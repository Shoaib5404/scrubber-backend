/** Laravel Formats constants used by ported CLAIM_RULES handlers. */

export const BILLING_TAX_ID_PATTERN = /^\d{9}$/;
export const BILLING_TAX_ID_NOT_PLACEHOLDER_PATTERN =
  /^(?!012345678|123456789|987654321|098765432|000000000|999999999|111111111).{9}$/;
export const BILLING_TAX_ID_MESSAGE = 'Billing provider tax ID should be 9 digits numeric.';
export const BILLING_TAX_ID_INVALID_MESSAGE =
  'Billing provider tax ID/SSN %s is missing or invalid.';

export const SSN_PATTERN = /^[0-9]{9}$/;
export const SSN_INVALID_MESSAGE =
  'Social Security Number (SSN) [%s] is missing or invalid. SSN must contain 9 numeric digits. The area number cannot be 000, the group number cannot be 00, and the serial number cannot be 0000.';

export const BILLING_PROVIDER_NAME_PATTERN = /^([A-Z0-9]{2,100})/;
export const BILLING_PROVIDER_NAME_MESSAGE =
  'Billing Provider Name [%s] is missing/invalid. Minimum length should be at least 2 characters and no special characters allowed';

export const SERVICE_LOCATION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 ]{1,300}$/;
export const SERVICE_LOCATION_NAME_STARTS_WITH_NUMBER_MESSAGE =
  'Service Location Name cannot start with numbers.';
export const SERVICE_LOCATION_NAME_INVALID_MESSAGE = 'Service Location Name %s is invalid.';

export const SUBSCRIBER_NAME_PATTERN = /^[A-Z0-9]{2,50}$/;
export const SUBSCRIBER_NAME_BLOCKLIST = ['TEST', 'DEMO'] as const;
export const SUBSCRIBER_NAME_TEST_PATIENT_MESSAGE =
  'It seems a test patient, do not submit claim without due verification.';
export const SUBSCRIBER_LAST_NAME_FORMAT_PATTERN =
  /^([0-9A-Za-z &.'-]{2})+([0-9A-Za-z &.'-])?$/;
export const SUBSCRIBER_NAME_VALIDATE_MESSAGE =
  'This patient seems to be a test patient. Do not submit claim without due verification.';

