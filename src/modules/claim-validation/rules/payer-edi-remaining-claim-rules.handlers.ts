import { ClaimRuleDefinition } from '../config/claim-rules.config';
import { MEMBER_ID_FORMAT_RULES } from '../config/member-id-format-rules.config';
import { MEMBER_ID_RULES } from '../config/member-id-rules.config';
import { AETNA_MEMBER_ID_PATTERNS } from '../config/payer-edi-messages';
import {
  ADMISSION_HOSPITAL_CARE_CPT_CODES,
  ADMISSION_SUBSEQUENT_SAME_DOS_MESSAGE,
  BCBS_FL_MULTIPLE_PRIMARY_ONLY_MESSAGE,
  BCBS_FL_PAYER_ID,
  BCBS_FL_PRIMARY_ONLY_ICD_CODES,
  BCBS_FL_PRIMARY_ONLY_POSITION_MESSAGE,
  BCBS_FL_Z01_PRIMARY_ABK_ICD_CODES,
  BCBS_FL_Z01_PRIMARY_ABK_MESSAGE,
  BMI_ICD_CODES,
  BMI_PRINCIPAL_EXCLUDED_CPT_RANGES,
  BMI_PRINCIPAL_EXCLUDED_HCPCS_CODES,
  BMI_PRINCIPAL_EXCLUDED_HCPCS_PREFIXES,
  BMI_PRINCIPAL_POSITION_MESSAGE,
  CERUMEN_ALLOWED_ICD_CODES,
  CERUMEN_NON_SUPPORTIVE_ICD_MESSAGE,
  CERUMEN_REMOVAL_PROCEDURE_CODES,
  CLAIM_LEVEL_DATE_MIN,
  COB_AMOUNT_NON_NEGATIVE_MESSAGE,
  CONSULTATION_REFERRING_LIBRARY_MISMATCH_MESSAGE,
  CONSULTATION_REFERRING_REQUIRED_MESSAGE,
  DELAY_REASON_CLAIM_AGE_DAYS,
  DELAY_REASON_MEDICAID_PAYER_ID,
  DELAY_REASON_PAPER_SUBMISSION,
  DELAY_REASON_REQUIRED_MESSAGE,
  DOS_AFTER_TRANSACTION_SET_CREATION_MESSAGE,
  EMBLEM_FIDELIS_FOBT_AGE_MESSAGE,
  EMBLEM_FIDELIS_FOBT_CPT_REQUIRES_ICD_MESSAGE,
  EMBLEM_FIDELIS_FOBT_ICD_CODES,
  EMBLEM_FIDELIS_FOBT_ICD_REQUIRES_CPT_MESSAGE,
  EMBLEM_FIDELIS_FOBT_MAX_AGE_YEARS,
  EMBLEM_FIDELIS_FOBT_MIN_AGE_YEARS,
  EMBLEM_FIDELIS_FOBT_PAYER_IDS,
  EMBLEM_FIDELIS_FOBT_PROCEDURE_CODES,
  EPSDT_EP_AGE_MESSAGE,
  EPSDT_EP_MAX_AGE_YEARS,
  EPSDT_MEDICAID_FILING_INDICATOR,
  EPSDT_MODIFIER,
  EPSDT_PROCEDURE_CODES,
  HOSPITAL_ADMISSION_EM_CPT_RANGES,
  HOSPITAL_ADMISSION_EM_UNIT_DOS_MESSAGE,
  HOSPITAL_DISCHARGE_EM_DISCHARGE_DATE_MESSAGE,
  HOSPITAL_DISCHARGE_EM_PROCEDURE_CODES,
  HOSPITAL_DISCHARGE_EM_REQUIRED_UNITS,
  HOSPITAL_DISCHARGE_EM_SAME_DAY_DOS_MESSAGE,
  HOSPITAL_DISCHARGE_EM_UNITS_MESSAGE,
  INITIAL_TREATMENT_DATE_REQUIRED_MESSAGE,
  INITIAL_TREATMENT_TAXONOMY_CODES,
  INVALID_MEMBER_ID_BLOCKLIST_PATTERN,
  LAB_CLIA_FILING_INDICATORS,
  LAB_CLIA_INVALID_FORMAT_MESSAGE,
  LAB_CLIA_MISSING_MESSAGE,
  LAB_CLIA_NUMBER_PATTERN,
  LAB_CLIA_REQUIRED_MESSAGE,
  LAB_QW_INVALID_MESSAGE,
  LAB_QW_MODIFIER,
  LAB_SPECIMEN_COLLECTION_CLIA_NOT_REQUIRED_MESSAGE,
  LAB_SPECIMEN_COLLECTION_INFO_CODE,
  LAB_SPECIMEN_COLLECTION_ONLY_CODES,
  LAST_SEEN_DATE_REQUIRED_MESSAGE,
  LAST_SEEN_TAXONOMY_CODES,
  MCR_VACCINE_ADMIN_FILING_INDICATORS,
  MCR_VACCINE_ADMIN_REQUIRED_ICD,
  MCR_VACCINE_ADMIN_REQUIRED_MESSAGE,
  MEDICARE_COB_OTHER_FILING_INDICATORS,
  MEDICARE_COB_OTHER_PAYER_CLAIM_CONTROL_MESSAGE,
  OTHER_SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  SEQUELA_NOT_PRINCIPAL_MESSAGE,
  SEQUELA_NOT_PRINCIPAL_PAYER_IDS,
  SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
  SUBSEQUENT_HOSPITAL_CARE_CPT_CODES,
  V49_PIP_AUTO_ICD_CODES,
  V49_PIP_AUTO_MESSAGE,
  V49_PIP_AUTO_PAPER_PAYER_ID,
  VACCINE_ADDITIONAL_ADMIN_90461,
  VACCINE_ADDITIONAL_ADMIN_90461_MISSING_MESSAGE,
  VACCINE_ADDITIONAL_ADMIN_90472,
  VACCINE_ADDITIONAL_ADMIN_90472_MISSING_MESSAGE,
  VACCINE_ADMIN_90460_90461_AGE_MESSAGE,
  VACCINE_ADMIN_90460_MAX_AGE_YEARS,
  VACCINE_ADMIN_CONFLICT_GROUP_1_CODES,
  VACCINE_ADMIN_CONFLICT_GROUP_1_LABEL,
  VACCINE_ADMIN_CONFLICT_GROUP_2_CODES,
  VACCINE_ADMIN_CONFLICT_GROUP_2_LABEL,
  VACCINE_ADMIN_EXCLUDED_FILING_INDICATORS,
  VACCINE_ADMIN_SAME_DOS_CONFLICT_MESSAGE,
  VACCINE_PRIMARY_ADMIN_90460,
  VACCINE_PRIMARY_ADMIN_90460_MISSING_MESSAGE,
  VACCINE_PRIMARY_ADMIN_90471,
  VACCINE_PRIMARY_ADMIN_90471_MISSING_MESSAGE,
  VALID_MEMBER_ID_FORMAT_PATTERN,
  WELL_VISIT_BLOCKED_CPT_RANGES,
  WELL_VISIT_CPT_NOT_ALLOWED_MEDICARE_MESSAGE,
  WELL_VISIT_EM_MESSAGE,
  WELL_VISIT_ICD_CODES,
  WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_FILING_INDICATOR,
  WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_MESSAGE,
  WELL_VISIT_NOT_ALLOWED_MEDICARE_FILING_INDICATOR,
  WELL_VISIT_OFFICE_EM_CPT_RANGES,
  WELL_VISIT_REQUIRED_ICD_FILING_INDICATOR,
  WELL_VISIT_REQUIRED_ICD_MESSAGE,
  WELL_VISIT_REQUIRED_ICD_RANGE_END,
  WELL_VISIT_REQUIRED_ICD_RANGE_START,
  WELL_VISIT_VACCINE_REQUIRED_ICD,
  WELL_VISIT_VACCINE_REQUIRES_Z23_MESSAGE,
} from '../config/payer-edi-claim-constants';
import { normalizeIcdCode, withIcdDot } from '../support/icd-tabular-notes';
import {
  digitsOnly,
  formatYmd,
  normalizePayerId,
  parseClaimDate,
  startOfLocalDay,
} from '../support/payer-edi.helpers';
import { ClaimIssue } from '../types';
import {
  OtherSubscriberInput,
  PayerEdiClaimInput,
  PayerEdiDiagnosisInput,
  PayerEdiServiceLineInput,
} from '../types/payer-edi.types';
export type RemainingClaimRuleLookups = {
  medicaidAlMemberIdFormatsActive?: boolean;
  consultationProcedureSet?: Record<string, true>;
  npiOrderingReferringByNpi?: Record<string, { last_name: string | null }>;
  vaccineComponentCountByCode?: Record<string, number>;
  mcrVaccineAdminByVaccineCode?: Record<string, string>;
  labCodeModifiersByHcpcs?: Record<string, Record<string, true>>;
};

