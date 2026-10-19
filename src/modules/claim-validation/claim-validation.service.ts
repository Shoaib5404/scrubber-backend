import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimIssue, ClaimValidationResult } from './types';
import { PayerEdiClaimInput } from './types/payer-edi.types';
import { validateClaimFields } from './rules/claim-field.rules';
import { validateClaimFilingIndicator } from './rules/claim-filing-indicator.rules';
import { validateBcbsClaimRouting } from './rules/bcbs-claim-routing.rules';
import { validatePayerAndEdiSpecific } from './rules/payer-edi-specific.rules';
import {
  validateCoreCptRules,
  validateAddOnPrimaryCodes,
  validateCptPosRules,
  validateUhcPriorAuthRules,
  validateCptModifierRules,
  CptServiceLineInput,
} from './rules/cpt.rules';
import { validateNpiProvider } from './rules/npi-provider.rules';
import {
  resolveClaimTypeFromBatchVersion,
  validateIcdDiagnosis,
} from './rules/icd-diagnosis.rules';
import {
  isApplicableMedicareNcdIcd10,
  validateMedicareNcdIcd10,
} from './rules/medicare-ncd-icd10.rules';
import { validateICode } from './rules/icode.rules';
import { validateServiceLineBasics } from './rules/service-line-basics.rules';
import { validateNdc } from './rules/ndc.rules';
import {
  isApplicableUhc87726Pos,
  validateUhc87726Pos,
} from './rules/uhc-87726-pos.rules';
import {
  isApplicableModifierSequence,
  validateModifierSequence,
} from './rules/modifier-sequence.rules';
import { validateRadiologyTcModifier } from './rules/radiology-tc-modifier.rules';
import { validateIcdBodySidewise } from './rules/icd-body-sidewise.rules';
import {
  isApplicableCigna62308,
  validateCigna62308,
} from './rules/cigna-62308.rules';
import {
  AETNA_B12_CPT_CODES,
  isApplicableAetnaLcd,
  validateAetnaLcd,
} from './rules/aetna-lcd.rules';
import { validateAnesthesia } from './rules/anesthesia.rules';
import { validateEnm } from './rules/enm.rules';
import { validateEmBundling } from './rules/em-bundling.rules';
import { validateGlobalSurgicalModifier } from './rules/global-surgical-modifier.rules';
import { validateNcci } from './rules/ncci.rules';
import {
  isApplicableMueUhcOxford,
  validateMueUhcOxford,
} from './rules/mue-uhc-oxford.rules';
import { validateMuePractitioner } from './rules/mue-practitioner.rules';
import { buildServiceLineStatusUpdates } from './support/service-line-status.updater';
import { ClaimRuleLookupService } from './support/claim-rule-lookup.service';
import { BusinessRulesService } from '../business-rules/business-rules.service';
import {
  extractStateFromFullAddress,
  extractZipDigitsFromAddress,
} from './support/payer-edi.helpers';
import { OtherSubscriberInput } from './types/payer-edi.types';

function pointers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => Number(p)).filter((n) => Number.isFinite(n));
}

