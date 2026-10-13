import { validateLoopSegmentElements } from '../../support/loop-element-validate';
import { extractClaimCobBlocks } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'COB-2320-ELEMENTS';
const GROUP = 'cob';
const LOOP_2320 = 'loop_2320';

const ENTITY_LOOP: Record<string, string> = {
  IL: 'loop_2330A',
  PR: 'loop_2330B',
  DN: 'loop_2330C',
  P3: 'loop_2330C',
  '82': 'loop_2330D',
  '77': 'loop_2330E',
  DQ: 'loop_2330F',
  '85': 'loop_2330G',
};

const LOOP_SEGMENTS: Record<string, string[]> = {
  loop_2330A: ['NM1', 'N3', 'N4', 'REF'],
  loop_2330B: ['NM1', 'N3', 'N4', 'DTP', 'REF'],
  loop_2330C: ['NM1', 'REF'],
  loop_2330D: ['NM1', 'REF'],
  loop_2330E: ['NM1', 'REF'],
  loop_2330F: ['NM1', 'REF'],
  loop_2330G: ['NM1', 'REF'],
};

const HEADER_TYPES = ['SBR', 'CAS', 'AMT', 'OI', 'MOA'];
const REQUIRED_CHILD_LOOPS = ['loop_2330A', 'loop_2330B'];
const N4_REQUIRED_LOOPS = ['loop_2330A', 'loop_2330B'];
const REF_REQUIRED_LOOPS = [
  'loop_2330C',
  'loop_2330D',
  'loop_2330E',
  'loop_2330F',
  'loop_2330G',
];

const AMT_SPEC: Record<string, string> = { D: 'AMT_D', A8: 'AMT_A8', EAF: 'AMT_EAF' };
const PAYER_REF_SPEC: Record<string, string> = {
  '2U': 'REF',
  EI: 'REF',
  FY: 'REF',
  NF: 'REF',
  G1: 'REF_G1',
  '9F': 'REF_9F',
  T4: 'REF_T4',
  F8: 'REF_F8',
};

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function ediCodeFromSpecKey(specKey: string): string {
  return specKey.split('_')[0] ?? specKey;
}

type ChildLoop = { loopKey: string; nm1: EdiSegment; segments: EdiSegment[] };

function splitHeaderAndChildren(segments: EdiSegment[]): [EdiSegment[], EdiSegment[]] {
  const header: EdiSegment[] = [];
  const children: EdiSegment[] = [];
  let inChildren = false;
  for (const segment of segments) {
    if (!inChildren && segment.id === 'NM1') inChildren = true;
    if (inChildren) children.push(segment);
    else header.push(segment);
  }
  return [header, children];
}

function splitChildLoops(zone: EdiSegment[]): ChildLoop[] {
  const loops: ChildLoop[] = [];
  let current: ChildLoop | null = null;
  for (const segment of zone) {
    if (segment.id === 'NM1') {
      if (current) loops.push(current);
      const entity = el(segment, 1).toUpperCase();
      current = {
        loopKey: ENTITY_LOOP[entity] ?? '',
        nm1: segment,
        segments: [],
      };
      continue;
    }
    if (current) current.segments.push(segment);
  }
  if (current) loops.push(current);
  return loops;
}

function headerSpecKey(segment: EdiSegment): string | null {
  const type = segment.id;
  if (type === 'SBR' || type === 'CAS' || type === 'OI' || type === 'MOA') return type;
  if (type === 'AMT') return AMT_SPEC[el(segment, 1).toUpperCase()] ?? null;
  return null;
}

function refSpecKey(loopKey: string, segment: EdiSegment): string | null {
  const qualifier = el(segment, 1).toUpperCase();
  if (loopKey === 'loop_2330A') return qualifier === 'SY' ? 'REF' : null;
  if (loopKey === 'loop_2330B') return PAYER_REF_SPEC[qualifier] ?? null;
  if (REF_REQUIRED_LOOPS.includes(loopKey)) return 'REF';
  return null;
}

function childSpecKey(loopKey: string, segment: EdiSegment): string | null {
  const type = segment.id;
  if (type === 'NM1' || type === 'N3' || type === 'N4') return type;
  if (type === 'DTP') return el(segment, 1) === '573' ? 'DTP_573' : null;
  if (type === 'REF') return refSpecKey(loopKey, segment);
  return null;
}

function maxOccursFromSpec(spec: { max_occurs?: number; repeatable?: boolean }): number | null {
  return spec.max_occurs ?? (spec.repeatable ? null : 1);
}