type CptRange = { from: number; to: number };
const APOSTROPHE_VARIANTS = ['\u2019', '\u2018', '`', '\u00B4', '\u2032'];

function issue(
  definition: ClaimRuleDefinition,
  field: string,
  message: string,
  severity: ClaimIssue['severity'] = 'error',
  rule?: string,
): ClaimIssue {
  return { rule: rule ?? definition.ruleCode, field, message, severity };
}

function others(claim: PayerEdiClaimInput): OtherSubscriberInput[] {
  return claim.otherSubscribers ?? [];
}
function diags(claim: PayerEdiClaimInput): PayerEdiDiagnosisInput[] {
  return claim.diagnoses ?? [];
}
function formatIcd(code: string): string {
  const norm = normalizeIcdCode(code);
  return norm === '' ? code.trim() : withIcdDot(norm);
}
function cptInRanges(code: string, ranges: readonly CptRange[]): boolean {
  if (code === '' || !/^\d+$/.test(code)) return false;
  const value = Number(code);
  return ranges.some((r) => value >= r.from && value <= r.to);
}
function ageYears(dob: Date, on: Date): number {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age -= 1;
  return age;
}
function earliestDos(claim: PayerEdiClaimInput): Date | null {
  let earliest: Date | null = null;
  for (const line of claim.serviceLines) {
    const dos = parseClaimDate(line.serviceDateFrom);
    if (dos == null) continue;
    if (earliest == null || dos.getTime() < earliest.getTime()) earliest = dos;
  }
  return earliest;
}
function creationCaps(claim: PayerEdiClaimInput): Date[] {
  const dates: Date[] = [];
  const isa = parseClaimDate(claim.batchIsaDate);
  if (isa != null) dates.push(isa);
  const bht = parseClaimDate(claim.transactionSetCreationDate ?? claim.batchBhtDate ?? null);
  if (bht != null) dates.push(bht);
  return dates;
}
function passesClaimLevelDate(
  claim: PayerEdiClaimInput,
  value: Date | string | null | undefined,
): boolean {
  const date = parseClaimDate(value);
  if (date == null) return false;
  const minDate = parseClaimDate(CLAIM_LEVEL_DATE_MIN);
  if (minDate != null && date.getTime() < minDate.getTime()) return false;
  if (creationCaps(claim).some((cap) => date.getTime() > cap.getTime())) return false;
  const earliest = earliestDos(claim);
  if (earliest != null && date.getTime() > earliest.getTime()) return false;
  return true;
}
function formatDateMsg(value: Date | string | null | undefined): string {
  const date = parseClaimDate(value);
  return date != null ? formatYmd(date) : String(value ?? '').trim();
}
function hasSubscriberEntity(claim: PayerEdiClaimInput): boolean {
  return (
    String(claim.subscriberLastName ?? '').trim() !== '' ||
    String(claim.subscriberFirstName ?? '').trim() !== ''
  );
}
function hasOtherEntity(other: OtherSubscriberInput): boolean {
  return (
    String(other.lastName ?? '').trim() !== '' ||
    String(other.firstName ?? '').trim() !== '' ||
    String(other.middleName ?? '').trim() !== ''
  );
}
function hasReferring(claim: PayerEdiClaimInput): boolean {
  return [
    claim.referringProviderLastName,
    claim.referringProviderFirstName,
    claim.referringProviderMiddleName,
    claim.referringProviderNpi,
  ].some((v) => String(v ?? '').trim() !== '');
}
function normalizeLastName(name: string | null | undefined): string {
  let n = String(name ?? '')
    .trim()
    .toUpperCase();
  if (n === '') return '';
  for (const v of APOSTROPHE_VARIANTS) n = n.split(v).join("'");
  return n;
}
function matchesPayerIds(claim: PayerEdiClaimInput, payerIds: readonly string[]): boolean {
  const claimPayerId = normalizePayerId(claim.payerId);
  if (claimPayerId === '') return false;
  return payerIds.map((id) => normalizePayerId(id)).includes(claimPayerId);
}
function icdLookup(codes: readonly string[]): Record<string, true> {
  const lookup: Record<string, true> = {};
  for (const code of codes) {
    const n = normalizeIcdCode(code);
    if (n !== '') lookup[n] = true;
  }
  return lookup;
}
function procLookup(codes: readonly string[]): Record<string, true> {
  const lookup: Record<string, true> = {};
  for (const code of codes) {
    const n = String(code).trim().toUpperCase();
    if (n !== '') lookup[n] = true;
  }
  return lookup;
}
function principalDiagnosis(claim: PayerEdiClaimInput): PayerEdiDiagnosisInput | null {
  const list = diags(claim);
  if (list.length === 0) return null;
  const byType = list.find((d) => {
    const type = String(d.type ?? '')
      .trim()
      .toLowerCase();
    const qualifier = String(d.qualifier ?? '')
      .trim()
      .toUpperCase();
    return type === 'principal' || qualifier === 'ABK';
  });
  if (byType != null) return byType;
  return (
    list.find((d) => d.sequence === 1) ??
    [...list].sort((a, b) => a.sequence - b.sequence)[0] ??
    null
  );
}
function icdInCategoryRange(norm: string, startCat: string, endCat: string): boolean {
  if (norm === '' || norm.length < 3) return false;
  const category = norm.slice(0, 3).toUpperCase();
  return (
    category >= startCat.slice(0, 3).toUpperCase() && category <= endCat.slice(0, 3).toUpperCase()
  );
}
function wellVisitProcMatch(cpt: string, definition: ClaimRuleDefinition): boolean {
  const codes = ((definition.cptCodes as string[] | undefined) ?? []).map((c) =>
    String(c).trim().toUpperCase(),
  );
  if (codes.includes(cpt)) return true;
  const ranges = (definition.cptRanges as CptRange[] | undefined) ?? [];
  return ranges.length > 0 && cptInRanges(cpt, ranges);
}
function wellVisitFilingMatch(claim: PayerEdiClaimInput, definition: ClaimRuleDefinition): boolean {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '') return false;
  const indicators = definition.filingIndicators as string[] | undefined;
  if (indicators != null && indicators.length > 0) {
    return indicators.map((v) => String(v).trim().toUpperCase()).includes(filing);
  }
  return (
    filing ===
    String(definition.filingIndicator ?? WELL_VISIT_REQUIRED_ICD_FILING_INDICATOR)
      .trim()
      .toUpperCase()
  );
}
function unitsEqual(units: number | string | null | undefined, required: number): boolean {
  if (units == null || units === '') return false;
  const n = Number(units);
  return Number.isFinite(n) && Math.abs(n - required) < 0.00001;
}
function sameStartEndDos(line: PayerEdiServiceLineInput): boolean {
  const from = parseClaimDate(line.serviceDateFrom);
  if (from == null) return false;
  const to = parseClaimDate(line.serviceDateTo);
  if (to == null) return true;
  return from.getTime() === to.getTime();
}
function sumUnits(claim: PayerEdiClaimInput, procedureCode: string): number {
  const target = procedureCode.trim().toUpperCase();
  if (target === '') return 0;
  let total = 0;
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code !== target) continue;
    const n = Number(line.units);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}
function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) return null;
  return Number(trimmed);
}
function exactModField(line: PayerEdiServiceLineInput, modifier: string): string | null {
  const fields: Array<[string, string | null | undefined]> = [
    ['modifier_1', line.modifier1],
    ['modifier_2', line.modifier2],
    ['modifier_3', line.modifier3],
    ['modifier_4', line.modifier4],
  ];
  for (const [field, raw] of fields) {
    if (String(raw ?? '').trim() === modifier) return field;
  }
  return null;
}
function upperModField(line: PayerEdiServiceLineInput, modifier: string): string | null {
  const target = modifier.trim().toUpperCase();
  const fields: Array<[string, string | null | undefined]> = [
    ['modifier_1', line.modifier1],
    ['modifier_2', line.modifier2],
    ['modifier_3', line.modifier3],
    ['modifier_4', line.modifier4],
  ];
  for (const [field, raw] of fields) {
    if (String(raw ?? '').trim().toUpperCase() === target) return field;
  }
  return null;
}
function ordinal(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  if (position === 4) return '4th';
  return `${position}th`;
}
function formatMdY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function memberIdPassesPayerFormatRules(
  claim: PayerEdiClaimInput,
  memberId: string,
  lookups: RemainingClaimRuleLookups,
): boolean {
  const payerId = normalizePayerId(claim.payerId);
  if (payerId === '') return false;
  let formatDefinition = MEMBER_ID_FORMAT_RULES[payerId];
  if (formatDefinition == null) formatDefinition = MEMBER_ID_FORMAT_RULES[payerId.toUpperCase()];
  if (formatDefinition != null) return formatDefinition.pattern.test(memberId);
  const definition = MEMBER_ID_RULES[payerId] ?? MEMBER_ID_RULES[payerId.toUpperCase()];
  if (definition == null) return false;
  switch (definition.type) {
    case 'no_subscriber_ssn':
      return false;
    case 'aetna_member_id':
      if (String(claim.payerId ?? '').trim().toLowerCase() === 'paper') return false;
      return AETNA_MEMBER_ID_PATTERNS.some((p) => p.test(memberId));
    case 'medicaid_al_member_id':
      if (!lookups.medicaidAlMemberIdFormatsActive) return false;
      return definition.pattern.test(memberId);
    case 'ssn_or_nine_digit': {
      const ssn = String(claim.subscriberSsn ?? '').trim();
      if (ssn !== '') return digitsOnly(memberId) === digitsOnly(ssn);
      return /^\d{9}$/.test(memberId);
    }
    case 'regex':
      return definition.pattern.test(memberId);
    default: {
      const _exhaustive: never = definition;
      return _exhaustive;
    }
  }
}

