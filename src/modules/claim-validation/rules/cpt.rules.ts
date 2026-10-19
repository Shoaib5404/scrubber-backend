import { ClaimIssue } from '../types';
import { isApplicableMueUhcOxford } from './mue-uhc-oxford.rules';
import { typeLabelForCptError } from '../support/procedure-code.helper';
import { normalizeTaxonomyCode } from '../support/taxonomy-code.helper';
import {
  AgeSpecificCptRuleRow,
  GenderSpecificCptRuleRow,
  hydrateAgeRuleFromJoinedRow,
  hydrateGenderRuleFromJoinedRow,
  validateAgeRuleForLine,
  validateGenderRuleForLine,
} from '../support/cpt-age-gender.validation';

/** Laravel CptRules::BILLING_TAXONOMY_* */
export const TAX_BP_001 = 'TAX-BP-001';
export const TAX_BP_002 = 'TAX-BP-002';
export const BILLING_TAXONOMY_MISSING_MESSAGE = 'Billing Provider Taxonomy code is Missing.';
export const BILLING_TAXONOMY_INVALID_MESSAGE = 'Billing Provider taxonomy code is invalid.';

/** Laravel Uhc87726PriorAuthRules */
export const UHC_PA_001 = 'UHC-PA-001';
export const UHC_PA_PAYER_ID = '87726';
export const UHC_PA_POLICY_URL =
  'https://www.uhcprovider.com/content/dam/provider/docs/public/prior-auth/PA-Requirements/Commercial/UHC-Commercial-Prior-Authorization-Requirements-Effective-01012019.pdf';
export const UHC_PA_REJECTION_MESSAGE =
  'Prior Authorization is required for this service line "%s". For more details, please see United Health Care policy at: %s';

export type CptServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  serviceDateFrom?: string | Date | null;
  placeOfService?: string | null;
  modifier1?: string | null;
  modifier2?: string | null;
  modifier3?: string | null;
  modifier4?: string | null;
  chargeAmount?: number | null;
  diagnosisPointers?: readonly (number | string)[];
};

export type CptClaimInput = {
  payerId?: string | null;
  placeOfService?: string | null;
  billingProviderTaxonomy?: string | null;
  patientDob?: string | Date | null;
  subscriberDob?: string | Date | null;
  patientGender?: string | null;
  subscriberGender?: string | null;
  priorAuthNumber?: string | null;
  diagnoses?: readonly { sequence: number; code: string | null }[];
};

/** Joined row shape from LookupCacheService::getCptCoreRuleRows */
export type CptCoreRuleRow = {
  cpt_code: string;
  age_rule_id?: number | null;
  low_limit?: number | null;
  high_limit?: number | null;
  unit?: string | null;
  age_gender?: string | null;
  gender_rule_id?: number | null;
  required_gender?: string | null;
};

export type CptPosRuleRow = {
  id: number;
  cpt_code: string;
  payer_id?: string | null;
  pos_code: string;
};

export type CptModifierRuleRow = {
  id: number;
  cpt_code: string;
  modifier_code: string;
  is_allowed: boolean;
};

export type UhcAuthorizationParsedRule = {
  id: number;
  condition: string;
  parsed: {
    pos: string[];
    icd: Readonly<Record<string, true>>;
    charge: number | null;
  };
};

export type ValidateCoreCptRulesLookups = {
  cptRuleRowsByCode: Readonly<Record<string, CptCoreRuleRow | undefined>>;
  activeTaxonomyCodes: Readonly<Record<string, true>>;
  /** UHC/Oxford path — `existsMany('mue_87726_uhc_06111_oxford', codes)` */
  mueCodeSet?: Readonly<Record<string, true>>;
  ageRulesByCode?: Readonly<Record<string, AgeSpecificCptRuleRow | undefined>>;
  genderRulesByCode?: Readonly<Record<string, GenderSpecificCptRuleRow | undefined>>;
};

