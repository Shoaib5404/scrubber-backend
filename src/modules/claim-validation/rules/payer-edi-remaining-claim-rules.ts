import { ClaimRuleDefinition } from '../config/claim-rules.config';
import { startOfLocalDay } from '../support/payer-edi.helpers';
import { ClaimIssue } from '../types';
import { PayerEdiClaimInput } from '../types/payer-edi.types';
import {
  RemainingClaimRuleLookups,
  validateAdmissionSubsequentSameDos,
  validateBcbsFlPrimaryOnlyIcd,
  validateBcbsSecondaryMedicareWait,
  validateBmiNotAllowedAsPrincipalWithHcpcs,
  validateCerumenRemovalRequiresSupportiveIcd,
  validateCobAmountsNonNegative,
  validateCommercialReferringProviderNpiDistinct,
  validateConsultationReferringRequired,
  validateDelayReasonRequiredForAgedMedicaid,
  validateDosNotAfterTransactionSetCreationDate,
  validateEmblemFidelisEligibleCptAgeRange,
  validateEmblemFidelisEligibleCptRequiresLinkedIcd,
  validateEmblemFidelisEligibleIcdRequiresCpt,
  validateEmNotAllowedWithWellVisitIcd,
  validateEpsdtModifierAgeExceedsMax,
  validateHospitalAdmissionEmUnitAndSameDos,
  validateHospitalDischargeEmRequirements,
  validateInitialTreatmentDateRequired,
  validateLabCliaPresenceAndFormat,
  validateLabCliaRequiredForLabCodes,
  validateLabQwModifierApplicability,
  validateLabSpecimenCollectionCliaNotRequired,
  validateLastSeenDateRequired,
  validateMcrVaccineRequiresRelativeAdminCode,
  validateMedicareCobOtherPayerClaimControlRequired,
  validatePrincipalDiagnosisAbkOnly,
  validateSequelaNotAllowedAsPrincipal,
  validateSubscriberOtherSubscriberMemberIdInvalid,
  validateSubscriberOtherSubscriberMemberIdRequired,
  validateV49RequiresPaperPayer,
  validateVaccineAdmin90460,
  validateVaccineAdmin90471,
  validateVaccineAdminGroupConflict,
  validateWellVisitCptNotAllowedForMedicareMb,
  validateWellVisitIcdNotAllowedWithOfficeEm,
  validateWellVisitRequiresZ00Z13Principal,
  validateWellVisitVaccineRequiresZ23Principal,
} from './payer-edi-remaining-claim-rules.handlers';