function isInvalidMemberId(memberId: string, blocklist: RegExp, format: RegExp): boolean {
  if (!format.test(memberId)) return true;
  return blocklist.test(memberId);
}

export function validateBcbsSecondaryMedicareWait(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  today: Date,
): ClaimIssue | null {
  const billing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (billing !== String(definition.billingFilingIndicator ?? 'BL').toUpperCase()) return null;
  const expectedPrimary = String(definition.primaryFilingIndicator ?? 'MB').toUpperCase();
  const othersList = others(claim);
  let match: { index: number; other: OtherSubscriberInput } | null = null;
  for (let index = 0; index < othersList.length; index++) {
    const other = othersList[index];
    if (String(other.payerResponsibility ?? '').trim().toUpperCase() !== 'P') continue;
    if (String(other.claimFilingIndicator ?? '').trim().toUpperCase() !== expectedPrimary) continue;
    match = { index, other };
    break;
  }
  if (match == null) return null;
  const field =
    match.index === 0 ? 'other_subscribers' : `other_subscribers.${match.index}.remittance_date`;
  const remittanceDate = parseClaimDate(match.other.remittanceDate);
  if (remittanceDate == null) {
    return issue(
      definition,
      field,
      'BCBS AS SECONDARY DOES NOT ACCEPT CLAIMS UNTIL 30 DAYS AFTER THE MEDICARE PAYMENT DATE, PLEASE SUBMIT THIS CLAIM ON OR AFTER (MM/DD/YYYY)',
    );
  }
  const waitDays = Number(definition.waitDays ?? 30);
  const eligible = startOfLocalDay(
    new Date(remittanceDate.getFullYear(), remittanceDate.getMonth(), remittanceDate.getDate() + waitDays),
  );
  if (today.getTime() >= eligible.getTime()) return null;
  const msg = String(
    definition.message ||
      'BCBS as secondary does not accept claims until 30 days after the Medicare payment date. Please submit this claim on or after %s',
  ).replace('%s', formatMdY(eligible));
  return issue(definition, field, msg);
}

export function validateMedicareCobOtherPayerClaimControlRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const responsibility = String(claim.payerResponsibility ?? '')
    .trim()
    .toUpperCase();
  if (responsibility !== String(definition.payerResponsibility ?? 'S').toUpperCase()) return [];
  const billing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (billing !== String(definition.billingFilingIndicator ?? 'BL').toUpperCase()) return [];
  const otherIndicators = (
    (definition.otherFilingIndicators as string[] | undefined) ?? [
      ...MEDICARE_COB_OTHER_FILING_INDICATORS,
    ]
  ).map((c) => String(c).trim().toUpperCase());
  const errors: ClaimIssue[] = [];
  const list = others(claim);
  for (let index = 0; index < list.length; index++) {
    const other = list[index];
    const otherIndicator = String(other.claimFilingIndicator ?? '')
      .trim()
      .toUpperCase();
    if (otherIndicator === '' || !otherIndicators.includes(otherIndicator)) continue;
    const hasNm1 =
      String(other.hasOtherPayerNm1 ?? '')
        .trim()
        .toUpperCase() === 'Y' ||
      String(other.payerName ?? '').trim() !== '' ||
      String(other.payerId ?? '').trim() !== '';
    const control = String(other.payerClaimControlNumber ?? '').trim();
    if (hasNm1 && control !== '') continue;
    errors.push(
      issue(
        definition,
        index === 0
          ? 'other_subscribers.payer_claim_control_number'
          : `other_subscribers.${index}.payer_claim_control_number`,
        definition.message || MEDICARE_COB_OTHER_PAYER_CLAIM_CONTROL_MESSAGE,
      ),
    );
  }
  return errors;
}

export function validateSubscriberOtherSubscriberMemberIdRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (!hasSubscriberEntity(claim)) return [];
  const errors: ClaimIssue[] = [];
  if (String(claim.subscriberMemberId ?? '').trim() === '') {
    errors.push(
      issue(
        definition,
        'subscriber_member_id',
        definition.message || SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
      ),
    );
  }
  const otherMsg =
    String(definition.otherSubscriberMessage ?? '').trim() ||
    OTHER_SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE;
  const list = others(claim);
  for (let index = 0; index < list.length; index++) {
    const other = list[index];
    if (!hasOtherEntity(other)) continue;
    if (String(other.memberId ?? '').trim() !== '') continue;
    errors.push(
      issue(
        definition,
        index === 0 ? 'other_subscribers' : `other_subscribers.${index}.member_id`,
        otherMsg,
      ),
    );
  }
  return errors;
}

export function validateSubscriberOtherSubscriberMemberIdInvalid(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (!hasSubscriberEntity(claim)) return [];
  const blocklist =
    (definition.pattern as RegExp | undefined) ?? INVALID_MEMBER_ID_BLOCKLIST_PATTERN;
  const format =
    (definition.formatPattern as RegExp | undefined) ?? VALID_MEMBER_ID_FORMAT_PATTERN;
  const errors: ClaimIssue[] = [];
  const subscriberMemberId = String(claim.subscriberMemberId ?? '').trim();
  if (
    subscriberMemberId !== '' &&
    isInvalidMemberId(subscriberMemberId, blocklist, format) &&
    !memberIdPassesPayerFormatRules(claim, subscriberMemberId, lookups)
  ) {
    errors.push(
      issue(
        definition,
        'subscriber_member_id',
        definition.message || SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE,
      ),
    );
  }
  const otherMsg =
    String(definition.otherSubscriberMessage ?? '').trim() ||
    OTHER_SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE;
  const list = others(claim);
  for (let index = 0; index < list.length; index++) {
    const other = list[index];
    if (!hasOtherEntity(other)) continue;
    const memberId = String(other.memberId ?? '').trim();
    if (memberId === '' || !isInvalidMemberId(memberId, blocklist, format)) continue;
    errors.push(
      issue(
        definition,
        index === 0 ? 'other_subscribers' : `other_subscribers.${index}.member_id`,
        otherMsg,
      ),
    );
  }
  return errors;
}

export function validatePrincipalDiagnosisAbkOnly(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const expectedPayerId = normalizePayerId(
    String(definition.payerId ?? BCBS_FL_PAYER_ID),
  );
  if (expectedPayerId !== '') {
    const claimPayerId = normalizePayerId(claim.payerId);
    if (claimPayerId === '' || claimPayerId !== expectedPayerId) return [];
  }
  const restricted = icdLookup(
    (definition.codes as string[] | undefined) ?? BCBS_FL_Z01_PRIMARY_ABK_ICD_CODES,
  );
  if (Object.keys(restricted).length === 0) return [];
  const requiredQualifier = String(definition.qualifier ?? 'ABK')
    .trim()
    .toUpperCase();
  const errors: ClaimIssue[] = [];
  for (const diagnosis of diags(claim)) {
    const diagnosisCode = String(diagnosis.code ?? '').trim();
    if (diagnosisCode === '') continue;
    const normalized = normalizeIcdCode(diagnosisCode);
    if (!restricted[normalized]) continue;
    const qualifier = String(diagnosis.qualifier ?? '')
      .trim()
      .toUpperCase();
    if (qualifier === requiredQualifier) continue;
    const sequence = diagnosis.sequence;
    errors.push(
      issue(
        definition,
        sequence > 0 ? `diagnoses.${sequence}.code` : 'diagnoses',
        (definition.message || BCBS_FL_Z01_PRIMARY_ABK_MESSAGE).replace(
          '%s',
          formatIcd(diagnosisCode),
        ),
      ),
    );
  }
  return errors;
}

export function validateSequelaNotAllowedAsPrincipal(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const payerIds = (
    (definition.payerIds as string[] | undefined) ?? [...SEQUELA_NOT_PRINCIPAL_PAYER_IDS]
  ).map((id) => normalizePayerId(id));
  const claimPayerId = normalizePayerId(claim.payerId);
  if (claimPayerId === '' || !payerIds.includes(claimPayerId)) return null;
  const principal = principalDiagnosis(claim);
  if (principal == null) return null;
  const rawCode = String(principal.code ?? '').trim();
  const normalized = normalizeIcdCode(rawCode);
  if (!(normalized.length === 7 && normalized.endsWith('S'))) return null;
  const sequence = principal.sequence;
  return issue(
    definition,
    sequence > 0 ? `diagnoses.${sequence}.code` : 'diagnoses',
    (definition.message || SEQUELA_NOT_PRINCIPAL_MESSAGE).replace('%s', formatIcd(rawCode)),
  );
}

