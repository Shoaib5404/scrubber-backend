import {
  bodySegmentsInTransaction,
  eachTransaction,
  parseHlSegments,
  segmentsAfterNm1Until,
  subscriberLoopSegments,
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

const LOOP_KEY = 'loop_2010BB';
const RULE_ID = 'PYR-2010BB-ELEMENTS';
const GROUP = 'payer';
const ENTITY_CODE = 'PR';
const PAYER_REF_QUALIFIERS = ['2U', 'EI', 'FY', 'NF'];
const BILLING_REF_QUALIFIERS = ['G2', 'LU'];

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function firstNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.id === 'NM1' && el(segment, 1) === entityCode) return segment;
  }
  return null;
}

function validateOccurrence(
  ctx: Edi837RuleContext,
  payerNm1: EdiSegment,
  subscriberLoopSegs: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues = validateLoopSegmentElements(ctx, payerNm1, LOOP_KEY, 'NM1', RULE_ID, GROUP, fg, tx);
  const loopSegments = segmentsAfterNm1Until(subscriberLoopSegs, payerNm1, ['HL', 'NM1', 'CLM']);

  let n3: EdiSegment | null = null;
  let n4: EdiSegment | null = null;
  const payerRefs: EdiSegment[] = [];
  const billingRefs: EdiSegment[] = [];

  for (const segment of loopSegments) {
    if (segment.id === 'N3' && n3 === null) n3 = segment;
    else if (segment.id === 'N4' && n4 === null) n4 = segment;
    else if (segment.id === 'REF') {
      const qualifier = el(segment, 1);
      if (PAYER_REF_QUALIFIERS.includes(qualifier)) {
        payerRefs.push(segment);
      } else if (BILLING_REF_QUALIFIERS.includes(qualifier)) {
        billingRefs.push(segment);
      } else {
        issues.push(
          issue(
            RULE_ID,
            'error',
            `Payer REF01 '${qualifier}' is not valid in loop 2010BB (allowed: 2U|EI|FY|NF or G2|LU)`,
            GROUP,
            {
              segment: 'REF',
              segment_index: segment.index,
              functional_group_index: fg,
              transaction_set_index: tx,
              field: 'REF01',
            },
          ),
        );
      }
    }
  }

  if (n3 !== null) {
    issues.push(...validateLoopSegmentElements(ctx, n3, LOOP_KEY, 'N3', RULE_ID, GROUP, fg, tx));

    if (n4 === null) {
      issues.push(
        issue(RULE_ID, 'error', 'Payer N4 is required in loop 2010BB when N3 is present', GROUP, {
          segment: 'NM1',
          segment_index: payerNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N4',
        }),
      );
    }
  }

  if (n4 !== null) {
    issues.push(...validateLoopSegmentElements(ctx, n4, LOOP_KEY, 'N4', RULE_ID, GROUP, fg, tx));
  }

  const payerRefSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF') ?? {}) as { max_occurs?: number };
  const maxPayerRef = payerRefSpec.max_occurs ?? 3;
  if (typeof maxPayerRef === 'number' && payerRefs.length > maxPayerRef) {
    const last = payerRefs[payerRefs.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Payer secondary REF may occur at most ${maxPayerRef} time(s) in loop 2010BB, got ${payerRefs.length}`,
        GROUP,
        {
          segment: 'REF',
          segment_index: last.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'REF',
        },
      ),
    );
  }

  const nm108 = el(payerNm1, 8);
  for (const ref of payerRefs) {
    issues.push(...validateLoopSegmentElements(ctx, ref, LOOP_KEY, 'REF', RULE_ID, GROUP, fg, tx));

    if (el(ref, 1) === '2U' && nm108 !== 'XV') {
      issues.push(
        issue(
          RULE_ID,
          'error',
          'Payer secondary REF01=2U is only allowed when NM108=XV (National Plan ID in NM109)',
          GROUP,
          {
            segment: 'REF',
            segment_index: ref.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'REF01',
          },
        ),
      );
    }
  }

  const billingRefSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF_G2') ?? {}) as { max_occurs?: number };
  const maxBillingRef = billingRefSpec.max_occurs ?? 2;
  if (typeof maxBillingRef === 'number' && billingRefs.length > maxBillingRef) {
    const last = billingRefs[billingRefs.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Billing provider secondary REF may occur at most ${maxBillingRef} time(s) in loop 2010BB, got ${billingRefs.length}`,
        GROUP,
        {
          segment: 'REF',
          segment_index: last.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'REF',
        },
      ),
    );
  }

  for (const ref of billingRefs) {
    issues.push(
      ...validateLoopSegmentElements(ctx, ref, LOOP_KEY, 'REF_G2', RULE_ID, GROUP, fg, tx, 'REF'),
    );
  }

  return issues;
}

export function pyr2010bbElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '22') continue;

          const loopSegs = subscriberLoopSegments(body, hl.segment);
          const payerNm1 = firstNm1ByEntity(loopSegs, ENTITY_CODE);
          if (!payerNm1) continue;

          issues.push(
            ...validateOccurrence(ctx, payerNm1, loopSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
