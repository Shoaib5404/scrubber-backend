/**
 * Laravel `App\Console\Commands\RedisFlush::KNOWN_GROUPS` — copied verbatim for `--list` /
 * unknown-group warnings on `redis:flush`.
 *
 * Nest note: this list is informational only here. Dispatch does NOT require membership —
 * any group name that matches a Nest `LOOKUP_CACHE_TABLE_NAMES` entry (e.g. `cpt_codes`,
 * which Laravel's comment excludes from this literal array because it already routes through
 * `LookupCache`) is still flushed correctly via `LookupCacheService.invalidateTable`; an
 * unrecognized name just gets a warning before falling back to a generic `{group}:*` SCAN+DEL.
 */
export const KNOWN_REDIS_FLUSH_GROUPS: readonly string[] = [
  'articles',
  'article_type_lookup',
  'article_url_type_lookup',
  'contractors',
  'contractor_jurisdictions',
  'contractor_oversight',
  'contractor_type_lookup',
  'contractor_subtype_lookup',
  'region_lookup',
  'ncci',
  'ncci_rules',
  'icd10_tabular_codes',
  'icd10_body_sidewise',
  'add_on_codes',
  'mue_practitioners',
  'mue_87726_uhc_06111_oxford',
  'cpt_modifier_rules',
  'anesthesia_modifiers',
  'anesthesia_codes',
  'anesthesia_codes_with_billable_modifiers',
  'cpt_pos_rules',
  'age_specific_cpt_rules',
  'age_specific_icd_rules',
  'tobacco_counseling_icd_rules',
  'ndc_hcpcs_crosswalk',
  'ndc_codes',
  'taxonomy_codes',
  'gender_specific_cpt_rules',
  'article_x_icd10_covered',
  'article_x_icd10_covered_group',
  'article_x_icd10_noncovered',
  'article_x_icd10_noncovered_group',
  'article_x_icd10_pcs_code',
  'article_x_icd10_pcs_code_group',
  'article_x_hcpc_code',
  'article_x_hcpc_code_group',
  'article_x_hcpc_modifier',
  'article_x_hcpc_modifier_group',
  'ncd_icd10',
  'ncd_other_lab_cpt',
  'ncd_other_lab_codes',
  'batches:index',
  'batch_views',
  'icd10_unacceptable_principal_diagnose_codes',
  'modifiers',
  'modifier_sequences',
  'uhc_pos_crosswalk',
  'cigna_cpt_icd_crosswalk',
  'cigna_cpt_icd_lookup',
  'aetna_b12_lcd',
  'aetna_fetal_lcd',
  'uhc_authorizations',
  'medicaid_member_id_formats',
  'lab_codes',
  'mcr_vaccine_codes',
  'vaccine_codes',
];

export function isKnownRedisFlushGroup(name: string): boolean {
  return KNOWN_REDIS_FLUSH_GROUPS.includes(name);
}
