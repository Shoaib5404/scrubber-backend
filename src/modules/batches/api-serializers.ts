import { Prisma } from '@prisma/client';

/** Laravel LengthAwarePaginator core fields used by API clients. */
export function laravelPaginator<T>(
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
  isaSenderId: string | null;
  isaReceiverId: string | null;
  isaControlNumber: string | null;
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
}) {
  return {
    id: batch.id,
    filename: batch.filename,
    original_filename: batch.originalFilename,
    file_path: batch.filePath,
    file_size: batch.fileSize,
    uploaded_by: batch.uploadedById,
    isa_sender_id: batch.isaSenderId,
    isa_receiver_id: batch.isaReceiverId,
    isa_control_number: batch.isaControlNumber,
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
  subscriberLastName: string | null;
  subscriberFirstName: string | null;
  subscriberMemberId: string | null;
  payerName: string | null;
  payerId: string | null;
  patientLastName: string | null;
  patientFirstName: string | null;
  placeOfService: string | null;
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
    subscriber_last_name: claim.subscriberLastName,
    subscriber_first_name: claim.subscriberFirstName,
    subscriber_member_id: claim.subscriberMemberId,
    payer_name: claim.payerName,
    payer_id: claim.payerId,
    patient_last_name: claim.patientLastName,
    patient_first_name: claim.patientFirstName,
    place_of_service: claim.placeOfService,
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
