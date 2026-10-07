export type ClaimLevelDates = {
  onsetOfIllnessDate: Date | null;
  lastMenstrualPeriodDate: Date | null;
  initialTreatmentDate: Date | null;
  lastSeenDate: Date | null;
  accidentDate: Date | null;
  lastXrayDate: Date | null;
  admissionDate: Date | null;
  dischargeDate: Date | null;
  hearingVisionPrescriptionDate: Date | null;
  disabilityStartDate: Date | null;
  disabilityEndDate: Date | null;
  lastWorkedDate: Date | null;
  authorizedReturnToWorkDate: Date | null;
  assumedCareDate: Date | null;
  relinquishedCareDate: Date | null;
};

export type PayerEdiServiceLineInput = {
  lineNumber: number;
  serviceDateFrom: Date | null;
  serviceDateTo: Date | null;
};

export type OtherSubscriberInput = {
  ssn?: string | null;
  relationshipCode?: string | null;
};

export type PayerEdiClaimInput = ClaimLevelDates & {
  payerId: string | null;
  subscriberMemberId: string | null;
  subscriberSsn: string | null;
  claimFilingIndicator: string | null;
  placeOfService: string | null;
  relatedCausesCode: string | null;
  patientGender: string | null;
  subscriberGender: string | null;
  billingProviderCity: string | null;
  subscriberAddress: string | null;
  patientAddress: string | null;
  facilityName: string | null;
  facilityNpi: string | null;
  facilityAddress: string | null;
  billingProviderZip: string | null;
  billingProviderState: string | null;
  patientState: string | null;
  subscriberState: string | null;
  facilityState: string | null;
  otherSubscribers?: OtherSubscriberInput[] | null;
  serviceLines: PayerEdiServiceLineInput[];
};
