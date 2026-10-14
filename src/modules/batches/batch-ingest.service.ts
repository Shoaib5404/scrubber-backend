import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../adapters/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';
import { parseEdiDate, toPrismaDate, toPrismaTime } from '../edi-parser/edi-date.util';
import { ModelDrivenEdiParser } from '../edi-parser/model-driven-edi.parser';
import { ParsedBatch } from '../edi-parser/types';
import { Edi837ValidationService } from '../edi-structural-validation/edi837-validation.service';
import { Edi837ValidationResultDto } from '../edi-structural-validation/types';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { QueueProducerService } from '../queue/queue-producer.service';
import {
  assertEdiObjectKeyBelongsToActor,
  assertEdiOriginalFilename,
  ediFilenameFromObjectKey,
  isAllowedEdiMimeType,
  mintEdiObjectKey,
  mintEdiObjectKeyAllowingZero,
  normalizeEdiMimeType,
  resolveEdiUploadActor,
} from './edi-object-key.util';

function envelopeFromParsed(parsed: ParsedBatch) {
  return {
    isaSenderId: parsed.isaSenderId ?? null,
    isaReceiverId: parsed.isaReceiverId ?? null,
    isaDate: toPrismaDate(parsed.isaDate),
    isaTime: toPrismaTime(parsed.isaTime),
    isaControlNumber: parsed.isaControlNumber ?? null,
    bhtDate: toPrismaDate(parsed.bhtDate),
    gsSenderCode: parsed.gsSenderCode ?? null,
    gsReceiverCode: parsed.gsReceiverCode ?? null,
    gsControlNumber: parsed.gsControlNumber ?? null,
    gsVersionCode: parsed.gsVersionCode ?? null,
  };
}

