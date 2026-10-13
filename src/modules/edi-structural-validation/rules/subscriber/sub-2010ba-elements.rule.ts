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

const LOOP_KEY = 'loop_2010BA';
const RULE_ID = 'SUB-2010BA-ELEMENTS';
const GROUP = 'subscriber';
const ENTITY_CODE = 'IL';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function firstNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.id === 'NM1' && el(segment, 1) === entityCode) return segment;
  }
  return null;
}

function validateRefGroup(
  ctx: Edi837RuleContext,
  refs: EdiSegment[],
  specKey: string,
  label: string,
  defaultMax: number,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const spec = (ctx.spec.loopSegmentSpec(LOOP_KEY, specKey) ?? {}) as { max_occurs?: number };
  const maxOccurs = spec.max_occurs ?? defaultMax;
  if (typeof maxOccurs === 'number' && refs.length > maxOccurs) {
    const last = refs[refs.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `${label} may occur at most ${maxOccurs} time(s) in loop 2010BA, got ${refs.length}`,
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

  for (const ref of refs) {
    issues.push(
      ...validateLoopSegmentElements(ctx, ref, LOOP_KEY, specKey, RULE_ID, GROUP, fg, tx, 'REF'),
    );
  }

  return issues;
}

function validatePerGroup(
  ctx: Edi837RuleContext,
  perSegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const spec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'PER') ?? {}) as { max_occurs?: number };
  const maxOccurs = spec.max_occurs ?? 1;
  if (typeof maxOccurs === 'number' && perSegments.length > maxOccurs) {
    const last = perSegments[perSegments.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Subscriber PER may occur at most ${maxOccurs} time(s) in loop 2010BA, got ${perSegments.length}`,
        GROUP,
        {
          segment: 'PER',
          segment_index: last.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'PER',
        },
      ),
    );
  }

  for (const per of perSegments) {
    issues.push(...validateLoopSegmentElements(ctx, per, LOOP_KEY, 'PER', RULE_ID, GROUP, fg, tx));
  }

  return issues;
}

function validateOccurrence(
  ctx: Edi837RuleContext,
  subscriberNm1: EdiSegment,
  subscriberLoopSegs: EdiSegment[],
  childCode: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues = validateLoopSegmentElements(ctx, subscriberNm1, LOOP_KEY, 'NM1', RULE_ID, GROUP, fg, tx);
  const loopSegments = segmentsAfterNm1Until(subscriberLoopSegs, subscriberNm1, ['HL', 'NM1', 'CLM']);

  let n3: EdiSegment | null = null;
  let n4: EdiSegment | null = null;
  let dmg: EdiSegment | null = null;
  const refSy: EdiSegment[] = [];
  const refY4: EdiSegment[] = [];
  const perSegments: EdiSegment[] = [];

  for (const segment of loopSegments) {
    if (segment.id === 'N3' && n3 === null) n3 = segment;
    else if (segment.id === 'N4' && n4 === null) n4 = segment;
    else if (segment.id === 'DMG' && dmg === null) dmg = segment;
    else if (segment.id === 'REF') {
      const qualifier = el(segment, 1);
      if (qualifier === 'SY') refSy.push(segment);
      else if (qualifier === 'Y4') refY4.push(segment);
      else {
        issues.push(
          issue(
            RULE_ID,
            'error',
            `Subscriber REF01 '${qualifier}' is not valid in loop 2010BA (allowed: SY, Y4)`,
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
    } else if (segment.id === 'PER') {
      perSegments.push(segment);
    }
  }

  const patientIsSubscriber = childCode === '0';

  if (patientIsSubscriber && n3 === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Subscriber N3 is required in loop 2010BA when patient is the subscriber (HL04=0)',
        GROUP,
        {
          segment: 'NM1',
          segment_index: subscriberNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N3',
        },
      ),
    );
  } else if (n3 !== null) {
    issues.push(...validateLoopSegmentElements(ctx, n3, LOOP_KEY, 'N3', RULE_ID, GROUP, fg, tx));
  }

  if ((patientIsSubscriber || n3 !== null) && n4 === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        patientIsSubscriber
          ? 'Subscriber N4 is required in loop 2010BA when patient is the subscriber (HL04=0)'
          : 'Subscriber N4 is required in loop 2010BA when N3 is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: subscriberNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'N4',
        },
      ),
    );
  } else if (n4 !== null) {
    issues.push(...validateLoopSegmentElements(ctx, n4, LOOP_KEY, 'N4', RULE_ID, GROUP, fg, tx));
  }

  if (patientIsSubscriber && dmg === null) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Subscriber DMG is required in loop 2010BA when patient is the subscriber (HL04=0)',
        GROUP,
        {
          segment: 'NM1',
          segment_index: subscriberNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DMG',
        },
      ),
    );
  } else if (dmg !== null) {
    issues.push(...validateLoopSegmentElements(ctx, dmg, LOOP_KEY, 'DMG', RULE_ID, GROUP, fg, tx));
  }

  issues.push(
    ...validateRefGroup(ctx, refSy, 'REF_SY', 'Subscriber secondary REF*SY', 1, fg, tx),
    ...validateRefGroup(ctx, refY4, 'REF_Y4', 'Subscriber property and casualty REF*Y4', 1, fg, tx),
    ...validatePerGroup(ctx, perSegments, fg, tx),
  );

  return issues;
}

export function sub2010baElementsRule(): Edi837ValidationRule {
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
          const subscriberNm1 = firstNm1ByEntity(loopSegs, ENTITY_CODE);
          if (!subscriberNm1) continue;

          issues.push(
            ...validateOccurrence(
              ctx,
              subscriberNm1,
              loopSegs,
              hl.childCode,
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
      }

      return issues;
    },
  };
}
