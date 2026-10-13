import { validateLoopSegmentElements } from '../../support/loop-element-validate';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'PROV-2310-ELEMENTS';
const GROUP = 'provider';

const ENTITY_LOOP: Record<string, string> = {
  DN: 'loop_2310A',
  P3: 'loop_2310A',
  '82': 'loop_2310B',
  '77': 'loop_2310C',
  DQ: 'loop_2310D',
  PW: 'loop_2310E',
  '45': 'loop_2310F',
};

const LOOP_SEGMENTS: Record<string, string[]> = {
  loop_2310A: ['NM1', 'REF'],
  loop_2310B: ['NM1', 'PRV', 'REF'],
  loop_2310C: ['NM1', 'N3', 'N4', 'REF', 'PER'],
  loop_2310D: ['NM1', 'REF'],
  loop_2310E: ['NM1', 'N3', 'N4'],
  loop_2310F: ['NM1', 'N3', 'N4'],
};

const ADDRESS_LOOPS = new Set(['loop_2310C', 'loop_2310E', 'loop_2310F']);

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function segmentsIn2310(claimSegments: EdiSegment[]): EdiSegment[] {
  const segments: EdiSegment[] = [];
  let started = false;

  for (const segment of claimSegments) {
    const type = segment.id;
    if (type === 'SBR' || type === 'LX') break;

    if (!started) {
      if (type !== 'NM1') continue;
      started = true;
    }

    segments.push(segment);
  }

  return segments;
}

type LoopOccurrence = {
  loop_key: string;
  nm1: EdiSegment;
  segments: EdiSegment[];
};

function splitLoops(zone: EdiSegment[]): LoopOccurrence[] {
  const loops: LoopOccurrence[] = [];
  let current: LoopOccurrence | null = null;

  for (const segment of zone) {
    if (segment.id === 'NM1') {
      if (current != null) loops.push(current);
      const entity = el(segment, 1).toUpperCase();
      current = {
        loop_key: ENTITY_LOOP[entity] ?? '',
        nm1: segment,
        segments: [],
      };
      continue;
    }

    if (current != null) {
      current.segments.push(segment);
    }
  }

  if (current != null) loops.push(current);
  return loops;
}

function validateLoopOccurrence(
  ctx: Edi837RuleContext,
  loopKey: string,
  nm1: EdiSegment,
  members: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (loopKey === '') {
    const entity = el(nm1, 1).toUpperCase();
    return [
      issue(
        RULE_ID,
        'error',
        `NM101 '${entity}' is not valid in loop 2310 (claim-level 2310A-F)`,
        GROUP,
        {
          segment: 'NM1',
          segment_index: nm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM101',
        },
      ),
    ];
  }

  const issues: Edi837ValidationIssue[] = [
    ...validateLoopSegmentElements(ctx, nm1, loopKey, 'NM1', RULE_ID, GROUP, fg, tx, 'NM1'),
  ];
  const allowed = LOOP_SEGMENTS[loopKey] ?? [];
  const present: Record<string, boolean> = { NM1: true };

  for (const segment of members) {
    const type = segment.id;
    if (!allowed.includes(type)) {
      issues.push(
        issue(RULE_ID, 'error', `Segment ${type} is not used in ${loopKey}`, GROUP, {
          segment: type,
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: type,
        }),
      );
      continue;
    }

    present[type] = true;
    issues.push(
      ...validateLoopSegmentElements(ctx, segment, loopKey, type, RULE_ID, GROUP, fg, tx, type),
    );
  }

  if (ADDRESS_LOOPS.has(loopKey)) {
    for (const requiredType of ['N3', 'N4'] as const) {
      const spec = ctx.spec.loopSegmentSpec(loopKey, requiredType) as { required?: boolean } | null;
      if (spec?.required === true && !present[requiredType]) {
        issues.push(
          issue(
            RULE_ID,
            'error',
            `${requiredType} is required in ${loopKey} when the loop is used`,
            GROUP,
            {
              segment: 'NM1',
              segment_index: nm1.index,
              functional_group_index: fg,
              transaction_set_index: tx,
              field: requiredType,
            },
          ),
        );
      }
    }
  }

  for (const type of allowed) {
    if (type === 'NM1' || type === 'N3' || type === 'N4') continue;
    const spec = (ctx.spec.loopSegmentSpec(loopKey, type) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    let count = 0;
    for (const segment of members) {
      if (segment.id === type) count++;
    }
    const maxOccurs = spec.max_occurs ?? (spec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `${loopKey} ${type} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: type,
            segment_index: nm1.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: type,
          },
        ),
      );
    }
  }

  return issues;
}

function validateReferringSequence(
  referringCodes: string[],
  clm: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (referringCodes.length === 0) return [];

  if (referringCodes[0] !== 'DN') {
    return [
      issue(RULE_ID, 'error', 'Loop 2310A first (or only) iteration NM101 must be DN', GROUP, {
        segment: 'NM1',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }

  if (referringCodes[1] != null && referringCodes[1] !== 'P3') {
    return [
      issue(RULE_ID, 'error', 'Loop 2310A second iteration NM101 must be P3', GROUP, {
        segment: 'NM1',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }

  return [];
}

function validateClaim(
  ctx: Edi837RuleContext,
  claim: { clm: EdiSegment; segments: EdiSegment[] },
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const zone = segmentsIn2310(claim.segments);
  if (zone.length === 0) return [];

  const loopCounts: Record<string, number> = {};
  const referringCodes: string[] = [];
  let issues: Edi837ValidationIssue[] = [];

  for (const loop of splitLoops(zone)) {
    const { loop_key: loopKey, nm1, segments: members } = loop;
    loopCounts[loopKey] = (loopCounts[loopKey] ?? 0) + 1;
    if (loopKey === 'loop_2310A') {
      referringCodes.push(el(nm1, 1).toUpperCase());
    }
    issues = issues.concat(validateLoopOccurrence(ctx, loopKey, nm1, members, fg, tx));
  }

  for (const [loopKey, count] of Object.entries(loopCounts)) {
    const spec = (ctx.spec.loopSpec(loopKey) ?? {}) as { max_occurs?: number; repeatable?: boolean };
    const maxOccurs = spec.max_occurs ?? (spec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(RULE_ID, 'error', `${loopKey} may occur at most ${maxOccurs} time(s), got ${count}`, GROUP, {
          segment: 'NM1',
          segment_index: claim.clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: loopKey,
        }),
      );
    }
  }

  return issues.concat(validateReferringSequence(referringCodes, claim.clm, fg, tx));
}

export function prov2310ElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        for (const claim of extractClaims(body)) {
          issues.push(...validateClaim(ctx, claim, tx.functionalGroupIndex, tx.transactionSetIndex));
        }
      }
      return issues;
    },
  };
}
