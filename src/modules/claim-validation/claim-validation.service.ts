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

function pointers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => Number(p)).filter((n) => Number.isFinite(n));
}

@Injectable()
export class ClaimValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lookups: ClaimRuleLookupService,
  ) {}

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
      patientState: null,
      subscriberState: null,
      facilityState: null,
      otherSubscribers: null,
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
      serviceLines: claim.serviceLines.map((l) => ({
        lineNumber: l.lineNumber,
        serviceDateFrom: l.serviceDateFrom,
        serviceDateTo: l.serviceDateTo,
      })),
    };
    pushSplit(validatePayerAndEdiSpecific(payerEdiClaim));

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
        validationErrors: [...errors, ...warnings, ...infos],
      },
    });

    return {
      claim_id: claim.id,
      status,
      errors,
      warnings,
      infos,
      error_count: errors.length,
      warning_count: warnings.length,
      info_count: infos.length,
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
