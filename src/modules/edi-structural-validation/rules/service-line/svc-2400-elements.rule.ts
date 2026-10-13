import { validateLoopSegmentElements } from '../../support/loop-element-validate';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import { extractServiceLines, ParsedServiceLine } from '../../support/parsed-claim.helpers';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'SVC-2400-ELEMENTS';
const GROUP = 'service_line';
const LOOP_2400 = 'loop_2400';

const CHILD_STARTS = ['LIN', 'NM1', 'SVD', 'LQ'];

const ENTITY_LOOP: Record<string, string> = {
  '82': 'loop_2420A',
  QB: 'loop_2420B',
  '77': 'loop_2420C',
  DQ: 'loop_2420D',
  DK: 'loop_2420E',
  DN: 'loop_2420F',
  P3: 'loop_2420F',
  PW: 'loop_2420G',
  '45': 'loop_2420H',
};

const LOOP_SEGMENTS: Record<string, string[]> = {
  loop_2410: ['LIN', 'CTP', 'REF'],
  loop_2420A: ['NM1', 'PRV', 'REF'],
  loop_2420B: ['NM1', 'REF'],
  loop_2420C: ['NM1', 'N3', 'N4', 'REF'],
  loop_2420D: ['NM1', 'REF'],
  loop_2420E: ['NM1', 'N3', 'N4', 'REF', 'PER'],
  loop_2420F: ['NM1', 'REF'],
  loop_2420G: ['NM1', 'N3', 'N4'],
  loop_2420H: ['NM1', 'N3', 'N4'],
  loop_2430: ['SVD', 'CAS', 'DTP', 'AMT'],
  loop_2440: ['LQ', 'FRM'],
};

const N4_REQUIRED = ['loop_2420C', 'loop_2420E', 'loop_2420G', 'loop_2420H'];
const N3_REQUIRED = ['loop_2420C', 'loop_2420G', 'loop_2420H'];

const DTP_SPEC: Record<string, string> = {
  '472': 'DTP_472',
  '471': 'DTP_471',
  '607': 'DTP_607',
  '463': 'DTP_463',
  '461': 'DTP_461',
  '304': 'DTP_304',
  '738': 'DTP_738',
  '739': 'DTP_739',
  '011': 'DTP_011',
  '455': 'DTP_455',
  '454': 'DTP_454',
};

const REF_SPEC: Record<string, string> = {
  '9B': 'REF_9B',
  '9D': 'REF_9D',
  G1: 'REF_G1',
  '6R': 'REF_6R',
  EW: 'REF_EW',
  X4: 'REF_X4',
  F4: 'REF_F4',
  BT: 'REF_BT',
  '9F': 'REF_9F',
};

const CRC_SPEC: Record<string, string> = {
  '07': 'CRC_07',
  '70': 'CRC_70',
  '09': 'CRC_09',
};

const AMT_SPEC: Record<string, string> = { T: 'AMT_T', F4: 'AMT_F4' };

const HEADER_TYPES = [
  'LX', 'SV1', 'SV5', 'PWK', 'CR1', 'CR3', 'CRC', 'DTP', 'QTY', 'MEA',
  'CN1', 'REF', 'AMT', 'K3', 'NTE', 'PS1', 'HCP',
];

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function ediCodeFromSpecKey(specKey: string): string {
  return specKey.split('_')[0] ?? specKey;
}

type ChildLoop = { loopKey: string; start: EdiSegment; segments: EdiSegment[] };

function splitHeaderAndChildren(segments: EdiSegment[]): [EdiSegment[], EdiSegment[]] {
  const header: EdiSegment[] = [];
  const children: EdiSegment[] = [];
  let inChildren = false;
  for (const segment of segments) {
    if (!inChildren && CHILD_STARTS.includes(segment.id)) inChildren = true;
    if (inChildren) children.push(segment);
    else header.push(segment);
  }
  return [header, children];
}

