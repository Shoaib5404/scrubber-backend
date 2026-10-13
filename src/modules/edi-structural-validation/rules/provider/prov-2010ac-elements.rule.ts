import {
  bodySegmentsInTransaction,
  eachTransaction,
  findAllNm1ByEntity,
  firstSegmentOfType,
  headerSegmentsInTransaction,
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

const LOOP_KEY = 'loop_2010AC';
const RULE_ID = 'PROV-2010AC-ELEMENTS';
const GROUP = 'provider';
const ENTITY_CODE = 'PE';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateOccurrence(
  ctx: Edi837RuleContext,
  payToPlanNm1: EdiSegment,
  bodySegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues = validateLoopSegmentElements(ctx, payToPlanNm1, LOOP_KEY, 'NM1', RULE_ID, GROUP, fg, tx);
  const loopSegments = segmentsAfterNm1Until(bodySegments, payToPlanNm1, ['HL', 'NM1']);

  let n3: EdiSegment | null = null;
  let n4: EdiSegment | null = null;
  const secondaryRefs: EdiSegment[] = [];
  const taxRefs: EdiSegment[] = [];

  for (const segment of loopSegments) {
    if (segment.id === 'N3' && n3 === null) n3 = segment;
    else if (segment.id === 'N4' && n4 === null) n4 = segment;
    else if (segment.id === 'REF') {
      const qualifier = el(segment, 1);
      if (qualifier === 'EI') {
        taxRefs.push(segment);
      } else if (qualifier === '2U' || qualifier === 'FY' || qualifier === 'NF') {
        secondaryRefs.push(segment);
      } else {
        issues.push(
          issue(
            RULE_ID,
            'error',
            `Pay-to Plan REF01 '${qualifier}' is not valid in loop 2010AC`,
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

  if (n3 === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Pay-to Plan N3 is required in loop 2010AC when NM1*PE is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: payToPlanNm1.index,
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
        'Pay-to Plan N4 is required in loop 2010AC when NM1*PE is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: payToPlanNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N4',
        },
      ),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, n4, LOOP_KEY, 'N4', RULE_ID, GROUP, fg, tx));
  }

  const secondarySpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF') ?? {}) as { max_occurs?: number };
  const maxSecondary = secondarySpec.max_occurs ?? 1;
  if (typeof maxSecondary === 'number' && secondaryRefs.length > maxSecondary) {
    const last = secondaryRefs[secondaryRefs.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Pay-to Plan secondary REF may occur at most ${maxSecondary} time(s) in loop 2010AC, got ${secondaryRefs.length}`,
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

  const nm108 = el(payToPlanNm1, 8);
  for (const ref of secondaryRefs) {
    issues.push(...validateLoopSegmentElements(ctx, ref, LOOP_KEY, 'REF', RULE_ID, GROUP, fg, tx, 'REF'));

    if (el(ref, 1) === '2U' && nm108 !== 'XV') {
      issues.push(
        issue(
          RULE_ID,
          'error',
          'Pay-to Plan secondary REF01=2U is only allowed when NM108=XV (National Plan ID in NM109)',
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

  const taxSpec = ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF_EI') as { required?: boolean } | null;
  if (taxSpec?.required === true && taxRefs.length === 0) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Pay-to Plan tax identification REF*EI is required in loop 2010AC',
        GROUP,
        {
          segment: 'NM1',
          segment_index: payToPlanNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'REF',
        },
      ),
    );
  }

  for (const ref of taxRefs) {
    issues.push(
      ...validateLoopSegmentElements(ctx, ref, LOOP_KEY, 'REF_EI', RULE_ID, GROUP, fg, tx, 'REF'),
    );
  }

  return issues;
}

export function prov2010acElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const payToPlanNm1Segments = findAllNm1ByEntity(body, ENTITY_CODE);
        if (payToPlanNm1Segments.length === 0) continue;

        const header = headerSegmentsInTransaction(tx.segments);
        const bht = firstSegmentOfType(header, 'BHT');
        const bht06 = bht ? el(bht, 6) : '';
        if (bht06 !== '31') {
          const first = payToPlanNm1Segments[0]!;
          issues.push(
            issue(
              RULE_ID,
              'error',
              `Pay-to Plan loop 2010AC may only be used when BHT06=31 (Subrogation Demand), got '${bht06}'`,
              GROUP,
              {
                segment: 'NM1',
                segment_index: first.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'BHT06',
              },
            ),
          );
        }

        const loopSpec = ctx.spec.loopSpec(LOOP_KEY) as { max_occurs?: number } | null;
        const maxOccurs = loopSpec?.max_occurs ?? 1;
        if (typeof maxOccurs === 'number' && payToPlanNm1Segments.length > maxOccurs) {
          const last = payToPlanNm1Segments[payToPlanNm1Segments.length - 1]!;
          issues.push(
            issue(
              RULE_ID,
              'error',
              `Pay-to Plan loop 2010AC may occur at most ${maxOccurs} time(s), got ${payToPlanNm1Segments.length}`,
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

        for (const payToPlanNm1 of payToPlanNm1Segments) {
          issues.push(
            ...validateOccurrence(ctx, payToPlanNm1, body, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
