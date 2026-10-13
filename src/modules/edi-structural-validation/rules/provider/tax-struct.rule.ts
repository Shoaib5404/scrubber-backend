import { validateEdi837Taxonomy } from '../../support/taxonomy.validator';
import {
  bodySegmentsInTransaction,
  eachTransaction,
  parseHlSegments,
} from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'TAX-STRUCT';
const GROUP = 'taxonomy';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function findBillingTaxonomyPrv(bodySegments: EdiSegment[], billingHl: EdiSegment): EdiSegment | null {
  let collect = false;

  for (const segment of bodySegments) {
    if (segment.index === billingHl.index) {
      collect = true;
      continue;
    }

    if (!collect) continue;

    if (segment.id === 'HL') break;

    if (segment.id === 'PRV' && el(segment, 1) === 'BI') {
      return segment;
    }
  }

  return null;
}

export function taxStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '20') continue;

          const prv = findBillingTaxonomyPrv(body, hl.segment);
          if (!prv) continue;

          for (const finding of validateEdi837Taxonomy(prv, 'Billing')) {
            issues.push(
              issue(RULE_ID, finding.severity, finding.message, GROUP, {
                segment: 'PRV',
                segment_index: prv.index,
                functional_group_index: tx.functionalGroupIndex,
                transaction_set_index: tx.transactionSetIndex,
                field: finding.field,
              }),
            );
          }
        }
      }

      return issues;
    },
  };
}