@Injectable()
export class BatchIngestService {
  private readonly logger = new Logger(BatchIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly structural: Edi837ValidationService,
    private readonly parser: ModelDrivenEdiParser,
    private readonly claimValidation: ClaimValidationService,
    @Inject(forwardRef(() => QueueProducerService))
    private readonly queue: QueueProducerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * TeleWound-style initiate: mint tenant/user object key + short-lived presigned PUT URL.
   * Does not create a BatchFile row yet.
   */
  async requestUploadUrl(params: {
    typ: string;
    role: string | null;
    tenantId: number | null;
    userId: number | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const actor = resolveEdiUploadActor(params);
    assertEdiOriginalFilename(params.originalFilename);
    if (!isAllowedEdiMimeType(params.mimeType)) {
      throw new BadRequestException(
        `Unsupported MIME type "${params.mimeType}". Allowed: application/EDI-X12, text/plain, application/octet-stream.`,
      );
    }
    const max = this.config.get<number>('EDI_MAX_BYTES', 10_485_760);
    if (params.sizeBytes > max) {
      throw new BadRequestException(`EDI file exceeds max size of ${max} bytes`);
    }

    const objectKey = mintEdiObjectKey(actor.keyTenantId, actor.userId);
    const signed = await this.storage.getPresignedUploadUrl({
      objectKey,
      mimeType: params.mimeType,
      maxSizeBytes: params.sizeBytes,
    });

    return {
      url: signed.url,
      objectKey: signed.objectKey,
      expiresIn: signed.expiresIn,
      headers: signed.headers ?? { 'Content-Type': params.mimeType },
    };
  }

  /**
   * After browser PUT to MinIO: HeadObject verify → get bytes → validate/parse → BatchFile.
   * Deletes the MinIO object if validation fails (no orphan batch row).
   */
  async completeUploadFromObject(params: {
    typ: string;
    role: string | null;
    tenantId: number | null;
    userId: number | null;
    objectKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const actor = resolveEdiUploadActor(params);
    assertEdiOriginalFilename(params.originalFilename);
    if (!isAllowedEdiMimeType(params.mimeType)) {
      throw new BadRequestException(
        `Unsupported MIME type "${params.mimeType}". Allowed: application/EDI-X12, text/plain, application/octet-stream.`,
      );
    }
    const max = this.config.get<number>('EDI_MAX_BYTES', 10_485_760);
    if (params.sizeBytes > max) {
      throw new BadRequestException(`EDI file exceeds max size of ${max} bytes`);
    }

    const objectKey = assertEdiObjectKeyBelongsToActor(
      params.objectKey,
      actor.keyTenantId,
      actor.userId,
    );

    const head = await this.storage.headObject(objectKey);
    if (!head.exists) {
      throw new BadRequestException('Uploaded file was not found in storage.');
    }
    if (
      typeof head.contentLength === 'number' &&
      head.contentLength > max
    ) {
      await this.safeDeleteObject(objectKey);
      throw new BadRequestException(`EDI file exceeds max size of ${max} bytes`);
    }
    if (
      typeof head.contentLength === 'number' &&
      head.contentLength !== params.sizeBytes
    ) {
      await this.safeDeleteObject(objectKey);
      throw new BadRequestException(
        'Stored file size does not match the declared size.',
      );
    }
    if (
      head.contentType &&
      normalizeEdiMimeType(head.contentType) !== normalizeEdiMimeType(params.mimeType)
    ) {
      // MinIO may omit or normalize Content-Type; only reject clear mismatches vs allowlist.
      if (!isAllowedEdiMimeType(head.contentType)) {
        await this.safeDeleteObject(objectKey);
        throw new BadRequestException(
          'Stored file MIME type does not match an allowed EDI type.',
        );
      }
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(objectKey);
    } catch (err) {
      this.logger.warn(`Failed to read uploaded object ${objectKey}: ${String(err)}`);
      throw new BadRequestException('Uploaded file was not found in storage.');
    }

    try {
      const { parsed, ediValidation } = this.validateAndParseBuffer(buffer, buffer.byteLength);
      const storedName = ediFilenameFromObjectKey(objectKey);
      const batch = await this.prisma.batchFile.create({
        data: {
          filename: storedName,
          originalFilename: params.originalFilename,
          filePath: objectKey,
          fileSize: buffer.byteLength,
          uploadedById: actor.userId,
          tenantId: actor.dbTenantId,
          status: 'processing',
          ...envelopeFromParsed(parsed),
          ediValidationErrors: ediValidation.issues.length ? ediValidation : undefined,
        },
      });
      this.audit.record({
        category: AuditCategoryCode.BatchUploadSucceeded,
        action: 'succeeded',
        actorUserId: actor.userId,
        tenantId: actor.dbTenantId,
        resourceType: 'batch',
        resourceId: batch.id,
        metadata: {
          original_filename: params.originalFilename,
          file_size: buffer.byteLength,
        },
      });
      return this.storeParsedData(batch.id, parsed, ediValidation);
    } catch (err) {
      await this.safeDeleteObject(objectKey);
      throw err;
    }
  }

  /** Structural validate + parse/store; no claim rules. */
  async ingestUpload(
    file: { originalname: string; buffer: Buffer; size: number },
    uploadedById: number | null,
    tenantId: number | null = null,
  ) {
    const { parsed, ediValidation } = this.validateAndParseBuffer(file.buffer, file.size);

    const relPath = mintEdiObjectKeyAllowingZero(tenantId, uploadedById);
    await this.storage.putObject(relPath, file.buffer, 'application/EDI-X12');

    const batch = await this.prisma.batchFile.create({
      data: {
        filename: ediFilenameFromObjectKey(relPath),
        originalFilename: file.originalname,
        filePath: relPath,
        fileSize: file.size,
        uploadedById,
        tenantId,
        status: 'processing',
        ...envelopeFromParsed(parsed),
        ediValidationErrors: ediValidation.issues.length ? ediValidation : undefined,
      },
    });

    this.audit.record({
      category: AuditCategoryCode.BatchUploadSucceeded,
      action: 'succeeded',
      actorUserId: uploadedById,
      tenantId,
      resourceType: 'batch',
      resourceId: batch.id,
      metadata: {
        original_filename: file.originalname,
        file_size: file.size,
      },
    });

    return this.storeParsedData(batch.id, parsed, ediValidation);
  }

  private validateAndParseBuffer(
    buffer: Buffer,
    size: number,
  ): { parsed: ParsedBatch; ediValidation: Edi837ValidationResultDto } {
    const raw = buffer.toString('utf8');
    if (!raw.trim()) {
      throw new UnprocessableEntityException({
        message: 'The uploaded EDI file is empty or could not be read.',
        issues: [
          {
            rule_id: 'EMPTY_FILE',
            severity: 'error',
            message: 'The uploaded EDI file is empty or could not be read.',
            category: 'upload',
          },
        ],
      });
    }

    const max = this.config.get<number>('EDI_MAX_BYTES', 10_485_760);
    if (size > max) {
      throw new BadRequestException(`EDI file exceeds max size of ${max} bytes`);
    }

    const ediValidation = this.structural.validate(raw);
    const strict = this.config.get<boolean>('EDI837_VALIDATION_STRICT', true);
    if (!ediValidation.passed && strict) {
      throw new UnprocessableEntityException({
        message: 'EDI 837 structural validation failed',
        ...ediValidation,
      });
    }

    let parsed: ParsedBatch;
    try {
      parsed = this.parser.parse(raw);
    } catch (e) {
      throw new UnprocessableEntityException({
        message: e instanceof Error ? e.message : 'EDI parse failed.',
        issues: [
          {
            rule_id: 'PARSE',
            severity: 'error',
            message: e instanceof Error ? e.message : 'EDI parse failed.',
            category: 'parse',
          },
        ],
      });
    }

    return { parsed, ediValidation };
  }

  private async safeDeleteObject(objectKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(objectKey);
    } catch (err) {
      this.logger.warn(`Failed to delete orphan object ${objectKey}: ${String(err)}`);
    }
  }

  /** Structural + parse only → parsed */
  async ingest(batchId: number) {
    const batch = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found.');

    const raw = (await this.storage.getObject(batch.filePath)).toString('utf8');
    const ediValidation = this.structural.validate(raw);
    const strict = this.config.get<boolean>('EDI837_VALIDATION_STRICT', true);
    if (!ediValidation.passed && strict) {
      return this.prisma.batchFile.update({
        where: { id: batchId },
        data: {
          status: 'error',
          errorMessage: 'EDI 837 structural validation failed',
          ediValidationErrors: ediValidation,
        },
      });
    }
    const parsed = this.parser.parse(raw);
    return this.storeParsedData(batchId, parsed, ediValidation);
  }

  /**
   * Parse/store then validate.
   * When USE_QUEUE + PARALLEL_VALIDATE, fans out ValidateBatchJob (async).
   */
  async process(batchId: number, force = false) {
    const existing = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!existing) throw new NotFoundException('Batch not found.');

    this.audit.record({
      category: force
        ? AuditCategoryCode.BatchRetry
        : AuditCategoryCode.BatchProcess,
      action: force ? 'forced' : 'started',
      tenantId: existing.tenantId,
      resourceType: 'batch',
      resourceId: batchId,
      metadata: { previous_status: existing.status, force },
    });

    if (!force && this.shouldResumeValidation(existing)) {
      const { batch } = await this.startRuleValidation(batchId, force);
      return batch;
    }

    const ingested = await this.ingest(batchId);
    if (ingested.status === 'error') return ingested;

    const { batch } = await this.startRuleValidation(batchId, force);
    return batch;
  }

  /**
   * Queue or run claim rules
   * after a successful structural parse (web upload parity).
   */
  async startRuleValidation(batchId: number, force = false) {
    const useParallel =
      this.config.get<boolean>('USE_QUEUE', false) &&
      this.config.get<boolean>('PARALLEL_VALIDATE', true);

    const prior = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    await this.prisma.batchFile.update({
      where: { id: batchId },
      data: { status: 'validating' },
    });

    this.audit.record({
      category: AuditCategoryCode.BatchStatusChange,
      action: 'changed',
      tenantId: prior?.tenantId ?? null,
      resourceType: 'batch',
      resourceId: batchId,
      metadata: { from: prior?.status ?? null, to: 'validating' },
    });
    this.audit.record({
      category: force
        ? AuditCategoryCode.BatchRetry
        : AuditCategoryCode.BatchValidate,
      action: force ? 'forced' : 'started',
      tenantId: prior?.tenantId ?? null,
      resourceType: 'batch',
      resourceId: batchId,
      metadata: { queued: useParallel, force },
    });

    if (useParallel) {
      await this.queue.enqueueValidateBatch(batchId, force);
      return {
        batch: await this.prisma.batchFile.findUniqueOrThrow({ where: { id: batchId } }),
        queued: true as const,
      };
    }

    await this.claimValidation.validateBatch(batchId, force);
    return {
      batch: await this.prisma.batchFile.findUniqueOrThrow({ where: { id: batchId } }),
      queued: false as const,
    };
  }

  private shouldResumeValidation(batch: {
    status: string;
    totalClaims: number;
  }): boolean {
    if (batch.totalClaims <= 0) return false;
    return ['parsed', 'validating', 'error', 'validated'].includes(batch.status);
  }

  private async storeParsedData(
    batchId: number,
    parsed: ParsedBatch,
    ediValidation?: Edi837ValidationResultDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.serviceLine.deleteMany({ where: { claim: { batchFileId: batchId } } });
      await tx.claimDiagnosis.deleteMany({ where: { claim: { batchFileId: batchId } } });
      await tx.claim.deleteMany({ where: { batchFileId: batchId } });

      for (const c of parsed.claims) {
        const claim = await tx.claim.create({
          data: {
            batchFileId: batchId,
            claimId: c.claimId,
            totalCharge: c.totalCharge,
            placeOfService: c.placeOfService,
            frequencyCode: c.frequencyCode,
            billingProviderName: c.billingProviderName,
            billingProviderNpi: c.billingProviderNpi,
            billingProviderTaxonomy: c.billingProviderTaxonomy,
            billingProviderAddress: c.billingProviderAddress,
            billingProviderAddressLine1: c.billingProviderAddressLine1,
            billingProviderAddressLine2: c.billingProviderAddressLine2,
            billingProviderCity: c.billingProviderCity,
            billingProviderState: c.billingProviderState,
            billingProviderZip: c.billingProviderZip,
            subscriberLastName: c.subscriberLastName,
            subscriberFirstName: c.subscriberFirstName,
            subscriberMemberId: c.subscriberMemberId,
            subscriberDob: toPrismaDate(parseEdiDate(c.subscriberDob)),
            subscriberGender: c.subscriberGender,
            subscriberAddress: c.subscriberAddress,
            subscriberRelationship: c.subscriberRelationship,
            payerResponsibility: c.payerResponsibility,
            claimFilingIndicator: c.claimFilingIndicator,
            insuranceTypeCode: c.insuranceTypeCode,
            subscriberGroupNumber: c.subscriberGroupNumber,
            subscriberGroupName: c.subscriberGroupName,
            payerName: c.payerName,
            payerId: c.payerId,
            payerAddress: c.payerAddress,
            patientLastName: c.patientLastName,
            patientFirstName: c.patientFirstName,
            patientDob: toPrismaDate(parseEdiDate(c.patientDob)),
            patientGender: c.patientGender,
            patientAddress: c.patientAddress,
            patientRelationship: c.patientRelationship,
            originalReferenceNumber: c.originalReferenceNumber,
            priorAuthNumber: c.priorAuthNumber,
            referralNumber: c.referralNumber,
            stControlNumber: c.stControlNumber,
            facilityName: c.facilityName,
            facilityNpi: c.facilityNpi,
            facilityAddress: c.facilityAddress,
            admissionDate: toPrismaDate(parseEdiDate(c.admissionDate)),
            dischargeDate: toPrismaDate(parseEdiDate(c.dischargeDate)),
            onsetOfIllnessDate: toPrismaDate(parseEdiDate(c.onsetOfIllnessDate)),
            lastMenstrualPeriodDate: toPrismaDate(parseEdiDate(c.lastMenstrualPeriodDate)),
            initialTreatmentDate: toPrismaDate(parseEdiDate(c.initialTreatmentDate)),
            lastSeenDate: toPrismaDate(parseEdiDate(c.lastSeenDate)),
            accidentDate: toPrismaDate(parseEdiDate(c.accidentDate)),
            lastXrayDate: toPrismaDate(parseEdiDate(c.lastXrayDate)),
            hearingVisionPrescriptionDate: toPrismaDate(parseEdiDate(c.hearingVisionPrescriptionDate)),
            disabilityStartDate: toPrismaDate(parseEdiDate(c.disabilityStartDate)),
            disabilityEndDate: toPrismaDate(parseEdiDate(c.disabilityEndDate)),
            lastWorkedDate: toPrismaDate(parseEdiDate(c.lastWorkedDate)),
            authorizedReturnToWorkDate: toPrismaDate(parseEdiDate(c.authorizedReturnToWorkDate)),
            assumedCareDate: toPrismaDate(parseEdiDate(c.assumedCareDate)),
            relinquishedCareDate: toPrismaDate(parseEdiDate(c.relinquishedCareDate)),
            otherSubscribers:
              c.otherSubscribers && c.otherSubscribers.length > 0
                ? (c.otherSubscribers as Prisma.InputJsonValue)
                : Prisma.DbNull,
            status: 'pending',
          },
        });
        if (c.diagnoses.length) {
          await tx.claimDiagnosis.createMany({
            data: c.diagnoses.map((d) => ({
              claimId: claim.id,
              sequence: d.sequence,
              code: d.code,
              qualifier: d.qualifier,
              type: d.type,
            })),
          });
        }
        if (c.serviceLines.length) {
          await tx.serviceLine.createMany({
            data: c.serviceLines.map((l) => ({
              claimId: claim.id,
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              modifier1: l.modifiers[0] ?? null,
              modifier2: l.modifiers[1] ?? null,
              modifier3: l.modifiers[2] ?? null,
              modifier4: l.modifiers[3] ?? null,
              chargeAmount: l.chargeAmount,
              units: l.units,
              placeOfService: l.placeOfService,
              serviceDateFrom: toPrismaDate(parseEdiDate(l.serviceDateFrom)),
              serviceDateTo: toPrismaDate(parseEdiDate(l.serviceDateTo)),
              diagnosisPointers: l.diagnosisPointers ?? undefined,
              ndcCode: l.ndcCode ?? null,
              ndcQuantity: l.ndcQuantity ?? null,
              ndcUnit: l.ndcUnit ?? null,
              status: 'pending',
            })),
          });
        }
      }

      const totalAmount = parsed.claims.reduce((s, c) => s + c.totalCharge, 0);
      return tx.batchFile.update({
        where: { id: batchId },
        data: {
          ...envelopeFromParsed(parsed),
          status: 'parsed',
          totalClaims: parsed.claims.length,
          totalAmount,
          errorMessage: null,
          ediValidationErrors: ediValidation ?? undefined,
        },
      });
    }).then((batch) => {
      this.audit.record({
        category: AuditCategoryCode.BatchParse,
        action: 'succeeded',
        tenantId: batch.tenantId,
        resourceType: 'batch',
        resourceId: batch.id,
        metadata: { total_claims: batch.totalClaims, status: batch.status },
      });
      this.audit.record({
        category: AuditCategoryCode.BatchStatusChange,
        action: 'changed',
        tenantId: batch.tenantId,
        resourceType: 'batch',
        resourceId: batch.id,
        metadata: { to: 'parsed' },
      });
      return batch;
    });
  }
}
