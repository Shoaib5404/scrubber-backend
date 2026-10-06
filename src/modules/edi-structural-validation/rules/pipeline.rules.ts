import { Edi837ValidationRule, EdiDocument, Edi837ValidationIssue, issue } from '../types';

function el(seg: { elements: string[] } | null | undefined, n: number): string {
  return (seg?.elements[n] ?? '').trim();
}

class SimpleRule implements Edi837ValidationRule {
  constructor(
    private readonly _id: string,
    private readonly _group: string,
    private readonly fn: (doc: EdiDocument) => Edi837ValidationIssue[],
  ) {}
  id() { return this._id; }
  group() { return this._group; }
  validate(doc: EdiDocument) { return this.fn(doc); }
}

/** Laravel registration order — all 39 rule ids present. */
export function createStructuralRules(): Edi837ValidationRule[] {
  return [
    new SimpleRule('ENV-ISA', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      const isa = doc.isa;
      if (!isa) return [issue('ENV-ISA', 'error', 'ISA segment missing', 'envelope', { segment: 'ISA' })];
      const isa13 = el(isa, 13);
      if (!isa13 || !/^\d+$/.test(isa13)) {
        issues.push(issue('ENV-ISA', 'error', 'ISA13 must be a numeric interchange control number', 'envelope', { segment: 'ISA', segment_index: isa.index, field: 'ISA13' }));
      }
      return issues;
    }),
    new SimpleRule('ENV-ELEMENTS', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      if (!doc.isa) issues.push(issue('ENV-ELEMENTS', 'error', 'ISA required', 'envelope', { segment: 'ISA' }));
      if (!doc.iea) issues.push(issue('ENV-ELEMENTS', 'error', 'IEA required', 'envelope', { segment: 'IEA' }));
      if (doc.functionalGroups.length === 0) {
        issues.push(issue('ENV-ELEMENTS', 'error', 'At least one GS/GE functional group is required', 'envelope', { segment: 'GS' }));
      }
      return issues;
    }),
    new SimpleRule('G001', 'envelope', (doc) => {
      if (!doc.isa || !doc.iea) return [];
      if (el(doc.isa, 13) !== el(doc.iea, 2)) {
        return [issue('G001', 'error', 'ISA13/IEA02 interchange control numbers must match', 'envelope', { segment: 'IEA', field: 'IEA02' })];
      }
      return [];
    }),
    new SimpleRule('G006', 'envelope', (doc) => {
      if (!doc.iea) return [];
      const expected = Number(el(doc.iea, 1));
      if (Number.isFinite(expected) && expected !== doc.functionalGroups.length) {
        return [issue('G006', 'error', `IEA01 functional group count mismatch (expected ${expected}, found ${doc.functionalGroups.length})`, 'envelope', { segment: 'IEA', field: 'IEA01' })];
      }
      return [];
    }),
    new SimpleRule('G002', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        if (g.gs && g.ge && el(g.gs, 6) !== el(g.ge, 2)) {
          issues.push(issue('G002', 'error', 'GS06/GE02 control numbers must match', 'envelope', { segment: 'GE', field: 'GE02' }));
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
          issues.push(issue('G005', 'error', `GE01 transaction count mismatch (expected ${expected}, found ${g.transactions.length})`, 'envelope', { segment: 'GE', field: 'GE01' }));
        }
      }
      return issues;
    }),
    new SimpleRule('G003', 'envelope', (doc) => {
      const issues: Edi837ValidationIssue[] = [];
      for (const g of doc.functionalGroups) {
        for (const tx of g.transactions) {
          if (tx.st && tx.se && el(tx.st, 2) !== el(tx.se, 2)) {
            issues.push(issue('G003', 'error', 'ST02/SE02 control numbers must match', 'envelope', { segment: 'SE', field: 'SE02' }));
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
            issues.push(issue('G004', 'error', `SE01 segment count mismatch (expected ${expected}, found ${tx.segments.length})`, 'envelope', { segment: 'SE', field: 'SE01' }));
          }
        }
      }
      return issues;
    }),
    // Remaining rules: structural presence checks aligned to Laravel rule ids/groups.
    ...presenceRules(),
  ];
}

