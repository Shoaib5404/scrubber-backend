import { Edi837Spec } from '../edi837-spec';
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

/** Laravel Edi837ServiceProvider registration order — 39 rules. */
export function createStructuralRules(): Edi837ValidationRule[] {
  return [
    new SimpleRule('ENV-ISA', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      const isa = doc.isa;
      if (!isa) return [issue('ENV-ISA', 'error', 'ISA segment missing', 'envelope', { segment: 'ISA' })];
      const isa13 = el(isa, 13);
      if (!isa13 || !/^\d+$/.test(isa13)) {
        issues.push(
          issue('ENV-ISA', 'error', 'ISA13 must be a numeric interchange control number', 'envelope', {
            segment: 'ISA',
            segment_index: isa.index,
            field: 'ISA13',
          }),
        );
      }
      return issues;
    }),
    new SimpleRule('ENV-ELEMENTS', 'envelope', validateEnvelopeElements),
    new SimpleRule('G001', 'envelope', (doc) => {
      if (!doc.isa || !doc.iea) return [];
      if (el(doc.isa, 13) !== el(doc.iea, 2)) {
        return [
          issue('G001', 'error', 'ISA13/IEA02 interchange control numbers must match', 'envelope', {
            segment: 'IEA',
            field: 'IEA02',
          }),
        ];
      }
      return [];
    }),
    new SimpleRule('G006', 'envelope', (doc) => {
      if (!doc.iea) return [];
      const expected = Number(el(doc.iea, 1));
      if (Number.isFinite(expected) && expected !== doc.functionalGroups.length) {
        return [
          issue(
            'G006',
            'error',
            `IEA01 functional group count mismatch (expected ${expected}, found ${doc.functionalGroups.length})`,
            'envelope',
            { segment: 'IEA', field: 'IEA01' },
          ),
        ];
      }
      return [];
    }),
    new SimpleRule('G002', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        if (g.gs && g.ge && el(g.gs, 6) !== el(g.ge, 2)) {
          issues.push(
            issue('G002', 'error', 'GS06/GE02 control numbers must match', 'envelope', {
              segment: 'GE',
              field: 'GE02',
            }),
          );
        }
      }
      return issues;
    }),
    new SimpleRule('G005', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        if (!g.ge) continue;
        const expected = Number(el(g.ge, 1));
        if (Number.isFinite(expected) && expected !== g.transactions.length) {
          issues.push(
            issue(
              'G005',
              'error',
              `GE01 transaction count mismatch (expected ${expected}, found ${g.transactions.length})`,
              'envelope',
              { segment: 'GE', field: 'GE01' },
            ),
          );
        }
      }
      return issues;
    }),
    new SimpleRule('G003', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        for (const tx of g.transactions) {
          if (tx.st && tx.se && el(tx.st, 2) !== el(tx.se, 2)) {
            issues.push(
              issue('G003', 'error', 'ST02/SE02 control numbers must match', 'envelope', {
                segment: 'SE',
                field: 'SE02',
              }),
            );
          }
        }
      }
      return issues;
    }),
    new SimpleRule('G004', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        for (const tx of g.transactions) {
          if (!tx.se) continue;
          const expected = Number(el(tx.se, 1));
          if (Number.isFinite(expected) && expected !== tx.segments.length) {
            issues.push(
              issue(
                'G004',
                'error',
                `SE01 segment count mismatch (expected ${expected}, found ${tx.segments.length})`,
                'envelope',
                { segment: 'SE', field: 'SE01' },
              ),
            );
          }
        }
      }
      return issues;
    }),
    loopElementRule('HDR-1000-ELEMENTS', 'header', 'loop_1000A', ['NM1', 'PER', 'N3', 'N4'], (d) => d.segments),
    new SimpleRule('HDR-STRUCT', 'header', (doc) =>
      doc.segments.some((s) => s.id === 'NM1')
        ? []
        : [issue('HDR-STRUCT', 'error', 'HDR-STRUCT: required structure missing (NM1)', 'header', { segment: 'NM1' })],
    ),
    new SimpleRule('HL-HIER', 'hierarchy', (doc) =>
      doc.segments.some((s) => s.id === 'HL')
        ? []
        : [issue('HL-HIER', 'error', 'HL-HIER: required structure missing (HL)', 'hierarchy', { segment: 'HL' })],
    ),
    loopElementRule('HL-2000A-ELEMENTS', 'hierarchy', 'loop_2000A', ['HL', 'PRV', 'CUR'], (d) =>
      d.segments.filter(
        (s) => (s.id === 'HL' && el(s, 3) === '20') || s.id === 'PRV' || s.id === 'CUR',
      ),
    ),
    loopElementRule('HL-2000B-ELEMENTS', 'hierarchy', 'loop_2000B', ['HL', 'SBR', 'PAT'], (d) =>
      d.segments.filter((s) => (s.id === 'HL' && el(s, 3) === '22') || s.id === 'SBR' || s.id === 'PAT'),
    ),
    loopElementRule('HL-2000C-ELEMENTS', 'hierarchy', 'loop_2000C', ['HL', 'PAT'], (d) =>
      d.segments.filter((s) => (s.id === 'HL' && el(s, 3) === '23') || s.id === 'PAT'),
    ),
    loopElementRule('PROV-2010AA-ELEMENTS', 'provider', 'loop_2010AA', ['NM1', 'N3', 'N4', 'REF', 'PER'], (d) =>
      d.segments.filter((s) => ['NM1', 'N3', 'N4', 'REF', 'PER'].includes(s.id)),
    ),
    loopElementRule('PROV-2010AB-ELEMENTS', 'provider', 'loop_2010AB', ['NM1', 'N3', 'N4'], (d) => d.segments),
    loopElementRule('PROV-2010AC-ELEMENTS', 'provider', 'loop_2010AC', ['NM1', 'N3', 'N4', 'REF'], (d) => d.segments),
    new SimpleRule('PROV-BILL', 'provider', (doc) =>
      doc.segments.some((s) => s.id === 'NM1' && el(s, 1) === '85')
        ? []
        : [issue('PROV-BILL', 'error', 'PROV-BILL: required structure missing (NM1)', 'provider', { segment: 'NM1' })],
    ),
    new SimpleRule('PROV-CLM', 'provider', () => []),
    new SimpleRule('TAX-STRUCT', 'taxonomy', () => []),
    loopElementRule('SUB-2010BA-ELEMENTS', 'subscriber', 'loop_2010BA', ['NM1', 'N3', 'N4', 'DMG', 'REF'], (d) =>
      d.segments,
    ),
    new SimpleRule('SUB-STRUCT', 'subscriber', (doc) =>
      doc.segments.some((s) => s.id === 'SBR')
        ? []
        : [issue('SUB-STRUCT', 'error', 'SUB-STRUCT: required structure missing (SBR)', 'subscriber', { segment: 'SBR' })],
    ),
    loopElementRule('PYR-2010BB-ELEMENTS', 'payer', 'loop_2010BB', ['NM1', 'N3', 'N4', 'REF'], (d) => d.segments),
    new SimpleRule('PYR-STRUCT', 'payer', (doc) =>
      doc.segments.some((s) => s.id === 'NM1' && el(s, 1) === 'PR')
        ? []
        : [issue('PYR-STRUCT', 'error', 'PYR-STRUCT: required structure missing (NM1)', 'payer', { segment: 'NM1' })],
    ),
    loopElementRule('PAT-2010CA-ELEMENTS', 'patient', 'loop_2010CA', ['NM1', 'N3', 'N4', 'DMG', 'REF'], (d) => d.segments),
    new SimpleRule('PAT-STRUCT', 'patient', () => []),
    loopElementRule('CLM-2300-ELEMENTS', 'claim', 'loop_2300', ['CLM', 'DTP', 'CL1', 'PWK', 'CN1', 'AMT', 'REF', 'K3', 'NTE', 'CR1', 'CR2', 'CRC', 'HI', 'HCP'], (d) =>
      d.segments,
    ),
    loopElementRule('PROV-2310-ELEMENTS', 'provider', 'loop_2310A', ['NM1', 'PRV', 'REF'], (d) => d.segments),
    loopElementRule('COB-2320-ELEMENTS', 'cob', 'loop_2320', ['SBR', 'CAS', 'AMT', 'OI', 'MOA'], (d) => d.segments),
    loopElementRule('SVC-2400-ELEMENTS', 'service_line', 'loop_2400', ['LX', 'SV1', 'SV5', 'PWK', 'CR1', 'CR3', 'CRC', 'DTP', 'QTY', 'MEA', 'CN1', 'REF', 'AMT', 'K3', 'NTE', 'PS1', 'HCP'], (d) =>
      d.segments,
    ),
    new SimpleRule('CLM-STRUCT', 'claim', (doc) =>
      doc.segments.some((s) => s.id === 'CLM')
        ? []
        : [issue('CLM-STRUCT', 'error', 'CLM-STRUCT: required structure missing (CLM)', 'claim', { segment: 'CLM' })],
    ),
    new SimpleRule('REF-STRUCT', 'claim', () => []),
    new SimpleRule('NTE-STRUCT', 'claim', () => []),
    new SimpleRule('AMT-STRUCT', 'amount', (doc) => {
      const clm = doc.segments.find((s) => s.id === 'CLM');
      if (!clm) return [];
      const amt = Number(el(clm, 2));
      return Number.isFinite(amt) && amt >= 0
        ? []
        : [issue('AMT-STRUCT', 'error', 'AMT-STRUCT: claim amount invalid', 'amount', { segment: 'CLM', field: 'CLM02' })];
    }),
    new SimpleRule('DX-STRUCT', 'diagnosis', (doc) =>
      doc.segments.some((s) => s.id === 'HI')
        ? []
        : [issue('DX-STRUCT', 'error', 'DX-STRUCT: required structure missing (HI)', 'diagnosis', { segment: 'HI' })],
    ),
    new SimpleRule('SVC-STRUCT', 'service_line', (doc) =>
      doc.segments.some((s) => s.id === 'SV1')
        ? []
        : [issue('SVC-STRUCT', 'error', 'SVC-STRUCT: required structure missing (SV1)', 'service_line', { segment: 'SV1' })],
    ),
    new SimpleRule('DRUG-STRUCT', 'service_line', () => []),
    new SimpleRule('DATE-STRUCT', 'date', () => []),
    new SimpleRule('COB-STRUCT', 'cob', () => []),
  ];
}

export function createRuleContext(specPath: string): Edi837RuleContext {
  return {
    spec: Edi837Spec.fromPath(specPath),
    elements: new SegmentElementValidator(),
  };
}
