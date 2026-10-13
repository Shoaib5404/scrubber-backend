import { EdiSegment } from '../types';

export type CasFinding = { message: string; field: string };

const VALID_GROUP_CODES = new Set(['CO', 'CR', 'OA', 'PI', 'PR']);

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

/** Laravel Edi837CasValidator — CAS adjustment group and reason code format checks. */
export function validateCasSegment(cas: EdiSegment): CasFinding[] {
  const issues: CasFinding[] = [];

  for (let groupStart = 1; groupStart < cas.elements.length; groupStart += 3) {
    const groupCode = el(cas, groupStart).toUpperCase();
    const reasonCode = el(cas, groupStart + 1);
    const amount = cas.elements[groupStart + 2] ?? '';

    if (groupCode === '' && reasonCode === '' && (amount === null || amount === '')) {
      continue;
    }

    if (groupCode === '') {
      issues.push({
        message: 'CAS claim adjustment group code is required when adjustment amounts are present',
        field: `CAS${groupStart}`,
      });
      continue;
    }

    if (!VALID_GROUP_CODES.has(groupCode)) {
      issues.push({
        message: `CAS group code '${groupCode}' must be one of CO, CR, OA, PI, PR`,
        field: `CAS${groupStart}`,
      });
    }

    if (reasonCode === '') {
      issues.push({
        message: 'CAS claim adjustment reason code is required when adjustment group is present',
        field: `CAS${groupStart + 1}`,
      });
    } else if (!/^[A-Z0-9]{1,5}$/i.test(reasonCode)) {
      issues.push({
        message: 'CAS claim adjustment reason code must be 1-5 alphanumeric characters',
        field: `CAS${groupStart + 1}`,
      });
    }
  }

  return issues;
}