function normalizeOtherSubscribers(raw: unknown): OtherSubscriberInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      ssn: (r.ssn as string | null | undefined) ?? null,
      relationshipCode:
        (r.relationship_code as string | null | undefined) ??
        (r.relationshipCode as string | null | undefined) ??
        null,
      memberId:
        (r.member_id as string | null | undefined) ??
        (r.memberId as string | null | undefined) ??
        null,
      groupNumber:
        (r.group_number as string | null | undefined) ??
        (r.groupNumber as string | null | undefined) ??
        null,
      claimFilingIndicator:
        (r.claim_filing_indicator as string | null | undefined) ??
        (r.claimFilingIndicator as string | null | undefined) ??
        null,
      payerResponsibility:
        (r.payer_responsibility as string | null | undefined) ??
        (r.payerResponsibility as string | null | undefined) ??
        null,
      remittanceDate:
        (r.remittance_date as string | null | undefined) ??
        (r.remittanceDate as string | null | undefined) ??
        null,
      payerName:
        (r.payer_name as string | null | undefined) ??
        (r.payerName as string | null | undefined) ??
        null,
      payerId:
        (r.payer_id as string | null | undefined) ??
        (r.payerId as string | null | undefined) ??
        null,
      payerClaimControlNumber:
        (r.payer_claim_control_number as string | null | undefined) ??
        (r.payerClaimControlNumber as string | null | undefined) ??
        null,
      hasOtherPayerNm1:
        (r.has_other_payer_nm1 as string | boolean | null | undefined) ??
        (r.hasOtherPayerNm1 as string | boolean | null | undefined) ??
        null,
      paidAmount:
        (r.paid_amount as string | number | null | undefined) ??
        (r.payer_paid_amount as string | number | null | undefined) ??
        (r.paidAmount as string | number | null | undefined) ??
        (r.payerPaidAmount as string | number | null | undefined) ??
        null,
      remainingPatientLiability:
        (r.remaining_patient_liability as string | number | null | undefined) ??
        (r.remainingPatientLiability as string | number | null | undefined) ??
        null,
      lastName:
        (r.last_name as string | null | undefined) ??
        (r.lastName as string | null | undefined) ??
        null,
      firstName:
        (r.first_name as string | null | undefined) ??
        (r.firstName as string | null | undefined) ??
        null,
      middleName:
        (r.middle_name as string | null | undefined) ??
        (r.middleName as string | null | undefined) ??
        null,
      zipCode:
        (r.zip_code as string | null | undefined) ??
        (r.zipCode as string | null | undefined) ??
        null,
      city: (r.city as string | null | undefined) ?? null,
      state: (r.state as string | null | undefined) ?? null,
      addressLine1:
        (r.address_line_1 as string | null | undefined) ??
        (r.addressLine1 as string | null | undefined) ??
        null,
      patientLastName:
        (r.patient_last_name as string | null | undefined) ??
        (r.patientLastName as string | null | undefined) ??
        null,
      patientFirstName:
        (r.patient_first_name as string | null | undefined) ??
        (r.patientFirstName as string | null | undefined) ??
        null,
      patientMiddleName:
        (r.patient_middle_name as string | null | undefined) ??
        (r.patientMiddleName as string | null | undefined) ??
        null,
      patientZipCode:
        (r.patient_zip_code as string | null | undefined) ??
        (r.patientZipCode as string | null | undefined) ??
        null,
      patientCity:
        (r.patient_city as string | null | undefined) ??
        (r.patientCity as string | null | undefined) ??
        null,
      patientState:
        (r.patient_state as string | null | undefined) ??
        (r.patientState as string | null | undefined) ??
        null,
      patientAddressLine1:
        (r.patient_address_line_1 as string | null | undefined) ??
        (r.patientAddressLine1 as string | null | undefined) ??
        null,
    };
  });
}