export function validateV49RequiresPaperPayer(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const allowed = String(definition.allowedPayerId ?? V49_PIP_AUTO_PAPER_PAYER_ID)
    .trim()
    .toLowerCase();
  const claimPayerId = String(claim.payerId ?? '')
    .trim()
    .toLowerCase();
  if (allowed !== '' && claimPayerId === allowed) return [];
  const restricted = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? V49_PIP_AUTO_ICD_CODES,
  );
  if (Object.keys(restricted).length === 0) return [];
  const errors: ClaimIssue[] = [];
  for (const diagnosis of diags(claim)) {
    const diagnosisCode = String(diagnosis.code ?? '').trim();
    if (diagnosisCode === '') continue;
    if (!restricted[normalizeIcdCode(diagnosisCode)]) continue;
    const sequence = diagnosis.sequence;
    errors.push(
      issue(
        definition,
        sequence > 0 ? `diagnoses.${sequence}.code` : 'diagnoses',
        definition.message || V49_PIP_AUTO_MESSAGE,
      ),
    );
  }
  return errors;
}

export function validateEmblemFidelisEligibleIcdRequiresCpt(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (
    !matchesPayerIds(
      claim,
      (definition.payerIds as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PAYER_IDS,
    )
  ) {
    return [];
  }
  const eligibleIcds = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_ICD_CODES,
  );
  const eligibleProcs = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PROCEDURE_CODES,
  );
  if (Object.keys(eligibleIcds).length === 0 || Object.keys(eligibleProcs).length === 0) return [];
  const matching = diags(claim).filter((d) => {
    const code = String(d.code ?? '').trim();
    return code !== '' && eligibleIcds[normalizeIcdCode(code)];
  });
  if (matching.length === 0) return [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt !== '' && eligibleProcs[cpt]) return [];
  }
  return matching.map((diagnosis) =>
    issue(
      definition,
      diagnosis.sequence > 0 ? `diagnoses.${diagnosis.sequence}.code` : 'diagnoses',
      (definition.message || EMBLEM_FIDELIS_FOBT_ICD_REQUIRES_CPT_MESSAGE).replace(
        '%s',
        formatIcd(String(diagnosis.code ?? '')),
      ),
    ),
  );
}

export function validateEmblemFidelisEligibleCptRequiresLinkedIcd(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (
    !matchesPayerIds(
      claim,
      (definition.payerIds as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PAYER_IDS,
    )
  ) {
    return [];
  }
  const eligibleIcds = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_ICD_CODES,
  );
  const eligibleProcs = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PROCEDURE_CODES,
  );
  if (Object.keys(eligibleIcds).length === 0 || Object.keys(eligibleProcs).length === 0) return [];
  const bySeq = new Map<number, PayerEdiDiagnosisInput>();
  for (const d of diags(claim)) {
    if (d.sequence > 0) bySeq.set(d.sequence, d);
  }
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !eligibleProcs[cpt]) continue;
    const pointers = line.diagnosisPointers ?? [];
    let linked = false;
    for (const pointer of pointers) {
      const diagnosis = bySeq.get(Number(pointer));
      if (diagnosis == null) continue;
      const norm = normalizeIcdCode(String(diagnosis.code ?? ''));
      if (norm !== '' && eligibleIcds[norm]) {
        linked = true;
        break;
      }
    }
    if (linked) continue;
    const lineNumber = line.lineNumber;
    errors.push(
      issue(
        definition,
        lineNumber > 0
          ? `service_lines.${lineNumber}.diagnosis_pointers`
          : `service_lines.${lineNumber}.procedure_code`,
        (definition.message || EMBLEM_FIDELIS_FOBT_CPT_REQUIRES_ICD_MESSAGE).replace('%s', cpt),
      ),
    );
  }
  return errors;
}

export function validateEmblemFidelisEligibleCptAgeRange(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  if (
    !matchesPayerIds(
      claim,
      (definition.payerIds as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PAYER_IDS,
    )
  ) {
    return [];
  }
  const eligibleProcs = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? EMBLEM_FIDELIS_FOBT_PROCEDURE_CODES,
  );
  if (Object.keys(eligibleProcs).length === 0) return [];
  const dob = parseClaimDate(claim.patientDob ?? claim.subscriberDob);
  if (dob == null) return [];
  const minAge = Number(definition.minAgeYears ?? EMBLEM_FIDELIS_FOBT_MIN_AGE_YEARS);
  const maxAge = Number(definition.maxAgeYears ?? EMBLEM_FIDELIS_FOBT_MAX_AGE_YEARS);
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !eligibleProcs[cpt]) continue;
    const serviceDate = parseClaimDate(line.serviceDateFrom) ?? earliestDos(claim);
    if (serviceDate == null || serviceDate.getTime() < dob.getTime()) continue;
    const age = ageYears(dob, serviceDate);
    if (age >= minAge && age <= maxAge) continue;
    errors.push(
      issue(
        definition,
        line.lineNumber > 0 ? `service_lines.${line.lineNumber}.procedure_code` : 'patient_dob',
        (definition.message || EMBLEM_FIDELIS_FOBT_AGE_MESSAGE).replace('%s', cpt),
      ),
    );
  }
  return errors;
}

export function validateBmiNotAllowedAsPrincipalWithHcpcs(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const bmi = icdLookup((definition.icdCodes as string[] | undefined) ?? BMI_ICD_CODES);
  if (Object.keys(bmi).length === 0) return [];
  const list = diags(claim);
  if (list.length === 0) return [];
  const bySeq = new Map<number, PayerEdiDiagnosisInput>();
  for (const d of list) {
    if (d.sequence > 0) bySeq.set(d.sequence, d);
  }
  const message = String(definition.message || BMI_PRINCIPAL_POSITION_MESSAGE);
  const warnings: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const hcpcs = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (hcpcs === '' || isBmiExcluded(hcpcs, definition)) continue;
    const pointers = line.diagnosisPointers ?? [];
    if (pointers.length === 0) continue;
    const first = bySeq.get(Number(pointers[0]));
    if (first == null) continue;
    const rawIcd = String(first.code ?? '').trim();
    const norm = normalizeIcdCode(rawIcd);
    if (norm === '' || !bmi[norm]) continue;
    warnings.push(
      issue(
        definition,
        line.lineNumber > 0
          ? `service_lines.${line.lineNumber}.diagnosis_pointers`
          : first.sequence > 0
            ? `diagnoses.${first.sequence}.code`
            : 'diagnoses',
        message.replace('%s', formatIcd(rawIcd)).replace('%s', hcpcs).replace('%s', hcpcs),
        'warning',
      ),
    );
  }
  if (warnings.length > 0) return warnings;
  const principal =
    list.find((d) => String(d.type ?? '').trim().toLowerCase() === 'principal') ??
    list.find((d) => d.sequence === 1) ??
    [...list].sort((a, b) => a.sequence - b.sequence)[0];
  if (principal == null) return [];
  const rawIcd = String(principal.code ?? '').trim();
  const norm = normalizeIcdCode(rawIcd);
  if (norm === '' || !bmi[norm]) return [];
  return [
    issue(
      definition,
      principal.sequence > 0 ? `diagnoses.${principal.sequence}.code` : 'diagnoses',
      message.replace('%s', formatIcd(rawIcd)).replace('%s', '').replace('%s', ''),
      'warning',
    ),
  ];
}

function isBmiExcluded(hcpcs: string, definition: ClaimRuleDefinition): boolean {
  const excludedCodes = (
    (definition.excludedHcpcsCodes as string[] | undefined) ?? [
      ...BMI_PRINCIPAL_EXCLUDED_HCPCS_CODES,
    ]
  ).map((c) => c.trim().toUpperCase());
  if (excludedCodes.includes(hcpcs)) return true;
  const prefixes = (
    (definition.excludedHcpcsPrefixes as string[] | undefined) ?? [
      ...BMI_PRINCIPAL_EXCLUDED_HCPCS_PREFIXES,
    ]
  ).map((p) => p.trim().toUpperCase());
  if (hcpcs !== '' && prefixes.includes(hcpcs.slice(0, 1))) return true;
  const ranges =
    (definition.excludedCptRanges as CptRange[] | undefined) ?? BMI_PRINCIPAL_EXCLUDED_CPT_RANGES;
  return cptInRanges(hcpcs, ranges);
}

