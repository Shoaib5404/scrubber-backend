/**
 * Laravel `config/lookup_cache.php` `tables` registry — enabled table names only, copied
 * from docs/migration/REDIS_LOOKUP_CACHE.md "Table registry inventory (59)".
 *
 * `nccis` is intentionally excluded: it is disabled in Laravel's registry and served
 * instead by `NcciRulesCacheService` (separate cache shape — see ncci-rules-cache.service.ts).
 *
 * Nest has no `LookupTableRegistry` service (profile/enabled metadata) yet; this static
 * list is the stand-in for CLI commands (redis:lookup-flush, redis:lookup-status,
 * redis:seed-lookups) that need to validate/enumerate table names.
 */
export const LOOKUP_CACHE_TABLE_NAMES: readonly string[] = [
  'cpt_codes',
  'age_specific_cpt_rules',
  'gender_specific_cpt_rules',
  'modifiers',
  'taxonomy_codes',
  'icd10_tabular_codes',
  'add_on_codes',
  'state_lookup',
  'enm_procedures',
  'enm_surgery_codes',
  'consultation_procedures',
  'lab_codes',
  'mcr_vaccine_codes',
  'vaccine_codes',
  'i_codes',
  'zero_amount_procedures',
  'no_of_units_cpts',
  'cigna_cpt_icd_crosswalk',
  'aetna_fetal_lcd',
  'aetna_b12_lcd',
  'mue_practitioners',
  'mue_87726_uhc_06111_oxford',
  'radiology_cpt_codes',
  'uhc_pos_crosswalk',
  'icd10_body_sidewise',
  'icd10_unacceptable_principal_diagnose_codes',
  'age_specific_icd_rules',
  'anesthesia_codes',
  'anesthesia_modifiers',
  'anesthesia_codes_with_billable_modifiers',
  'bcbs_claim_routings',
  'cpt_modifier_rules',
  'cpt_modifier_rules_by_cpt',
  'cpt_pos_rules',
  'cpt_pos_rules_by_cpt',
  'global_days_surgeries',
  'ncd_cpt',
  'ncd_icd',
  'ncd_denied_icd_pairs',
  'icd_gender_specific_rules',
  'initial_treatment_codes',
  'major_surgery_codes',
  'modifier_sequences',
  'ncd_other_lab_cpt',
  'ncd_other_lab_codes',
  'ndc_codes',
  'ndc_hcpcs_crosswalk',
  'npi_ordering_referrings',
  'tobacco_counseling_icd_rules',
  'uhc_authorizations',
  'uhc_authorizations_by_cpt',
  'zip_codes',
  'region_lookup',
  'contractor_type_lookup',
  'contractor_subtype_lookup',
  'contractor',
  'contractor_jurisdiction',
  'contractor_oversight',
] as const;

export function isKnownLookupTable(name: string): boolean {
  return (LOOKUP_CACHE_TABLE_NAMES as readonly string[]).includes(name);
}
