import { Prisma } from '@prisma/client';
import { formatPrismaDate } from '../edi-parser/edi-date.util';

/** Length-aware paginator fields used by API clients. */
export function lengthAwarePaginator<T>(
  rows: T[],
  total: number,
  page: number,
  perPage: number,
): {
  current_page: number;
  data: T[];
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
} {
  const lastPage = Math.max(1, Math.ceil(total / perPage) || 1);
  const from = total === 0 ? null : (page - 1) * perPage + 1;
  const to = total === 0 ? null : Math.min(page * perPage, total);
  return {
    current_page: page,
    data: rows,
    per_page: perPage,
    total,
    last_page: lastPage,
    from,
    to,
  };
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

export function isoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export type BatchStatistics = {
  total_claims: number;
  total_amount: number;
  total_service_lines: number;
  pending_claims: number;
  valid_claims: number;
  warning_claims: number;
  error_claims: number;
  status_breakdown: {
    pending: number;
    valid: number;
    warning: number;
    error: number;
  };
  unique_payers: string[];
  unique_providers: string[];
  date_range: { earliest: string | null; latest: string | null };
};

export function serializeBatch(batch: {
  id: number;
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number | null;
  uploadedById: number | null;
  tenantId?: number | null;
  isaSenderId: string | null;
  isaReceiverId: string | null;
  isaDate: Date | null;
  bhtDate: Date | null;
  isaControlNumber: string | null;
  gsSenderCode: string | null;
  gsReceiverCode: string | null;
  gsControlNumber: string | null;
  gsVersionCode: string | null;
  totalClaims: number;
  totalAmount: Prisma.Decimal | number;
  validClaims: number;
  errorClaims: number;
  warningClaims: number;
  status: string;
  errorMessage: string | null;
  ediValidationErrors: unknown;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { claims?: number };
  tenant?: { id: number; name: string; slug: string } | null;
}) {
  const tenantId = batch.tenant?.id ?? batch.tenantId ?? null;
  return {
    id: batch.id,
    filename: batch.filename,
    original_filename: batch.originalFilename,
    file_path: batch.filePath,
    file_size: batch.fileSize,
    uploaded_by: batch.uploadedById,
    tenant_id: tenantId,
    tenant_name: batch.tenant?.name ?? null,
    tenant_slug: batch.tenant?.slug ?? null,
    isa_sender_id: batch.isaSenderId,
    isa_receiver_id: batch.isaReceiverId,
    isa_date: formatPrismaDate(batch.isaDate),
    bht_date: formatPrismaDate(batch.bhtDate),
    isa_control_number: batch.isaControlNumber,
    gs_sender_code: batch.gsSenderCode,
    gs_receiver_code: batch.gsReceiverCode,
    gs_control_number: batch.gsControlNumber,
    gs_version_code: batch.gsVersionCode,
    /** API exposes `gs_version`; column is `gs_version_code`. */
    gs_version: batch.gsVersionCode,
    total_claims: batch.totalClaims,
    total_amount: decimalToNumber(batch.totalAmount),
    valid_claims: batch.validClaims,
    error_claims: batch.errorClaims,
    warning_claims: batch.warningClaims,
    status: batch.status,
    error_message: batch.errorMessage,
    edi_validation_errors: batch.ediValidationErrors,
    processed_at: batch.processedAt?.toISOString() ?? null,
    created_at: batch.createdAt.toISOString(),
    updated_at: batch.updatedAt.toISOString(),
    claims_count: batch._count?.claims ?? batch.totalClaims,
  };
}

export function serializeClaim(claim: {
  id: number;
  batchFileId: number;
  claimId: string;
  status: string;
  totalCharge: Prisma.Decimal | number;
  billingProviderName: string | null;
  billingProviderNpi: string | null;
  billingProviderTaxId?: string | null;
  billingProviderSsn?: string | null;
  billingProviderTaxonomy?: string | null;
  billingProviderUpin?: string | null;
  billingProviderStateLicense?: string | null;
  billingProviderAddress?: string | null;
  billingProviderAddressLine1?: string | null;
  billingProviderAddressLine2?: string | null;
  billingProviderCity?: string | null;
  billingProviderState?: string | null;
  billingProviderZip?: string | null;
  subscriberLastName: string | null;
  subscriberFirstName: string | null;
  subscriberMemberId: string | null;
  subscriberSsn?: string | null;
  subscriberDob?: Date | null;
  subscriberGender?: string | null;
  subscriberAddress?: string | null;
  subscriberGroupNumber?: string | null;
  subscriberGroupName?: string | null;
  subscriberRelationship?: string | null;
  payerResponsibility?: string | null;
  claimFilingIndicator?: string | null;
  insuranceTypeCode?: string | null;
  otherSubscribers?: unknown;
  patientLastName: string | null;
  patientFirstName: string | null;
  patientDob?: Date | null;
  patientGender?: string | null;
  patientRelationship?: string | null;
  patientAddress?: string | null;
  payerName: string | null;
  payerId: string | null;
  payerAddress?: string | null;
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
  facilityName?: string | null;
  facilityNpi?: string | null;
  facilityAddress?: string | null;
  placeOfService: string | null;
  frequencyCode?: string | null;
  delayReasonCode?: string | null;
  submissionMethod?: string | null;
  relatedCausesCode?: string | null;
  admissionDate?: Date | null;
  dischargeDate?: Date | null;
  onsetOfIllnessDate?: Date | null;
  lastMenstrualPeriodDate?: Date | null;
  initialTreatmentDate?: Date | null;
  lastSeenDate?: Date | null;
  accidentDate?: Date | null;
  lastXrayDate?: Date | null;
  hearingVisionPrescriptionDate?: Date | null;
  disabilityStartDate?: Date | null;
  disabilityEndDate?: Date | null;
  lastWorkedDate?: Date | null;
  authorizedReturnToWorkDate?: Date | null;
  assumedCareDate?: Date | null;
  relinquishedCareDate?: Date | null;
  priorAuthNumber?: string | null;
  referralNumber?: string | null;
  cliaNumber?: string | null;
  mammographyCertificationNumber?: string | null;
  claimNote?: string | null;
  validationErrors: unknown;
  isModified: boolean;
  createdAt: Date;
  updatedAt: Date;
  diagnoses?: Array<{
    id: number;
    sequence: number;
    code: string;
    type: string | null;
  }>;
  serviceLines?: Array<Record<string, unknown>>;
  _count?: { diagnoses?: number; serviceLines?: number };
}) {
  return {
    id: claim.id,
    batch_file_id: claim.batchFileId,
    claim_id: claim.claimId,
    status: claim.status,
    total_charge: decimalToNumber(claim.totalCharge),
    billing_provider_name: claim.billingProviderName,
    billing_provider_npi: claim.billingProviderNpi,
    billing_provider_tax_id: claim.billingProviderTaxId ?? null,
    billing_provider_ssn: claim.billingProviderSsn ?? null,
    billing_provider_taxonomy: claim.billingProviderTaxonomy ?? null,
    billing_provider_upin: claim.billingProviderUpin ?? null,
    billing_provider_state_license: claim.billingProviderStateLicense ?? null,
    billing_provider_address: claim.billingProviderAddress ?? null,
    billing_provider_address_line_1: claim.billingProviderAddressLine1 ?? null,
    billing_provider_address_line_2: claim.billingProviderAddressLine2 ?? null,
    billing_provider_city: claim.billingProviderCity ?? null,
    billing_provider_state: claim.billingProviderState ?? null,
    billing_provider_zip: claim.billingProviderZip ?? null,
    subscriber_last_name: claim.subscriberLastName,
    subscriber_first_name: claim.subscriberFirstName,
    subscriber_member_id: claim.subscriberMemberId,
    subscriber_ssn: claim.subscriberSsn ?? null,
    subscriber_dob: isoDate(claim.subscriberDob),
    subscriber_gender: claim.subscriberGender ?? null,
    subscriber_address: claim.subscriberAddress ?? null,
    subscriber_group_number: claim.subscriberGroupNumber ?? null,
    subscriber_group_name: claim.subscriberGroupName ?? null,
    subscriber_relationship: claim.subscriberRelationship ?? null,
    payer_responsibility: claim.payerResponsibility ?? null,
    claim_filing_indicator: claim.claimFilingIndicator ?? null,
    insurance_type_code: claim.insuranceTypeCode ?? null,
    other_subscribers: claim.otherSubscribers ?? null,
    patient_last_name: claim.patientLastName,
    patient_first_name: claim.patientFirstName,
    patient_dob: isoDate(claim.patientDob),
    patient_gender: claim.patientGender ?? null,
    patient_relationship: claim.patientRelationship ?? null,
    patient_address: claim.patientAddress ?? null,
    payer_name: claim.payerName,
    payer_id: claim.payerId,
    payer_address: claim.payerAddress ?? null,
    rendering_provider_npi: claim.renderingProviderNpi ?? null,
    rendering_provider_last_name: claim.renderingProviderLastName ?? null,
    rendering_provider_first_name: claim.renderingProviderFirstName ?? null,
    rendering_provider_middle_name: claim.renderingProviderMiddleName ?? null,
    rendering_provider_upin: claim.renderingProviderUpin ?? null,
    rendering_provider_state_license: claim.renderingProviderStateLicense ?? null,
    referring_provider_npi: claim.referringProviderNpi ?? null,
    referring_provider_last_name: claim.referringProviderLastName ?? null,
    referring_provider_first_name: claim.referringProviderFirstName ?? null,
    referring_provider_middle_name: claim.referringProviderMiddleName ?? null,
    referring_provider_upin: claim.referringProviderUpin ?? null,
    referring_provider_state_license: claim.referringProviderStateLicense ?? null,
    facility_name: claim.facilityName ?? null,
    facility_npi: claim.facilityNpi ?? null,
    facility_address: claim.facilityAddress ?? null,
    place_of_service: claim.placeOfService,
    frequency_code: claim.frequencyCode ?? null,
    delay_reason_code: claim.delayReasonCode ?? null,
    submission_method: claim.submissionMethod ?? null,
    related_causes_code: claim.relatedCausesCode ?? null,
    admission_date: isoDate(claim.admissionDate),
    discharge_date: isoDate(claim.dischargeDate),
    onset_of_illness_date: isoDate(claim.onsetOfIllnessDate),
    last_menstrual_period_date: isoDate(claim.lastMenstrualPeriodDate),
    initial_treatment_date: isoDate(claim.initialTreatmentDate),
    last_seen_date: isoDate(claim.lastSeenDate),
    accident_date: isoDate(claim.accidentDate),
    last_xray_date: isoDate(claim.lastXrayDate),
    hearing_vision_prescription_date: isoDate(claim.hearingVisionPrescriptionDate),
    disability_start_date: isoDate(claim.disabilityStartDate),
    disability_end_date: isoDate(claim.disabilityEndDate),
    last_worked_date: isoDate(claim.lastWorkedDate),
    authorized_return_to_work_date: isoDate(claim.authorizedReturnToWorkDate),
    assumed_care_date: isoDate(claim.assumedCareDate),
    relinquished_care_date: isoDate(claim.relinquishedCareDate),
    prior_auth_number: claim.priorAuthNumber ?? null,
    referral_number: claim.referralNumber ?? null,
    clia_number: claim.cliaNumber ?? null,
    mammography_certification_number: claim.mammographyCertificationNumber ?? null,
    claim_note: claim.claimNote ?? null,
    validation_errors: claim.validationErrors,
    is_modified: claim.isModified,
    created_at: claim.createdAt.toISOString(),
    updated_at: claim.updatedAt.toISOString(),
    diagnoses_count: claim._count?.diagnoses ?? claim.diagnoses?.length ?? 0,
    service_lines_count: claim._count?.serviceLines ?? claim.serviceLines?.length ?? 0,
    diagnoses: claim.diagnoses?.map((d) => ({
      id: d.id,
      sequence: d.sequence,
      code: d.code,
      type: d.type,
    })),
    service_lines: claim.serviceLines?.map((l) => serializeServiceLine(l as never)),
  };
}

export function serializeServiceLine(line: {
  id: number;
  claimId: number;
  lineNumber: number;
  procedureCode: string;
  procedureDescription: string | null;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
  chargeAmount: Prisma.Decimal | number;
  units: Prisma.Decimal | number;
  unitScale: string;
  serviceDateFrom: Date | null;
  serviceDateTo: Date | null;
  placeOfService: string | null;
  diagnosisPointers: unknown;
  renderingProviderNpi: string | null;
  referringProviderNpi: string | null;
  referringProviderLastName: string | null;
  referringProviderFirstName: string | null;
  referringProviderMiddleName: string | null;
  otherPayerPaidAmount: Prisma.Decimal | number | null;
  referenceId: string | null;
  ndcCode: string | null;
  ndcQuantity: Prisma.Decimal | number | null;
  ndcUnit: string | null;
  status: string;
  validationErrors: unknown;
  isModified: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: line.id,
    claim_id: line.claimId,
    line_number: line.lineNumber,
    procedure_code: line.procedureCode,
    procedure_description: line.procedureDescription,
    modifier_1: line.modifier1,
    modifier_2: line.modifier2,
    modifier_3: line.modifier3,
    modifier_4: line.modifier4,
    charge_amount: decimalToNumber(line.chargeAmount),
    units: decimalToNumber(line.units),
    unit_scale: line.unitScale,
    service_date_from: isoDate(line.serviceDateFrom),
    service_date_to: isoDate(line.serviceDateTo),
    place_of_service: line.placeOfService,
    diagnosis_pointers: line.diagnosisPointers,
    rendering_provider_npi: line.renderingProviderNpi,
    referring_provider_npi: line.referringProviderNpi,
    referring_provider_last_name: line.referringProviderLastName,
    referring_provider_first_name: line.referringProviderFirstName,
    referring_provider_middle_name: line.referringProviderMiddleName,
    other_payer_paid_amount:
      line.otherPayerPaidAmount == null ? null : decimalToNumber(line.otherPayerPaidAmount),
    reference_id: line.referenceId,
    ndc_code: line.ndcCode,
    ndc_quantity: line.ndcQuantity == null ? null : decimalToNumber(line.ndcQuantity),
    ndc_unit: line.ndcUnit,
    status: line.status,
    validation_errors: line.validationErrors,
    is_modified: line.isModified,
    created_at: line.createdAt.toISOString(),
    updated_at: line.updatedAt.toISOString(),
  };
}
