import type { OtherSubscriberEntry } from './other-subscriber-normalizer';

export type ParsedDiagnosis = { sequence: number; code: string; qualifier?: string; type: string };
export type ParsedServiceLine = {
  lineNumber: number;
  procedureCode: string;
  modifiers: string[];
  chargeAmount: number;
  units: number;
  serviceDateFrom?: string | null;
  serviceDateTo?: string | null;
  placeOfService?: string | null;
  diagnosisPointers?: number[];
  /** 2410 LIN03 (qualifier N4) — Laravel ModelDrivenEdiParser::parseServiceLines. */
  ndcCode?: string | null;
  /** 2410 CTP04. */
  ndcQuantity?: number | null;
  /** 2410 CTP05. */
  ndcUnit?: string | null;
};
export type ParsedClaim = {
  claimId: string;
  totalCharge: number;
  placeOfService?: string | null;
  frequencyCode?: string | null;
  billingProviderName?: string | null;
  billingProviderNpi?: string | null;
  billingProviderTaxonomy?: string | null;
  billingProviderAddress?: string | null;
  billingProviderAddressLine1?: string | null;
  billingProviderAddressLine2?: string | null;
  billingProviderCity?: string | null;
  billingProviderState?: string | null;
  billingProviderZip?: string | null;
  subscriberLastName?: string | null;
  subscriberFirstName?: string | null;
  subscriberMemberId?: string | null;
  subscriberDob?: string | null;
  subscriberGender?: string | null;
  subscriberAddress?: string | null;
  subscriberRelationship?: string | null;
  payerResponsibility?: string | null;
  claimFilingIndicator?: string | null;
  insuranceTypeCode?: string | null;
  subscriberGroupNumber?: string | null;
  subscriberGroupName?: string | null;
  payerName?: string | null;
  payerId?: string | null;
  payerAddress?: string | null;
  patientLastName?: string | null;
  patientFirstName?: string | null;
  patientDob?: string | null;
  patientGender?: string | null;
  patientAddress?: string | null;
  patientRelationship?: string | null;
  originalReferenceNumber?: string | null;
  priorAuthNumber?: string | null;
  referralNumber?: string | null;
  diagnoses: ParsedDiagnosis[];
  serviceLines: ParsedServiceLine[];
  /** 2320 COB other subscribers (snake_case keys, Laravel other_subscribers JSON). */
  otherSubscribers?: OtherSubscriberEntry[];
  stControlNumber?: string | null;
  /** 2310C NM1*77 service facility location (Laravel parseProviderFromSegments($segments, '77')). */
  facilityName?: string | null;
  facilityNpi?: string | null;
  facilityAddress?: string | null;
  /** Claim-level Loop 2300 DTP dates (Laravel ModelDrivenEdiParser::extractClaimLevelDates). Raw EDI date (CCYYMMDD). */
  onsetOfIllnessDate?: string | null;
  lastMenstrualPeriodDate?: string | null;
  initialTreatmentDate?: string | null;
  lastSeenDate?: string | null;
  accidentDate?: string | null;
  lastXrayDate?: string | null;
  admissionDate?: string | null;
  dischargeDate?: string | null;
  hearingVisionPrescriptionDate?: string | null;
  disabilityStartDate?: string | null;
  disabilityEndDate?: string | null;
  lastWorkedDate?: string | null;
  authorizedReturnToWorkDate?: string | null;
  assumedCareDate?: string | null;
  relinquishedCareDate?: string | null;
};
export type ParsedBatch = {
  claims: ParsedClaim[];
  isaSenderId?: string | null;
  isaReceiverId?: string | null;
  /** Y-m-d */
  isaDate?: string | null;
  /** H:i:s */
  isaTime?: string | null;
  isaControlNumber?: string | null;
  /** Y-m-d from first BHT04 */
  bhtDate?: string | null;
  gsSenderCode?: string | null;
  gsReceiverCode?: string | null;
  gsControlNumber?: string | null;
  gsVersionCode?: string | null;
  parseErrors: string[];
};
