export interface CodeListImportOptions {
  truncate?: boolean;
  chunk?: number;
}

export interface CodeListImportResult {
  upserted: number;
  skipped: number;
}