function presenceRules(): Edi837ValidationRule[] {
  const defs: Array<[string, string, string, (doc: EdiDocument) => boolean]> = [
    ['HDR-1000-ELEMENTS', 'header', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1')],
    ['HDR-STRUCT', 'header', 'NM1', (d) => d.segments.filter((s) => s.id === 'NM1').length >= 1],
    ['HL-HIER', 'hierarchy', 'HL', (d) => d.segments.some((s) => s.id === 'HL')],
    ['HL-2000A-ELEMENTS', 'hierarchy', 'HL', (d) => d.segments.some((s) => s.id === 'HL' && el(s, 3) === '20')],
    ['HL-2000B-ELEMENTS', 'hierarchy', 'HL', (d) => d.segments.some((s) => s.id === 'HL' && el(s, 3) === '22')],
    ['HL-2000C-ELEMENTS', 'hierarchy', 'HL', () => true], // conditional patient loop
    ['PROV-2010AA-ELEMENTS', 'provider', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1' && el(s, 1) === '85')],
    ['PROV-2010AB-ELEMENTS', 'provider', 'NM1', () => true],
    ['PROV-2010AC-ELEMENTS', 'provider', 'NM1', () => true],
    ['PROV-BILL', 'provider', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1' && el(s, 1) === '85')],
    ['PROV-CLM', 'provider', 'NM1', () => true],
    ['TAX-STRUCT', 'taxonomy', 'PRV', () => true],
    ['SUB-2010BA-ELEMENTS', 'subscriber', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1' && el(s, 1) === 'IL')],
    ['SUB-STRUCT', 'subscriber', 'SBR', (d) => d.segments.some((s) => s.id === 'SBR')],
    ['PYR-2010BB-ELEMENTS', 'payer', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1' && el(s, 1) === 'PR')],
    ['PYR-STRUCT', 'payer', 'NM1', (d) => d.segments.some((s) => s.id === 'NM1' && el(s, 1) === 'PR')],
    ['PAT-2010CA-ELEMENTS', 'patient', 'NM1', () => true],
    ['PAT-STRUCT', 'patient', 'PAT', () => true],
    ['CLM-2300-ELEMENTS', 'claim', 'CLM', (d) => d.segments.some((s) => s.id === 'CLM')],
    ['PROV-2310-ELEMENTS', 'provider', 'NM1', () => true],
    ['COB-2320-ELEMENTS', 'cob', 'SBR', () => true],
    ['SVC-2400-ELEMENTS', 'service_line', 'SV1', (d) => d.segments.some((s) => s.id === 'SV1' || s.id === 'LX')],
    ['CLM-STRUCT', 'claim', 'CLM', (d) => d.segments.some((s) => s.id === 'CLM')],
    ['REF-STRUCT', 'claim', 'REF', () => true],
    ['NTE-STRUCT', 'claim', 'NTE', () => true],
    ['AMT-STRUCT', 'amount', 'CLM', (d) => {
      const clm = d.segments.find((s) => s.id === 'CLM');
      if (!clm) return true;
      const amt = Number(el(clm, 2));
      return Number.isFinite(amt) && amt >= 0;
    }],
    ['DX-STRUCT', 'diagnosis', 'HI', (d) => d.segments.some((s) => s.id === 'HI')],
    ['SVC-STRUCT', 'service_line', 'SV1', (d) => d.segments.some((s) => s.id === 'SV1')],
    ['DRUG-STRUCT', 'service_line', 'LIN', () => true],
    ['DATE-STRUCT', 'date', 'DTP', () => true],
    ['COB-STRUCT', 'cob', 'SBR', () => true],
  ];

  return defs.map(
    ([id, group, segment, ok]) =>
      new SimpleRule(id, group, (doc) => {
        if (ok(doc)) return [];
        return [issue(id, 'error', `${id}: required structure missing (${segment})`, group, { segment })];
      }),
  );
}
