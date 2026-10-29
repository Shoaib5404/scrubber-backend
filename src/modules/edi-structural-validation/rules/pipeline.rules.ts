import { Edi837Spec } from '../edi837-spec';
import {
  eachTransaction,
  findNm1ByEntity,
  firstSegmentOfType,
  headerSegmentsInTransaction,
  parseHlSegments,
  segmentsAfterHlUntil,
  transactionBodySegments,
} from '../support/loop-segment-scope';
import { createChunk2Rules } from './chunk2.rules';
import { createChunk3Rules } from './chunk3.rules';
import { createChunk4Rules } from './chunk4.rules';
import { FieldFormatValidator } from '../support/field-format.validator';
import { SegmentElementValidator } from '../support/segment-element.validator';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../types';

function el(seg: EdiSegment | null | undefined, n: number): string {
  return (seg?.elements[n] ?? '').trim();
}

class SimpleRule implements Edi837ValidationRule {
  constructor(
    private readonly _id: string,
    private readonly _group: string,
    private readonly fn: (doc: EdiDocument, ctx: Edi837RuleContext) => Edi837ValidationIssue[],
  ) {}
  id() {
    return this._id;
  }
  group() {
    return this._group;
  }
  validate(doc: EdiDocument, ctx: Edi837RuleContext) {
    return this.fn(doc, ctx);
  }
}

function validateEnvelopeElements(doc: EdiDocument, ctx: Edi837RuleContext): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const validate = (seg: EdiSegment | null, code: string, fg?: number, tx?: number) => {
    if (!seg) return;
    const spec = ctx.spec.segmentSpec(code);
    if (!spec) return;
    issues.push(
      ...ctx.elements.validateSegment(seg, code, spec, 'ENV-ELEMENTS', 'envelope', fg ?? null, tx ?? null),
    );
  };

  validate(doc.isa, 'ISA');
  validate(doc.iea, 'IEA');
  doc.functionalGroups.forEach((g, gi) => {
    validate(g.gs, 'GS', gi);
    validate(g.ge, 'GE', gi);
    g.transactions.forEach((tx, ti) => {
      validate(tx.st, 'ST', gi, ti);
      validate(tx.se, 'SE', gi, ti);
      const bht = tx.segments.find((s) => s.id === 'BHT');
      if (bht) validate(bht, 'BHT', gi, ti);
    });
  });
  return issues;
}

function loopElementRule(
  id: string,
  group: string,
  loopKey: string,
  segmentCodes: string[],
  findSegments: (doc: EdiDocument) => EdiSegment[],
): Edi837ValidationRule {
  return new SimpleRule(id, group, (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const seg of findSegments(doc)) {
      if (!segmentCodes.includes(seg.id)) continue;
      const spec = ctx.spec.loopSegmentSpec(loopKey, seg.id);
      if (!spec) continue;
      issues.push(...ctx.elements.validateSegment(seg, seg.id, spec, id, group));
    }
    return issues;
  });
}

function submitterDisplayName(submitter: EdiSegment): string {
  const entityType = el(submitter, 2);
  const lastOrOrg = el(submitter, 3);
  const first = el(submitter, 4);
  const middle = el(submitter, 5);
  if (entityType === '2') return lastOrOrg;
  return [first, middle, lastOrOrg].filter((p) => p !== '').join(' ');
}