export function validateCobAmountsNonNegative(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const msg = definition.message || COB_AMOUNT_NON_NEGATIVE_MESSAGE;
  const list = others(claim);
  for (let index = 0; index < list.length; index++) {
    const other = list[index];
    const paid = parseAmount(other.paidAmount);
    if (paid != null && paid < 0) {
      errors.push(
        issue(
          definition,
          index === 0
            ? 'other_subscribers.payer_paid_amount'
            : `other_subscribers.${index}.payer_paid_amount`,
          msg.replace('%s', 'AMT*D'),
        ),
      );
    }
    const liability = parseAmount(other.remainingPatientLiability);
    if (liability != null && liability < 0) {
      errors.push(
        issue(
          definition,
          index === 0
            ? 'other_subscribers.remaining_patient_liability'
            : `other_subscribers.${index}.remaining_patient_liability`,
          msg.replace('%s', 'AMT*EAF'),
        ),
      );
    }
  }
  for (const line of claim.serviceLines) {
    const svd = parseAmount(line.otherPayerPaidAmount);
    if (svd != null && svd < 0) {
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.other_payer_paid_amount`,
          msg.replace('%s', 'SVD02'),
        ),
      );
    }
  }
  return errors;
}

export function validateCommercialReferringProviderNpiDistinct(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const claimPayerId = normalizePayerId(claim.payerId).toUpperCase();
  const payerIds = ((definition.payerIds as string[] | undefined) ?? ['11315', '87726', 'BS022']).map(
    (id) => normalizePayerId(id).toUpperCase(),
  );
  if (claimPayerId === '' || !payerIds.includes(claimPayerId)) return null;
  if (!hasReferring(claim)) return null;
  const referringNpi = String(claim.referringProviderNpi ?? '').trim();
  if (referringNpi === '') {
    return issue(definition, 'referring_provider_npi', definition.message || 'Referring provider is missing/invalid.');
  }
  const billingNpi = String(claim.billingProviderNpi ?? '').trim();
  if (billingNpi !== '' && referringNpi === billingNpi) {
    return issue(definition, 'referring_provider_npi', definition.message || 'Referring provider is missing/invalid.');
  }
  const renderingNpi = String(claim.renderingProviderNpi ?? '').trim();
  if (renderingNpi !== '' && referringNpi === renderingNpi) {
    return issue(definition, 'referring_provider_npi', definition.message || 'Referring provider is missing/invalid.');
  }
  return null;
}

export function validateConsultationReferringRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue | null {
  const consultationSet = lookups.consultationProcedureSet ?? {};
  const consultationCodes: string[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || consultationCodes.includes(code) || !consultationSet[code]) continue;
    consultationCodes.push(code);
  }
  if (consultationCodes.length === 0) return null;
  if (!hasReferring(claim)) {
    return issue(
      definition,
      'referring_provider_npi',
      (definition.message || CONSULTATION_REFERRING_REQUIRED_MESSAGE).replace(
        '%s',
        consultationCodes.join(', '),
      ),
    );
  }
  const referringNpi = String(claim.referringProviderNpi ?? '').trim();
  const registryRow =
    referringNpi === '' ? null : (lookups.npiOrderingReferringByNpi?.[referringNpi] ?? null);
  if (registryRow != null) {
    const registryLast = normalizeLastName(registryRow.last_name);
    const claimLast = normalizeLastName(claim.referringProviderLastName);
    if (registryLast !== '' && claimLast === registryLast) return null;
  }
  return issue(
    definition,
    'referring_provider_npi',
    String(definition.mismatchMessage || CONSULTATION_REFERRING_LIBRARY_MISMATCH_MESSAGE),
    'error',
    String(definition.mismatchRuleCode ?? 'CONSULT-REF-002'),
  );
}

export function validateInitialTreatmentDateRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const taxonomy = String(claim.billingProviderTaxonomy ?? '')
    .trim()
    .toUpperCase();
  const taxonomyCodes = (
    (definition.taxonomyCodes as string[] | undefined) ?? [...INITIAL_TREATMENT_TAXONOMY_CODES]
  ).map((c) => c.toUpperCase());
  if (taxonomy === '' || !taxonomyCodes.includes(taxonomy)) return null;
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  const filingIndicators = (
    (definition.filingIndicators as string[] | undefined) ?? ['MA', 'MB']
  ).map((c) => c.toUpperCase());
  if (filing === '' || !filingIndicators.includes(filing)) return null;
  if (passesClaimLevelDate(claim, claim.initialTreatmentDate)) return null;
  return issue(
    definition,
    'initial_treatment_date',
    (definition.message || INITIAL_TREATMENT_DATE_REQUIRED_MESSAGE)
      .replace('%s', formatDateMsg(claim.initialTreatmentDate))
      .replace('%s', taxonomy),
  );
}

export function validateLastSeenDateRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const taxonomy = String(claim.billingProviderTaxonomy ?? '')
    .trim()
    .toUpperCase();
  const taxonomyCodes = (
    (definition.taxonomyCodes as string[] | undefined) ?? [...LAST_SEEN_TAXONOMY_CODES]
  ).map((c) => c.toUpperCase());
  if (taxonomy === '' || !taxonomyCodes.includes(taxonomy)) return null;
  if (passesClaimLevelDate(claim, claim.lastSeenDate)) return null;
  return issue(
    definition,
    'last_seen_date',
    (definition.message || LAST_SEEN_DATE_REQUIRED_MESSAGE)
      .replace('%s', formatDateMsg(claim.lastSeenDate))
      .replace('%s', taxonomy),
  );
}

export function validateAdmissionSubsequentSameDos(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const admissionCodes = procLookup(
    (definition.admissionCodes as string[] | undefined) ?? ADMISSION_HOSPITAL_CARE_CPT_CODES,
  );
  const subsequentCodes = procLookup(
    (definition.subsequentCodes as string[] | undefined) ?? SUBSEQUENT_HOSPITAL_CARE_CPT_CODES,
  );
  if (Object.keys(admissionCodes).length === 0 || Object.keys(subsequentCodes).length === 0) {
    return [];
  }
  const admissionLines: PayerEdiServiceLineInput[] = [];
  const subsequentLines: PayerEdiServiceLineInput[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '') continue;
    if (admissionCodes[code]) admissionLines.push(line);
    if (subsequentCodes[code]) subsequentLines.push(line);
  }
  if (admissionLines.length === 0 || subsequentLines.length === 0) return [];
  const errors: ClaimIssue[] = [];
  for (const admissionLine of admissionLines) {
    const admissionRange = serviceDateRange(admissionLine);
    if (admissionRange == null) continue;
    for (const subsequentLine of subsequentLines) {
      const subsequentRange = serviceDateRange(subsequentLine);
      if (subsequentRange == null) continue;
      if (!rangesOverlap(admissionRange, subsequentRange)) continue;
      const firstLine =
        admissionLine.lineNumber <= subsequentLine.lineNumber ? admissionLine : subsequentLine;
      const secondLine = firstLine === admissionLine ? subsequentLine : admissionLine;
      errors.push(
        issue(
          definition,
          `service_lines.${firstLine.lineNumber}.procedure_code`,
          (definition.message || ADMISSION_SUBSEQUENT_SAME_DOS_MESSAGE)
            .replace(
              '%s',
              String(firstLine.procedureCode ?? '')
                .trim()
                .toUpperCase(),
            )
            .replace(
              '%s',
              String(secondLine.procedureCode ?? '')
                .trim()
                .toUpperCase(),
            ),
        ),
      );
    }
  }
  return errors;
}

function serviceDateRange(line: PayerEdiServiceLineInput): [Date, Date] | null {
  const from = parseClaimDate(line.serviceDateFrom);
  if (from == null) return null;
  let to = parseClaimDate(line.serviceDateTo) ?? from;
  if (to.getTime() < from.getTime()) to = from;
  return [from, to];
}
function rangesOverlap(left: [Date, Date], right: [Date, Date]): boolean {
  return left[0].getTime() <= right[1].getTime() && right[0].getTime() <= left[1].getTime();
}

export function validateDelayReasonRequiredForAgedMedicaid(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  today: Date,
): ClaimIssue | null {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing !== String(definition.filingIndicator ?? 'MC').toUpperCase()) return null;
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(
    String(definition.payerId ?? DELAY_REASON_MEDICAID_PAYER_ID),
  );
  if (claimPayerId === '' || claimPayerId !== expectedPayerId) return null;
  const submission = String(claim.submissionMethod ?? '').trim();
  const excluded = String(
    definition.excludedSubmissionMethod ?? DELAY_REASON_PAPER_SUBMISSION,
  ).trim();
  if (excluded !== '' && submission.toLowerCase() === excluded.toLowerCase()) return null;
  const minAgeDays = Number(definition.minClaimAgeDays ?? DELAY_REASON_CLAIM_AGE_DAYS);
  const earliest = earliestDos(claim);
  if (earliest == null) return null;
  const reference = parseClaimDate(claim.batchIsaDate) ?? today;
  const ageDays =
    reference.getTime() < earliest.getTime()
      ? 0
      : Math.floor((reference.getTime() - earliest.getTime()) / 86400000);
  if (ageDays <= minAgeDays) return null;
  if (String(claim.delayReasonCode ?? '').trim() !== '') return null;
  return issue(
    definition,
    'delay_reason_code',
    definition.message || DELAY_REASON_REQUIRED_MESSAGE,
  );
}

export function validateEmNotAllowedWithWellVisitIcd(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const wellVisitIcds = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? WELL_VISIT_ICD_CODES,
  );
  if (Object.keys(wellVisitIcds).length === 0) return [];
  const ranges =
    (definition.cptRanges as CptRange[] | undefined) ?? WELL_VISIT_BLOCKED_CPT_RANGES;
  const matchingLines = claim.serviceLines.filter((line) => {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    return cpt !== '' && cptInRanges(cpt, ranges);
  });
  if (matchingLines.length === 0) return [];
  const errors: ClaimIssue[] = [];
  for (const diagnosis of diags(claim)) {
    const rawIcd = String(diagnosis.code ?? '').trim();
    const normalized = normalizeIcdCode(rawIcd);
    if (normalized === '' || !wellVisitIcds[normalized]) continue;
    const display = rawIcd !== '' ? rawIcd.toUpperCase() : normalized;
    for (const line of matchingLines) {
      const cpt = String(line.procedureCode ?? '')
        .trim()
        .toUpperCase();
      errors.push(
        issue(
          definition,
          diagnosis.sequence > 0
            ? `diagnoses.${diagnosis.sequence}.code`
            : `service_lines.${line.lineNumber}.procedure_code`,
          (definition.message || WELL_VISIT_EM_MESSAGE)
            .replace('%s', display)
            .replace('%s', cpt),
        ),
      );
    }
  }
  return errors;
}

export function validateWellVisitRequiresZ00Z13Principal(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  if (!wellVisitFilingMatch(claim, definition)) return null;
  const hasProc = claim.serviceLines.some((line) => {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    return cpt !== '' && wellVisitProcMatch(cpt, definition);
  });
  if (!hasProc) return null;
  const principal = principalDiagnosis(claim);
  const rawCode = String(principal?.code ?? '').trim();
  const normalized = normalizeIcdCode(rawCode);
  const rangeStart = String(
    definition.icdRangeStart ?? WELL_VISIT_REQUIRED_ICD_RANGE_START,
  )
    .trim()
    .toUpperCase();
  const rangeEnd = String(definition.icdRangeEnd ?? WELL_VISIT_REQUIRED_ICD_RANGE_END)
    .trim()
    .toUpperCase();
  if (icdInCategoryRange(normalized, rangeStart, rangeEnd)) return null;
  const sequence = principal?.sequence ?? 0;
  const display = rawCode !== '' ? formatIcd(rawCode) : '';
  return issue(
    definition,
    sequence > 0 ? `diagnoses.${sequence}.code` : 'diagnoses',
    (definition.message || WELL_VISIT_REQUIRED_ICD_MESSAGE).replace('%s', display),
  );
}

export function validateWellVisitCptNotAllowedForMedicareMb(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const expected = String(
    definition.filingIndicator ?? WELL_VISIT_NOT_ALLOWED_MEDICARE_FILING_INDICATOR,
  )
    .trim()
    .toUpperCase();
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== expected) return [];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !wellVisitProcMatch(cpt, definition)) continue;
    errors.push(
      issue(
        definition,
        line.lineNumber > 0
          ? `service_lines.${line.lineNumber}.procedure_code`
          : 'service_lines',
        (definition.message || WELL_VISIT_CPT_NOT_ALLOWED_MEDICARE_MESSAGE).replace('%s', cpt),
      ),
    );
  }
  return errors;
}

export function validateWellVisitVaccineRequiresZ23Principal(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const requiredIcd = normalizeIcdCode(
    String(definition.requiredIcd ?? WELL_VISIT_VACCINE_REQUIRED_ICD),
  );
  const principal = principalDiagnosis(claim);
  const principalNorm = normalizeIcdCode(String(principal?.code ?? '').trim());
  if (requiredIcd !== '' && principalNorm === requiredIcd) return [];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !wellVisitProcMatch(cpt, definition)) continue;
    errors.push(
      issue(
        definition,
        line.lineNumber > 0
          ? `service_lines.${line.lineNumber}.procedure_code`
          : 'service_lines',
        (definition.message || WELL_VISIT_VACCINE_REQUIRES_Z23_MESSAGE).replace('%s', cpt),
      ),
    );
  }
  return errors;
}

export function validateWellVisitIcdNotAllowedWithOfficeEm(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const expected = String(
    definition.filingIndicator ?? WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_FILING_INDICATOR,
  )
    .trim()
    .toUpperCase();
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '' || filing !== expected) return [];
  const ranges =
    (definition.cptRanges as CptRange[] | undefined) ?? WELL_VISIT_OFFICE_EM_CPT_RANGES;
  const matchingLines = claim.serviceLines.filter((line) => {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    return cpt !== '' && cptInRanges(cpt, ranges);
  });
  if (matchingLines.length === 0) return [];
  const rangeStart = String(
    definition.icdRangeStart ?? WELL_VISIT_REQUIRED_ICD_RANGE_START,
  )
    .trim()
    .toUpperCase();
  const rangeEnd = String(definition.icdRangeEnd ?? WELL_VISIT_REQUIRED_ICD_RANGE_END)
    .trim()
    .toUpperCase();
  const errors: ClaimIssue[] = [];
  for (const diagnosis of diags(claim)) {
    const rawIcd = String(diagnosis.code ?? '').trim();
    const normalized = normalizeIcdCode(rawIcd);
    if (!icdInCategoryRange(normalized, rangeStart, rangeEnd)) continue;
    const display = rawIcd !== '' ? formatIcd(rawIcd) : normalized;
    for (const line of matchingLines) {
      const cpt = String(line.procedureCode ?? '')
        .trim()
        .toUpperCase();
      errors.push(
        issue(
          definition,
          diagnosis.sequence > 0
            ? `diagnoses.${diagnosis.sequence}.code`
            : line.lineNumber > 0
              ? `service_lines.${line.lineNumber}.procedure_code`
              : 'diagnoses',
          (definition.message || WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_MESSAGE)
            .replace('%s', display)
            .replace('%s', cpt),
        ),
      );
    }
  }
  return errors;
}

export function validateMcrVaccineRequiresRelativeAdminCode(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (!wellVisitFilingMatch(claim, { ...definition, filingIndicators: definition.filingIndicators ?? [...MCR_VACCINE_ADMIN_FILING_INDICATORS] })) {
    return [];
  }
  const requiredIcd = normalizeIcdCode(
    String(definition.requiredIcd ?? MCR_VACCINE_ADMIN_REQUIRED_ICD),
  );
  if (requiredIcd === '' || !diags(claim).some((d) => normalizeIcdCode(d.code) === requiredIcd)) {
    return [];
  }
  const vaccineAdminByCode = lookups.mcrVaccineAdminByVaccineCode ?? {};
  if (Object.keys(vaccineAdminByCode).length === 0) return [];
  const onClaim: Record<string, true> = {};
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code !== '') onClaim[code] = true;
  }
  const errors: ClaimIssue[] = [];
  const reported: Record<string, true> = {};
  for (const line of claim.serviceLines) {
    const vaccineCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (vaccineCode === '' || vaccineAdminByCode[vaccineCode] == null || reported[vaccineCode]) {
      continue;
    }
    const adminCode = vaccineAdminByCode[vaccineCode];
    if (adminCode === '' || onClaim[adminCode]) continue;
    reported[vaccineCode] = true;
    errors.push(
      issue(
        definition,
        line.lineNumber > 0
          ? `service_lines.${line.lineNumber}.procedure_code`
          : 'service_lines',
        (definition.message || MCR_VACCINE_ADMIN_REQUIRED_MESSAGE)
          .replace('%s', adminCode)
          .replace('%s', vaccineCode),
      ),
    );
  }
  return errors;
}

function libraryVaccineLines(
  claim: PayerEdiClaimInput,
  componentByVaccine: Record<string, number>,
): PayerEdiServiceLineInput[] {
  const admin: Record<string, true> = {
    [VACCINE_PRIMARY_ADMIN_90471]: true,
    [VACCINE_ADDITIONAL_ADMIN_90472]: true,
    [VACCINE_PRIMARY_ADMIN_90460]: true,
    [VACCINE_ADDITIONAL_ADMIN_90461]: true,
  };
  return claim.serviceLines
    .filter((line) => {
      const code = String(line.procedureCode ?? '')
        .trim()
        .toUpperCase();
      return code !== '' && !admin[code] && componentByVaccine[code] != null;
    })
    .sort((a, b) => a.lineNumber - b.lineNumber);
}

function excludedVaccineFiling(claim: PayerEdiClaimInput, definition: ClaimRuleDefinition): boolean {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '') return false;
  const excluded = (
    (definition.excludedFilingIndicators as string[] | undefined) ?? [
      ...VACCINE_ADMIN_EXCLUDED_FILING_INDICATORS,
    ]
  ).map((v) => String(v).trim().toUpperCase());
  return excluded.includes(filing);
}

export function validateVaccineAdmin90471(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (excludedVaccineFiling(claim, definition)) return [];
  const componentByVaccine = lookups.vaccineComponentCountByCode ?? {};
  if (Object.keys(componentByVaccine).length === 0) return [];
  const vaccineLines = libraryVaccineLines(claim, componentByVaccine);
  if (vaccineLines.length === 0) return [];
  const primary = String(definition.primaryAdminCode ?? VACCINE_PRIMARY_ADMIN_90471)
    .trim()
    .toUpperCase();
  const additional = String(definition.additionalAdminCode ?? VACCINE_ADDITIONAL_ADMIN_90472)
    .trim()
    .toUpperCase();
  const errors: ClaimIssue[] = [];
  if (sumUnits(claim, primary) <= 0) {
    errors.push(
      issue(
        definition,
        'service_lines',
        String(definition.primaryMissingMessage || VACCINE_PRIMARY_ADMIN_90471_MISSING_MESSAGE),
      ),
    );
  }
  const additionalVaccineCount = vaccineLines.length - 1;
  if (additionalVaccineCount > 0) {
    const additionalUnits = sumUnits(claim, additional);
    if (!unitsEqual(additionalUnits, additionalVaccineCount)) {
      errors.push(
        issue(
          definition,
          'service_lines',
          String(
            definition.additionalMissingMessage || VACCINE_ADDITIONAL_ADMIN_90472_MISSING_MESSAGE,
          ).replace('%s', String(additionalVaccineCount)),
        ),
      );
    }
  }
  return errors;
}

export function validateVaccineAdmin90460(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (excludedVaccineFiling(claim, definition)) return [];
  const componentByVaccine = lookups.vaccineComponentCountByCode ?? {};
  if (Object.keys(componentByVaccine).length === 0) return [];
  const vaccineLines = libraryVaccineLines(claim, componentByVaccine);
  if (vaccineLines.length === 0) return [];
  const primary = String(definition.primaryAdminCode ?? VACCINE_PRIMARY_ADMIN_90460)
    .trim()
    .toUpperCase();
  const additional = String(definition.additionalAdminCode ?? VACCINE_ADDITIONAL_ADMIN_90461)
    .trim()
    .toUpperCase();
  const vaccineCount = vaccineLines.length;
  let requiredToxoidUnits = 0;
  for (const line of vaccineLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    requiredToxoidUnits += Math.max(0, (componentByVaccine[code] ?? 0) - 1);
  }
  const errors: ClaimIssue[] = [];
  const primaryUnits = sumUnits(claim, primary);
  if (primaryUnits <= 0 || !unitsEqual(primaryUnits, vaccineCount)) {
    errors.push(
      issue(
        definition,
        'service_lines',
        String(definition.primaryMissingMessage || VACCINE_PRIMARY_ADMIN_90460_MISSING_MESSAGE),
      ),
    );
  }
  const additionalUnits = sumUnits(claim, additional);
  if (!unitsEqual(additionalUnits, requiredToxoidUnits)) {
    let missingToxoid = Math.max(0, requiredToxoidUnits - Math.floor(additionalUnits));
    if (additionalUnits <= 0) missingToxoid = requiredToxoidUnits;
    if (requiredToxoidUnits > 0 || additionalUnits > 0) {
      errors.push(
        issue(
          definition,
          'service_lines',
          String(
            definition.additionalMissingMessage || VACCINE_ADDITIONAL_ADMIN_90461_MISSING_MESSAGE,
          ).replace('%s', String(missingToxoid)),
        ),
      );
    }
  }
  const maxAge = Number(definition.maxAgeYears ?? VACCINE_ADMIN_90460_MAX_AGE_YEARS);
  const dob = parseClaimDate(claim.patientDob ?? claim.subscriberDob);
  const serviceDate = earliestDos(claim);
  if (dob != null && serviceDate != null && serviceDate.getTime() >= dob.getTime()) {
    if (ageYears(dob, serviceDate) > maxAge) {
      errors.push(
        issue(
          definition,
          'patient_dob',
          String(definition.ageMessage || VACCINE_ADMIN_90460_90461_AGE_MESSAGE),
        ),
      );
    }
  }
  return errors;
}

export function validateVaccineAdminGroupConflict(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue | null {
  const group1 = procLookup(
    (definition.group1Codes as string[] | undefined) ?? VACCINE_ADMIN_CONFLICT_GROUP_1_CODES,
  );
  const group2 = procLookup(
    (definition.group2Codes as string[] | undefined) ?? VACCINE_ADMIN_CONFLICT_GROUP_2_CODES,
  );
  if (Object.keys(group1).length === 0 || Object.keys(group2).length === 0) return null;
  const g1Dos: Record<string, true> = {};
  const g2Dos: Record<string, true> = {};
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '') continue;
    const in1 = !!group1[code];
    const in2 = !!group2[code];
    if (!in1 && !in2) continue;
    const dos = parseClaimDate(line.serviceDateFrom);
    if (dos == null) continue;
    const key = formatYmd(dos);
    if (in1) g1Dos[key] = true;
    if (in2) g2Dos[key] = true;
  }
  const conflict = Object.keys(g1Dos).some((k) => g2Dos[k]);
  if (!conflict) return null;
  return issue(
    definition,
    'service_lines',
    (definition.message || VACCINE_ADMIN_SAME_DOS_CONFLICT_MESSAGE)
      .replace('%s', String(definition.group1Label ?? VACCINE_ADMIN_CONFLICT_GROUP_1_LABEL))
      .replace('%s', String(definition.group2Label ?? VACCINE_ADMIN_CONFLICT_GROUP_2_LABEL)),
  );
}

export function validateHospitalAdmissionEmUnitAndSameDos(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const ranges =
    (definition.cptRanges as CptRange[] | undefined) ?? HOSPITAL_ADMISSION_EM_CPT_RANGES;
  const requiredUnits = Number(definition.requiredUnits ?? 1);
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !cptInRanges(cpt, ranges)) continue;
    if (unitsEqual(line.units, requiredUnits) && sameStartEndDos(line)) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        (definition.message || HOSPITAL_ADMISSION_EM_UNIT_DOS_MESSAGE).replace('%s', cpt),
      ),
    );
  }
  return errors;
}

export function validateEpsdtModifierAgeExceedsMax(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (
    filing !==
    String(definition.medicaidFilingIndicator ?? EPSDT_MEDICAID_FILING_INDICATOR).toUpperCase()
  ) {
    return [];
  }
  const dob = parseClaimDate(claim.patientDob ?? claim.subscriberDob);
  if (dob == null) return [];
  const requiredModifier = String(definition.modifier ?? EPSDT_MODIFIER);
  const maxAge = Number(definition.maxAgeYears ?? EPSDT_EP_MAX_AGE_YEARS);
  const procedureLookup = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? EPSDT_PROCEDURE_CODES,
  );
  const severity = (definition.severity as ClaimIssue['severity']) ?? 'warning';
  const warnings: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !procedureLookup[code]) continue;
    const modifierField = exactModField(line, requiredModifier);
    if (modifierField == null) continue;
    const serviceDate =
      parseClaimDate(line.serviceDateFrom) ?? earliestDos(claim) ?? startOfLocalDay(new Date());
    if (serviceDate.getTime() < dob.getTime()) continue;
    const age = ageYears(dob, serviceDate);
    if (age <= maxAge) continue;
    warnings.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.${modifierField}`,
        (definition.message || EPSDT_EP_AGE_MESSAGE)
          .replace('%s', code)
          .replace('%s', String(age)),
        severity,
      ),
    );
  }
  return warnings;
}

