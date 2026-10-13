import { claimRefSegments, extractServiceLines } from '../../support/parsed-claim.helpers';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'REF-STRUCT';
const GROUP = 'claim';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateRequiredValue(
  ref: EdiSegment,
  value: string,
  label: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (value !== '') return [];
  return [
    issue(
      RULE_ID,
      'error',
      `${label} (REF02) is required when REF segment is present`,
      GROUP,
      {
        segment: 'REF',
        segment_index: ref.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'REF02',
      },
    ),
  ];
}

function validateClaimRef(ref: EdiSegment, fg: number, tx: number): Edi837ValidationIssue[] {
  const qualifier = el(ref, 1).toUpperCase();
  const value = el(ref, 2);

  if (qualifier === '') {
    return [
      issue(
        RULE_ID,
        'error',
        'REF qualifier (REF01) is required when REF segment is present',
        GROUP,
        {
          segment: 'REF',
          segment_index: ref.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'REF01',
        },
      ),
    ];
  }

  switch (qualifier) {
    case 'X4':
      return validateRequiredValue(ref, value, 'REF*X4 clinical laboratory improvement amendment number', fg, tx);
    case 'EA':
      return validateRequiredValue(ref, value, 'REF*EA medical record number', fg, tx);
    case 'F8':
      return validateRequiredValue(ref, value, 'REF*F8 original reference number', fg, tx);
    case 'D9':
      return validateRequiredValue(ref, value, 'REF*D9 claim number', fg, tx);
    case 'G1':
      return validateRequiredValue(ref, value, 'REF*G1 prior authorization number', fg, tx);
    case '1C':
      return validateRequiredValue(ref, value, 'REF*1C Medicare provider number', fg, tx);
    case 'HPI':
      return validateRequiredValue(ref, value, 'REF*HPI health industry number', fg, tx);
    default:
      return validateRequiredValue(ref, value, `REF*${qualifier} reference`, fg, tx);
  }
}

function validateLineRef(ref: EdiSegment, fg: number, tx: number): Edi837ValidationIssue[] {
  const qualifier = el(ref, 1).toUpperCase();
  const value = el(ref, 2);

  if (qualifier === '') {
    return [
      issue(
        RULE_ID,
        'error',
        'REF qualifier (REF01) is required when REF segment is present',
        GROUP,
        {
          segment: 'REF',
          segment_index: ref.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'REF01',
        },
      ),
    ];
  }

  return validateRequiredValue(ref, value, `REF*${qualifier} line reference`, fg, tx);
}

export function refStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        for (const claim of extractClaims(body)) {
          for (const ref of claimRefSegments(claim.segments)) {
            issues.push(...validateClaimRef(ref, tx.functionalGroupIndex, tx.transactionSetIndex));
          }
          for (const line of extractServiceLines(claim.segments)) {
            for (const segment of line.segments) {
              if (segment.id !== 'REF') continue;
              issues.push(...validateLineRef(segment, tx.functionalGroupIndex, tx.transactionSetIndex));
            }
          }
        }
      }
      return issues;
    },
  };
}
