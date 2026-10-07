import { ClaimIssue } from '../types';
import {
  NDC_UNITS,
  hasAnyNdcData,
  isValidNdcCode,
  ndcMatchesServiceIdRegex,
  normalizeHcpcs,
} from '../support/ndc.helper';
import {
  NdcCrosswalkContext,
  hcpcsRequiresNdc,
  isValidNdcHcpcsPair,
  ndcExistsInLibrary,
} from '../support/ndc-crosswalk.context';

/** Laravel NdcRules rule codes */
export const NDC_0 = 'NDC-0';
export const NDC_0_1 = 'NDC-0.1';
export const NDC_0_2 = 'NDC-0.2';
export const NDC_1 = 'NDC-1';
export const NDC_2 = 'NDC-2';
export const NDC_3 = 'NDC-3';

export type NdcServiceLineInput = {
  lineNumber: number;
  procedureCode: string | null;
  ndcCode: string | null;
  ndcQuantity: unknown;
  ndcUnit: string | null;
};

/**
 * Laravel NdcRules::validate — strict rule order; first failure per line stops.
 *
 * @returns `[errors, warnings]` (warnings are always empty in Laravel implementation).
 */
export function validateNdc(
  lines: readonly NdcServiceLineInput[],
  context: NdcCrosswalkContext,
): [ClaimIssue[], ClaimIssue[]] {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];

  for (const line of lines) {
    const lineError = validateNdcLine(line, context);
    if (lineError) {
      errors.push(lineError);
    }
  }

  return [errors, warnings];
}

function validateNdcLine(line: NdcServiceLineInput, context: NdcCrosswalkContext): ClaimIssue | null {
  const prefix = `service_lines.${line.lineNumber}`;
  const hcpcs = normalizeHcpcs(line.procedureCode);
  const hcpcsInCrosswalk = hcpcs !== null && hcpcsRequiresNdc(context, hcpcs);
  const hasNdcEntity = filled(line.ndcCode);
  const hasAnyData = hasAnyNdcData(line.ndcCode, line.ndcQuantity, line.ndcUnit);

  if (!hasNdcEntity && !hasAnyData && !hcpcsInCrosswalk) {
    return null;
  }

  if (hasNdcEntity && !isValidNdcCode(line.ndcCode)) {
    return ndcError(NDC_0, `${prefix}.ndc_code`, 'Invalid NDC format');
  }

  const inLibrary = hasNdcEntity && ndcExistsInLibrary(context, line.ndcCode);
  const pairIsValid = hasNdcEntity && hcpcs !== null && isValidNdcHcpcsPair(context, line.ndcCode, hcpcs);

  if (hasNdcEntity && hcpcsInCrosswalk && !inLibrary && !pairIsValid) {
    return ndcError(NDC_0_1, `${prefix}.ndc_code`, 'The procedure code is invalid with the drug code.');
  }

  if (hcpcsInCrosswalk && !hasNdcEntity) {
    return ndcError(NDC_0_2, `${prefix}.ndc_code`, 'This procedure requires drug code.');
  }

  if (hasNdcEntity && hcpcsInCrosswalk && inLibrary && !pairIsValid) {
    return ndcError(
      NDC_1,
      `${prefix}.ndc_code`,
      `Please update the appropriate NDC for drug code (${hcpcs})`,
    );
  }

  if (hasNdcEntity) {
    const libraryHit = inLibrary && ndcMatchesServiceIdRegex(line.ndcCode);
    if (!libraryHit) {
      const displayCode = String(line.ndcCode ?? '').trim();
      return ndcError(
        NDC_2,
        `${prefix}.ndc_code`,
        `Drug code ${displayCode} format is invalid or not found in the drug library`,
      );
    }
  }

  if (hasNdcEntity && !hasValidNdcQuantityAndUnit(line)) {
    return ndcError(
      NDC_3,
      `${prefix}.ndc_quantity`,
      'NDC quantity or qualifier is missing or invalid. It must be used when reporting for drug',
    );
  }

  return null;
}

function hasValidNdcQuantityAndUnit(line: NdcServiceLineInput): boolean {
  if (line.ndcQuantity === null || line.ndcQuantity === undefined || line.ndcQuantity === '') {
    return false;
  }

  if (!isNumericPositive(line.ndcQuantity)) {
    return false;
  }

  const unit = String(line.ndcUnit ?? '')
    .trim()
    .toUpperCase();

  return unit !== '' && NDC_UNITS.includes(unit);
}

function isNumericPositive(raw: unknown): boolean {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0;
}

function ndcError(rule: string, field: string, message: string): ClaimIssue {
  return { rule, field, message, severity: 'error' };
}

function filled(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}
