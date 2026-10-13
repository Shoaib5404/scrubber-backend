export type ClaimIssue = {
  rule: string;
  field?: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  /** Inline / modal help (e.g. NCCI bypass modifiers). */
  help_text?: string | null;
  /** Named UI modal key, e.g. `cerumen-plan-policy`. */
  policy_modal?: string | null;
  /** Optional deep-link for LCD / article / NCD details. */
  details_url?: string | null;
  /** CPT/HCPCS on the offending service line (LCD / NCD / Cigna). */
  cpt_code?: string | null;
  /** Diagnosis code on the offending pointer (LCD / NCD / Cigna). */
  icd_code?: string | null;
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
