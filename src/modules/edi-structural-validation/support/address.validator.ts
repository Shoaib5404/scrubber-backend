import { EdiSegment } from '../types';

function el(seg: EdiSegment | null | undefined, n: number): string {
  return (seg?.elements[n] ?? '').trim();
}

export type AddressFinding = {
  message: string;
  segment: string;
  segmentIndex: number | null;
  field: string;
};

/** Shared N3/N4 structural checks for provider and subscriber loops. */
export function validateEdi837Address(
  n3: EdiSegment | null,
  n4: EdiSegment | null,
  contextLabel: string,
  requireStateAndPostal = true,
): AddressFinding[] {
  const issues: AddressFinding[] = [];

  if (n3 === null || el(n3, 1) === '') {
    issues.push({
      message: `${contextLabel} address (N3) is required`,
      segment: 'N3',
      segmentIndex: n3?.index ?? null,
      field: 'N301',
    });
  }

  if (n4 === null || el(n4, 1) === '') {
    issues.push({
      message: `${contextLabel} city (N401) is required`,
      segment: 'N4',
      segmentIndex: n4?.index ?? null,
      field: 'N401',
    });

    return issues;
  }

  if (requireStateAndPostal && el(n4, 2) === '') {
    issues.push({
      message: `${contextLabel} state (N402) is required`,
      segment: 'N4',
      segmentIndex: n4.index,
      field: 'N402',
    });
  } else if (requireStateAndPostal && el(n4, 3) === '') {
    issues.push({
      message: `${contextLabel} ZIP (N403) is required`,
      segment: 'N4',
      segmentIndex: n4.index,
      field: 'N403',
    });
  }

  return issues;
}