function validateSbr01Uniqueness(
  blocks: { sbr: EdiSegment }[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const seen = new Set<string>();
  const issues: Edi837ValidationIssue[] = [];
  for (const block of blocks) {
    const code = el(block.sbr, 1).toUpperCase();
    if (code === '' || code === 'U') continue;
    if (seen.has(code)) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `2320 SBR01 '${code}' may occur at most once per claim (except U)`,
          GROUP,
          {
            segment: 'SBR',
            segment_index: block.sbr.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'SBR01',
          },
        ),
      );
    } else {
      seen.add(code);
    }
  }
  return issues;
}

function unknownHeaderQualifier(
  segment: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue {
  const qual = el(segment, 1).toUpperCase();
  const type = segment.id;
  const message =
    type === 'AMT'
      ? `AMT01 qualifier '${qual}' is not valid in loop 2320`
      : `Segment ${type} is not used in loop 2320`;
  return issue(RULE_ID, 'error', message, GROUP, {
    segment: type,
    segment_index: segment.index,
    functional_group_index: fg,
    transaction_set_index: tx,
    field: `${type}01`,
  });
}

function unknownChildQualifier(
  loopKey: string,
  segment: EdiSegment,
  fg: number,
  tx: number,
): Edi837ValidationIssue {
  const qual = el(segment, 1).toUpperCase();
  const type = segment.id;
  let message: string;
  if (type === 'REF') message = `REF01 qualifier '${qual}' is not valid in ${loopKey}`;
  else if (type === 'DTP') message = `DTP01 qualifier '${qual}' is not valid in ${loopKey}`;
  else message = `Segment ${type} is not used in ${loopKey}`;
  return issue(RULE_ID, 'error', message, GROUP, {
    segment: type,
    segment_index: segment.index,
    functional_group_index: fg,
    transaction_set_index: tx,
    field: `${type}01`,
  });
}

function validateHeader(
  ctx: Edi837RuleContext,
  header: EdiSegment[],
  block: { sbr: EdiSegment },
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const specCounts: Record<string, number> = {};
  let hasOi = false;

  for (const segment of header) {
    const type = segment.id;
    if (!HEADER_TYPES.includes(type)) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `Segment ${type} is not used in loop 2320 (before 2330 NM1)`,
          GROUP,
          {
            segment: type,
            segment_index: segment.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: type,
          },
        ),
      );
      continue;
    }
    if (type === 'OI') hasOi = true;
    const specKey = headerSpecKey(segment);
    if (!specKey) {
      issues.push(unknownHeaderQualifier(segment, fg, tx));
      continue;
    }
    specCounts[specKey] = (specCounts[specKey] ?? 0) + 1;
    issues.push(
      ...validateLoopSegmentElements(
        ctx,
        segment,
        LOOP_2320,
        specKey,
        RULE_ID,
        GROUP,
        fg,
        tx,
        ediCodeFromSpecKey(specKey),
      ),
    );
  }

  if (!hasOi) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'OI segment is required in each 2320 other subscriber loop',
        GROUP,
        {
          segment: 'SBR',
          segment_index: block.sbr.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'OI',
        },
      ),
    );
  }

  for (const [specKey, count] of Object.entries(specCounts)) {
    const spec = (ctx.spec.loopSegmentSpec(LOOP_2320, specKey) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    const maxOccurs = maxOccursFromSpec(spec);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `loop_2320 ${specKey} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: ediCodeFromSpecKey(specKey),
            segment_index: block.sbr.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: specKey,
          },
        ),
      );
    }
  }

  return issues;
}

function validateChildLoop(
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
        `NM101 '${entity}' is not valid in loop 2320/2330 (other subscriber/payer)`,
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
  const specCounts: Record<string, number> = { NM1: 1 };

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
    const specKey = childSpecKey(loopKey, segment);
    if (!specKey) {
      issues.push(unknownChildQualifier(loopKey, segment, fg, tx));
      continue;
    }
    present[type] = true;
    specCounts[specKey] = (specCounts[specKey] ?? 0) + 1;
    issues.push(
      ...validateLoopSegmentElements(
        ctx,
        segment,
        loopKey,
        specKey,
        RULE_ID,
        GROUP,
        fg,
        tx,
        ediCodeFromSpecKey(specKey),
      ),
    );
  }

  if (N4_REQUIRED_LOOPS.includes(loopKey) && !present.N4) {
    issues.push(
      issue(RULE_ID, 'error', `N4 is required in ${loopKey} when the loop is used`, GROUP, {
        segment: 'NM1',
        segment_index: nm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'N4',
      }),
    );
  }

  if (REF_REQUIRED_LOOPS.includes(loopKey) && !present.REF) {
    issues.push(
      issue(RULE_ID, 'error', `REF is required in ${loopKey} when the loop is used`, GROUP, {
        segment: 'NM1',
        segment_index: nm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'REF',
      }),
    );
  }

  for (const [specKey, count] of Object.entries(specCounts)) {
    const spec = (ctx.spec.loopSegmentSpec(loopKey, specKey) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    const maxOccurs = maxOccursFromSpec(spec);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `${loopKey} ${specKey} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: ediCodeFromSpecKey(specKey),
            segment_index: nm1.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: specKey,
          },
        ),
      );
    }
  }

  return issues;
}

