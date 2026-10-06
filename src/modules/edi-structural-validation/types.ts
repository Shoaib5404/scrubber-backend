export type ValidationSeverity = 'error' | 'critical' | 'warning' | 'info';

export type Edi837ValidationIssue = {
  rule: string;
  severity: ValidationSeverity;
  message: string;
  category: string;
  segment?: string | null;
  segment_index?: number | null;
  functional_group_index?: number | null;
  transaction_set_index?: number | null;
  field?: string | null;
};

export type Edi837ValidationResultDto = {
  issues: Edi837ValidationIssue[];
  error_count: number;
  warning_count: number;
  passed: boolean;
};

export type EdiSegment = {
  id: string;
  elements: string[];
  index: number;
  raw: string;
};

export type EdiDocument = {
  segments: EdiSegment[];
  elementSeparator: string;
  segmentTerminator: string;
  componentSeparator: string;
  isa: EdiSegment | null;
  iea: EdiSegment | null;
  functionalGroups: Array<{
    gs: EdiSegment | null;
    ge: EdiSegment | null;
    transactions: Array<{ st: EdiSegment | null; se: EdiSegment | null; segments: EdiSegment[] }>;
  }>;
};

export interface Edi837ValidationRule {
  id(): string;
  group(): string;
  validate(doc: EdiDocument): Edi837ValidationIssue[];
}

export function issue(
  rule: string,
  severity: ValidationSeverity,
  message: string,
  category: string,
  extra: Partial<Edi837ValidationIssue> = {},
): Edi837ValidationIssue {
  return {
    rule,
    severity,
    message,
    category,
    segment: extra.segment ?? null,
    segment_index: extra.segment_index ?? null,
    functional_group_index: extra.functional_group_index ?? null,
    transaction_set_index: extra.transaction_set_index ?? null,
    field: extra.field ?? null,
  };
}

export function toResult(issues: Edi837ValidationIssue[]): Edi837ValidationResultDto {
  const error_count = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length;
  const warning_count = issues.filter((i) => i.severity === 'warning').length;
  return { issues, error_count, warning_count, passed: error_count === 0 };
}

export function isBlocking(i: Edi837ValidationIssue): boolean {
  return i.severity === 'error' || i.severity === 'critical';
}