export function validateHospitalDischargeEmRequirements(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const procedureLookup = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? HOSPITAL_DISCHARGE_EM_PROCEDURE_CODES,
  );
  const requiredUnits = Number(definition.requiredUnits ?? HOSPITAL_DISCHARGE_EM_REQUIRED_UNITS);
  const hasDischargeDate = parseClaimDate(claim.dischargeDate) != null;
  const errors: ClaimIssue[] = [];
  let matchedDischargeCpt: string | null = null;
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || !procedureLookup[code]) continue;
    matchedDischargeCpt ??= code;
    if (!unitsEqual(line.units, requiredUnits)) {
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.units`,
          String(definition.unitsMessage || HOSPITAL_DISCHARGE_EM_UNITS_MESSAGE).replace(
            '%s',
            code,
          ),
          'error',
          String(definition.unitsRuleCode ?? 'CPT-DC-002'),
        ),
      );
    }
    const from = parseClaimDate(line.serviceDateFrom);
    const to = parseClaimDate(line.serviceDateTo);
    if (from != null && to != null && from.getTime() !== to.getTime()) {
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.service_date_to`,
          String(
            definition.sameDayDosMessage || HOSPITAL_DISCHARGE_EM_SAME_DAY_DOS_MESSAGE,
          ).replace('%s', code),
          'error',
          String(definition.sameDayDosRuleCode ?? 'CPT-DC-003'),
        ),
      );
    }
  }
  if (matchedDischargeCpt != null && !hasDischargeDate) {
    errors.push(
      issue(
        definition,
        'discharge_date',
        String(
          definition.dischargeDateMessage || HOSPITAL_DISCHARGE_EM_DISCHARGE_DATE_MESSAGE,
        ).replace('%s', matchedDischargeCpt),
        'error',
        String(definition.dischargeDateRuleCode ?? definition.ruleCode ?? 'CPT-DC-001'),
      ),
    );
  }
  return errors;
}

