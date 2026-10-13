import { validateCasSegment } from '../../support/cas.validator';
import { bodySegmentsInTransaction, eachTransaction } from '../../support/loop-segment-scope';
import { FieldFormatValidator } from '../../support/field-format.validator';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'AMT-STRUCT';
const GROUP = 'amount';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateSegmentAmounts(
  segment: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const type = segment.id;

  const fields: Record<number, string> =
    type === 'CLM'
      ? { 2: 'CLM02' }
      : type === 'SV1'
        ? { 2: 'SV102' }
        : type === 'AMT'
          ? { 2: 'AMT02' }
          : type === 'SVD'
            ? { 2: 'SVD02' }
            : {};

  for (const [position, field] of Object.entries(fields)) {
    const value = el(segment, Number(position));
    if (value === '') continue;
    if (!FieldFormatValidator.isValidAmount(value)) {
      issues.push(
        issue(RULE_ID, 'error', `${field} must be numeric with up to 2 decimal places`, GROUP, {
          segment: type,
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field,
        }),
      );
    }
  }

  if (type === 'CAS') {
    for (const finding of validateCasSegment(segment)) {
      issues.push(
        issue(RULE_ID, 'error', finding.message, GROUP, {
          segment: 'CAS',
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: finding.field,
        }),
      );
    }

    for (let i = 3; i < segment.elements.length; i += 3) {
      const amount = segment.elements[i] ?? '';
      if (amount === '') continue;
      if (!FieldFormatValidator.isValidAmount(amount)) {
        issues.push(
          issue(
            RULE_ID,
            'error',
            'CAS adjustment amount must be numeric with up to 2 decimal places',
            GROUP,
            {
              segment: 'CAS',
              segment_index: segment.index,
              functional_group_index: fg,
              transaction_set_index: tx,
              field: `CAS${i}`,
            },
          ),
        );
      }
    }
  }

  return issues;
}

export function amtStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        for (const segment of body) {
          issues.push(
            ...validateSegmentAmounts(segment, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }
      return issues;
    },
  };
}
