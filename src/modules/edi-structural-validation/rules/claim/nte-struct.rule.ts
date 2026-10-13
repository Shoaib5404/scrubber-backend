import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'NTE-STRUCT';
const GROUP = 'claim';

const ALLOWED_QUALIFIERS = ['ADD', 'CER', 'DCP'] as const;

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateNote(nte: EdiSegment, fg: number, tx: number): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const qualifier = el(nte, 1).toUpperCase();

  if (qualifier === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Claim note qualifier (NTE01) is required when NTE is present',
        GROUP,
        {
          segment: 'NTE',
          segment_index: nte.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NTE01',
        },
      ),
    );
  } else if (!(ALLOWED_QUALIFIERS as readonly string[]).includes(qualifier)) {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        `Claim note qualifier '${qualifier}' is not a common 837P note code`,
        GROUP,
        {
          segment: 'NTE',
          segment_index: nte.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NTE01',
        },
      ),
    );
  }

  if (el(nte, 2) === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Claim note text (NTE02) is required when NTE is present',
        GROUP,
        {
          segment: 'NTE',
          segment_index: nte.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NTE02',
        },
      ),
    );
  }

  return issues;
}

export function nteStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        for (const claim of extractClaims(body)) {
          for (const segment of claim.segments) {
            if (segment.id === 'NM1' || segment.id === 'SBR' || segment.id === 'LX') break;
            if (segment.id !== 'NTE') continue;
            issues.push(...validateNote(segment, tx.functionalGroupIndex, tx.transactionSetIndex));
          }
        }
      }
      return issues;
    },
  };
}
