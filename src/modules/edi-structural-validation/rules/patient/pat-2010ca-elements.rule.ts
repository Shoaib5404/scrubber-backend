import {
  bodySegmentsInTransaction,
  eachTransaction,
  parseHlSegments,
  patientLoopSegments,
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

const LOOP_KEY = 'loop_2010CA';
const RULE_ID = 'PAT-2010CA-ELEMENTS';
const GROUP = 'patient';
const ENTITY_CODE = 'QC';

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
  patientNm1: EdiSegment,
  patientLoopSegs: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues = validateLoopSegmentElements(ctx, patientNm1, LOOP_KEY, 'NM1', RULE_ID, GROUP, fg, tx);
  const loopSegments = segmentsAfterNm1Until(patientLoopSegs, patientNm1, ['HL', 'NM1', 'CLM']);

  let n3: EdiSegment | null = null;
  let n4: EdiSegment | null = null;
  let dmg: EdiSegment | null = null;
  const refY4: EdiSegment[] = [];
  const perSegments: EdiSegment[] = [];

  for (const segment of loopSegments) {
    if (segment.id === 'N3' && n3 === null) n3 = segment;
    else if (segment.id === 'N4' && n4 === null) n4 = segment;
    else if (segment.id === 'DMG' && dmg === null) dmg = segment;
    else if (segment.id === 'REF') {
      const qualifier = el(segment, 1);
      if (qualifier === 'Y4') refY4.push(segment);
      else {
        issues.push(
          issue(
            RULE_ID,
            'error',
            `Patient REF01 '${qualifier}' is not valid in loop 2010CA (allowed: Y4)`,
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

  if (n3 === null) {
    issues.push(
      issue(RULE_ID, 'error', 'Patient N3 is required in loop 2010CA', GROUP, {
        segment: 'NM1',
        segment_index: patientNm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'N3',
      }),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, n3, LOOP_KEY, 'N3', RULE_ID, GROUP, fg, tx));
  }

  if (n4 === null) {
    issues.push(
      issue(RULE_ID, 'error', 'Patient N4 is required in loop 2010CA', GROUP, {
        segment: 'NM1',
        segment_index: patientNm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'N4',
      }),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, n4, LOOP_KEY, 'N4', RULE_ID, GROUP, fg, tx));
  }

  if (dmg === null) {
    issues.push(
      issue(RULE_ID, 'error', 'Patient DMG is required in loop 2010CA', GROUP, {
        segment: 'NM1',
        segment_index: patientNm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'DMG',
      }),
    );
  } else {
    issues.push(...validateLoopSegmentElements(ctx, dmg, LOOP_KEY, 'DMG', RULE_ID, GROUP, fg, tx));
  }

  const refSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'REF_Y4') ?? {}) as { max_occurs?: number };
  const maxRef = refSpec.max_occurs ?? 1;
  if (typeof maxRef === 'number' && refY4.length > maxRef) {
    const last = refY4[refY4.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Patient property and casualty REF*Y4 may occur at most ${maxRef} time(s) in loop 2010CA, got ${refY4.length}`,
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

  for (const ref of refY4) {
    issues.push(
      ...validateLoopSegmentElements(ctx, ref, LOOP_KEY, 'REF_Y4', RULE_ID, GROUP, fg, tx, 'REF'),
    );
  }

  const perSpec = (ctx.spec.loopSegmentSpec(LOOP_KEY, 'PER') ?? {}) as { max_occurs?: number };
  const maxPer = perSpec.max_occurs ?? 1;
  if (typeof maxPer === 'number' && perSegments.length > maxPer) {
    const last = perSegments[perSegments.length - 1]!;
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Patient PER may occur at most ${maxPer} time(s) in loop 2010CA, got ${perSegments.length}`,
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

export function pat2010caElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '23') continue;

          const loopSegs = patientLoopSegments(body, hl.segment);
          const patientNm1 = firstNm1ByEntity(loopSegs, ENTITY_CODE);
          if (!patientNm1) continue;

          issues.push(
            ...validateOccurrence(ctx, patientNm1, loopSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