export function validateBcbsFlPrimaryOnlyIcd(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const claimPayerId = normalizePayerId(claim.payerId);
  const expectedPayerId = normalizePayerId(String(definition.payerId ?? BCBS_FL_PAYER_ID));
  if (claimPayerId === '' || expectedPayerId === '' || claimPayerId !== expectedPayerId) return [];
  const primaryOnly = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? BCBS_FL_PRIMARY_ONLY_ICD_CODES,
  );
  if (Object.keys(primaryOnly).length === 0) return [];
  const bySeq = new Map<number, PayerEdiDiagnosisInput>();
  for (const d of diags(claim)) {
    if (d.sequence > 0) bySeq.set(d.sequence, d);
  }
  if (bySeq.size === 0) return [];
  const nonPrimaryRule = String(
    definition.nonPrimaryRuleCode ?? definition.ruleCode ?? 'ICD-BCBSFL-001',
  );
  const multipleRule = String(definition.multipleRuleCode ?? 'ICD-BCBSFL-002');
  const nonPrimaryMsg = String(
    definition.nonPrimaryMessage || BCBS_FL_PRIMARY_ONLY_POSITION_MESSAGE,
  );
  const multipleMsg = String(
    definition.multipleMessage || BCBS_FL_MULTIPLE_PRIMARY_ONLY_MESSAGE,
  );
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const pointers = line.diagnosisPointers ?? [];
    if (pointers.length === 0) continue;
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const hits: Array<{ position: number; ordinal: string; display: string }> = [];
    pointers.forEach((pointer, index) => {
      const diagnosis = bySeq.get(Number(pointer));
      if (diagnosis == null) return;
      const rawIcd = String(diagnosis.code ?? '').trim();
      const norm = normalizeIcdCode(rawIcd);
      if (norm === '' || !primaryOnly[norm]) return;
      const position = index + 1;
      hits.push({ position, ordinal: ordinal(position), display: formatIcd(rawIcd) });
    });
    if (hits.length === 0) continue;
    for (const hit of hits) {
      if (hit.position === 1) continue;
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.diagnosis_pointers`,
          nonPrimaryMsg
            .replace('%s', hit.display)
            .replace('%s', cpt)
            .replace('%s', hit.ordinal),
          'error',
          nonPrimaryRule,
        ),
      );
    }
    if (hits.length > 1) {
      errors.push(
        issue(
          definition,
          `service_lines.${line.lineNumber}.diagnosis_pointers`,
          multipleMsg
            .replace('%s', hits.map((h) => h.display).join(', '))
            .replace('%s', cpt)
            .replace('%s', hits.map((h) => h.ordinal).join(', ')),
          'error',
          multipleRule,
        ),
      );
    }
  }
  return errors;
}

export function validateCerumenRemovalRequiresSupportiveIcd(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const allowedProcs = procLookup(
    (definition.procedureCodes as string[] | undefined) ?? CERUMEN_REMOVAL_PROCEDURE_CODES,
  );
  const allowedIcds = icdLookup(
    (definition.icdCodes as string[] | undefined) ?? CERUMEN_ALLOWED_ICD_CODES,
  );
  if (Object.keys(allowedProcs).length === 0 || Object.keys(allowedIcds).length === 0) return [];
  const hasSupportive = diags(claim).some((d) => {
    const n = normalizeIcdCode(String(d.code ?? ''));
    return n !== '' && allowedIcds[n];
  });
  if (hasSupportive) return [];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const cpt = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cpt === '' || !allowedProcs[cpt]) continue;
    errors.push({
      ...issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        (definition.message || CERUMEN_NON_SUPPORTIVE_ICD_MESSAGE).replace('%s', cpt),
      ),
      policy_modal: 'cerumen-plan-policy',
    });
  }
  return errors;
}

export function validateDosNotAfterTransactionSetCreationDate(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const bhtDate = parseClaimDate(claim.transactionSetCreationDate ?? claim.batchBhtDate ?? null);
  if (bhtDate == null) return [];
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const from = parseClaimDate(line.serviceDateFrom);
    const to = parseClaimDate(line.serviceDateTo) ?? from;
    const fromInvalid = from != null && from.getTime() > bhtDate.getTime();
    const toInvalid = to != null && to.getTime() > bhtDate.getTime();
    if (!fromInvalid && !toInvalid) continue;
    errors.push(
      issue(
        definition,
        fromInvalid
          ? `service_lines.${line.lineNumber}.service_date_from`
          : `service_lines.${line.lineNumber}.service_date_to`,
        definition.message || DOS_AFTER_TRANSACTION_SET_CREATION_MESSAGE,
      ),
    );
  }
  return errors;
}

function labExcluded(definition: ClaimRuleDefinition): Record<string, true> {
  return procLookup(
    (definition.excludedCodes as string[] | undefined) ?? LAB_SPECIMEN_COLLECTION_ONLY_CODES,
  );
}

function isLabFiling(claim: PayerEdiClaimInput, definition: ClaimRuleDefinition): boolean {
  const filing = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  if (filing === '') return false;
  const allowed = (
    (definition.filingIndicators as string[] | undefined) ?? [...LAB_CLIA_FILING_INDICATORS]
  ).map((v) => String(v).trim().toUpperCase());
  return allowed.includes(filing);
}

export function validateLabCliaRequiredForLabCodes(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (!isLabFiling(claim, definition)) return [];
  if (String(claim.cliaNumber ?? '').trim() !== '') return [];
  const excluded = labExcluded(definition);
  const labMods = lookups.labCodeModifiersByHcpcs ?? {};
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || excluded[code] || labMods[code] == null) continue;
    errors.push(
      issue(
        definition,
        'clia_number',
        (definition.message || LAB_CLIA_REQUIRED_MESSAGE).replace('%s', code),
      ),
    );
  }
  return errors;
}

export function validateLabSpecimenCollectionCliaNotRequired(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
): ClaimIssue[] {
  const target = String(definition.procedureCode ?? LAB_SPECIMEN_COLLECTION_INFO_CODE)
    .trim()
    .toUpperCase();
  const severity = (definition.severity as ClaimIssue['severity']) ?? 'info';
  const infos: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code !== target) continue;
    infos.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.procedure_code`,
        definition.message || LAB_SPECIMEN_COLLECTION_CLIA_NOT_REQUIRED_MESSAGE,
        severity,
      ),
    );
  }
  return infos;
}

