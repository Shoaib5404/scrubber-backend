import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UnitScale } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';
import { QueueProducerService } from '../queue/queue-producer.service';
import {
  laravelPaginator,
  serializeClaim,
  serializeServiceLine,
} from '../batches/api-serializers';
import { BatchesService } from '../batches/batches.service';

const CLAIM_UPDATE_MAP: Record<string, string> = {
  billing_provider_name: 'billingProviderName',
  billing_provider_npi: 'billingProviderNpi',
  billing_provider_tax_id: 'billingProviderTaxId',
  billing_provider_ssn: 'billingProviderSsn',
  billing_provider_taxonomy: 'billingProviderTaxonomy',
  billing_provider_upin: 'billingProviderUpin',
  billing_provider_state_license: 'billingProviderStateLicense',
  billing_provider_address: 'billingProviderAddress',
  billing_provider_address_line_1: 'billingProviderAddressLine1',
  billing_provider_address_line_2: 'billingProviderAddressLine2',
  billing_provider_city: 'billingProviderCity',
  billing_provider_state: 'billingProviderState',
  billing_provider_zip: 'billingProviderZip',
  subscriber_last_name: 'subscriberLastName',
  subscriber_first_name: 'subscriberFirstName',
  subscriber_member_id: 'subscriberMemberId',
  subscriber_ssn: 'subscriberSsn',
  subscriber_dob: 'subscriberDob',
  subscriber_gender: 'subscriberGender',
  subscriber_address: 'subscriberAddress',
  subscriber_group_number: 'subscriberGroupNumber',
  subscriber_group_name: 'subscriberGroupName',
  subscriber_relationship: 'subscriberRelationship',
  payer_responsibility: 'payerResponsibility',
  claim_filing_indicator: 'claimFilingIndicator',
  insurance_type_code: 'insuranceTypeCode',
  other_subscribers: 'otherSubscribers',
  patient_last_name: 'patientLastName',
  patient_first_name: 'patientFirstName',
  patient_dob: 'patientDob',
  patient_gender: 'patientGender',
  patient_relationship: 'patientRelationship',
  patient_address: 'patientAddress',
  payer_name: 'payerName',
  payer_id: 'payerId',
  payer_address: 'payerAddress',
  rendering_provider_npi: 'renderingProviderNpi',
  rendering_provider_last_name: 'renderingProviderLastName',
  rendering_provider_first_name: 'renderingProviderFirstName',
  rendering_provider_middle_name: 'renderingProviderMiddleName',
  referring_provider_npi: 'referringProviderNpi',
  referring_provider_last_name: 'referringProviderLastName',
  referring_provider_first_name: 'referringProviderFirstName',
  referring_provider_middle_name: 'referringProviderMiddleName',
  facility_name: 'facilityName',
  facility_npi: 'facilityNpi',
  facility_address: 'facilityAddress',
  total_charge: 'totalCharge',
  place_of_service: 'placeOfService',
  frequency_code: 'frequencyCode',
  delay_reason_code: 'delayReasonCode',
  submission_method: 'submissionMethod',
  related_causes_code: 'relatedCausesCode',
  prior_auth_number: 'priorAuthNumber',
  referral_number: 'referralNumber',
  clia_number: 'cliaNumber',
  mammography_certification_number: 'mammographyCertificationNumber',
  claim_note: 'claimNote',
};

const LINE_UPDATE_MAP: Record<string, string> = {
  procedure_code: 'procedureCode',
  procedure_description: 'procedureDescription',
  modifier_1: 'modifier1',
  modifier_2: 'modifier2',
  modifier_3: 'modifier3',
  modifier_4: 'modifier4',
  charge_amount: 'chargeAmount',
  units: 'units',
  unit_scale: 'unitScale',
  service_date_from: 'serviceDateFrom',
  service_date_to: 'serviceDateTo',
  place_of_service: 'placeOfService',
  diagnosis_pointers: 'diagnosisPointers',
  rendering_provider_npi: 'renderingProviderNpi',
  referring_provider_npi: 'referringProviderNpi',
  referring_provider_last_name: 'referringProviderLastName',
  referring_provider_first_name: 'referringProviderFirstName',
  referring_provider_middle_name: 'referringProviderMiddleName',
  other_payer_paid_amount: 'otherPayerPaidAmount',
  reference_id: 'referenceId',
  ndc_code: 'ndcCode',
  ndc_quantity: 'ndcQuantity',
  ndc_unit: 'ndcUnit',
};

const DATE_CLAIM_FIELDS = new Set([
  'subscriberDob',
  'patientDob',
  'admissionDate',
  'dischargeDate',
]);

