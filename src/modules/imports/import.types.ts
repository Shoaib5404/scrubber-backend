export interface CodeListImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface CodeListImportResult {
  upserted: number;
  skipped: number;
}

export interface BcbsClaimRoutingsImportResult {
  upserted: number;
  duplicates: number;
}

export interface UhcAuthorizationsImportResult {
  imported: number;
  skipped: number;
  errors: number;
  countsByCondition: Record<string, number>;
}
