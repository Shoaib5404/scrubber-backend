import {
  bodySegmentsInTransaction,
  eachTransaction,
  findNm1ByEntity,
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

const LOOP_KEY = 'loop_2010AA';
const RULE_ID = 'PROV-2010AA-ELEMENTS';
const GROUP = 'provider';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validatePer02FirstIteration(
  per: EdiSegment,
  isFirst: boolean,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (!isFirst || el(per, 2) !== '') {
    return [];
  }

  return [
    issue(
      RULE_ID,
      'error',
      'Billing provider contact name (PER02) is required in the first PER iteration of loop 2010AA',
      GROUP,
      {
        segment: 'PER',
        segment_index: per.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'PER02',
      },
    ),
  ];
}

export function prov2010aaElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const billingNm1 = findNm1ByEntity(body, '85');
        if (!billingNm1) continue;

        const loopSegments = segmentsAfterNm1Until(body, billingNm1, ['HL', 'NM1']);

        issues.push(
          ...validateLoopSegmentElements(
            ctx,
            billingNm1,
            LOOP_KEY,
            'NM1',
            RULE_ID,
            GROUP,
            tx.functionalGroupIndex,
            tx.transactionSetIndex,
          ),
        );

        for (const segment of loopSegments) {
          if (segment.id === 'N3' || segment.id === 'N4') {
            issues.push(
              ...validateLoopSegmentElements(
                ctx,
                segment,
                LOOP_KEY,
                segment.id,
                RULE_ID,
                GROUP,
                tx.functionalGroupIndex,
                tx.transactionSetIndex,
              ),
            );
          }
        }

        const taxRefs: EdiSegment[] = [];
        const upinRefs: EdiSegment[] = [];
        const perSegments: EdiSegment[] = [];

        for (const segment of loopSegments) {
          if (segment.id === 'REF') {
            const qualifier = el(segment, 1);
            if (qualifier === 'EI' || qualifier === 'SY') {
              taxRefs.push(segment);
            } else if (qualifier === '0B' || qualifier === '1G') {
              upinRefs.push(segment);
            }
          }
          if (segment.id === 'PER') {
            perSegments.push(segment);
          }
        }

        const refEiSpec = ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF_EI') as { required?: boolean } | null;
        if (refEiSpec?.required === true && taxRefs.length === 0) {
          issues.push(
            issue(
              RULE_ID,
              'error',
              'Billing provider tax identification REF (EI/SY) is required in loop 2010AA',
              GROUP,
              {
                segment: 'NM1',
                segment_index: billingNm1.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'REF',
              },
            ),
          );
        }

        for (const ref of taxRefs) {
          issues.push(
            ...validateLoopSegmentElements(
              ctx,
              ref,
              LOOP_KEY,
              'REF_EI',
              RULE_ID,
              GROUP,
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
              'REF',
            ),
          );
        }

        const upinSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF_LU') ?? {}) as { max_occurs?: number };
        const maxUpin = upinSpec.max_occurs;
        if (typeof maxUpin === 'number' && upinRefs.length > maxUpin) {
          const last = upinRefs[upinRefs.length - 1]!;
          issues.push(
            issue(
              RULE_ID,
              'error',
              `Billing provider UPIN/license REF may occur at most ${maxUpin} time(s) in loop 2010AA, got ${upinRefs.length}`,
              GROUP,
              {
                segment: 'REF',
                segment_index: last.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'REF',
              },
            ),
          );
        }

        for (const ref of upinRefs) {
          issues.push(
            ...validateLoopSegmentElements(
              ctx,
              ref,
              LOOP_KEY,
              'REF_LU',
              RULE_ID,
              GROUP,
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
              'REF',
            ),
          );
        }

        const perSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'PER') ?? {}) as { max_occurs?: number };
        const maxPer = perSpec.max_occurs;
        if (typeof maxPer === 'number' && perSegments.length > maxPer) {
          const last = perSegments[perSegments.length - 1]!;
          issues.push(
            issue(
              RULE_ID,
              'error',
              `Billing provider PER may occur at most ${maxPer} time(s) in loop 2010AA, got ${perSegments.length}`,
              GROUP,
              {
                segment: 'PER',
                segment_index: last.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'PER',
              },
            ),
          );
        }

        perSegments.forEach((per, index) => {
          issues.push(
            ...validateLoopSegmentElements(
              ctx,
              per,
              LOOP_KEY,
              'PER',
              RULE_ID,
              GROUP,
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
            ...validatePer02FirstIteration(per, index === 0, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        });
      }

      return issues;
    },
  };
}