export type ValidateCoreCptRulesResult = {
  validLines: CptServiceLineInput[];
  cptErrors: ClaimIssue[];
  ageErrors: ClaimIssue[];
  genderErrors: ClaimIssue[];
};

export type CptRuleGate = {
  /** When false, a line with no procedure code still continues and REQ-007 is not emitted. */
  req007Enabled?: boolean;
  /** When false, an unknown procedure still continues and CPT-001 is not emitted. */
  cpt001Enabled?: boolean;
};

/** Laravel CptRules::validateCoreCptRules */
export function validateCoreCptRules(
  claim: CptClaimInput,
  serviceLines: readonly CptServiceLineInput[],
  lookups: ValidateCoreCptRulesLookups,
  gate: CptRuleGate = {},
): ValidateCoreCptRulesResult {
  const validLines: CptServiceLineInput[] = [];
  const cptErrors = validateBillingProviderTaxonomy(claim, lookups.activeTaxonomyCodes);
  const ageErrors: ClaimIssue[] = [];
  const genderErrors: ClaimIssue[] = [];
  const linesWithCode: CptServiceLineInput[] = [];

  for (const line of serviceLines) {
    if (!String(line.procedureCode ?? '').trim()) {
      if (gate.req007Enabled === false) {
        validLines.push(line);
        continue;
      }
      cptErrors.push({
        rule: 'REQ-007',
        field: `service_lines.${line.lineNumber}.procedure_code`,
        message: `Line ${line.lineNumber}: Procedure code is required`,
      });
      continue;
    }
    linesWithCode.push(line);
  }

  if (linesWithCode.length === 0) {
    return { validLines, cptErrors, ageErrors, genderErrors };
  }

  const uniqueCodes = [
    ...new Set(linesWithCode.map((l) => String(l.procedureCode).trim().toUpperCase())),
  ];

  if (isApplicableMueUhcOxford({ payerId: claim.payerId ?? null })) {
    return validateCoreCptRulesForUhcOxford(
      claim,
      linesWithCode,
      uniqueCodes,
      cptErrors,
      lookups,
      gate,
    );
  }

  const patientDob = claim.patientDob ?? claim.subscriberDob;
  const patientGender = claim.patientGender ?? claim.subscriberGender;

  for (const line of linesWithCode) {
    const code = String(line.procedureCode).trim();
    const normalized = code.toUpperCase();
    const ruleRow = lookups.cptRuleRowsByCode[normalized];

    if (!ruleRow) {
      if (gate.cpt001Enabled === false) {
        validLines.push(line);
        continue;
      }
      const codeType = typeLabelForCptError(code);
      cptErrors.push({
        rule: 'CPT-001',
        field: `service_lines.${line.lineNumber}.procedure_code`,
        message: `Line ${line.lineNumber}: ${codeType} code '${code}' is not valid or not found in the system`,
        severity: 'error',
      });
      continue;
    }

    validLines.push(line);

    const ageRule = hydrateAgeRuleFromJoinedRow(ruleRow);
    if (ageRule) {
      ageErrors.push(
        ...validateAgeRuleForLine(
          ageRule,
          { lineNumber: line.lineNumber, procedureCode: code, serviceDateFrom: line.serviceDateFrom },
          patientDob,
          patientGender,
        ),
      );
    }

    const genderRule = hydrateGenderRuleFromJoinedRow(ruleRow);
    if (genderRule) {
      genderErrors.push(
        ...validateGenderRuleForLine(
          genderRule,
          { lineNumber: line.lineNumber, procedureCode: code },
          patientGender,
        ),
      );
    }
  }

  return { validLines, cptErrors, ageErrors, genderErrors };
}

