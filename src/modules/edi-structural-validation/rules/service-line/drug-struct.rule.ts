import {
  extractServiceLines,
  firstSegmentAfter,
} from '../../support/parsed-claim.helpers';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'DRUG-STRUCT';
const GROUP = 'service_line';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateDrugLoop(
  lin: EdiSegment,
  lineSegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const productQualifier = el(lin, 2).toUpperCase();
  const productId = el(lin, 3);

  if (productQualifier === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Drug product qualifier (LIN02) is required when LIN is present',
        GROUP,
        {
          segment: 'LIN',
          segment_index: lin.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'LIN02',
        },
      ),
    );
  } else if (productQualifier !== 'N4') {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        `Drug product qualifier '${productQualifier}' is expected to be N4 (NDC) in loop 2410`,
        GROUP,
        {
          segment: 'LIN',
          segment_index: lin.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'LIN02',
        },
      ),
    );
  }

  if (productId === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Drug NDC code (LIN03) is required when LIN is present',
        GROUP,
        {
          segment: 'LIN',
          segment_index: lin.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'LIN03',
        },
      ),
    );
  } else if (!/^\d{11}$/.test(productId)) {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        'Drug NDC code (LIN03) should be 11 digits without separators',
        GROUP,
        {
          segment: 'LIN',
          segment_index: lin.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'LIN03',
        },
      ),
    );
  }

  const ctp = firstSegmentAfter(lineSegments, lin.index, 'CTP');
  if (!ctp) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Drug pricing (CTP) is required when LIN drug identification is present',
        GROUP,
        {
          segment: 'LIN',
          segment_index: lin.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CTP',
        },
      ),
    );
    return issues;
  }

  const quantity = el(ctp, 4);
  const unit = el(ctp, 5).toUpperCase();

  if (quantity !== '' && (!/^-?\d+(\.\d+)?$/.test(quantity) || Number(quantity) <= 0)) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Drug quantity (CTP04) must be greater than zero when present',
        GROUP,
        {
          segment: 'CTP',
          segment_index: ctp.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CTP04',
        },
      ),
    );
  }

  if (unit !== '' && unit !== 'UN') {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        `Drug unit of measure '${unit}' is expected to be UN in loop 2410`,
        GROUP,
        {
          segment: 'CTP',
          segment_index: ctp.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CTP05',
        },
      ),
    );
  }

  return issues;
}

export function drugStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;

        for (const claim of extractClaims(body)) {
          for (const line of extractServiceLines(claim.segments)) {
            const lin = line.segments.find((s) => s.id === 'LIN');
            if (!lin) continue;
            issues.push(...validateDrugLoop(lin, line.segments, fg, ti));
          }
        }
      }

      return issues;
    },
  };
}