function validateReferringSequence(
  referringCodes: string[],
  block: { sbr: EdiSegment },
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (referringCodes.length === 0) return [];
  if (referringCodes[0] !== 'DN') {
    return [
      issue(RULE_ID, 'error', 'Loop 2330C first (or only) iteration NM101 must be DN', GROUP, {
        segment: 'NM1',
        segment_index: block.sbr.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }
  if (referringCodes[1] && referringCodes[1] !== 'P3') {
    return [
      issue(RULE_ID, 'error', 'Loop 2330C second iteration NM101 must be P3', GROUP, {
        segment: 'NM1',
        segment_index: block.sbr.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }
  return [];
}

function validateCobBlock(
  ctx: Edi837RuleContext,
  block: { sbr: EdiSegment; segments: EdiSegment[] },
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const [header, childZone] = splitHeaderAndChildren(block.segments);
  let issues = validateHeader(ctx, header, block, fg, tx);

  const loopCounts: Record<string, number> = {};
  const referringCodes: string[] = [];

  for (const loop of splitChildLoops(childZone)) {
    const loopKey = loop.loopKey;
    loopCounts[loopKey] = (loopCounts[loopKey] ?? 0) + 1;
    if (loopKey === 'loop_2330C') {
      referringCodes.push(el(loop.nm1, 1).toUpperCase());
    }
    issues = issues.concat(
      validateChildLoop(ctx, loopKey, loop.nm1, loop.segments, fg, tx),
    );
  }

  for (const requiredLoop of REQUIRED_CHILD_LOOPS) {
    if ((loopCounts[requiredLoop] ?? 0) < 1) {
      const label =
        requiredLoop === 'loop_2330A'
          ? '2330A other subscriber NM1*IL'
          : '2330B other payer NM1*PR';
      issues.push(
        issue(RULE_ID, 'error', `${label} is required when 2320 COB loop is present`, GROUP, {
          segment: 'SBR',
          segment_index: block.sbr.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: requiredLoop,
        }),
      );
    }
  }

  for (const [loopKey, count] of Object.entries(loopCounts)) {
    if (loopKey === '') continue;
    const loopSpec = (ctx.spec.loopSpec(loopKey) ?? {}) as { max_occurs?: number; repeatable?: boolean };
    const maxOccurs = loopSpec.max_occurs ?? (loopSpec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(RULE_ID, 'error', `${loopKey} may occur at most ${maxOccurs} time(s), got ${count}`, GROUP, {
          segment: 'NM1',
          segment_index: block.sbr.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: loopKey,
        }),
      );
    }
  }

  return issues.concat(validateReferringSequence(referringCodes, block, fg, tx));
}

export function cob2320ElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const claim of extractClaimCobBlocks(doc)) {
        if (claim.blocks.length === 0) continue;

        const fg = claim.functionalGroupIndex;
        const tx = claim.transactionSetIndex;

        const loopSpec = (ctx.spec.loopSpec(LOOP_2320) ?? {}) as { max_occurs?: number };
        const maxOccurs = loopSpec.max_occurs ?? 10;
        const count = claim.blocks.length;
        if (typeof maxOccurs === 'number' && count > maxOccurs) {
          issues.push(
            issue(
              RULE_ID,
              'error',
              `loop_2320 may occur at most ${maxOccurs} time(s), got ${count}`,
              GROUP,
              {
                segment: 'SBR',
                segment_index: claim.blocks[0]!.sbr.index,
                functional_group_index: fg,
                transaction_set_index: tx,
                field: 'loop_2320',
              },
            ),
          );
        }

        issues.push(...validateSbr01Uniqueness(claim.blocks, fg, tx));

        for (const block of claim.blocks) {
          issues.push(...validateCobBlock(ctx, block, fg, tx));
        }
      }

      return issues;
    },
  };
}