function validateCoreCptRulesForUhcOxford(
  claim: CptClaimInput,
  linesWithCode: CptServiceLineInput[],
  _uniqueCodes: string[],
  cptErrors: ClaimIssue[],
  lookups: ValidateCoreCptRulesLookups,
  gate: CptRuleGate = {},
): ValidateCoreCptRulesResult {
  const validLines: CptServiceLineInput[] = [];
  const ageErrors: ClaimIssue[] = [];
  const genderErrors: ClaimIssue[] = [];
  const mueCodeSet = lookups.mueCodeSet ?? {};
  const ageRules = lookups.ageRulesByCode ?? {};
  const genderRules = lookups.genderRulesByCode ?? {};
  const patientDob = claim.patientDob ?? claim.subscriberDob;
  const patientGender = claim.patientGender ?? claim.subscriberGender;

  for (const line of linesWithCode) {
    const code = String(line.procedureCode).trim();
    const normalized = code.toUpperCase();

    if (!mueCodeSet[normalized]) {
      if (gate.cpt001Enabled === false) {
        validLines.push(line);
        continue;
      }
      const codeType = typeLabelForCptError(code);
      cptErrors.push({
        rule: 'CPT-001',
        field: `service_lines.${line.lineNumber}.procedure_code`,
        message: `Line ${line.lineNumber}: ${codeType} code '${code}' is not valid or not found in the UHC/Oxford MUE library`,
        severity: 'error',
      });
      continue;
    }

    validLines.push(line);

    const ageRule = ageRules[normalized];
    if (ageRule) {
      ageErrors.push(
        ...validateAgeRuleForLine(
          ageRule,
          { lineNumber: line.lineNumber, procedureCode: code, serviceDateFrom: line.serviceDateFrom },
          patientDob,
          patientGender,
        ),
      );
    }

    const genderRule = genderRules[normalized];
    if (genderRule) {
      genderErrors.push(
        ...validateGenderRuleForLine(
          genderRule,
          { lineNumber: line.lineNumber, procedureCode: code },
          patientGender,
        ),
      );
    }
  }

  return { validLines, cptErrors, ageErrors, genderErrors };
}

/** Laravel CptRules::validateAddOnPrimaryCodes */
export function validateAddOnPrimaryCodes(
  validLines: readonly CptServiceLineInput[],
  allServiceLines: readonly CptServiceLineInput[],
  primariesByAddon: Readonly<Record<string, readonly string[] | undefined>>,
): ClaimIssue[] {
  const errors: ClaimIssue[] = [];
  const claimCodeSet: Record<string, true> = {};
  for (const line of allServiceLines) {
    if (String(line.procedureCode ?? '').trim()) {
      claimCodeSet[String(line.procedureCode).trim().toUpperCase()] = true;
    }
  }
  for (const line of validLines) {
    const addonNorm = String(line.procedureCode).trim().toUpperCase();
    const primaries = primariesByAddon[addonNorm];
    if (!primaries || primaries.length === 0) {
      continue;
    }

    const hasPrimary = primaries.some((p) => claimCodeSet[p.toUpperCase()] === true);
    if (!hasPrimary) {
      const displayCode = String(line.procedureCode).trim();
      errors.push({
        rule: 'AOC-001',
        field: `service_lines.${line.lineNumber}.procedure_code`,
        message: `Line ${line.lineNumber}: Add On Code ${displayCode} cannot be billed without a Primary Code.`,
        severity: 'error',
      });
    }
  }

  return errors;
}