const DATE_LINE_FIELDS = new Set(['serviceDateFrom', 'serviceDateTo']);

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly claimValidation: ClaimValidationService,
    private readonly batches: BatchesService,
    @Inject(forwardRef(() => QueueProducerService))
    private readonly queue: QueueProducerService,
  ) {}

  async listByBatch(
    batchId: number,
    filters: {
      status?: string;
      search?: string;
      payer?: string;
      page?: number;
      perPage?: number;
    },
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const perPage = Math.min(100, Math.max(1, filters.perPage ?? 20));
    const where: Prisma.ClaimWhereInput = { batchFileId: batchId };
    if (filters.status) where.status = filters.status;
    if (filters.payer) {
      where.payerName = { contains: filters.payer, mode: 'insensitive' };
    }
    if (filters.search) {
      where.OR = [
        { claimId: { contains: filters.search, mode: 'insensitive' } },
        { subscriberLastName: { contains: filters.search, mode: 'insensitive' } },
        { subscriberFirstName: { contains: filters.search, mode: 'insensitive' } },
        { subscriberMemberId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.claim.count({ where }),
      this.prisma.claim.findMany({
        where,
        orderBy: { claimId: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          diagnoses: true,
          serviceLines: true,
          _count: { select: { diagnoses: true, serviceLines: true } },
        },
      }),
    ]);

    return laravelPaginator(
      rows.map((c) => serializeClaim(c)),
      total,
      page,
      perPage,
    );
  }

  async getById(id: number) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        diagnoses: true,
        serviceLines: true,
        batchFile: true,
        _count: { select: { diagnoses: true, serviceLines: true } },
      },
    });
    if (!claim) throw new NotFoundException('Claim not found.');
    return serializeClaim(claim);
  }

  async update(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.claim.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Claim not found.');

    const diagnoses = asRecordArray(body.diagnoses);
    const newDiagnoses = asRecordArray(body.new_diagnoses);
    const lines = asRecordArray(body.lines);
    const newLines = asRecordArray(body.new_lines);

    const data: Prisma.ClaimUpdateInput = { isModified: true };
    for (const [snake, camel] of Object.entries(CLAIM_UPDATE_MAP)) {
      if (!(snake in body)) continue;
      let value = body[snake];
      if (DATE_CLAIM_FIELDS.has(String(camel)) && typeof value === 'string' && value) {
        value = new Date(value);
      }
      (data as Record<string, unknown>)[camel as string] = value;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.claim.update({ where: { id }, data });

      for (const diagnosisData of diagnoses) {
        const diagnosisId = Number(diagnosisData.id);
        if (!Number.isFinite(diagnosisId) || diagnosisId <= 0) continue;
        const diagnosis = await tx.claimDiagnosis.findFirst({
          where: { id: diagnosisId, claimId: id },
        });
        if (!diagnosis) continue;
        await tx.claimDiagnosis.update({
          where: { id: diagnosisId },
          data: {
            code:
              diagnosisData.code != null
                ? String(diagnosisData.code)
                : diagnosis.code,
            sequence:
              diagnosisData.sequence != null
                ? Number(diagnosisData.sequence)
                : diagnosis.sequence,
          },
        });
      }

      for (const newDiagnosis of newDiagnoses) {
        const code = String(newDiagnosis.code ?? '').trim();
        if (!code) continue;
        const agg = await tx.claimDiagnosis.aggregate({
          where: { claimId: id },
          _max: { sequence: true },
        });
        const sequence =
          newDiagnosis.sequence != null
            ? Number(newDiagnosis.sequence)
            : (agg._max.sequence ?? 0) + 1;
        await tx.claimDiagnosis.create({
          data: {
            claimId: id,
            code,
            sequence,
            qualifier: 'ABF',
            type: 'other',
          },
        });
      }

      for (const lineData of lines) {
        const lineId = Number(lineData.id);
        if (!Number.isFinite(lineId) || lineId <= 0) continue;
        const line = await tx.serviceLine.findFirst({
          where: { id: lineId, claimId: id },
        });
        if (!line) continue;

        const modifiers = parseModifiersField(lineData.modifiers);
        const pointers = parseDiagnosisPointers(lineData.diagnosis_pointers, []);
        const ndc = normalizeLineNdcFields(lineData);

        await tx.serviceLine.update({
          where: { id: lineId },
          data: {
            procedureCode:
              lineData.procedure_code != null
                ? String(lineData.procedure_code).trim().toUpperCase()
                : line.procedureCode,
            serviceDateFrom:
              lineData.service_date_from != null && lineData.service_date_from !== ''
                ? new Date(String(lineData.service_date_from))
                : line.serviceDateFrom,
            serviceDateTo:
              lineData.service_date_to != null && lineData.service_date_to !== ''
                ? new Date(String(lineData.service_date_to))
                : line.serviceDateTo,
            modifier1: modifiers[0] ?? null,
            modifier2: modifiers[1] ?? null,
            modifier3: modifiers[2] ?? null,
            modifier4: modifiers[3] ?? null,
            diagnosisPointers: pointers,
            units:
              lineData.units != null ? new Prisma.Decimal(String(lineData.units)) : line.units,
            unitScale: normalizeLineUnitScale(lineData.unit_scale),
            ndcCode: ndc.ndcCode,
            ndcQuantity: ndc.ndcQuantity,
            ndcUnit: ndc.ndcUnit,
            referringProviderNpi: nullableTrimmed(lineData.referring_provider_npi),
            referringProviderLastName: nullableTrimmed(lineData.referring_provider_last_name),
            referringProviderFirstName: nullableTrimmed(lineData.referring_provider_first_name),
            referringProviderMiddleName: nullableTrimmed(
              lineData.referring_provider_middle_name,
            ),
            otherPayerPaidAmount: nullableAmount(lineData.other_payer_paid_amount),
            isModified: true,
          },
        });
      }

      for (const newLine of newLines) {
        const procedureCode = String(newLine.procedure_code ?? '')
          .trim()
          .toUpperCase();
        if (!procedureCode) continue;

        const agg = await tx.serviceLine.aggregate({
          where: { claimId: id },
          _max: { lineNumber: true },
        });
        const modifiers = parseModifiersField(newLine.modifiers);
        const pointers = parseDiagnosisPointers(newLine.diagnosis_pointers, [1]);
        const ndc = normalizeLineNdcFields(newLine);

        await tx.serviceLine.create({
          data: {
            claimId: id,
            lineNumber: (agg._max.lineNumber ?? 0) + 1,
            procedureCode,
            serviceDateFrom:
              newLine.service_date_from != null && newLine.service_date_from !== ''
                ? new Date(String(newLine.service_date_from))
                : null,
            serviceDateTo:
              newLine.service_date_to != null && newLine.service_date_to !== ''
                ? new Date(String(newLine.service_date_to))
                : null,
            modifier1: modifiers[0] ?? null,
            modifier2: modifiers[1] ?? null,
            modifier3: modifiers[2] ?? null,
            modifier4: modifiers[3] ?? null,
            diagnosisPointers: pointers,
            units: new Prisma.Decimal(
              newLine.units != null ? String(newLine.units) : '1',
            ),
            unitScale: normalizeLineUnitScale(newLine.unit_scale),
            chargeAmount: new Prisma.Decimal(0),
            ndcCode: ndc.ndcCode,
            ndcQuantity: ndc.ndcQuantity,
            ndcUnit: ndc.ndcUnit,
            referringProviderNpi: nullableTrimmed(newLine.referring_provider_npi),
            referringProviderLastName: nullableTrimmed(newLine.referring_provider_last_name),
            referringProviderFirstName: nullableTrimmed(newLine.referring_provider_first_name),
            referringProviderMiddleName: nullableTrimmed(
              newLine.referring_provider_middle_name,
            ),
            otherPayerPaidAmount: nullableAmount(newLine.other_payer_paid_amount),
            status: 'pending',
          },
        });
      }
    });

    return this.getById(id);
  }

  async updateServiceLine(claimId: number, lineId: number, body: Record<string, unknown>) {
    const line = await this.prisma.serviceLine.findFirst({
      where: { id: lineId, claimId },
    });
    if (!line) throw new NotFoundException('Service line not found.');

    const data: Prisma.ServiceLineUpdateInput = { isModified: true };
    const merged = { ...body };
    if (Array.isArray(body.modifiers)) {
      const mods = (body.modifiers as unknown[]).map((m) =>
        String(m ?? '')
          .trim()
          .toUpperCase(),
      );
      merged.modifier_1 = mods[0] ?? null;
      merged.modifier_2 = mods[1] ?? null;
      merged.modifier_3 = mods[2] ?? null;
      merged.modifier_4 = mods[3] ?? null;
    }

    for (const [snake, camel] of Object.entries(LINE_UPDATE_MAP)) {
      if (!(snake in merged)) continue;
      let value = merged[snake];
      if (DATE_LINE_FIELDS.has(camel) && typeof value === 'string' && value) {
        value = new Date(value);
      }
      if (camel === 'procedureCode' && typeof value === 'string') {
        value = value.trim().toUpperCase();
      }
      (data as Record<string, unknown>)[camel] = value;
    }

    const updated = await this.prisma.serviceLine.update({ where: { id: lineId }, data });
    return serializeServiceLine(updated);
  }

  async validateClaim(id: number) {
    return this.claimValidation.validateClaim(id);
  }

  /**
   * Laravel ClaimController::validateBatch — start/check rule validation.
   */
  async validateBatch(batchId: number, force = false) {
    const batch = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found.');

    if (!force && batch.status === 'validated') {
      return this.validationResultsResponse(batchId, batch.status);
    }

    if (!force && batch.status === 'validating') {
      return this.underProcessingResponse(batchId, batch.status, false);
    }

    if (!force && batch.status === 'error') {
      const hasValidated = await this.prisma.claim.count({
        where: {
          batchFileId: batchId,
          status: { in: ['valid', 'error', 'warning'] },
        },
      });
      if (hasValidated > 0) {
        return this.validationResultsResponse(batchId, batch.status);
      }
    }

    const useQueue =
      this.config.get<boolean>('USE_QUEUE', false) &&
      this.config.get<boolean>('PARALLEL_VALIDATE', true);

    if (useQueue) {
      try {
        await this.queue.enqueueValidateBatch(batchId, force);
      } catch (e) {
        throw new BadRequestException(
          `Could not queue claim validation: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      await this.prisma.batchFile.update({
        where: { id: batchId },
        data: { status: 'validating' },
      });
      return this.underProcessingResponse(batchId, 'validating', true);
    }

    await this.claimValidation.validateBatch(batchId, force);
    const fresh = await this.prisma.batchFile.findUniqueOrThrow({ where: { id: batchId } });
    return this.validationResultsResponse(batchId, fresh.status);
  }

  private async underProcessingResponse(
    batchId: number,
    batchStatus: string,
    started: boolean,
  ) {
    const statistics = await this.batches.getStatistics(batchId);
    return {
      httpStatus: 202 as const,
      body: {
        success: true,
        message: started
          ? 'Your file is under processing for rule validation. Call this same endpoint again to get results when complete.'
          : 'Rule validation is still under processing. Call this same endpoint again to get results when complete.',
        data: {
          batch_id: batchId,
          status: 'under_processing',
          batch_status: batchStatus,
          queued: true,
          statistics,
        },
      },
    };
  }

  private async validationResultsResponse(batchId: number, batchStatus: string) {
    const [statistics, claims] = await Promise.all([
      this.batches.getStatistics(batchId),
      this.prisma.claim.findMany({
        where: { batchFileId: batchId },
        orderBy: { id: 'asc' },
        select: { claimId: true, status: true, validationErrors: true },
      }),
    ]);

    return {
      httpStatus: 200 as const,
      body: {
        success: true,
        message: 'Rule validation complete.',
        data: {
          batch_id: batchId,
          status: 'completed',
          batch_status: batchStatus,
          statistics,
          claims: claims.map((c) => ({
            claim_id: c.claimId,
            status: c.status,
            validation_errors: c.validationErrors,
          })),
        },
      },
    };
  }
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
}

function parseModifiersField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((m) =>
        String(m ?? '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
  }
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean);
}

function parseDiagnosisPointers(raw: unknown, defaultPointers: number[]): number[] {
  if (Array.isArray(raw)) {
    const nums = raw.map((p) => Number(p)).filter((n) => Number.isFinite(n));
    return nums.length > 0 ? nums : defaultPointers;
  }
  const s = String(raw ?? '').trim();
  if (!s) return defaultPointers;
  const nums = s
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : defaultPointers;
}

function normalizeLineUnitScale(raw: unknown): UnitScale {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (u === 'UN' || u === 'MJ' || u === 'F2') return u;
  return UnitScale.UN;
}

function nullableTrimmed(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed !== '' ? trimmed : null;
}

function nullableAmount(value: unknown): Prisma.Decimal | null {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return null;
  return new Prisma.Decimal(Number(trimmed).toFixed(2));
}

function normalizeLineNdcFields(lineData: Record<string, unknown>): {
  ndcCode: string | null;
  ndcQuantity: Prisma.Decimal | null;
  ndcUnit: string | null;
} {
  const ndcCode = nullableTrimmed(lineData.ndc_code);
  const qtyRaw = String(lineData.ndc_quantity ?? '').trim();
  const ndcQuantity =
    qtyRaw !== '' && !Number.isNaN(Number(qtyRaw))
      ? new Prisma.Decimal(qtyRaw)
      : null;
  const ndcUnit = nullableTrimmed(lineData.ndc_unit);
  return { ndcCode, ndcQuantity, ndcUnit };
}
