import { EdiSegment } from '../types';
import type { ValidationSeverity } from '../types';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

export type TaxonomyFinding = {
  message: string;
  field: string;
  severity: ValidationSeverity;
};

/** Shared PRV taxonomy format checks (BI and PE). */
export function validateEdi837Taxonomy(prv: EdiSegment, label: string): TaxonomyFinding[] {
  const issues: TaxonomyFinding[] = [];
  const qualifier = el(prv, 1).toUpperCase();
  const taxonomy = el(prv, 3);

  if (qualifier === '') {
    issues.push({
      message: `${label} provider type (PRV01) is required`,
      field: 'PRV01',
      severity: 'error',
    });
  }

  const reference = el(prv, 2).toUpperCase();
  if (reference !== '' && reference !== 'PXC' && reference !== 'ZZ') {
    issues.push({
      message: `${label} taxonomy reference (PRV02) should be PXC or ZZ`,
      field: 'PRV02',
      severity: 'warning',
    });
  }

  if (taxonomy === '') {
    issues.push({
      message: `${label} taxonomy code (PRV03) is required when PRV is present`,
      field: 'PRV03',
      severity: 'warning',
    });

    return issues;
  }

  if (taxonomy.length !== 10) {
    issues.push({
      message: `${label} taxonomy code (PRV03) must be exactly 10 characters`,
      field: 'PRV03',
      severity: 'warning',
    });
  }

  if (!/^[A-Z0-9]{10}$/i.test(taxonomy)) {
    issues.push({
      message: `${label} taxonomy code (PRV03) must be 10 alphanumeric characters`,
      field: 'PRV03',
      severity: 'warning',
    });
  }

  return issues;
}
