export type ClaimIssue = {
  rule: string;
  field?: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
};

export type ClaimValidationResult = {
  claim_id: number;
  status: string;
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
  infos: ClaimIssue[];
  error_count: number;
  warning_count: number;
  info_count: number;
};
