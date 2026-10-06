export type ParsedDiagnosis = { sequence: number; code: string; qualifier?: string; type: string };
export type ParsedServiceLine = {
  lineNumber: number;
  procedureCode: string;
  modifiers: string[];
  chargeAmount: number;
  units: number;
  serviceDateFrom?: string | null;
  placeOfService?: string | null;
  diagnosisPointers?: number[];
};
export type ParsedClaim = {
  claimId: string;
  totalCharge: number;
  placeOfService?: string | null;
  frequencyCode?: string | null;
  billingProviderName?: string | null;
  billingProviderNpi?: string | null;
  subscriberLastName?: string | null;
  subscriberFirstName?: string | null;
  subscriberMemberId?: string | null;
  subscriberDob?: string | null;
  subscriberGender?: string | null;
  payerName?: string | null;
  payerId?: string | null;
  patientLastName?: string | null;
  patientFirstName?: string | null;
  diagnoses: ParsedDiagnosis[];
  serviceLines: ParsedServiceLine[];
  stControlNumber?: string | null;
};
export type ParsedBatch = {
  claims: ParsedClaim[];
  isaSenderId?: string | null;
  isaReceiverId?: string | null;
  isaControlNumber?: string | null;
  gsControlNumber?: string | null;
  parseErrors: string[];
};