export function validateLabQwModifierApplicability(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  const required = String(definition.modifier ?? LAB_QW_MODIFIER)
    .trim()
    .toUpperCase();
  const labMods = lookups.labCodeModifiersByHcpcs ?? {};
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const modifierField = upperModField(line, required);
    if (modifierField == null) continue;
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    const allowed = labMods[code] ?? {};
    if (allowed[required]) continue;
    errors.push(
      issue(
        definition,
        `service_lines.${line.lineNumber}.${modifierField}`,
        (definition.message || LAB_QW_INVALID_MESSAGE).replace(
          '%s',
          code !== '' ? code : '(MISSING)',
        ),
      ),
    );
  }
  return errors;
}

export function validateLabCliaPresenceAndFormat(
  claim: PayerEdiClaimInput,
  definition: ClaimRuleDefinition,
  lookups: RemainingClaimRuleLookups,
): ClaimIssue[] {
  if (!isLabFiling(claim, definition)) return [];
  const excluded = labExcluded(definition);
  const labMods = lookups.labCodeModifiersByHcpcs ?? {};
  const cliaNumber = String(claim.cliaNumber ?? '').trim();
  const pattern = (definition.pattern as RegExp | undefined) ?? LAB_CLIA_NUMBER_PATTERN;
  const missingRule = String(definition.missingRuleCode ?? definition.ruleCode);
  const invalidRule = String(definition.invalidRuleCode ?? definition.ruleCode);
  const missingMsg = String(definition.missingMessage || LAB_CLIA_MISSING_MESSAGE);
  const invalidMsg = String(definition.invalidMessage || LAB_CLIA_INVALID_FORMAT_MESSAGE);
  const errors: ClaimIssue[] = [];
  for (const line of claim.serviceLines) {
    const code = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (code === '' || excluded[code] || labMods[code] == null) continue;
    if (cliaNumber === '') {
      errors.push(
        issue(definition, 'clia_number', missingMsg.replace('%s', code), 'error', missingRule),
      );
      continue;
    }
    if (!pattern.test(cliaNumber)) {
      errors.push(
        issue(definition, 'clia_number', invalidMsg.replace('%s', code), 'error', invalidRule),
      );
    }
  }
  return errors;
}