/** HDR-1000: Laravel Loop1000ElementSpecRule (incl. PER required/max/PER02). */
function header1000ElementRule(): Edi837ValidationRule {
  return new SimpleRule('HDR-1000-ELEMENTS', 'header', (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];

    for (const tx of eachTransaction(doc)) {
      const header = headerSegmentsInTransaction(tx.segments);
      let submitterNm1 = findNm1ByEntity(header, '41');
      let receiverNm1 = findNm1ByEntity(header, '40');
      if (!submitterNm1) {
        for (const seg of header) {
          if (seg.id !== 'NM1') continue;
          if (receiverNm1 && seg.index >= receiverNm1.index) break;
          submitterNm1 = seg;
          break;
        }
      }
      if (!receiverNm1) {
        for (const seg of header) {
          if (seg.id !== 'NM1') continue;
          if (submitterNm1 && seg.index <= submitterNm1.index) continue;
          receiverNm1 = seg;
          break;
        }
      }

      if (submitterNm1) {
        const nm1Spec = ctx.spec.loopSegmentSpec('loop_1000A', 'NM1');
        if (nm1Spec) {
          issues.push(
            ...ctx.elements.validateSegment(
              submitterNm1,
              'NM1',
              nm1Spec,
              'HDR-1000-ELEMENTS',
              'header',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }

        const perSegments: EdiSegment[] = [];
        for (const seg of header) {
          if (seg.index <= submitterNm1.index) continue;
          if (receiverNm1 && seg.index >= receiverNm1.index) break;
          if (seg.id === 'PER') perSegments.push(seg);
        }

        const perSpec = ctx.spec.loopSegmentSpec('loop_1000A', 'PER') ?? {};
        if ((perSpec as { required?: boolean }).required === true && perSegments.length === 0) {
          issues.push(
            issue(
              'HDR-1000-ELEMENTS',
              'error',
              'Submitter EDI contact (PER in loop 1000A) is required',
              'header',
              {
                segment: 'NM1',
                segment_index: submitterNm1.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'PER',
              },
            ),
          );
        }
        const maxOccurs = (perSpec as { max_occurs?: number }).max_occurs;
        if (typeof maxOccurs === 'number' && perSegments.length > maxOccurs) {
          const last = perSegments[perSegments.length - 1]!;
          issues.push(
            issue(
              'HDR-1000-ELEMENTS',
              'error',
              `Submitter PER may occur at most ${maxOccurs} time(s) in loop 1000A, got ${perSegments.length}`,
              'header',
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
          const spec = ctx.spec.loopSegmentSpec('loop_1000A', 'PER');
          if (spec) {
            issues.push(
              ...ctx.elements.validateSegment(
                per,
                'PER',
                spec,
                'HDR-1000-ELEMENTS',
                'header',
                tx.functionalGroupIndex,
                tx.transactionSetIndex,
              ),
            );
          }
          const per02 = el(per, 2);
          if (per02 === '') return;
          if (index > 0) {
            issues.push(
              issue(
                'HDR-1000-ELEMENTS',
                'error',
                'Submitter contact name (PER02) must not be sent on PER iterations after the first',
                'header',
                {
                  segment: 'PER',
                  segment_index: per.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'PER02',
                },
              ),
            );
            return;
          }
          const submitterName = submitterDisplayName(submitterNm1!);
          if (submitterName !== '' && per02.toLowerCase() === submitterName.toLowerCase()) {
            issues.push(
              issue(
                'HDR-1000-ELEMENTS',
                'error',
                'Submitter contact name (PER02) must not be sent when it matches Submitter NM1; omit PER02 per X222',
                'header',
                {
                  segment: 'PER',
                  segment_index: per.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'PER02',
                },
              ),
            );
          }
        });
      }

      if (receiverNm1) {
        const spec = ctx.spec.loopSegmentSpec('loop_1000B', 'NM1');
        if (spec) {
          issues.push(
            ...ctx.elements.validateSegment(
              receiverNm1,
              'NM1',
              spec,
              'HDR-1000-ELEMENTS',
              'header',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
      }
    }

    return issues;
  });
}

/** Laravel HeaderRule — BHT + NM1*41/*40 presence. */
function headerStructRule(): Edi837ValidationRule {
  return new SimpleRule('HDR-STRUCT', 'header', (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const tx of eachTransaction(doc)) {
      const bht = firstSegmentOfType(tx.segments, 'BHT');
      if (!bht) {
        issues.push(
          issue(
            'HDR-STRUCT',
            'error',
            'Beginning of hierarchical transaction (BHT) is required',
            'header',
            {
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'BHT',
            },
          ),
        );
      } else {
        const bht02 = el(bht, 2);
        const allowedBht02 = ctx.spec.validValues('BHT', 'bht02');
        const bht02Allowed = allowedBht02.length ? allowedBht02 : ['00', '18'];
        if (bht02 !== '00' && bht02Allowed.includes(bht02)) {
          issues.push(
            issue(
              'HDR-STRUCT',
              'warning',
              `BHT02 should be 00 (original), got '${bht02}'`,
              'header',
              {
                segment: 'BHT',
                segment_index: bht.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'BHT02',
              },
            ),
          );
        }
        if (el(bht, 3) === '') {
          issues.push(
            issue('HDR-STRUCT', 'error', 'BHT03 reference identification is required', 'header', {
              segment: 'BHT',
              segment_index: bht.index,
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'BHT03',
            }),
          );
        }
        const bht06 = el(bht, 6);
        const allowedBht06 = ctx.spec.validValues('BHT', 'bht06');
        const bht06Allowed = allowedBht06.length ? allowedBht06 : ['31', 'CH', 'RP'];
        if (bht06 !== '' && bht06 !== 'CH' && bht06 !== '31' && bht06Allowed.includes(bht06)) {
          issues.push(
            issue(
              'HDR-STRUCT',
              'warning',
              `BHT06 should be CH (chargeable), got '${bht06}'`,
              'header',
              {
                segment: 'BHT',
                segment_index: bht.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'BHT06',
              },
            ),
          );
        }
      }

      const header = headerSegmentsInTransaction(tx.segments);
      const nm1Segments = header.filter((s) => s.id === 'NM1');
      const hasReceiver40 = findNm1ByEntity(header, '40') !== null;
      if (nm1Segments.length === 0) {
        issues.push(
          issue(
            'HDR-STRUCT',
            'error',
            'Submitter NM1*41 segment (loop 1000A) is required',
            'header',
            {
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'NM101',
            },
          ),
          issue(
            'HDR-STRUCT',
            'error',
            'Receiver NM1*40 segment (loop 1000B) is required',
            'header',
            {
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'NM101',
            },
          ),
        );
      } else if (!hasReceiver40 && nm1Segments.length < 2) {
        issues.push(
          issue(
            'HDR-STRUCT',
            'error',
            'Receiver NM1*40 segment (loop 1000B) is required',
            'header',
            {
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'NM101',
            },
          ),
        );
      }
    }
    return issues;
  });
}

/** Laravel HlHierarchyRule. */
function hlHierRule(): Edi837ValidationRule {
  return new SimpleRule('HL-HIER', 'hierarchy', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const tx of eachTransaction(doc)) {
      const hls = parseHlSegments(tx.segments);
      if (hls.length === 0) {
        issues.push(
          issue(
            'HL-HIER',
            'error',
            'Transaction set must contain at least one HL segment',
            'hierarchy',
            {
              segment: 'HL',
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
            },
          ),
        );
        continue;
      }

      const ids: Record<string, boolean> = {};
      let expectedSequentialId = 1;

      hls.forEach((hl, position) => {
        const hlId = hl.id;
        if (hlId === '') {
          issues.push(
            issue('HL-HIER', 'error', 'HL01 hierarchical ID is required', 'hierarchy', {
              segment: 'HL',
              segment_index: hl.segment.index,
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: 'HL01',
            }),
          );
          return;
        }
        if (!/^\d+$/.test(hlId)) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              `HL01 must contain numeric characters only, got '${hlId}'`,
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL01',
              },
            ),
          );
        } else if (hlId.length > 12) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              `HL01 length must be less than or equal to 12, got ${hlId.length}`,
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL01',
              },
            ),
          );
        }
        if (ids[hlId]) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              `HL01 value '${hlId}' is duplicated within the transaction set`,
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL01',
              },
            ),
          );
        }
        ids[hlId] = true;

        if (/^\d+$/.test(hlId) && Number(hlId) !== expectedSequentialId) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              `HL01 must be sequential starting at 1; expected ${expectedSequentialId}, got '${hlId}'`,
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL01',
              },
            ),
          );
        }
        if (/^\d+$/.test(hlId)) expectedSequentialId++;

        // 837P allows multiple billing-provider HL roots (HL03=20) in one ST;
        // each has empty HL02. Subscriber/patient HL must still point at a parent.
        const isBillingProviderRoot = hl.levelCode === '20';
        if (position === 0) {
          if (hl.parentId !== null) {
            issues.push(
              issue(
                'HL-HIER',
                'error',
                'First HL segment must not have HL02 (parent ID)',
                'hierarchy',
                {
                  segment: 'HL',
                  segment_index: hl.segment.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'HL02',
                },
              ),
            );
          }
        } else if (isBillingProviderRoot) {
          if (hl.parentId !== null) {
            issues.push(
              issue(
                'HL-HIER',
                'error',
                'Billing provider HL (HL03=20) must not have HL02 (parent ID)',
                'hierarchy',
                {
                  segment: 'HL',
                  segment_index: hl.segment.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'HL02',
                },
              ),
            );
          }
        } else if (hl.parentId === null || !ids[hl.parentId]) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              'HL02 must reference a valid parent HL01 within the transaction set',
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL02',
              },
            ),
          );
        }

        if (hl.levelCode === '20' && hl.childCode !== '1') {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              'Billing provider HL (HL03=20) must have HL04=1 (subordinate HL exists)',
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL04',
              },
            ),
          );
        }
        if (hl.levelCode === '22' && hl.childCode === '1') {
          const hasPatient = hls.some((o) => o.levelCode === '23' && o.parentId === hl.id);
          if (!hasPatient) {
            issues.push(
              issue(
                'HL-HIER',
                'error',
                'Subscriber HL with HL04=1 requires a patient HL (HL03=23) child loop',
                'hierarchy',
                {
                  segment: 'HL',
                  segment_index: hl.segment.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'HL04',
                },
              ),
            );
          }
        }
        if (
          hl.levelCode === '23' &&
          hl.childCode !== '0' &&
          hl.childCode !== ''
        ) {
          issues.push(
            issue(
              'HL-HIER',
              'error',
              'Patient HL (HL03=23) must have HL04=0 (no subordinate HL)',
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'HL04',
              },
            ),
          );
        }
      });
    }
    return issues;
  });
}

