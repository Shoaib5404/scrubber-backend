export interface ArticleImportEntry {
  /** Postgres table name (snake_case, matches Prisma `@@map`). */
  table: string;
  /** CSV filename under the import data directory (e.g. `import/article_csv`). */
  csv: string;
  /** Human-readable phase label, used for `--list` grouping / progress logging. */
  phase: string;
}

/**
 * Laravel App\Console\Commands\ImportArticleData::IMPORT_ORDER — copied verbatim (dependency
 * order: lookups, then main entities, then relations, then cross-references). `--fresh`
 * truncates this list in reverse so child tables are emptied before their parents.
 */
export const ARTICLE_IMPORT_ORDER: readonly ArticleImportEntry[] = [
  // Phase 1: Lookup tables (no dependencies)
  { table: 'article_type_lookup', csv: 'article_type_lookup.csv', phase: 'Lookup Tables' },
  { table: 'article_url_type_lookup', csv: 'article_url_type_lookup.csv', phase: 'Lookup Tables' },
  { table: 'contractor_type_lookup', csv: 'contractor_type_lookup.csv', phase: 'Lookup Tables' },
  { table: 'contractor_subtype_lookup', csv: 'contractor_subtype_lookup.csv', phase: 'Lookup Tables' },
  { table: 'region_lookup', csv: 'region_lookup.csv', phase: 'Lookup Tables' },
  { table: 'state_lookup', csv: 'state_lookup.csv', phase: 'Lookup Tables' },
  { table: 'dmerc_region_lookup', csv: 'dmerc_region_lookup.csv', phase: 'Lookup Tables' },
  { table: 'update_period', csv: 'update_period.csv', phase: 'Lookup Tables' },

  // Phase 2: Geographic
  { table: 'state_x_region', csv: 'state_x_region.csv', phase: 'Geographic' },

  // Phase 3: Main entities
  { table: 'contractor', csv: 'contractor.csv', phase: 'Main Tables' },
  { table: 'article', csv: 'article.csv', phase: 'Main Tables' },

  // Phase 4: Contractor relations
  { table: 'contractor_jurisdiction', csv: 'contractor_jurisdiction.csv', phase: 'Contractor Relations' },
  { table: 'contractor_oversight', csv: 'contractor_oversight.csv', phase: 'Contractor Relations' },

  // Phase 5: Article relations
  { table: 'article_future_retire', csv: 'article_future_retire.csv', phase: 'Article Relations' },
  { table: 'article_related_documents', csv: 'article_related_documents.csv', phase: 'Article Relations' },
  {
    table: 'article_related_ncd_documents',
    csv: 'article_related_ncd_documents.csv',
    phase: 'Article Relations',
  },
  {
    table: 'article_related_source_icd9',
    csv: 'article_related_source_icd9.csv',
    phase: 'Article Relations',
  },

  // Phase 6: Article x code references
  { table: 'article_x_bill_code', csv: 'article_x_bill_code.csv', phase: 'Article Code References' },
  { table: 'article_x_code_table', csv: 'article_x_code_table.csv', phase: 'Article Code References' },
  { table: 'article_x_contractor', csv: 'article_x_contractor.csv', phase: 'Article Code References' },

  // Phase 7: Article x HCPC references
  { table: 'article_x_hcpc_code', csv: 'article_x_hcpc_code.csv', phase: 'Article HCPC References' },
  {
    table: 'article_x_hcpc_code_group',
    csv: 'article_x_hcpc_code_group.csv',
    phase: 'Article HCPC References',
  },
  { table: 'article_x_hcpc_modifier', csv: 'article_x_hcpc_modifier.csv', phase: 'Article HCPC References' },
  {
    table: 'article_x_hcpc_modifier_group',
    csv: 'article_x_hcpc_modifier_group.csv',
    phase: 'Article HCPC References',
  },

  // Phase 8: Article x ICD10 references
  {
    table: 'article_x_icd10_covered',
    csv: 'article_x_icd10_covered.csv',
    phase: 'Article ICD10 References',
  },
  {
    table: 'article_x_icd10_covered_group',
    csv: 'article_x_icd10_covered_group.csv',
    phase: 'Article ICD10 References',
  },
  {
    table: 'article_x_icd10_noncovered',
    csv: 'article_x_icd10_noncovered.csv',
    phase: 'Article ICD10 References',
  },
  {
    table: 'article_x_icd10_noncovered_group',
    csv: 'article_x_icd10_noncovered_group.csv',
    phase: 'Article ICD10 References',
  },
  {
    table: 'article_x_icd10_pcs_code',
    csv: 'article_x_icd10_pcs_code.csv',
    phase: 'Article ICD10 References',
  },
  {
    table: 'article_x_icd10_pcs_code_group',
    csv: 'article_x_icd10_pcs_code_group.csv',
    phase: 'Article ICD10 References',
  },

  // Phase 9: Article miscellaneous references
  {
    table: 'article_x_other_coding_group',
    csv: 'article_x_other_coding_group.csv',
    phase: 'Article Misc References',
  },
  {
    table: 'article_x_primary_jurisdiction',
    csv: 'article_x_primary_jurisdiction.csv',
    phase: 'Article Misc References',
  },
  {
    table: 'article_x_response_to_comment',
    csv: 'article_x_response_to_comment.csv',
    phase: 'Article Misc References',
  },
  { table: 'article_x_revenue_code', csv: 'article_x_revenue_code.csv', phase: 'Article Misc References' },
  {
    table: 'article_x_revision_history',
    csv: 'article_x_revision_history.csv',
    phase: 'Article Misc References',
  },
  { table: 'article_x_sticky_note', csv: 'article_x_sticky_note.csv', phase: 'Article Misc References' },
  { table: 'article_x_urls', csv: 'article_x_urls.csv', phase: 'Article Misc References' },
];