export type { RemainingClaimRuleLookups };
/** Dispatch remaining CLAIM_RULES (Laravel validateClaimRules private methods). */
export function dispatchRemainingClaimRule(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups = {},
  today: Date = startOfLocalDay(new Date()),
): ClaimIssue | ClaimIssue[] | null {
  switch (definition.type) {
    case 'bcbs_secondary_medicare_wait':
      return validateBcbsSecondaryMedicareWait(claim, definition, today);
    case 'medicare_cob_other_payer_claim_control_required':
      return validateMedicareCobOtherPayerClaimControlRequired(claim, definition);
    case 'subscriber_other_subscriber_member_id_required':
      return validateSubscriberOtherSubscriberMemberIdRequired(claim, definition);
    case 'subscriber_other_subscriber_member_id_invalid':
      return validateSubscriberOtherSubscriberMemberIdInvalid(claim, definition, lookups);
    case 'principal_diagnosis_abk_only':
      return validatePrincipalDiagnosisAbkOnly(claim, definition);
    case 'sequela_not_allowed_as_principal':
      return validateSequelaNotAllowedAsPrincipal(claim, definition);
    case 'v49_requires_paper_payer':
      return validateV49RequiresPaperPayer(claim, definition);
    case 'emblem_fidelis_eligible_icd_requires_cpt':
      return validateEmblemFidelisEligibleIcdRequiresCpt(claim, definition);
    case 'emblem_fidelis_eligible_cpt_requires_linked_icd':
      return validateEmblemFidelisEligibleCptRequiresLinkedIcd(claim, definition);
    case 'emblem_fidelis_eligible_cpt_age_range':
      return validateEmblemFidelisEligibleCptAgeRange(claim, definition);
    case 'bmi_not_allowed_as_principal_with_hcpcs':
      return validateBmiNotAllowedAsPrincipalWithHcpcs(claim, definition);
    case 'cob_amounts_non_negative':
      return validateCobAmountsNonNegative(claim, definition);
    case 'commercial_referring_provider_npi_distinct':
      return validateCommercialReferringProviderNpiDistinct(claim, definition);
    case 'consultation_referring_required':
      return validateConsultationReferringRequired(claim, definition, lookups);
    case 'initial_treatment_date_required':
      return validateInitialTreatmentDateRequired(claim, definition);
    case 'last_seen_date_required':
      return validateLastSeenDateRequired(claim, definition);
    case 'admission_subsequent_same_dos':
      return validateAdmissionSubsequentSameDos(claim, definition);
    case 'delay_reason_required_for_aged_medicaid':
      return validateDelayReasonRequiredForAgedMedicaid(claim, definition, today);
    case 'em_not_allowed_with_well_visit_icd':
      return validateEmNotAllowedWithWellVisitIcd(claim, definition);
    case 'well_visit_requires_z00_z13_principal':
      return validateWellVisitRequiresZ00Z13Principal(claim, definition);
    case 'well_visit_cpt_not_allowed_for_medicare_mb':
      return validateWellVisitCptNotAllowedForMedicareMb(claim, definition);
    case 'well_visit_vaccine_requires_z23_principal':
      return validateWellVisitVaccineRequiresZ23Principal(claim, definition);
    case 'well_visit_icd_not_allowed_with_office_em':
      return validateWellVisitIcdNotAllowedWithOfficeEm(claim, definition);
    case 'mcr_vaccine_requires_relative_admin_code':
      return validateMcrVaccineRequiresRelativeAdminCode(claim, definition, lookups);
    case 'vaccine_requires_primary_additional_admin_90471_90472':
      return validateVaccineAdmin90471(claim, definition, lookups);
    case 'vaccine_requires_primary_additional_admin_90460_90461':
      return validateVaccineAdmin90460(claim, definition, lookups);
    case 'vaccine_admin_group1_group2_same_dos_conflict':
      return validateVaccineAdminGroupConflict(claim, definition);
    case 'hospital_admission_em_unit_and_same_dos':
      return validateHospitalAdmissionEmUnitAndSameDos(claim, definition);
    case 'epsdt_modifier_age_exceeds_max':
      return validateEpsdtModifierAgeExceedsMax(claim, definition);
    case 'hospital_discharge_em_requirements':
      return validateHospitalDischargeEmRequirements(claim, definition);
    case 'bcbs_fl_primary_only_icd':
      return validateBcbsFlPrimaryOnlyIcd(claim, definition);
    case 'cerumen_removal_requires_supportive_icd':
      return validateCerumenRemovalRequiresSupportiveIcd(claim, definition);
    case 'dos_not_after_transaction_set_creation_date':
      return validateDosNotAfterTransactionSetCreationDate(claim, definition);
    case 'lab_clia_required_for_lab_codes':
      return validateLabCliaRequiredForLabCodes(claim, definition, lookups);
    case 'lab_specimen_collection_clia_not_required':
      return validateLabSpecimenCollectionCliaNotRequired(claim, definition);
    case 'lab_qw_modifier_applicability':
      return validateLabQwModifierApplicability(claim, definition, lookups);
    case 'lab_clia_presence_and_format':
      return validateLabCliaPresenceAndFormat(claim, definition, lookups);
    default:
      return null;
  }
}