function hl2000AElementsRule(): Edi837ValidationRule {
  return new SimpleRule('HL-2000A-ELEMENTS', 'hierarchy', (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const tx of eachTransaction(doc)) {
      for (const hl of parseHlSegments(tx.segments)) {
        if (hl.levelCode !== '20') continue;
        const hlSpec = ctx.spec.loopSegmentSpec('loop_2000A', 'HL');
        if (hlSpec) {
          issues.push(
            ...ctx.elements.validateSegment(
              hl.segment,
              'HL',
              hlSpec,
              'HL-2000A-ELEMENTS',
              'hierarchy',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
        for (const seg of segmentsAfterHlUntil(tx.segments, hl.segment, ['HL', 'NM1'])) {
          if (seg.id !== 'PRV' && seg.id !== 'CUR') continue;
          const spec = ctx.spec.loopSegmentSpec('loop_2000A', seg.id);
          if (!spec) continue;
          issues.push(
            ...ctx.elements.validateSegment(
              seg,
              seg.id,
              spec,
              'HL-2000A-ELEMENTS',
              'hierarchy',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
      }
    }
    return issues;
  });
}

function hl2000BElementsRule(): Edi837ValidationRule {
  return new SimpleRule('HL-2000B-ELEMENTS', 'hierarchy', (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const tx of eachTransaction(doc)) {
      for (const hl of parseHlSegments(tx.segments)) {
        if (hl.levelCode !== '22') continue;
        const hlSpec = ctx.spec.loopSegmentSpec('loop_2000B', 'HL');
        if (hlSpec) {
          issues.push(
            ...ctx.elements.validateSegment(
              hl.segment,
              'HL',
              hlSpec,
              'HL-2000B-ELEMENTS',
              'hierarchy',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
        const loopSegs = segmentsAfterHlUntil(tx.segments, hl.segment, ['HL', 'CLM', 'NM1']);
        const sbr = firstSegmentOfType(loopSegs, 'SBR');
        const pat = firstSegmentOfType(loopSegs, 'PAT');
        if (!sbr) {
          issues.push(
            issue(
              'HL-2000B-ELEMENTS',
              'error',
              'Subscriber Information (SBR) is required in loop 2000B',
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'SBR',
              },
            ),
          );
        } else {
          const sbrSpec = ctx.spec.loopSegmentSpec('loop_2000B', 'SBR');
          if (sbrSpec) {
            issues.push(
              ...ctx.elements.validateSegment(
                sbr,
                'SBR',
                sbrSpec,
                'HL-2000B-ELEMENTS',
                'hierarchy',
                tx.functionalGroupIndex,
                tx.transactionSetIndex,
              ),
            );
          }
          const sbr02 = el(sbr, 2);
          if (hl.childCode === '1' && sbr02 !== '') {
            issues.push(
              issue(
                'HL-2000B-ELEMENTS',
                'error',
                'SBR02 must not be sent when HL04=1 (patient is a dependent; relationship is in 2000C PAT01)',
                'hierarchy',
                {
                  segment: 'SBR',
                  segment_index: sbr.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'SBR02',
                },
              ),
            );
          }
          if (hl.childCode === '0' && sbr02 !== '' && sbr02 !== '18') {
            issues.push(
              issue(
                'HL-2000B-ELEMENTS',
                'error',
                `SBR02 must be 18 (Self) when patient is the subscriber, got '${sbr02}'`,
                'hierarchy',
                {
                  segment: 'SBR',
                  segment_index: sbr.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'SBR02',
                },
              ),
            );
          }
        }
        if (pat) {
          if (hl.childCode === '1') {
            issues.push(
              issue(
                'HL-2000B-ELEMENTS',
                'error',
                'PAT in loop 2000B must not be sent when HL04=1 (use patient loop 2000C)',
                'hierarchy',
                {
                  segment: 'PAT',
                  segment_index: pat.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'PAT',
                },
              ),
            );
          } else {
            const patSpec = ctx.spec.loopSegmentSpec('loop_2000B', 'PAT');
            if (patSpec) {
              issues.push(
                ...ctx.elements.validateSegment(
                  pat,
                  'PAT',
                  patSpec,
                  'HL-2000B-ELEMENTS',
                  'hierarchy',
                  tx.functionalGroupIndex,
                  tx.transactionSetIndex,
                ),
              );
            }
          }
        }
      }
    }
    return issues;
  });
}

function hl2000CElementsRule(): Edi837ValidationRule {
  return new SimpleRule('HL-2000C-ELEMENTS', 'hierarchy', (doc, ctx) => {
    const issues: Edi837ValidationIssue[] = [];
    for (const tx of eachTransaction(doc)) {
      for (const hl of parseHlSegments(tx.segments)) {
        if (hl.levelCode !== '23') continue;
        const hlSpec = ctx.spec.loopSegmentSpec('loop_2000C', 'HL');
        if (hlSpec) {
          issues.push(
            ...ctx.elements.validateSegment(
              hl.segment,
              'HL',
              hlSpec,
              'HL-2000C-ELEMENTS',
              'hierarchy',
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
        const loopSegs = segmentsAfterHlUntil(tx.segments, hl.segment, ['HL', 'CLM', 'NM1']);
        const pat = firstSegmentOfType(loopSegs, 'PAT');
        if (!pat) {
          issues.push(
            issue(
              'HL-2000C-ELEMENTS',
              'error',
              'Patient Information (PAT) is required in loop 2000C',
              'hierarchy',
              {
                segment: 'HL',
                segment_index: hl.segment.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: 'PAT',
              },
            ),
          );
        } else {
          const patSpec = ctx.spec.loopSegmentSpec('loop_2000C', 'PAT');
          if (patSpec) {
            issues.push(
              ...ctx.elements.validateSegment(
                pat,
                'PAT',
                patSpec,
                'HL-2000C-ELEMENTS',
                'hierarchy',
                tx.functionalGroupIndex,
                tx.transactionSetIndex,
              ),
            );
          }
        }
      }
    }
    return issues;
  });
}

function envIsaRule(): Edi837ValidationRule {
  return new SimpleRule('ENV-ISA', 'envelope', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    const isa = doc.isa;
    if (!isa) {
      return [issue('ENV-ISA', 'error', 'ISA segment missing', 'envelope', { segment: 'ISA' })];
    }

    const isa13 = el(isa, 13);
    if (isa13 === '' || !/^\d+$/.test(isa13)) {
      issues.push(
        issue('ENV-ISA', 'error', 'ISA13 must be a numeric interchange control number', 'envelope', {
          segment: 'ISA',
          segment_index: isa.index,
          field: 'ISA13',
        }),
      );
    }

    const isa09 = el(isa, 9);
    if (isa09 !== '' && FieldFormatValidator.isValidYyMmDd(isa09)) {
      const interchangeDate = FieldFormatValidator.parseYyMmDd(isa09);
      if (interchangeDate && interchangeDate.getTime() > FieldFormatValidator.todayStart().getTime()) {
        issues.push(
          issue('ENV-ISA', 'error', 'ISA09 interchange date cannot be in the future', 'envelope', {
            segment: 'ISA',
            segment_index: isa.index,
            field: 'ISA09',
          }),
        );
      }
    }

    const isa06 = el(isa, 6);
    const isa08 = el(isa, 8);
    if (isa06 !== '' && isa06 === isa08) {
      issues.push(
        issue(
          'ENV-ISA',
          'warning',
          'ISA06 and ISA08 should not be identical (sender and receiver IDs)',
          'envelope',
          {
            segment: 'ISA',
            segment_index: isa.index,
            field: 'ISA06/ISA08',
          },
        ),
      );
    }

    return issues;
  });
}

function g001Rule(): Edi837ValidationRule {
  return new SimpleRule('G001', 'envelope', (doc) => {
    if (!doc.isa || !doc.iea) return [];
    const isaControl = el(doc.isa, 13);
    const ieaControl = el(doc.iea, 2);
    if (isaControl === '' || ieaControl === '') {
      return [
        issue(
          'G001',
          'error',
          'ISA13 and IEA02 are required for interchange control number matching',
          'envelope',
          { segment: 'ISA/IEA', segment_index: doc.isa.index, field: 'ISA13/IEA02' },
        ),
      ];
    }
    if (isaControl !== ieaControl) {
      return [
        issue(
          'G001',
          'error',
          `ISA13 (${isaControl}) must equal IEA02 (${ieaControl})`,
          'envelope',
          { segment: 'IEA', segment_index: doc.iea.index, field: 'IEA02' },
        ),
      ];
    }
    return [];
  });
}

function g006Rule(): Edi837ValidationRule {
  return new SimpleRule('G006', 'envelope', (doc) => {
    if (!doc.iea) return [];
    const raw = el(doc.iea, 1);
    if (raw === '') {
      return [
        issue('G006', 'error', 'IEA01 must contain the number of functional groups', 'envelope', {
          segment: 'IEA',
          segment_index: doc.iea.index,
          field: 'IEA01',
        }),
      ];
    }
    const declared = Number(raw);
    const actual = doc.functionalGroups.length;
    if (!Number.isFinite(declared) || declared !== actual) {
      return [
        issue(
          'G006',
          'error',
          `IEA01 declares ${raw} functional group(s) but ${actual} GS-GE pair(s) were found`,
          'envelope',
          { segment: 'IEA', segment_index: doc.iea.index, field: 'IEA01' },
        ),
      ];
    }
    return [];
  });
}

function g002Rule(): Edi837ValidationRule {
  return new SimpleRule('G002', 'envelope', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    doc.functionalGroups.forEach((g, gi) => {
      if (!g.gs || !g.ge) return;
      const gsControl = el(g.gs, 6);
      const geControl = el(g.ge, 2);
      if (gsControl === '' || geControl === '') {
        issues.push(
          issue(
            'G002',
            'error',
            'GS06 and GE02 are required for functional group control number matching',
            'envelope',
            {
              segment: 'GS/GE',
              segment_index: g.gs.index,
              functional_group_index: gi,
              field: 'GS06/GE02',
            },
          ),
        );
        return;
      }
      if (gsControl !== geControl) {
        issues.push(
          issue('G002', 'error', `GS06 (${gsControl}) must equal GE02 (${geControl})`, 'envelope', {
            segment: 'GE',
            segment_index: g.ge.index,
            functional_group_index: gi,
            field: 'GE02',
          }),
        );
      }
    });
    return issues;
  });
}

function g005Rule(): Edi837ValidationRule {
  return new SimpleRule('G005', 'envelope', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    doc.functionalGroups.forEach((g, gi) => {
      if (!g.ge) return;
      const raw = el(g.ge, 1);
      if (raw === '') {
        issues.push(
          issue('G005', 'error', 'GE01 must contain the number of transaction sets', 'envelope', {
            segment: 'GE',
            segment_index: g.ge.index,
            functional_group_index: gi,
            field: 'GE01',
          }),
        );
        return;
      }
      const declared = Number(raw);
      const actual = g.transactions.length;
      if (!Number.isFinite(declared) || declared !== actual) {
        issues.push(
          issue(
            'G005',
            'error',
            `GE01 declares ${raw} transaction set(s) but ${actual} ST-SE pair(s) were found in functional group ${gi}`,
            'envelope',
            {
              segment: 'GE',
              segment_index: g.ge.index,
              functional_group_index: gi,
              field: 'GE01',
            },
          ),
        );
      }
    });
    return issues;
  });
}

function g003Rule(): Edi837ValidationRule {
  return new SimpleRule('G003', 'envelope', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    doc.functionalGroups.forEach((g, gi) => {
      g.transactions.forEach((tx, ti) => {
        if (!tx.st || !tx.se) return;
        const stControl = el(tx.st, 2);
        const seControl = el(tx.se, 2);
        if (stControl === '' || seControl === '') {
          issues.push(
            issue(
              'G003',
              'error',
              'ST02 and SE02 are required for transaction set control number matching',
              'envelope',
              {
                segment: 'ST/SE',
                segment_index: tx.st.index,
                functional_group_index: gi,
                transaction_set_index: ti,
                field: 'ST02/SE02',
              },
            ),
          );
          return;
        }
        if (stControl !== seControl) {
          issues.push(
            issue('G003', 'error', `ST02 (${stControl}) must equal SE02 (${seControl})`, 'envelope', {
              segment: 'SE',
              segment_index: tx.se.index,
              functional_group_index: gi,
              transaction_set_index: ti,
              field: 'SE02',
            }),
          );
        }
      });
    });
    return issues;
  });
}

function g004Rule(): Edi837ValidationRule {
  return new SimpleRule('G004', 'envelope', (doc) => {
    const issues: Edi837ValidationIssue[] = [];
    doc.functionalGroups.forEach((g, gi) => {
      g.transactions.forEach((tx, ti) => {
        if (!tx.se) return;
        const raw = el(tx.se, 1);
        if (raw === '') {
          issues.push(
            issue(
              'G004',
              'error',
              'SE01 must contain the number of segments in the transaction set',
              'envelope',
              {
                segment: 'SE',
                segment_index: tx.se.index,
                functional_group_index: gi,
                transaction_set_index: ti,
                field: 'SE01',
              },
            ),
          );
          return;
        }
        const declared = Number(raw);
        const actual = tx.segments.length;
        if (!Number.isFinite(declared) || declared !== actual) {
          const control = el(tx.st, 2) || String(ti);
          issues.push(
            issue(
              'G004',
              'error',
              `SE01 declares ${raw} segment(s) but ${actual} segment(s) exist between ST and SE (transaction ${control})`,
              'envelope',
              {
                segment: 'SE',
                segment_index: tx.se.index,
                functional_group_index: gi,
                transaction_set_index: ti,
                field: 'SE01',
              },
            ),
          );
        }
      });
    });
    return issues;
  });
}

/** Laravel Edi837ServiceProvider registration order — 39 rules. */
export function createStructuralRules(): Edi837ValidationRule[] {
  const [clm2300Elements, prov2310Elements, clmStruct, refStruct, nteStruct] = createChunk3Rules();
  const chunk4 = createChunk4Rules();

  return [
    envIsaRule(),
    new SimpleRule('ENV-ELEMENTS', 'envelope', validateEnvelopeElements),
    g001Rule(),
    g006Rule(),
    g002Rule(),
    g005Rule(),
    g003Rule(),
    g004Rule(),
    header1000ElementRule(),
    headerStructRule(),
    hlHierRule(),
    hl2000AElementsRule(),
    hl2000BElementsRule(),
    hl2000CElementsRule(),
    ...createChunk2Rules(),
    clm2300Elements,
    prov2310Elements,
    ...chunk4.slice(0, 2),
    clmStruct,
    refStruct,
    nteStruct,
    ...chunk4.slice(2),
  ];
}

export function createRuleContext(specPath: string): Edi837RuleContext {
  return {
    spec: Edi837Spec.fromPath(specPath),
    elements: new SegmentElementValidator(),
  };
}
