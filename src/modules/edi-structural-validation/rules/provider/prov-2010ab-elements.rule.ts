import {
  bodySegmentsInTransaction,
  eachTransaction,
  findAllNm1ByEntity,
  segmentsAfterNm1Until,
} from '../../support/loop-segment-scope';
import { validateLoopSegmentElements } from '../../support/loop-element-validate';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const LOOP_KEY = 'loop_2010AB';
const RULE_ID = 'PROV-2010AB-ELEMENTS';
const GROUP = 'provider';
const ENTITY_CODE = '87';

function validateOccurrence(
  ctx: Edi837RuleContext,
  payToNm1: EdiSegment,
  bodySegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues = validateLoopSegmentElements(ctx, payToNm1, LOOP_KEY, 'NM1', RULE_ID, GROUP, fg, tx);
  const loopSegments = segmentsAfterNm1Until(bodySegments, payToNm1, ['HL', 'NM1']);

  let n3: EdiSegment | null = null;
  let n4: EdiSegment | null = null;
  for (const segment of loopSegments) {
    if (segment.id === 'N3' && n3 === null) n3 = segment;
    else if (segment.id === 'N4' && n4 === null) n4 = segment;
  }

  if (n3 === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Pay-to Address N3 is required in loop 2010AB when NM1*87 is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: payToNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N3',
        },
      ),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, n3, LOOP_KEY, 'N3', RULE_ID, GROUP, fg, tx));
  }

  if (n4 === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Pay-to Address N4 is required in loop 2010AB when NM1*87 is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: payToNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N4',
        },
      ),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, n4, LOOP_KEY, 'N4', RULE_ID, GROUP, fg, tx));
  }

  return issues;
}

export function prov2010abElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const payToNm1Segments = findAllNm1ByEntity(body, ENTITY_CODE);
        if (payToNm1Segments.length === 0) continue;

        const loopSpec = ctx.spec.loopSpec(LOOP_KEY) as { max_occurs?: number } | null;
        const maxOccurs = loopSpec?.max_occurs ?? 1;
        if (typeof maxOccurs === 'number' && payToNm1Segments.length > maxOccurs) {
          const last = payToNm1Segments[payToNm1Segments.length - 1]!;
          issues.push(
            issue(
              RULE_ID,
              'error',
              `Pay-to Address loop 2010AB may occur at most ${maxOccurs} time(s), got ${payToNm1Segments.length}`,
              GROUP,
              {
                segment: 'NM1',
                segment_index: last.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'NM101',
              },
            ),
          );
        }

        for (const payToNm1 of payToNm1Segments) {
          issues.push(
            ...validateOccurrence(ctx, payToNm1, body, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