/** Laravel CptRules::validateCptPosRules */
export function validateCptPosRules(
  claim: Pick<CptClaimInput, 'payerId' | 'placeOfService'>,
  lines: readonly CptServiceLineInput[],
  cptPosRules: readonly CptPosRuleRow[],
): { errors: ClaimIssue[] } {
  const errors: ClaimIssue[] = [];
  if (lines.length === 0 || cptPosRules.length === 0) {
    return { errors };
  }

  const claimPayerId = normalizePayerId(claim.payerId);
  const posContextByCpt = buildCptPosContext(cptPosRules, claimPayerId);
  if (Object.keys(posContextByCpt).length === 0) {
    return { errors };
  }

  for (const line of lines) {
    const prefix = `service_lines.${line.lineNumber}`;
    const cptCode = normalizeCptCode(String(line.procedureCode ?? ''));
    const context = posContextByCpt[cptCode];
    if (!context) {
      continue;
    }

    const posCodeRaw = resolvePlaceOfService(line, claim);
    if (posCodeRaw === null) {
      errors.push({
        rule: 'POS-001',
        field: `${prefix}.place_of_service`,
        message: `Line ${line.lineNumber}: Place of Service is required to validate CPT ${line.procedureCode} against POS rules`,
        severity: 'error',
      });
      continue;
    }

    const posCode = normalizePosCode(posCodeRaw);
    if (context.allowed_pos.includes(posCode)) {
      continue;
    }

    const displayCpt = String(line.procedureCode).trim();
    const message = context.payer_specific_only
      ? `For Payer ${claimPayerId}, procedure code ${displayCpt} cannot be billed with place of service ${posCode}. Please use an approved place of service for this payer.`
      : `Procedure code ${displayCpt} cannot be billed with place of service ${posCode}. Please use the correct place of service.`;

    errors.push({
      rule: 'POS-002',
      field: `${prefix}.place_of_service`,
      message,
      severity: 'error',
    });
  }

  return { errors };
}

/** Laravel CptRules::validateUhcPriorAuthRules */
export function validateUhcPriorAuthRules(
  claim: CptClaimInput,
  lines: readonly CptServiceLineInput[],
  rulesByCpt: Readonly<Record<string, readonly UhcAuthorizationParsedRule[] | undefined>>,
): { errors: ClaimIssue[] } {
  const errors: ClaimIssue[] = [];

  if (String(claim.payerId ?? '').trim() !== UHC_PA_PAYER_ID || lines.length === 0) {
    return { errors };
  }

  if (Object.keys(rulesByCpt).length === 0) {
    return { errors };
  }

  const diagnosesBySequence = new Map<number, { code: string | null }>();
  for (const d of claim.diagnoses ?? []) {
    diagnosesBySequence.set(d.sequence, { code: d.code });
  }

  for (const line of lines) {
    const cptCode = String(line.procedureCode ?? '')
      .trim()
      .toUpperCase();
    if (cptCode === '') {
      continue;
    }

    const rules = rulesByCpt[cptCode] ?? [];
    if (rules.length === 0) {
      continue;
    }

    if (!isPriorAuthRequiredForLine(rules, line, claim, diagnosesBySequence)) {
      continue;
    }

    if (String(claim.priorAuthNumber ?? '').trim() !== '') {
      continue;
    }

    errors.push({
      rule: UHC_PA_001,
      field: `service_lines.${line.lineNumber}.procedure_code`,
      message: formatUhcPriorAuthMessage(cptCode),
      severity: 'error',
    });
  }

  return { errors };
}

/** Laravel CptRules::validateCptModifierRules */
export function validateCptModifierRules(
  lines: readonly CptServiceLineInput[],
  modRules: readonly CptModifierRuleRow[],
): { errors: ClaimIssue[] } {
  const errors: ClaimIssue[] = [];
  if (lines.length === 0 || modRules.length === 0) {
    return { errors };
  }

  const lookup = new Map<string, CptModifierRuleRow[]>();
  for (const rule of [...modRules].sort((a, b) => a.id - b.id)) {
    const key = rule.cpt_code;
    const list = lookup.get(key) ?? [];
    list.push(rule);
    lookup.set(key, list);
  }

  for (const line of lines) {
    const prefix = `service_lines.${line.lineNumber}`;
    const rulesForCpt = lookup.get(String(line.procedureCode ?? ''));
    if (!rulesForCpt || rulesForCpt.length === 0) {
      continue;
    }

    const allowedModifiers = rulesForCpt.filter((r) => r.is_allowed).map((r) => r.modifier_code);
    const lineModifiers = [line.modifier1, line.modifier2, line.modifier3, line.modifier4].filter(
      (m) => m !== null && m !== undefined && String(m).trim() !== '',
    ) as string[];

    if (lineModifiers.length === 0) {
      continue;
    }

    for (const rawModifier of lineModifiers) {
      const modifier = normalizeModifierCode(rawModifier);
      if (!allowedModifiers.includes(modifier)) {
        const allowedDisplay = allowedModifiers.join(', ');
        errors.push({
          rule: 'MOD-001',
          field: `${prefix}.modifiers`,
          message: `Line ${line.lineNumber}: Modifier ${modifier} is not allowed for CPT ${line.procedureCode}. Allowed modifiers: ${allowedDisplay}`,
          severity: 'error',
        });
      }
    }
  }

  return { errors };
}