export const PATIENT_LAST_NAME_PATTERN = /^([A-Za-z\-' ]{2})+([A-Za-z\- ])?$/;
export const PATIENT_FIRST_NAME_PATTERN = /^[A-Za-z \-']*$/;
export const PATIENT_LAST_NAME_INVALID_MESSAGE =
  'Patient last name %s missing/invalid. Please verify and submit the claim.';
export const PATIENT_FIRST_NAME_INVALID_MESSAGE =
  'Patient first name %s missing/invalid. Please verify and submit the claim.';

export const DOB_AFTER_DOS_MESSAGE =
  "Patient's Date of Birth (DOB) is missing/invalid; Date of Service (DOS) cannot be prior to the DOB. Correction is required to run all other edits.";

export const CLAIM_LEVEL_DATE_MIN = '2000-01-01';
export const CLAIM_LEVEL_DATE_MESSAGE = 'Claim-level date (%s) is missing/invalid.';
export const CLAIM_LEVEL_DATE_FIELDS = [
  { field: 'onset_of_illness_date', camel: 'onsetOfIllnessDate', label: 'Onset of Current Illness or Symptom', ruleCode: 'DTP-431-001' },
  { field: 'last_menstrual_period_date', camel: 'lastMenstrualPeriodDate', label: 'Last Menstrual Period', ruleCode: 'DTP-484-001' },
  { field: 'initial_treatment_date', camel: 'initialTreatmentDate', label: 'Initial Treatment Date', ruleCode: 'DTP-454-001' },
  { field: 'last_seen_date', camel: 'lastSeenDate', label: 'Last Seen Date', ruleCode: 'DTP-304-001' },
  { field: 'accident_date', camel: 'accidentDate', label: 'Accident Date', ruleCode: 'DTP-439-001' },
  { field: 'last_xray_date', camel: 'lastXrayDate', label: 'Last X-Ray Date', ruleCode: 'DTP-455-001' },
  { field: 'admission_date', camel: 'admissionDate', label: 'Admission Date', ruleCode: 'DTP-435-001' },
  { field: 'discharge_date', camel: 'dischargeDate', label: 'Discharge Date', ruleCode: 'DTP-096-001' },
  { field: 'hearing_vision_prescription_date', camel: 'hearingVisionPrescriptionDate', label: 'Hearing/Vision Prescription Date', ruleCode: 'DTP-471-001' },
  { field: 'disability_start_date', camel: 'disabilityStartDate', label: 'Disability Start Date', ruleCode: 'DTP-360-001' },
  { field: 'disability_end_date', camel: 'disabilityEndDate', label: 'Disability End Date', ruleCode: 'DTP-361-001' },
  { field: 'last_worked_date', camel: 'lastWorkedDate', label: 'Last Worked Date', ruleCode: 'DTP-297-001' },
  { field: 'authorized_return_to_work_date', camel: 'authorizedReturnToWorkDate', label: 'Authorized Return to Work Date', ruleCode: 'DTP-296-001' },
  { field: 'assumed_care_date', camel: 'assumedCareDate', label: 'Relinquished Care Date 1', ruleCode: 'DTP-090-001' },
  { field: 'relinquished_care_date', camel: 'relinquishedCareDate', label: 'Relinquished Care Date 2', ruleCode: 'DTP-091-001' },
] as const;

export const HOSPITAL_BENEFITS_MEMBER_ID_PREFIX_PATTERN = /^(YLS89|NYC)/;
export const HOSPITAL_BENEFITS_BL_MESSAGE =
  "This claim does not belong to BCBS. Patient's policy covers only hospital benefits. Please confirm insurance for medical benefits.";

export const REGENCE_MEMBER_ID_PREFIX_PATTERN =
  /^(TFC|CUX|DSN|FMW|HAR|IPW|KER|NUZ|NVC|XNE|XNH|XNJ|XNN|XNV)/i;
export const REGENCE_ROUTING_MESSAGE =
  'Member ID belongs to Regence Blue Shield. Please submit the claim to Payer ID 00611.';

export const BLUE_CROSS_IDAHO_ALPHA_PREFIX_PATTERN = /^[A-Z]{3}/;
export const BLUE_CROSS_IDAHO_ROUTING_MESSAGE =
  'Member ID belongs to Blue Cross of Idaho. Please submit the claim to Payer ID BLUEC.';

export const BCBS_WNY_AMERIGROUP_MEMBER_ID_PREFIX_PATTERN = /^(WNH|WNB)/;
export const BCBS_WNY_AMERIGROUP_MESSAGE =
  'BCBS WNY will no longer accept the claims of this patient. Please resubmit the claim to Amerigroup. Reference: www.ask-edi.com/news/2016/2016-10-25_hnny-bcbswny-alliance-amerigroup.htm';

export const BCBS_MI_MEMBER_ID_PREFIX_PATTERN = /^(XYL|X3L)/i;
export const BCBS_MI_ROUTING_MESSAGE =
  'Claim with prefix %s should be sent to BCBS Medicare Advantage Plan.';

export const MEDICARE_ADVANTAGE_MEMBER_ID_PREFIXES = [
  'YUB', 'YUX', 'XOJ', 'XOD', 'ZGJ', 'ZGD', 'YIJ', 'YID', 'YDJ', 'YDL',
] as const;
export const MEDICARE_ADVANTAGE_EXPECTED_PAYER_ID = '66006';
export const MEDICARE_ADVANTAGE_ROUTING_MESSAGE =
  'Medicare Advantage claim needs to be resubmitted to Payer ID: 66006.';

export const MEDICARE_MBI_FILING_INDICATORS = ['MA', 'MB'] as const;
export const MEDICARE_MBI_LENGTH = 11;
export const MEDICARE_MBI_ALPHA_CHARS = 'ACDEFGHJKMNPQRTUVWXY';
export const MEDICARE_MBI_INVALID_MESSAGE =
  'Medicare subscriber ID is missing or invalid. Please verify member card and submit the claim after eligibility verification.';

export const MEDICARE_CONSULTATION_CPT_CODES = [
  '99241', '99242', '99243', '99244', '99245',
  '99251', '99252', '99253', '99254', '99255',
] as const;
export const MEDICARE_CONSULTATION_CPT_MESSAGE =
  'Patient has Medicare insurance type. We cannot bill consultation codes to this plan.';

export const BCBS_NE_CONSULTATION_CPT_RANGES = [
  { from: 99241, to: 99245 },
  { from: 99251, to: 99255 },
] as const;
export const BCBS_NE_CONSULTATION_PAYER_ID = '77780';
export const BCBS_NE_CONSULTATION_MESSAGE =
  'BCBS NE will not accept CPT codes from range 99241-99245 and 99251-99255. Please resubmit with a more appropriate E&M code.';

export const AETNA_CONSULTATION_CPT_RANGES = [
  { from: 99241, to: 99245 },
  { from: 99251, to: 99255 },
] as const;
export const AETNA_CONSULTATION_MEMBER_ID_PREFIX = 'MEB';
export const AETNA_CONSULTATION_MESSAGE =
  'Member AETNA coverage is Medicare HMO which does not cover consultation service %s. Please replace with regular E&M.';

export const AFFINITY_ALPHA_MEMBER_ID_PATTERN = /^([a-zA-Z])+/;
export const AFFINITY_NINE_DIGIT_MEMBER_ID_PATTERN = /^[0-9]{9}$/;
export const AFFINITY_MIDDLE_LETTER_MEMBER_ID_PATTERN = /^[0-9]{4}[A-Z][0-9]{4}$/;
export const AFFINITY_ROUTING_MESSAGE =
  'Please submit the claims of this member to Payer ID %s.';

export const REPLACEMENT_FREQUENCY_CODES = ['6', '7', '8'] as const;
export const CLAIM_NUMBER_REQUIRED_WITH_REPLACEMENT_MESSAGE =
  'Claim frequency type code/bill type is missing/invalid.';
export const MEDICARE_ORIGINAL_FREQUENCY_CODE = '1';
export const MEDICARE_ORIGINAL_FREQUENCY_FILING_INDICATOR = 'MB';
export const MEDICARE_ORIGINAL_FREQUENCY_MESSAGE =
  'Medicare always accepts the claim as an original/new claim. Rejected due to claim frequency code.';
export const MEDICARE_CORRECTED_VOID_FILING_INDICATORS = ['MA', 'MB'] as const;
export const MEDICARE_CORRECTED_VOID_FREQUENCY_CODES = ['7', '8'] as const;
export const MEDICARE_CORRECTED_VOID_ELECTRONIC_MESSAGE =
  'Medicare does not accept corrected/void claims electronically. Please file your claim on paper with appeal.';
export const CORRECTED_VOID_PAPER_ONLY_PAYER_IDS = ['13174', '06111'] as const;
export const CORRECTED_VOID_FREQUENCY_CODES = ['7', '8'] as const;
export const CORRECTED_VOID_PAPER_ONLY_MESSAGE =
  'Payer does not accept corrected/void claims electronically. Please file your claim on paper.';

export const MAMMOGRAPHY_CPT_RANGE_START = 77053;
export const MAMMOGRAPHY_CPT_RANGE_END = 77067;
export const MAMMOGRAPHY_EXCLUDED_MODIFIER = '26';
export const MAMMOGRAPHY_CERTIFICATION_MISSING_MESSAGE =
  'FDA certification number is missing with mammography services %s. Please check the location settings and update FDA certification number.';

export const MEDICARE_SECONDARY_TERTIARY_FILING_INDICATORS = ['MA', 'MB'] as const;
export const MEDICARE_SECONDARY_TERTIARY_PAYER_RESPONSIBILITIES = ['S', 'T'] as const;
export const MEDICARE_SECONDARY_INSURANCE_TYPE_CODE_REQUIRED_MESSAGE =
  'Insurance type code is required when secondary insurance is Medicare.';
export const MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_FILING_INDICATORS = ['MA', 'MB', 'MC'] as const;
export const MEDICARE_MEDICAID_GROUP_EXCLUDED_PAYER_ID = 'DNC00';
export const MEDICARE_MEDICAID_GROUP_NOT_ALLOWED_MESSAGE =
  'Subscriber group name and number are not allowed for Medicare and Medicaid.';

export const REFERRING_PROVIDER_REQUIRED_WITH_REFERRAL_MESSAGE =
  'Referring Provider is required with Referral Number.';

export const MODIFIER_50_UNITS_GT_ONE_MESSAGE =
  'Units must be greater than one when a modifier of 50 is entered.';
export const EPSDT_MODIFIER = 'EP';
export const EPSDT_MEDICAID_FILING_INDICATOR = 'MC';
export const EPSDT_NON_MEDICAID_MESSAGE =
  'EPSDT indicator is used. It may be used on Medicaid claims only.';
export const HOSPICE_MODIFIERS = ['GV', 'GW'] as const;
export const HOSPICE_MEDICARE_FILING_INDICATOR = 'MB';
export const HOSPICE_MODIFIER_NON_MEDICARE_MESSAGE =
  'Modifier %s indicates hospice services. Please file claim to Medicare or remove the modifier.';
export const HOSPICE_CARE_PROCEDURE_CODES = [
  'Q5001', 'Q5002', 'Q5003', 'Q5004', 'Q5005',
  'Q5006', 'Q5007', 'Q5008', 'Q5009', 'Q5010',
] as const;
export const HOSPICE_CARE_MODIFIER_REQUIRED_MESSAGE =
  'Use modifier GV/GW to report hospice care procedure %s.';
export const MEDICAID_HOME_HEALTH_CERT_PROCEDURE_CODES = ['G0179', 'G0180'] as const;
export const MEDICAID_HOME_HEALTH_CERT_FILING_INDICATOR = 'MC';
export const MEDICAID_HOME_HEALTH_CERT_MESSAGE =
  'Medicaid does not cover home health re-certification %s. Please report it back to client to get the correct code.';

export const DISTINCT_PROCEDURAL_XEPSU_MODIFIERS = ['XE', 'XP', 'XS', 'XU'] as const;
export const DISTINCT_PROCEDURAL_BASE_MODIFIER = '59';
export const DISTINCT_PROCEDURAL_59_XEPSU_MESSAGE =
  'Distinct procedural services modifiers %s and 59 is incorrect to report on the same line-item %s. Please remove one of them.';

export const MCD_PATIENT_RELATIONSHIP_FILING_INDICATORS = ['MA', 'MB'] as const;
export const MCD_PATIENT_RELATIONSHIP_PAYER_IDS = ['84146', '31114'] as const;
export const MCD_PATIENT_RELATIONSHIP_SELF_MESSAGE =
  'Subscriber relationship must be Self for Medicaid.';
export const MCD_PATIENT_ENTITY_NOT_ALLOWED_MESSAGE =
  'Patient entity is not allowed when subscriber relationship is Self.';

/** Remaining CLAIM_RULES constants (Laravel Formats.php). */
export const INVALID_MEMBER_ID_BLOCKLIST_PATTERN =
  /^(123456789|TEST|[0]{2,}|[1]{2,}|[2]{2,}|[3]{2,}|[4]{2,}|[5]{2,}|[6]{2,}|[7]{2,}|[8]{2,}|[9]{2,})$/i;
export const VALID_MEMBER_ID_FORMAT_PATTERN = /^[A-Za-z0-9]{3,30}$/;
export const SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE =
  'Subscriber ID is missing or invalid.';
export const OTHER_SUBSCRIBER_MEMBER_ID_MISSING_OR_INVALID_MESSAGE =
  'Other Subscriber ID is missing or invalid.';

export const MEDICARE_COB_OTHER_PAYER_CLAIM_CONTROL_MESSAGE =
  'Medicare claim number is required for claim adjudication. Medicare ICN number is missing or invalid.';
export const MEDICARE_COB_OTHER_FILING_INDICATORS = ['MA', 'MB'] as const;

export const COB_AMOUNT_NON_NEGATIVE_MESSAGE =
  'The value of element %s is incorrect. It should be a zero or positive number.';

export const CONSULTATION_REFERRING_REQUIRED_MESSAGE =
  'Referring Provider is required with consultation procedures %s.';
export const CONSULTATION_REFERRING_LIBRARY_MISMATCH_MESSAGE =
  'Referring provider NPI or last name does not match with the CMS ordering and referring provider library. Please verify referring provider information.';

export const INITIAL_TREATMENT_TAXONOMY_CODES = [
  '111N00000X',
  '111NI0013X',
  '111NI0900X',
  '111NN0400X',
  '111NN1001X',
  '111NP0017X',
  '111NR0200X',
  '111NR0400X',
  '111NS0005X',
  '111NT0100X',
  '111NX0100X',
  '111NX0800X',
] as const;
export const INITIAL_TREATMENT_DATE_REQUIRED_MESSAGE =
  'Claim-level date %s is missing/invalid. Initial Treatment Date is required for this specialty code %s.';

export const LAST_SEEN_TAXONOMY_CODES = [
  '213ES0131X',
  '213EG0000X',
  '213EP1101X',
  '213EP0504X',
  '213ER0200X',
  '213ES0000X',
] as const;
export const LAST_SEEN_DATE_REQUIRED_MESSAGE =
  'Claim-level date %s is missing/invalid. Last Seen Date is required for this specialty code %s.';

export const ADMISSION_HOSPITAL_CARE_CPT_CODES = ['99221', '99222', '99223'] as const;
export const SUBSEQUENT_HOSPITAL_CARE_CPT_CODES = ['99231', '99232', '99233'] as const;
export const ADMISSION_SUBSEQUENT_SAME_DOS_MESSAGE =
  'Procedure code %s is inconsistent with %s in the billing guideline CCI.';

export const DELAY_REASON_MEDICAID_PAYER_ID = '141797357';
export const DELAY_REASON_CLAIM_AGE_DAYS = 90;
export const DELAY_REASON_PAPER_SUBMISSION = 'Paper';
export const DELAY_REASON_REQUIRED_MESSAGE =
  'Delay Reason Code is required when claim aging is more than 90 days.';

export const WELL_VISIT_BLOCKED_CPT_RANGES = [
  { from: 99201, to: 99357 },
  { from: 92002, to: 92014 },
] as const;
export const WELL_VISIT_ICD_CODES = [
  'Z0001',
  'Z00110',
  'Z00111',
  'Z00121',
  'Z00129',
  'Z01411',
  'Z01419',
  'Z30015',
  'Z30016',
  'Z3044',
  'Z3045',
] as const;
export const WELL_VISIT_EM_MESSAGE =
  'Well-visit diagnose %s is invalid. It is not allowed with procedure %s.';
export const WELL_VISIT_REQUIRED_ICD_CPT_RANGES = [
  { from: 99381, to: 99397 },
  { from: 90460, to: 90461 },
  { from: 90476, to: 90749 },
] as const;
export const WELL_VISIT_REQUIRED_ICD_FILING_INDICATOR = 'CI';
export const WELL_VISIT_REQUIRED_ICD_RANGE_START = 'Z00';
export const WELL_VISIT_REQUIRED_ICD_RANGE_END = 'Z13';
export const WELL_VISIT_REQUIRED_ICD_MESSAGE =
  'Well-visit diagnose (%s) is missing or invalid. It must be in this range "Z00 to Z13.9".';
export const WELL_VISIT_AWV_HCPCS_CODES = ['G0402', 'G0438', 'G0439'] as const;
export const WELL_VISIT_AWV_FILING_INDICATORS = ['MA', 'MB'] as const;
export const WELL_VISIT_AWV_REQUIRED_ICD_MESSAGE =
  'Well-visit diagnose (%s) is missing or invalid. It must be in this range "Z00 to Z13.9".';
export const WELL_VISIT_NOT_ALLOWED_MEDICARE_FILING_INDICATOR = 'MB';
export const WELL_VISIT_CPT_NOT_ALLOWED_MEDICARE_MESSAGE =
  'Well-visit CPT/Vaccine (%s) is not allowed by Medicare.';
export const WELL_VISIT_VACCINE_CPT_RANGES = [{ from: 90476, to: 90749 }] as const;
export const WELL_VISIT_VACCINE_REQUIRED_ICD = 'Z23';
export const WELL_VISIT_VACCINE_REQUIRES_Z23_MESSAGE =
  'Well-visit Vaccine (%s) must be billed with ICD-10 Z23.';
export const WELL_VISIT_OFFICE_EM_CPT_RANGES = [{ from: 99201, to: 99215 }] as const;
export const WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_FILING_INDICATOR = 'CI';
export const WELL_VISIT_ICD_NOT_ALLOWED_WITH_OFFICE_EM_MESSAGE =
  'Well-visit diagnose (%s) is invalid. It is not allowed with procedure (%s).';

export const MCR_VACCINE_ADMIN_FILING_INDICATORS = ['MA', 'MB', '16'] as const;
export const MCR_VACCINE_ADMIN_REQUIRED_ICD = 'Z23';
export const MCR_VACCINE_ADMIN_REQUIRED_MESSAGE =
  'Relative admin code (%s) is also required to bill vaccine code (%s).';

export const VACCINE_ADMIN_EXCLUDED_FILING_INDICATORS = ['MB', 'MA', '16'] as const;
export const VACCINE_PRIMARY_ADMIN_90471 = '90471';
export const VACCINE_ADDITIONAL_ADMIN_90472 = '90472';
export const VACCINE_PRIMARY_ADMIN_90471_MISSING_MESSAGE =
  'Primary vaccine administration code 90471 is missing.';
export const VACCINE_ADDITIONAL_ADMIN_90472_MISSING_MESSAGE =
  'Additional vaccine (%s) administration code is missing.';
export const VACCINE_PRIMARY_ADMIN_90460 = '90460';
export const VACCINE_ADDITIONAL_ADMIN_90461 = '90461';
export const VACCINE_ADMIN_90460_MAX_AGE_YEARS = 18;
export const VACCINE_PRIMARY_ADMIN_90460_MISSING_MESSAGE =
  'Primary vaccine administration code 90460 is missing.';
export const VACCINE_ADDITIONAL_ADMIN_90461_MISSING_MESSAGE =
  'Vaccine toxoid (%s) administration code(s) is/are missing.';
export const VACCINE_ADMIN_90460_90461_AGE_MESSAGE =
  'Age of patient must be less then or equal to 18 years for 90460 and 90461.';
export const VACCINE_ADMIN_CONFLICT_GROUP_1_CODES = ['G0008', 'G0009', 'G0010'] as const;
export const VACCINE_ADMIN_CONFLICT_GROUP_2_CODES = ['90471', '90472'] as const;
export const VACCINE_ADMIN_CONFLICT_GROUP_1_LABEL = 'G0008, G0009, G0010';
export const VACCINE_ADMIN_CONFLICT_GROUP_2_LABEL = '90471, 90472';
export const VACCINE_ADMIN_SAME_DOS_CONFLICT_MESSAGE =
  'System identifies Medicare and commercial vaccine admins (%s & %s) alongside which is incorrect by coding point of view. Please review coding before filing the claim.';

export const BMI_ICD_CODES = [
  'Z681',
  'Z6820',
  'Z6821',
  'Z6822',
  'Z6823',
  'Z6824',
  'Z6825',
  'Z6826',
  'Z6827',
  'Z6828',
  'Z6829',
  'Z6830',
  'Z6831',
  'Z6832',
  'Z6833',
  'Z6834',
  'Z6835',
  'Z6836',
  'Z6837',
  'Z6838',
  'Z6839',
  'Z6841',
  'Z6842',
  'Z6843',
  'Z6844',
  'Z6845',
  'Z6851',
  'Z6852',
  'Z6853',
  'Z6854',
] as const;
export const BMI_PRINCIPAL_EXCLUDED_CPT_RANGES = [
  { from: 97802, to: 97804 },
  { from: 99401, to: 99404 },
  { from: 99381, to: 99397 },
] as const;
export const BMI_PRINCIPAL_EXCLUDED_HCPCS_CODES = ['G0402', 'G0438', 'G0439'] as const;
export const BMI_PRINCIPAL_EXCLUDED_HCPCS_PREFIXES = ['8', '7', 'A', 'E', 'L', 'D', 'S'] as const;
export const BMI_PRINCIPAL_POSITION_MESSAGE =
  'BMI diagnosis (%s) identified at principal position with HCPCS %s the service might be denied, please move its position to second or last position of the HCPCS %s code.';

export const HOSPITAL_ADMISSION_EM_CPT_RANGES = [
  { from: 99221, to: 99223 },
  { from: 99231, to: 99233 },
  { from: 99234, to: 99236 },
  { from: 99238, to: 99239 },
] as const;
export const HOSPITAL_ADMISSION_EM_UNIT_DOS_MESSAGE =
  'Hospital admission service for CPT %s should always be billed as one unit, and start/end DOS should be the same.';
export const DOS_AFTER_TRANSACTION_SET_CREATION_MESSAGE =
  'Service Date Invalid. Must be less than or equal to Transaction Set Creation Date.';

export const EPSDT_EP_MAX_AGE_YEARS = 21;
export const EPSDT_EP_AGE_MESSAGE =
  'Eligible Medicaid recipient for EPSDT services %s are less than 21 year of age. Patient %s years of age is not appropriate to bill this service. Please remove modifier EP.';
export const EPSDT_PROCEDURE_CODES = [
  '99392',
  '99393',
  '90471',
  '99391',
  '99394',
  '90472',
  '99381',
  '99383',
  '99382',
  '99420',
  '96110',
  '99384',
  '90474',
  '99214',
  '99395',
  '96127',
  '90473',
  '96160',
  '99213',
  '99385',
  '90460',
  '92552',
  '99173',
  '0172T',
  '0014F',
  '96161',
  '92100',
  '99215',
  '99401',
  '99502',
  '99354',
  '92551',
  '99211',
  '85018',
  '99212',
  '99462',
  '99408',
  '92587',
  '90649',
  'D1206',
  '99203',
  'D0145',
  '90633',
  '90716',
  '90707',
  '90686',
  '90696',
  '36415',
  '99202',
  '99238',
  '99204',
  '97802',
  '99460',
  'D0191',
  '90461',
  '83655',
  '99188',
  '92553',
  '92555',
  '92556',
  'V5008',
  '86580',
  '99174',
] as const;

export const HOSPITAL_DISCHARGE_EM_PROCEDURE_CODES = ['99238', '99239'] as const;
export const HOSPITAL_DISCHARGE_EM_REQUIRED_UNITS = 1;
export const HOSPITAL_DISCHARGE_EM_DISCHARGE_DATE_MESSAGE =
  'Discharge date is required when billed with this procedure %s.';
export const HOSPITAL_DISCHARGE_EM_UNITS_MESSAGE =
  'Units must be equal to 1 when billed with this procedure %s.';
export const HOSPITAL_DISCHARGE_EM_SAME_DAY_DOS_MESSAGE =
  'Procedure start and end DOS must be the same when billed with this procedure %s.';

export const BCBS_FL_PAYER_ID = '00590';
export const BCBS_FL_PRIMARY_ONLY_ICD_CODES = [
  'Z02.1',
  'Z02.3',
  'Z03.6',
  'Z03.89',
  'Z03.818',
  'Z03.810',
  'Z01.810',
  'Z01.811',
  'Z01.812',
  'Z01.818',
  'Z04.1',
  'Z04.2',
  'Z04.3',
  'Z04.41',
  'Z04.42',
  'Z04.6',
  'Z04.71',
  'Z04.72',
] as const;
export const BCBS_FL_PRIMARY_ONLY_POSITION_MESSAGE =
  'ICD code %s reported with CPT %s at position %s is a primary only diagnosis, please make it primary.';
export const BCBS_FL_MULTIPLE_PRIMARY_ONLY_MESSAGE =
  'Multiple ICDs %s cannot be reported together since both ICDs defined as primary only diagnosis, please remove the unnecessary diagnosis from CPT %s pointer number (%s)';
export const BCBS_FL_Z01_PRIMARY_ABK_ICD_CODES = [
  'Z01.810',
  'Z01.811',
  'Z01.812',
  'Z01.818',
] as const;
export const BCBS_FL_Z01_PRIMARY_ABK_MESSAGE =
  'ICD-10 (%s) may only be used as first-listed or principal diagnosis position.';

export const SEQUELA_NOT_PRINCIPAL_PAYER_IDS = ['87726', '39026', '13551', '61101'] as const;
export const SEQUELA_NOT_PRINCIPAL_MESSAGE =
  'Sequela ICD (%s) cannot be billed as the primary, first listed, or principal diagnosis on a claim, nor can it be the only diagnosis on a claim. Please check coding before billing out the claim.';

export const V49_PIP_AUTO_ICD_CODES = [
  'V49.00XA',
  'V49.00XD',
  'V49.00XS',
  'V49.09XA',
  'V49.09XD',
  'V49.09XS',
  'V49.10XA',
  'V49.10XD',
  'V49.10XS',
  'V49.19XA',
  'V49.19XD',
  'V49.19XS',
  'V49.20XA',
  'V49.20XD',
  'V49.20XS',
  'V49.29XA',
  'V49.29XD',
  'V49.29XS',
  'V49.3XXA',
  'V49.3XXD',
  'V49.3XXS',
  'V49.40XA',
  'V49.40XD',
  'V49.40XS',
  'V49.49XA',
  'V49.49XD',
  'V49.49XS',
  'V49.50XA',
  'V49.50XD',
  'V49.50XS',
  'V49.59XA',
  'V49.59XD',
  'V49.59XS',
  'V49.60XA',
  'V49.60XD',
  'V49.60XS',
  'V49.69XA',
  'V49.69XD',
  'V49.69XS',
  'V49.81XA',
  'V49.81XD',
  'V49.81XS',
  'V49.88XA',
  'V49.88XD',
  'V49.88XS',
  'V49.9XXA',
  'V49.9XXD',
  'V49.9XXS',
] as const;
export const V49_PIP_AUTO_PAPER_PAYER_ID = 'PAPER';
export const V49_PIP_AUTO_MESSAGE =
  'Diagnosis code from range V49.00 to V49.9XXS cannot be billed to any insurance other than PIP/auto insurance.';

export const EMBLEM_FIDELIS_FOBT_PAYER_IDS = ['13551', '11315'] as const;
export const EMBLEM_FIDELIS_FOBT_PROCEDURE_CODES = [
  '82270',
  '82271',
  '82272',
  '82273',
  '82274',
  'G0328',
] as const;
export const EMBLEM_FIDELIS_FOBT_ICD_CODES = [
  'Z00.00',
  'Z00.01',
  'Z12.10',
  'Z12.11',
  'Z12.12',
  'Z80.0',
  'Z83.71',
  'Z83.79',
] as const;
export const EMBLEM_FIDELIS_FOBT_MIN_AGE_YEARS = 50;
export const EMBLEM_FIDELIS_FOBT_MAX_AGE_YEARS = 75;
export const EMBLEM_FIDELIS_FOBT_ICD_REQUIRES_CPT_MESSAGE =
  'Please use an appropriate CPT/HCPCS code (82270–82274, G0328) for ICD code %s.';
export const EMBLEM_FIDELIS_FOBT_CPT_REQUIRES_ICD_MESSAGE =
  'Please use an appropriate ICD code (Z00.00, Z00.01, Z12.10, Z12.11, Z12.12, Z80.0, Z83.71, Z83.79) for CPT/HCPCS code %s.';
export const EMBLEM_FIDELIS_FOBT_AGE_MESSAGE =
  'Patient age must be between 50 and 75 years for CPT/HCPCS code %s.';

export const CERUMEN_REMOVAL_PROCEDURE_CODES = ['69209', '69210', 'G0268'] as const;
export const CERUMEN_ALLOWED_ICD_CODES = ['H612', 'H6120', 'H6121', 'H6122', 'H6123'] as const;
export const CERUMEN_NON_SUPPORTIVE_ICD_MESSAGE =
  'No supportive ICD found with procedure code %s, please report supportive diagnosis code.';

export const LAB_CLIA_FILING_INDICATORS = ['MA', 'MB'] as const;
export const LAB_SPECIMEN_COLLECTION_ONLY_CODES = ['36415', '36416'] as const;
export const LAB_SPECIMEN_COLLECTION_INFO_CODE = '36415';
export const LAB_CLIA_REQUIRED_MESSAGE =
  'CLIA certification number (REF*X4) is required for laboratory/diagnostic procedure code %s. Please report a valid CLIA number.';
export const LAB_SPECIMEN_COLLECTION_CLIA_NOT_REQUIRED_MESSAGE =
  'Procedure code 36415 is a specimen collection code — CLIA not required.';
export const LAB_QW_MODIFIER = 'QW';
export const LAB_QW_INVALID_MESSAGE =
  'Modifier QW is not a valid modifier for procedure code %s. Please remove the modifier or verify the procedure code.';
export const LAB_CLIA_MISSING_MESSAGE =
  'CLIA required procedure code %s found. CLIA number is required.';
export const LAB_CLIA_NUMBER_PATTERN = /^\d{2}[A-Za-z]\d{7}$/;
export const LAB_CLIA_INVALID_FORMAT_MESSAGE =
  'CLIA required procedure code %s found with Invalid CLIA Number is should be in this format "NNANNNNNNN" where N is numeric, and A is Alphabet.';