function childLoopKey(segment: EdiSegment): string | null {
  const type = segment.id;
  if (type === 'LIN') return 'loop_2410';
  if (type === 'SVD') return 'loop_2430';
  if (type === 'LQ') return 'loop_2440';
  if (type === 'NM1') return ENTITY_LOOP[el(segment, 1).toUpperCase()] ?? '';
  return null;
}

function splitChildLoops(zone: EdiSegment[]): ChildLoop[] {
  const loops: ChildLoop[] = [];
  let current: ChildLoop | null = null;
  for (const segment of zone) {
    const newKey = childLoopKey(segment);
    if (newKey !== null) {
      if (current) loops.push(current);
      current = { loopKey: newKey, start: segment, segments: [] };
      continue;
    }
    if (current) current.segments.push(segment);
  }
  if (current) loops.push(current);
  return loops;
}

function headerSpecKey(segment: EdiSegment): string | null {
  const type = segment.id;
  const qual = el(segment, 1).toUpperCase();
  if (['LX', 'SV1', 'SV5', 'CR1', 'CR3', 'MEA', 'CN1', 'K3', 'PS1', 'HCP'].includes(type)) {
    return type;
  }
  if (type === 'PWK') return qual === 'CT' ? 'PWK_CT' : 'PWK';
  if (type === 'CRC') return CRC_SPEC[qual] ?? null;
  if (type === 'DTP') return DTP_SPEC[qual] ?? null;
  if (type === 'QTY') {
    if (qual === 'PT') return 'QTY_PT';
    if (qual === 'FL') return 'QTY_FL';
    return null;
  }
  if (type === 'REF') return REF_SPEC[qual] ?? null;
  if (type === 'AMT') return AMT_SPEC[qual] ?? null;
  if (type === 'NTE') {
    if (qual === 'TPO') return 'NTE_TPO';
    if (qual === 'ADD' || qual === 'DCP') return 'NTE';
    return null;
  }
  return null;
}

function childStartSpecKey(loopKey: string): string {
  if (loopKey === 'loop_2410') return 'LIN';
  if (loopKey === 'loop_2430') return 'SVD';
  if (loopKey === 'loop_2440') return 'LQ';
  return 'NM1';
}

function childMemberSpecKey(segment: EdiSegment): string | null {
  const type = segment.id;
  const qual = el(segment, 1).toUpperCase();
  if (['CTP', 'PRV', 'N3', 'N4', 'PER', 'CAS', 'FRM', 'REF'].includes(type)) return type;
  if (type === 'DTP') return qual === '573' ? 'DTP_573' : null;
  if (type === 'AMT') return qual === 'EAF' ? 'AMT_EAF' : null;
  return null;
}

function validateProcedureComposite(
  segment: EdiSegment,
  field: string,
  position: number,
  componentSeparator: string,
  allowedQualifiers: string[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const raw = el(segment, position);
  if (raw === '') return [];
  const parts = raw.split(componentSeparator);
  const qualifier = (parts[0] ?? '').trim().toUpperCase();
  const code = (parts[1] ?? '').trim();
  const issues: Edi837ValidationIssue[] = [];
  if (qualifier !== '' && !allowedQualifiers.includes(qualifier)) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `${field}-1 must be one of [${allowedQualifiers.join(', ')}], got '${qualifier}'`,
        GROUP,
        {
          segment: segment.id,
          segment_index: segment.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: `${field}-1`,
        },
      ),
    );
  }
  if (code === '') {
    issues.push(
      issue(RULE_ID, 'error', `${field}-2 procedure code is required`, GROUP, {
        segment: segment.id,
        segment_index: segment.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: `${field}-2`,
      }),
    );
  }
  return issues;
}

