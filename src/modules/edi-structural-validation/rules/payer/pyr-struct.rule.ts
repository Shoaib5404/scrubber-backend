import {
  bodySegmentsInTransaction,
  eachTransaction,
  parseHlSegments,
  subscriberLoopSegments,
} from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'PYR-STRUCT';
const GROUP = 'payer';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function firstNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.id === 'NM1' && el(segment, 1) === entityCode) return segment;
  }
  return null;
}

export function pyrStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '22') continue;

          const loopSegs = subscriberLoopSegments(body, hl.segment);
          const payerNm1 = firstNm1ByEntity(loopSegs, 'PR');

          if (!payerNm1) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Primary payer NM1*PR segment (loop 2010BB) is required',
                GROUP,
                {
                  segment: 'HL',
                  segment_index: hl.segment.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'NM101',
                },
              ),
            );
            continue;
          }

          if (el(payerNm1, 3) === '') {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Primary payer name (NM103 in 2010BB) is required',
                GROUP,
                {
                  segment: 'NM1',
                  segment_index: payerNm1.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'NM103',
                },
              ),
            );
          }

          if (el(payerNm1, 9) === '') {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Primary payer ID (NM109 in 2010BB) is required',
                GROUP,
                {
                  segment: 'NM1',
                  segment_index: payerNm1.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'NM109',
                },
              ),
            );
          }
        }
      }

      return issues;
    },
  };
}
