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
  procedureCode?: string | null;
  units?: number | null;
  modifier1?: string | null;
  modifier2?: string | null;
  modifier3?: string | null;
  modifier4?: string | null;
  referringProviderNpi?: string | null;
  referringProviderLastName?: string | null;
  referringProviderFirstName?: string | null;
  referringProviderMiddleName?: string | null;
  diagnosisPointers?: number[] | null;
  otherPayerPaidAmount?: string | number | null;
};

export type PayerEdiDiagnosisInput = {
  sequence: number;
  code: string | null;
  type?: string | null;
  qualifier?: string | null;
};

export type OtherSubscriberInput = {
  ssn?: string | null;
  relationshipCode?: string | null;
  memberId?: string | null;
  groupNumber?: string | null;
  claimFilingIndicator?: string | null;
  payerResponsibility?: string | null;
  remittanceDate?: string | Date | null;
  payerName?: string | null;
  payerId?: string | null;
  payerClaimControlNumber?: string | null;
  hasOtherPayerNm1?: string | boolean | null;
  paidAmount?: string | number | null;
  remainingPatientLiability?: string | number | null;
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  /** 2330A other subscriber address (Laravel other_subscribers.zip_code/city/state). */
  zipCode?: string | null;
  city?: string | null;
  state?: string | null;
  addressLine1?: string | null;
  /** Other patient (when relationship not self) — Laravel patient_* keys. */
  patientLastName?: string | null;
  patientFirstName?: string | null;
  patientMiddleName?: string | null;
  patientZipCode?: string | null;
  patientCity?: string | null;
  patientState?: string | null;
  patientAddressLine1?: string | null;
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
  diagnoses?: PayerEdiDiagnosisInput[] | null;
  serviceLines: PayerEdiServiceLineInput[];

  billingProviderName?: string | null;
  billingProviderNpi?: string | null;
  billingProviderTaxId?: string | null;
  billingProviderSsn?: string | null;
  billingProviderTaxonomy?: string | null;
  billingProviderUpin?: string | null;
  billingProviderStateLicense?: string | null;
  billingProviderAddress?: string | null;
  billingProviderAddressLine1?: string | null;
  billingProviderAddressLine2?: string | null;

  subscriberLastName?: string | null;
  subscriberFirstName?: string | null;
  subscriberDob?: Date | null;
  subscriberGroupNumber?: string | null;
  subscriberGroupName?: string | null;
  subscriberRelationship?: string | null;

  payerResponsibility?: string | null;
  insuranceTypeCode?: string | null;
  frequencyCode?: string | null;
  delayReasonCode?: string | null;
  submissionMethod?: string | null;
  originalReferenceNumber?: string | null;
  priorAuthNumber?: string | null;
  referralNumber?: string | null;
  cliaNumber?: string | null;
  mammographyCertificationNumber?: string | null;

  patientLastName?: string | null;
  patientFirstName?: string | null;
  patientDob?: Date | null;
  patientRelationship?: string | null;

  renderingProviderNpi?: string | null;
  renderingProviderLastName?: string | null;
  renderingProviderFirstName?: string | null;
  renderingProviderMiddleName?: string | null;
  renderingProviderUpin?: string | null;
  renderingProviderStateLicense?: string | null;

  referringProviderNpi?: string | null;
  referringProviderLastName?: string | null;
  referringProviderFirstName?: string | null;
  referringProviderMiddleName?: string | null;
  referringProviderUpin?: string | null;
  referringProviderStateLicense?: string | null;

  transactionSetCreationDate?: Date | null;
  batchIsaDate?: Date | null;
  batchBhtDate?: Date | null;
};