function validateDiagnosisPointers(
  sv1: EdiSegment,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const raw = el(sv1, 7);
  if (raw === '') return [];
  const parts = raw.split(componentSeparator);
  const issues: Edi837ValidationIssue[] = [];
  const pointer = (parts[0] ?? '').trim();
  if (pointer === '') {
    issues.push(
      issue(RULE_ID, 'error', 'SV107-1 diagnosis pointer is required', GROUP, {
        segment: 'SV1',
        segment_index: sv1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'SV107-1',
      }),
    );
  }
  parts.forEach((value, index) => {
    const trimmed = value.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (n < 1 || n > 12) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `SV107-${index + 1} must be 1 through 12, got '${trimmed}'`,
          GROUP,
          {
            segment: 'SV1',
            segment_index: sv1.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: `SV107-${index + 1}`,
          },
        ),
      );
    }
  });
  return issues;
}

function validateCtpComposite(
  members: EdiSegment[],
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  for (const segment of members) {
    if (segment.id !== 'CTP') continue;
    const raw = el(segment, 5);
    if (raw === '') return [];
    const parts = raw.split(componentSeparator);
    const unit = (parts[0] ?? '').trim().toUpperCase();
    const allowed = ['F2', 'GR', 'ME', 'ML', 'UN'];
    if (unit !== '' && !allowed.includes(unit)) {
      return [
        issue(
          RULE_ID,
          'error',
          `CTP05-1 must be one of [${allowed.join(', ')}], got '${unit}'`,
          GROUP,
          {
            segment: 'CTP',
            segment_index: segment.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'CTP05-1',
          },
        ),
      ];
    }
  }
  return [];
}