function validateBillingProviderTaxonomy(
  claim: Pick<CptClaimInput, 'billingProviderTaxonomy'>,
  activeTaxonomyCodes: Readonly<Record<string, true>>,
): ClaimIssue[] {
  const rawTaxonomy = String(claim.billingProviderTaxonomy ?? '').trim();
  if (rawTaxonomy === '') {
    return [
      {
        rule: TAX_BP_001,
        field: 'billing_provider_taxonomy',
        message: BILLING_TAXONOMY_MISSING_MESSAGE,
        severity: 'error',
      },
    ];
  }

  const normalizedTaxonomy = normalizeTaxonomyCode(rawTaxonomy);
  if (normalizedTaxonomy === null || !activeTaxonomyCodes[normalizedTaxonomy]) {
    return [
      {
        rule: TAX_BP_002,
        field: 'billing_provider_taxonomy',
        message: BILLING_TAXONOMY_INVALID_MESSAGE,
        severity: 'error',
      },
    ];
  }

  return [];
}

function buildCptPosContext(
  cptPosRules: readonly CptPosRuleRow[],
  claimPayerId: string,
): Record<string, { allowed_pos: string[]; payer_specific_only: boolean }> {
  const grouped = new Map<string, CptPosRuleRow[]>();
  for (const rule of cptPosRules) {
    const list = grouped.get(rule.cpt_code) ?? [];
    list.push(rule);
    grouped.set(rule.cpt_code, list);
  }

  const context: Record<string, { allowed_pos: string[]; payer_specific_only: boolean }> = {};

  for (const [cptCode, rules] of grouped.entries()) {
    const allowedPos: string[] = [];
    let hasUniversal = false;
    let hasPayerSpecific = false;

    for (const rule of rules) {
      const rulePayer = rule.payer_id !== null && rule.payer_id !== undefined ? String(rule.payer_id).trim() : null;

      if (rulePayer === null || rulePayer === '') {
        hasUniversal = true;
        allowedPos.push(normalizePosCode(rule.pos_code));
        continue;
      }

      if (claimPayerId !== '' && rulePayer === claimPayerId) {
        hasPayerSpecific = true;
        allowedPos.push(normalizePosCode(rule.pos_code));
      }
    }

    if (allowedPos.length === 0) {
      continue;
    }

    context[String(cptCode)] = {
      allowed_pos: [...new Set(allowedPos)],
      payer_specific_only: hasPayerSpecific && !hasUniversal,
    };
  }

  return context;
}

function normalizeCptCode(code: string): string {
  const cptCode = code.trim();
  if (cptCode === '') {
    return '';
  }
  if (/^\d+$/.test(cptCode)) {
    return cptCode.padStart(5, '0');
  }
  return cptCode.toUpperCase();
}

function normalizePayerId(payerId: string | null | undefined): string {
  const normalized = String(payerId ?? '').trim();
  if (normalized === '') {
    return '';
  }
  if (/^\d+$/.test(normalized) && normalized.length < 5) {
    return normalized.padStart(5, '0');
  }
  return normalized;
}

function normalizePosCode(code: string): string {
  return String(code).trim().padStart(2, '0');
}

function normalizeModifierCode(raw: string): string {
  const trimmed = String(raw).trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(2, '0');
  }
  return trimmed.toUpperCase();
}