@Injectable()
export class ClaimValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lookups: ClaimRuleLookupService,
    private readonly businessRules: BusinessRulesService,
  ) {}

  private dropDisabled(issues: ClaimIssue[], disabled: ReadonlySet<string>): ClaimIssue[] {
    if (disabled.size === 0) return issues;
    return issues.filter((issue) => !issue.rule || !disabled.has(issue.rule));
  }

  async validateClaim(claimId: number): Promise<ClaimValidationResult> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        diagnoses: true,
        serviceLines: true,
        batchFile: true,
      },
    });
    if (!claim) throw new NotFoundException('Claim not found.');

    const disabled = await this.businessRules.disabledKeys(claim.batchFile?.uploadedById ?? null);

    let errors: ClaimIssue[] = [];
    let warnings: ClaimIssue[] = [];
    const infos: ClaimIssue[] = [];

    const pushSplit = (issues: ClaimIssue[]) => {
      for (const issue of issues) {
        const severity = issue.severity ?? 'error';
        if (severity === 'info') infos.push(issue);
        else if (severity === 'warning') warnings.push(issue);
        else errors.push(issue);
      }
    };

    // ── PHASE 1 ──
    errors = errors.concat(
      validateClaimFields({
        billingProviderNpi: claim.billingProviderNpi,
        subscriberMemberId: claim.subscriberMemberId,
        payerId: claim.payerId,
        payerName: claim.payerName,
        totalCharge: Number(claim.totalCharge),
        diagnosesCount: claim.diagnoses.length,
      }),
      validateClaimFilingIndicator({
        claimFilingIndicator: claim.claimFilingIndicator,
        payerResponsibility: claim.payerResponsibility,
        subscriberMemberId: claim.subscriberMemberId,
        subscriberDob: claim.subscriberDob,
        patientDob: claim.patientDob,
        otherSubscribers: claim.otherSubscribers,
        serviceDateFrom: claim.serviceLines[0]?.serviceDateFrom ?? null,
      }),
    );

    errors = errors.concat(
      await validateBcbsClaimRouting(this.prisma, {
        subscriberMemberId: claim.subscriberMemberId,
        payerId: claim.payerId,
      }),
    );

    const otherSubscribers = normalizeOtherSubscribers(claim.otherSubscribers);
    const payerEdiClaim: PayerEdiClaimInput = {
      payerId: claim.payerId,
      subscriberMemberId: claim.subscriberMemberId,
      subscriberSsn: claim.subscriberSsn,
      claimFilingIndicator: claim.claimFilingIndicator,
      placeOfService: claim.placeOfService,
      relatedCausesCode: claim.relatedCausesCode,
      patientGender: claim.patientGender,
      subscriberGender: claim.subscriberGender,
      billingProviderCity: claim.billingProviderCity,
      subscriberAddress: claim.subscriberAddress,
      patientAddress: claim.patientAddress,
      facilityName: claim.facilityName,
      facilityNpi: claim.facilityNpi,
      facilityAddress: claim.facilityAddress,
      billingProviderZip: claim.billingProviderZip,
      billingProviderState: claim.billingProviderState,
      patientState: extractStateFromFullAddress(claim.patientAddress),
      subscriberState: extractStateFromFullAddress(claim.subscriberAddress),
      facilityState: extractStateFromFullAddress(claim.facilityAddress),
      otherSubscribers,
      onsetOfIllnessDate: claim.onsetOfIllnessDate,
      lastMenstrualPeriodDate: claim.lastMenstrualPeriodDate,
      initialTreatmentDate: claim.initialTreatmentDate,
      lastSeenDate: claim.lastSeenDate,
      accidentDate: claim.accidentDate,
      lastXrayDate: claim.lastXrayDate,
      admissionDate: claim.admissionDate,
      dischargeDate: claim.dischargeDate,
      hearingVisionPrescriptionDate: claim.hearingVisionPrescriptionDate,
      disabilityStartDate: claim.disabilityStartDate,
      disabilityEndDate: claim.disabilityEndDate,
      lastWorkedDate: claim.lastWorkedDate,
      authorizedReturnToWorkDate: claim.authorizedReturnToWorkDate,
      assumedCareDate: claim.assumedCareDate,
      relinquishedCareDate: claim.relinquishedCareDate,
      billingProviderName: claim.billingProviderName,
      billingProviderNpi: claim.billingProviderNpi,
      billingProviderTaxId: claim.billingProviderTaxId,
      billingProviderSsn: claim.billingProviderSsn,
      billingProviderTaxonomy: claim.billingProviderTaxonomy,
      billingProviderUpin: claim.billingProviderUpin,
      billingProviderStateLicense: claim.billingProviderStateLicense,
      billingProviderAddress: claim.billingProviderAddress,
      billingProviderAddressLine1: claim.billingProviderAddressLine1,
      billingProviderAddressLine2: claim.billingProviderAddressLine2,
      subscriberLastName: claim.subscriberLastName,
      subscriberFirstName: claim.subscriberFirstName,
      subscriberDob: claim.subscriberDob,
      subscriberGroupNumber: claim.subscriberGroupNumber,
      subscriberGroupName: claim.subscriberGroupName,
      subscriberRelationship: claim.subscriberRelationship,
      payerResponsibility: claim.payerResponsibility,
      insuranceTypeCode: claim.insuranceTypeCode,
      frequencyCode: claim.frequencyCode,
      delayReasonCode: claim.delayReasonCode,
      submissionMethod: claim.submissionMethod,
      originalReferenceNumber: claim.originalReferenceNumber,
      priorAuthNumber: claim.priorAuthNumber,
      referralNumber: claim.referralNumber,
      cliaNumber: claim.cliaNumber,
      mammographyCertificationNumber: claim.mammographyCertificationNumber,
      patientLastName: claim.patientLastName,
      patientFirstName: claim.patientFirstName,
      patientDob: claim.patientDob,
      patientRelationship: claim.patientRelationship,
      renderingProviderNpi: claim.renderingProviderNpi,
      renderingProviderLastName: claim.renderingProviderLastName,
      renderingProviderFirstName: claim.renderingProviderFirstName,
      renderingProviderMiddleName: claim.renderingProviderMiddleName,
      renderingProviderUpin: claim.renderingProviderUpin,
      renderingProviderStateLicense: claim.renderingProviderStateLicense,
      referringProviderNpi: claim.referringProviderNpi,
      referringProviderLastName: claim.referringProviderLastName,
      referringProviderFirstName: claim.referringProviderFirstName,
      referringProviderMiddleName: claim.referringProviderMiddleName,
      referringProviderUpin: claim.referringProviderUpin,
      referringProviderStateLicense: claim.referringProviderStateLicense,
      transactionSetCreationDate: claim.transactionSetCreationDate,
      batchIsaDate: claim.batchFile?.isaDate ?? null,
      batchBhtDate: claim.batchFile?.bhtDate ?? null,
      diagnoses: claim.diagnoses.map((d) => ({
        sequence: d.sequence,
        code: d.code,
        type: d.type,
        qualifier: d.qualifier,
      })),
      serviceLines: claim.serviceLines.map((l) => ({
        lineNumber: l.lineNumber,
        serviceDateFrom: l.serviceDateFrom,
        serviceDateTo: l.serviceDateTo,
        procedureCode: l.procedureCode,
        units: Number(l.units),
        modifier1: l.modifier1,
        modifier2: l.modifier2,
        modifier3: l.modifier3,
        modifier4: l.modifier4,
        referringProviderNpi: l.referringProviderNpi,
        referringProviderLastName: l.referringProviderLastName,
        referringProviderFirstName: l.referringProviderFirstName,
        referringProviderMiddleName: l.referringProviderMiddleName,
        diagnosisPointers: pointers(l.diagnosisPointers),
        otherPayerPaidAmount:
          l.otherPayerPaidAmount == null ? null : Number(l.otherPayerPaidAmount),
      })),
    };
    const payerEdiProcCodes = this.lookups.uniqueCodes(
      claim.serviceLines.map((l) => l.procedureCode),
    );
    const referringNpis = this.lookups.uniqueCodes([claim.referringProviderNpi]);
    const payerEdiLookups = {
      zipCodeRowsByZip5: await this.lookups.zipCodeRowsByZip5([
        claim.billingProviderZip,
        extractZipDigitsFromAddress(claim.patientAddress),
        extractZipDigitsFromAddress(claim.subscriberAddress),
        extractZipDigitsFromAddress(claim.facilityAddress),
        ...otherSubscribers.flatMap((other) => [other.zipCode, other.patientZipCode]),
      ]),
      medicaidAlMemberIdFormatsActive: await this.lookups.medicaidAlMemberIdFormatsActive(
        claim.payerId,
      ),
      consultationProcedureSet: await this.lookups.consultationProcedureSet(payerEdiProcCodes),
      npiOrderingReferringByNpi: await this.lookups.npiOrderingReferringByNpi(referringNpis),
      vaccineComponentCountByCode: await this.lookups.vaccineComponentCountByCode(payerEdiProcCodes),
      mcrVaccineAdminByVaccineCode: await this.lookups.mcrVaccineAdminByVaccineCode(
        payerEdiProcCodes,
      ),
      labCodeModifiersByHcpcs: await this.lookups.labCodeModifiersByHcpcs(payerEdiProcCodes),
    };
    pushSplit(validatePayerAndEdiSpecific(payerEdiClaim, payerEdiLookups));
    errors = this.dropDisabled(errors, disabled);
    warnings = this.dropDisabled(warnings, disabled);

    const haltAfterDosFutureGate = errors.some((e) => e.rule === 'DOS-FUT-001');

    if (!haltAfterDosFutureGate) {
      const allCodes = this.lookups.uniqueCodes(claim.serviceLines.map((l) => l.procedureCode));
      const lineInputs: CptServiceLineInput[] = claim.serviceLines.map((l) => ({
        lineNumber: l.lineNumber,
        procedureCode: l.procedureCode,
        serviceDateFrom: l.serviceDateFrom,
        placeOfService: l.placeOfService,
        modifier1: l.modifier1,
        modifier2: l.modifier2,
        modifier3: l.modifier3,
        modifier4: l.modifier4,
        chargeAmount: Number(l.chargeAmount),
        diagnosisPointers: pointers(l.diagnosisPointers),
      }));

      // ── PHASE 1b: NPI ──
      const npis = this.lookups.uniqueCodes([
        claim.renderingProviderNpi,
        claim.referringProviderNpi,
      ]);
      errors = errors.concat(
        validateNpiProvider(
          {
            claimFilingIndicator: claim.claimFilingIndicator,
            renderingProviderNpi: claim.renderingProviderNpi,
            renderingProviderLastName: claim.renderingProviderLastName,
            referringProviderNpi: claim.referringProviderNpi,
            referringProviderLastName: claim.referringProviderLastName,
            referringProviderFirstName: claim.referringProviderFirstName,
            billingProviderNpi: claim.billingProviderNpi,
          },
          await this.lookups.npiOrderingReferringByNpi(npis),
        ),
      );

      // ── PHASE 2: CPT core ──
      const taxonomyCodes = this.lookups.uniqueCodes([claim.billingProviderTaxonomy]);
      const cptCore = validateCoreCptRules(
        {
          payerId: claim.payerId,
          placeOfService: claim.placeOfService,
          billingProviderTaxonomy: claim.billingProviderTaxonomy,
          patientDob: claim.patientDob,
          subscriberDob: claim.subscriberDob,
          patientGender: claim.patientGender,
          subscriberGender: claim.subscriberGender,
          priorAuthNumber: claim.priorAuthNumber,
          diagnoses: claim.diagnoses.map((d) => ({ sequence: d.sequence, code: d.code })),
        },
        lineInputs,
        {
          cptRuleRowsByCode: await this.lookups.cptRuleRowsByCode(allCodes),
          activeTaxonomyCodes: await this.lookups.activeTaxonomyCodes(taxonomyCodes),
          mueCodeSet: await this.lookups.mueUhcOxfordCodeSet(allCodes),
          ageRulesByCode: await this.lookups.ageRulesByCode(allCodes),
          genderRulesByCode: await this.lookups.genderRulesByCode(allCodes),
        },
        {
          req007Enabled: !disabled.has('REQ-007'),
          cpt001Enabled: !disabled.has('CPT-001'),
        },
      );
      errors = errors.concat(cptCore.cptErrors);
      const validLines = cptCore.validLines;
      const validCodes = this.lookups.uniqueCodes(validLines.map((l) => l.procedureCode));

      // ── PHASE 3: rules on valid CPT lines ──
      if (validLines.length > 0) {
        const diagnosisInputs = claim.diagnoses.map((d) => ({
          sequence: d.sequence,
          code: d.code,
          type: d.type,
        }));
        const claimType = resolveClaimTypeFromBatchVersion(
          claim.batchFile?.gsVersionCode ?? null,
        );
        const icdResult = validateIcdDiagnosis(
          {
            claimFilingIndicator: claim.claimFilingIndicator,
            batchGsVersionCode: claim.batchFile?.gsVersionCode ?? null,
            patientDob: claim.patientDob,
            subscriberDob: claim.subscriberDob,
            patientGender: claim.patientGender,
            subscriberGender: claim.subscriberGender,
          },
          diagnosisInputs,
          validLines.map((l) => ({
            lineNumber: l.lineNumber,
            procedureCode: l.procedureCode,
            diagnosisPointers: l.diagnosisPointers,
            serviceDateFrom: l.serviceDateFrom ?? null,
          })),
          await this.lookups.icdDiagnosisLookups(
            claim.diagnoses.map((d) => d.code ?? ''),
            claimType,
          ),
        );
        errors = errors.concat(icdResult.errors);
        warnings = warnings.concat(icdResult.warnings);

        if (isApplicableMedicareNcdIcd10({ claimFilingIndicator: claim.claimFilingIndicator })) {
          errors = errors.concat(
            validateMedicareNcdIcd10(
              validLines.map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                diagnosisPointers: l.diagnosisPointers,
              })),
              { claimFilingIndicator: claim.claimFilingIndicator },
              diagnosisInputs,
              await this.lookups.ncdDeniedByCpt(validCodes),
            ),
          );
        }

        errors = errors.concat(
          validateICode(
            validLines.map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
            })),
            { claimFilingIndicator: claim.claimFilingIndicator },
            await this.lookups.iCodeSet(validCodes),
          ),
        );

        const maxSequence =
          claim.diagnoses.length === 0
            ? null
            : Math.max(...claim.diagnoses.map((d) => d.sequence));
        const lineBasics = validateServiceLineBasics(
          claim.serviceLines
            .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
            .map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              chargeAmount: Number(l.chargeAmount),
              units: Number(l.units),
              serviceDateFrom: l.serviceDateFrom,
              serviceDateTo: l.serviceDateTo,
              diagnosisPointers: l.diagnosisPointers,
            })),
          maxSequence,
          {
            zeroAmountProcedures: await this.lookups.zeroAmountProcedureSet(validCodes),
            noOfUnitsCptsExempt: await this.lookups.noOfUnitsCptSet(validCodes),
          },
        );
        errors = errors.concat(lineBasics.errors);
        warnings = warnings.concat(lineBasics.warnings);

        const [ndcErrors, ndcWarnings] = validateNdc(
          claim.serviceLines
            .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
            .map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              ndcCode: l.ndcCode,
              ndcQuantity: l.ndcQuantity,
              ndcUnit: l.ndcUnit,
            })),
          await this.lookups.ndcContext(validCodes),
        );
        errors = errors.concat(ndcErrors);
        warnings = warnings.concat(ndcWarnings);

        errors = errors.concat(cptCore.ageErrors);
        errors = errors.concat(cptCore.genderErrors);

        errors = errors.concat(
          validateAddOnPrimaryCodes(
            validLines,
            lineInputs,
            await this.lookups.primariesByAddon(validCodes),
          ),
        );

        errors = errors.concat(
          validateCptPosRules(
            { payerId: claim.payerId, placeOfService: claim.placeOfService },
            validLines,
            await this.lookups.cptPosRules(validCodes),
          ).errors,
        );

        if (isApplicableUhc87726Pos({ payerId: claim.payerId, placeOfService: claim.placeOfService })) {
          errors = errors.concat(
            validateUhc87726Pos(
              validLines.map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                placeOfService: l.placeOfService ?? null,
              })),
              { payerId: claim.payerId, placeOfService: claim.placeOfService },
              await this.lookups.uhcPosByCpt(validCodes),
            ),
          );
        }

        errors = errors.concat(
          validateUhcPriorAuthRules(
            {
              payerId: claim.payerId,
              placeOfService: claim.placeOfService,
              priorAuthNumber: claim.priorAuthNumber,
              diagnoses: claim.diagnoses.map((d) => ({ sequence: d.sequence, code: d.code })),
            },
            validLines,
            await this.lookups.uhcPriorAuthRulesByCpt(validCodes),
          ).errors,
        );

        errors = errors.concat(
          validateCptModifierRules(
            validLines,
            await this.lookups.cptModifierRules(validCodes),
          ).errors,
        );

        if (isApplicableModifierSequence({ claimFilingIndicator: claim.claimFilingIndicator })) {
          errors = errors.concat(
            validateModifierSequence(
              validLines.map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                modifier1: l.modifier1 ?? null,
                modifier2: l.modifier2 ?? null,
                modifier3: l.modifier3 ?? null,
                modifier4: l.modifier4 ?? null,
              })),
              { claimFilingIndicator: claim.claimFilingIndicator },
              await this.lookups.modifierSequences(),
            ),
          );
        }

        errors = errors.concat(
          validateRadiologyTcModifier(
            validLines.map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              placeOfService: l.placeOfService ?? null,
              modifier1: l.modifier1 ?? null,
              modifier2: l.modifier2 ?? null,
              modifier3: l.modifier3 ?? null,
              modifier4: l.modifier4 ?? null,
            })),
            { placeOfService: claim.placeOfService },
            await this.lookups.radiologyCptSet(validCodes),
          ),
        );

        errors = errors.concat(
          validateIcdBodySidewise(
            validLines.map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              diagnosisPointers: l.diagnosisPointers,
              modifier1: l.modifier1 ?? null,
              modifier2: l.modifier2 ?? null,
              modifier3: l.modifier3 ?? null,
              modifier4: l.modifier4 ?? null,
            })),
            {
              diagnoses: diagnosisInputs.map((d) => ({ sequence: d.sequence, code: d.code })),
            },
            await this.lookups.icdBodySides(claim.diagnoses.map((d) => d.code ?? '')),
          ),
        );

        if (
          isApplicableCigna62308(
            {
              payerId: claim.payerId,
              patientDob: claim.patientDob,
              subscriberDob: claim.subscriberDob,
            },
            validLines.map((l) => ({
              serviceDateFrom:
                l.serviceDateFrom instanceof Date
                  ? l.serviceDateFrom
                  : l.serviceDateFrom
                    ? new Date(l.serviceDateFrom)
                    : null,
            })),
          )
        ) {
          errors = errors.concat(
            validateCigna62308(
              validLines.map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                diagnosisPointers: l.diagnosisPointers,
                serviceDateFrom:
                  l.serviceDateFrom instanceof Date
                    ? l.serviceDateFrom
                    : l.serviceDateFrom
                      ? new Date(l.serviceDateFrom)
                      : null,
              })),
              diagnosisInputs,
              {
                payerId: claim.payerId,
                patientDob: claim.patientDob,
                subscriberDob: claim.subscriberDob,
              },
              await this.lookups.cignaIcdMaps(validCodes),
            ),
          );
        }

        if (isApplicableAetnaLcd({ payerId: claim.payerId })) {
          const fetalCpts = await this.lookups.aetnaFetalCpts();
          const maps = await this.lookups.aetnaLcdMaps(fetalCpts, [...AETNA_B12_CPT_CODES]);
          errors = errors.concat(
            validateAetnaLcd(
              validLines.map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                diagnosisPointers: l.diagnosisPointers,
              })),
              diagnosisInputs,
              { payerId: claim.payerId },
              fetalCpts,
              maps.fetal,
              maps.b12,
            ),
          );
        }

        errors = errors.concat(
          validateAnesthesia(
            claim.serviceLines
              .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
              .map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                units: Number(l.units),
                unitScale: l.unitScale,
                modifier1: l.modifier1,
                modifier2: l.modifier2,
                modifier3: l.modifier3,
                modifier4: l.modifier4,
              })),
            await this.lookups.anesthesiaLookups(validCodes),
          ),
        );

        const enmOneDayEarlier = this.config.get<boolean>(
          'SCRUBBER_RULE_SWITCH_ENM_ONE_DAY_EARLIER',
          true,
        );
        const enmResult = validateEnm(
          claim.serviceLines
            .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
            .map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              units: Number(l.units),
              serviceDateFrom: l.serviceDateFrom,
              modifier1: l.modifier1,
              modifier2: l.modifier2,
              modifier3: l.modifier3,
              modifier4: l.modifier4,
            })),
          diagnosisInputs,
          {
            enmProcedures: await this.lookups.enmProcedureSet(),
            enmSurgeryCodes: await this.lookups.enmSurgerySet(),
          },
          { enmOneDayEarlier },
        );
        errors = errors.concat(enmResult.errors);
        warnings = warnings.concat(enmResult.warnings);

        if (this.config.get<boolean>('SCRUBBER_RULE_SWITCH_EM_BUNDLING', true)) {
          const emLines = claim.serviceLines
            .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
            .map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              serviceDateFrom: l.serviceDateFrom,
              renderingProviderNpi: l.renderingProviderNpi,
              modifier1: l.modifier1,
              modifier2: l.modifier2,
              modifier3: l.modifier3,
              modifier4: l.modifier4,
            }));
          const checkInDates = emLines
            .filter((l) => String(l.procedureCode ?? '').trim().toUpperCase() === '98016')
            .map((l) => l.serviceDateFrom);
          const crossClaimRelated = await this.lookups.briefCheckInRelatedOnOtherClaims({
            claimId: claim.id,
            subscriberMemberId: claim.subscriberMemberId,
            checkInServiceDates: checkInDates,
          });
          errors = errors.concat(
            validateEmBundling(
              emLines,
              {
                claimFilingIndicator: claim.claimFilingIndicator,
                renderingProviderNpi: claim.renderingProviderNpi,
              },
              crossClaimRelated,
            ),
          );
        }

        const enmProcs = await this.lookups.enmProcedureSet();
        const enmSurg = await this.lookups.enmSurgerySet();
        errors = errors.concat(
          validateGlobalSurgicalModifier(
            claim.serviceLines
              .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
              .map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                modifier1: l.modifier1,
                modifier2: l.modifier2,
                modifier3: l.modifier3,
                modifier4: l.modifier4,
              })),
            {
              majorSurgeryCodes: await this.lookups.majorSurgerySet(validCodes),
              enmSurgeryCodes: enmSurg,
              enmProcedures: enmProcs,
              globalDaysSurgeries: await this.lookups.globalDaysSurgerySet(validCodes),
            },
          ),
        );

        const ncciResult = validateNcci(
          claim.serviceLines
            .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
            .map((l) => ({
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              modifier1: l.modifier1,
              modifier2: l.modifier2,
              modifier3: l.modifier3,
              modifier4: l.modifier4,
            })),
          await this.lookups.ncciPairsByColumnKey(validCodes),
        );
        errors = errors.concat(ncciResult.errors);
        warnings = warnings.concat(ncciResult.warnings);

        if (isApplicableMueUhcOxford({ payerId: claim.payerId })) {
          errors = errors.concat(
            validateMueUhcOxford(
              claim.serviceLines
                .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
                .map((l) => ({
                  lineNumber: l.lineNumber,
                  procedureCode: l.procedureCode,
                  units: Number(l.units),
                })),
              { payerId: claim.payerId },
              await this.lookups.mueUhcOxfordByCode(validCodes),
            ),
          );
        } else {
          const mueResult = validateMuePractitioner(
            claim.serviceLines
              .filter((l) => validLines.some((v) => v.lineNumber === l.lineNumber))
              .map((l) => ({
                lineNumber: l.lineNumber,
                procedureCode: l.procedureCode,
                units: Number(l.units),
                serviceDateFrom: l.serviceDateFrom,
                modifier1: l.modifier1,
                modifier2: l.modifier2,
                modifier3: l.modifier3,
                modifier4: l.modifier4,
              })),
            { payerId: claim.payerId },
            await this.lookups.muePractitionerByCode(validCodes),
          );
          errors = errors.concat(mueResult.errors);
          warnings = warnings.concat(mueResult.warnings);
        }
      }
    }

    // ── PHASE 4: status updater ──
    errors = this.dropDisabled(errors, disabled);
    warnings = this.dropDisabled(warnings, disabled);
    const keptInfos = this.dropDisabled(infos, disabled);
    const lineUpdates = buildServiceLineStatusUpdates(
      claim.serviceLines.map((l) => ({ id: l.id, lineNumber: l.lineNumber })),
      errors,
      warnings,
    );
    for (const update of lineUpdates) {
      await this.prisma.serviceLine.update({
        where: { id: update.id },
        data: {
          status: update.status,
          validationErrors: update.validationErrors,
        },
      });
    }

    const status = errors.length ? 'error' : warnings.length ? 'warning' : 'valid';
    await this.prisma.claim.update({
      where: { id: claim.id },
      data: {
        status,
        validationErrors: [...errors, ...warnings, ...keptInfos],
      },
    });

    return {
      claim_id: claim.id,
      status,
      errors,
      warnings,
      infos: keptInfos,
      error_count: errors.length,
      warning_count: warnings.length,
      info_count: keptInfos.length,
    };
  }

  async validateBatch(batchId: number, force = false): Promise<ClaimValidationResult[]> {
    const claims = await this.prisma.claim.findMany({
      where: force
        ? { batchFileId: batchId }
        : { batchFileId: batchId, NOT: { status: 'valid' } },
      select: { id: true },
    });
    const results: ClaimValidationResult[] = [];
    for (const c of claims) {
      results.push(await this.validateClaim(c.id));
    }
    const errorClaims = results.filter((r) => r.status === 'error').length;
    const warningClaims = results.filter((r) => r.status === 'warning').length;
    const validClaims = results.filter((r) => r.status === 'valid').length;
    await this.prisma.batchFile.update({
      where: { id: batchId },
      data: {
        status: 'validated',
        errorClaims,
        warningClaims,
        validClaims,
        processedAt: new Date(),
      },
    });
    return results;
  }
}