function unknownHeaderQualifier(segment: EdiSegment, fg: number, tx: number): Edi837ValidationIssue {
  const qual = el(segment, 1).toUpperCase();
  const type = segment.id;
  const messages: Record<string, string> = {
    REF: `REF01 qualifier '${qual}' is not valid in loop 2400`,
    DTP: `DTP01 qualifier '${qual}' is not valid in loop 2400`,
    AMT: `AMT01 qualifier '${qual}' is not valid in loop 2400`,
    CRC: `CRC01 qualifier '${qual}' is not valid in loop 2400`,
    QTY: `QTY01 qualifier '${qual}' is not valid in loop 2400`,
    NTE: `NTE01 qualifier '${qual}' is not valid in loop 2400`,
  };
  const message = messages[type] ?? `Segment ${type} is not used in loop 2400`;
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
  if (type === 'DTP') message = `DTP01 qualifier '${qual}' is not valid in ${loopKey}`;
  else if (type === 'AMT') message = `AMT01 qualifier '${qual}' is not valid in ${loopKey}`;
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
  line: ParsedServiceLine,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const specCounts: Record<string, number> = {};
  let hasSv1 = false;
  let hasServiceDate = false;
  let crcCount = 0;

  for (const segment of header) {
    const type = segment.id;
    if (!HEADER_TYPES.includes(type)) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `Segment ${type} is not used in loop 2400 (before 2410/2420/2430/2440)`,
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
    if (type === 'SV1') hasSv1 = true;
    if (type === 'CRC') crcCount++;

    const specKey = headerSpecKey(segment);
    if (!specKey) {
      issues.push(unknownHeaderQualifier(segment, fg, tx));
      continue;
    }
    if (specKey === 'DTP_472') hasServiceDate = true;

    specCounts[specKey] = (specCounts[specKey] ?? 0) + 1;
    issues.push(
      ...validateLoopSegmentElements(
        ctx,
        segment,
        LOOP_2400,
        specKey,
        RULE_ID,
        GROUP,
        fg,
        tx,
        ediCodeFromSpecKey(specKey),
      ),
    );

    if (type === 'SV1') {
      issues.push(
        ...validateProcedureComposite(
          segment,
          'SV101',
          1,
          componentSeparator,
          ['ER', 'HC', 'IV', 'WK'],
          fg,
          tx,
        ),
        ...validateDiagnosisPointers(segment, componentSeparator, fg, tx),
      );
    }
    if (type === 'SV5') {
      issues.push(
        ...validateProcedureComposite(segment, 'SV501', 1, componentSeparator, ['HC'], fg, tx),
      );
    }
  }

  if (!hasSv1) {
    issues.push(
      issue(RULE_ID, 'error', 'SV1 is required in each 2400 service line', GROUP, {
        segment: 'LX',
        segment_index: line.lx.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'SV1',
      }),
    );
  }
  if (!hasServiceDate) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'DTP*472 service date is required in each 2400 service line',
        GROUP,
        {
          segment: 'LX',
          segment_index: line.lx.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'DTP472',
        },
      ),
    );
  }
  if (crcCount > 3) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `loop_2400 CRC may occur at most 3 time(s) combined, got ${crcCount}`,
        GROUP,
        {
          segment: 'CRC',
          segment_index: line.lx.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CRC',
        },
      ),
    );
  }

  for (const [specKey, count] of Object.entries(specCounts)) {
    const spec = (ctx.spec.loopSegmentSpec(LOOP_2400, specKey) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    const maxOccurs = spec.max_occurs ?? (spec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `loop_2400 ${specKey} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: ediCodeFromSpecKey(specKey),
            segment_index: line.lx.index,
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
  start: EdiSegment,
  members: EdiSegment[],
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (loopKey === '') {
    const entity = el(start, 1).toUpperCase();
    return [
      issue(
        RULE_ID,
        'error',
        `NM101 '${entity}' is not valid in loop 2400 (line-level 2420A-H)`,
        GROUP,
        {
          segment: 'NM1',
          segment_index: start.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM101',
        },
      ),
    ];
  }

  const startSpecKey = childStartSpecKey(loopKey);
  let issues = validateLoopSegmentElements(
    ctx,
    start,
    loopKey,
    startSpecKey,
    RULE_ID,
    GROUP,
    fg,
    tx,
    ediCodeFromSpecKey(startSpecKey),
  );

  if (loopKey === 'loop_2430') {
    issues = issues.concat(
      validateProcedureComposite(start, 'SVD03', 3, componentSeparator, ['ER', 'HC', 'IV', 'WK'], fg, tx),
    );
  }
  if (loopKey === 'loop_2410') {
    issues = issues.concat(validateCtpComposite(members, componentSeparator, fg, tx));
  }

  const allowed = LOOP_SEGMENTS[loopKey] ?? [];
  const present: Record<string, boolean> = { [start.id]: true };
  const specCounts: Record<string, number> = { [startSpecKey]: 1 };

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
    const specKey = childMemberSpecKey(segment);
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

  if (loopKey === 'loop_2410' && !present.CTP) {
    issues.push(
      issue(RULE_ID, 'error', 'CTP is required in loop_2410 when LIN is used', GROUP, {
        segment: 'LIN',
        segment_index: start.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CTP',
      }),
    );
  }
  if (loopKey === 'loop_2430' && !present.DTP) {
    issues.push(
      issue(RULE_ID, 'error', 'DTP*573 is required in loop_2430 when SVD is used', GROUP, {
        segment: 'SVD',
        segment_index: start.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'DTP573',
      }),
    );
  }
  if (loopKey === 'loop_2440' && !present.FRM) {
    issues.push(
      issue(RULE_ID, 'error', 'FRM is required in loop_2440 when LQ is used', GROUP, {
        segment: 'LQ',
        segment_index: start.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'FRM',
      }),
    );
  }
  if (N3_REQUIRED.includes(loopKey) && !present.N3) {
    issues.push(
      issue(RULE_ID, 'error', `N3 is required in ${loopKey} when the loop is used`, GROUP, {
        segment: 'NM1',
        segment_index: start.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'N3',
      }),
    );
  }
  if (N4_REQUIRED.includes(loopKey) && !present.N4) {
    issues.push(
      issue(RULE_ID, 'error', `N4 is required in ${loopKey} when the loop is used`, GROUP, {
        segment: 'NM1',
        segment_index: start.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'N4',
      }),
    );
  }

  for (const [specKey, count] of Object.entries(specCounts)) {
    const spec = (ctx.spec.loopSegmentSpec(loopKey, specKey) ?? {}) as {
      max_occurs?: number;
      repeatable?: boolean;
    };
    const maxOccurs = spec.max_occurs ?? (spec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(
          RULE_ID,
          'error',
          `${loopKey} ${specKey} may occur at most ${maxOccurs} time(s), got ${count}`,
          GROUP,
          {
            segment: ediCodeFromSpecKey(specKey),
            segment_index: start.index,
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
  line: ParsedServiceLine,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  if (referringCodes.length === 0) return [];
  if (referringCodes[0] !== 'DN') {
    return [
      issue(RULE_ID, 'error', 'Loop 2420F first (or only) iteration NM101 must be DN', GROUP, {
        segment: 'NM1',
        segment_index: line.lx.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }
  if (referringCodes[1] && referringCodes[1] !== 'P3') {
    return [
      issue(RULE_ID, 'error', 'Loop 2420F second iteration NM101 must be P3', GROUP, {
        segment: 'NM1',
        segment_index: line.lx.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    ];
  }
  return [];
}

function validateLine(
  ctx: Edi837RuleContext,
  line: ParsedServiceLine,
  componentSeparator: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const [header, childZone] = splitHeaderAndChildren(line.segments);
  let issues = validateHeader(ctx, header, line, componentSeparator, fg, tx);

  const loopCounts: Record<string, number> = {};
  const referringCodes: string[] = [];

  for (const loop of splitChildLoops(childZone)) {
    const loopKey = loop.loopKey;
    loopCounts[loopKey] = (loopCounts[loopKey] ?? 0) + 1;
    if (loopKey === 'loop_2420F') {
      referringCodes.push(el(loop.start, 1).toUpperCase());
    }
    issues = issues.concat(
      validateChildLoop(ctx, loopKey, loop.start, loop.segments, componentSeparator, fg, tx),
    );
  }

  for (const [loopKey, count] of Object.entries(loopCounts)) {
    if (loopKey === '') continue;
    const loopSpec = (ctx.spec.loopSpec(loopKey) ?? {}) as { max_occurs?: number; repeatable?: boolean };
    const maxOccurs = loopSpec.max_occurs ?? (loopSpec.repeatable ? null : 1);
    if (typeof maxOccurs === 'number' && count > maxOccurs) {
      issues.push(
        issue(RULE_ID, 'error', `${loopKey} may occur at most ${maxOccurs} time(s), got ${count}`, GROUP, {
          segment: 'LX',
          segment_index: line.lx.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: loopKey,
        }),
      );
    }
  }

  return issues.concat(validateReferringSequence(referringCodes, line, fg, tx));
}

export function svc2400ElementsRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      const componentSeparator = doc.componentSeparator;

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;

        for (const claim of extractClaims(body)) {
          const lines = extractServiceLines(claim.segments);
          const loopSpec = (ctx.spec.loopSpec(LOOP_2400) ?? {}) as { max_occurs?: number };
          const maxOccurs = loopSpec.max_occurs ?? 50;
          if (typeof maxOccurs === 'number' && lines.length > maxOccurs) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                `loop_2400 may occur at most ${maxOccurs} time(s), got ${lines.length}`,
                GROUP,
                {
                  segment: 'LX',
                  segment_index: lines[0]!.lx.index,
                  functional_group_index: fg,
                  transaction_set_index: ti,
                  field: 'loop_2400',
                },
              ),
            );
          }

          for (const line of lines) {
            issues.push(...validateLine(ctx, line, componentSeparator, fg, ti));
          }
        }
      }

      return issues;
    },
  };
}