function resolvePlaceOfService(
  line: Pick<CptServiceLineInput, 'placeOfService'>,
  claim: Pick<CptClaimInput, 'placeOfService'>,
): string | null {
  const linePos = line.placeOfService;
  if (linePos !== null && linePos !== undefined && String(linePos).trim() !== '') {
    return String(linePos).trim();
  }
  const claimPos = claim.placeOfService;
  if (claimPos !== null && claimPos !== undefined && String(claimPos).trim() !== '') {
    return String(claimPos).trim();
  }
  return null;
}

const UHC_CONDITION_ALWAYS = 'always';
const UHC_CONDITION_CHARGE_GT = 'charge_gt';
const UHC_CONDITION_POS_IN = 'pos_in';
const UHC_CONDITION_MANDATORY_WITH_ICDS = 'mandatory_with_icds';
const UHC_CONDITION_NOT_REQUIRED_WITH_ICDS = 'not_required_with_icds';

function isPriorAuthRequiredForLine(
  rules: readonly UhcAuthorizationParsedRule[],
  line: CptServiceLineInput,
  claim: CptClaimInput,
  diagnosesBySequence: Map<number, { code: string | null }>,
): boolean {
  for (const rule of rules) {
    if (evaluateUhcRule(rule, line, claim, diagnosesBySequence)) {
      return true;
    }
  }
  return false;
}

function evaluateUhcRule(
  rule: UhcAuthorizationParsedRule,
  line: CptServiceLineInput,
  claim: CptClaimInput,
  diagnosesBySequence: Map<number, { code: string | null }>,
): boolean {
  const parsed = rule.parsed;
  switch (rule.condition) {
    case UHC_CONDITION_ALWAYS:
      return true;
    case UHC_CONDITION_CHARGE_GT:
      return matchesChargeThreshold(line, parsed.charge);
    case UHC_CONDITION_POS_IN:
      return matchesPos(line, claim, parsed.pos);
    case UHC_CONDITION_MANDATORY_WITH_ICDS:
      return matchesIcdList(line, diagnosesBySequence, parsed.icd);
    case UHC_CONDITION_NOT_REQUIRED_WITH_ICDS:
      return !matchesIcdList(line, diagnosesBySequence, parsed.icd);
    default:
      return false;
  }
}

function formatUhcPriorAuthMessage(cptCode: string): string {
  let remaining = UHC_PA_REJECTION_MESSAGE;
  remaining = remaining.replace('%s', cptCode);
  remaining = remaining.replace('%s', UHC_PA_POLICY_URL);
  return remaining;
}

function matchesChargeThreshold(line: CptServiceLineInput, threshold: number | null): boolean {
  if (threshold === null) {
    return false;
  }
  return Number(line.chargeAmount ?? 0) > threshold;
}

function matchesPos(
  line: CptServiceLineInput,
  claim: Pick<CptClaimInput, 'placeOfService'>,
  allowedPosCodes: readonly string[],
): boolean {
  if (allowedPosCodes.length === 0) {
    return false;
  }
  const posCode = resolvePlaceOfService(line, claim);
  if (posCode === null) {
    return false;
  }
  return allowedPosCodes.includes(normalizePosCode(posCode));
}

function matchesIcdList(
  line: CptServiceLineInput,
  diagnosesBySequence: Map<number, { code: string | null }>,
  allowedIcds: Readonly<Record<string, true>>,
): boolean {
  if (Object.keys(allowedIcds).length === 0) {
    return false;
  }

  for (const pointer of line.diagnosisPointers ?? []) {
    const diagnosis = diagnosesBySequence.get(Number(pointer));
    if (!diagnosis) {
      continue;
    }
    const icdCode = String(diagnosis.code ?? '').trim();
    if (icdCode === '') {
      continue;
    }
    if (allowedIcds[normalizeIcd(icdCode)] === true) {
      return true;
    }
  }

  return false;
}

function normalizeIcd(code: string): string {
  return code.toUpperCase().replace(/\./g, '').trim();
}
