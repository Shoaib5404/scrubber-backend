import {
  bodySegmentsInTransaction,
  eachTransaction,
  extractClaimCobBlocks,
  extractClaims,
} from '../../support/loop-segment-scope';
import {
  cobBlockOtherPayerId,
  extractServiceLines,
  lineHasDtpQualifier,
  parseCobBlockMeta,
  primarySbr,
} from '../../support/parsed-claim.helpers';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'COB-STRUCT';
const GROUP = 'cob';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function validateCobBlock(
  block: ReturnType<typeof parseCobBlockMeta>,
  primaryResponsibility: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const cobResponsibility = el(block.sbr, 1).toUpperCase();

  if (cobResponsibility !== '' && cobResponsibility === primaryResponsibility) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `2320 SBR01 '${cobResponsibility}' must differ from primary payer responsibility`,
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
  }

  if (!block.oi) {
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

  if (!block.otherSubscriberNm1) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        '2330A other subscriber NM1*IL is required when 2320 COB loop is present',
        GROUP,
        {
          segment: 'SBR',
          segment_index: block.sbr.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM101',
        },
      ),
    );
  } else if (el(block.otherSubscriberNm1, 9) === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        '2330A other subscriber identifier (NM109) is required',
        GROUP,
        {
          segment: 'NM1',
          segment_index: block.otherSubscriberNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM109',
        },
      ),
    );
  }

  if (!block.otherPayerNm1) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        '2330B other payer NM1*PR is required when 2320 COB loop is present',
        GROUP,
        {
          segment: 'SBR',
          segment_index: block.sbr.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM101',
        },
      ),
    );
  } else if (el(block.otherPayerNm1, 9) === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        '2330B other payer identifier (NM109) is required',
        GROUP,
        {
          segment: 'NM1',
          segment_index: block.otherPayerNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM109',
        },
      ),
    );
  }

  return issues;
}

export function cobStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      const cobByTx = new Map<string, ReturnType<typeof extractClaimCobBlocks>>();

      for (const entry of extractClaimCobBlocks(doc)) {
        const key = `${entry.functionalGroupIndex}:${entry.transactionSetIndex}`;
        const list = cobByTx.get(key) ?? [];
        list.push(entry);
        cobByTx.set(key, list);
      }

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;
        const primary = primarySbr(body);
        const primaryResponsibility = primary ? el(primary, 1).toUpperCase() : '';

        const key = `${fg}:${ti}`;
        const cobClaims = cobByTx.get(key) ?? [];

        for (const claim of extractClaims(body)) {
          const cobEntry = cobClaims.find((c) => c.claimIndex === claim.index);
          if (!cobEntry || cobEntry.blocks.length === 0) continue;

          const otherPayerIds: string[] = [];

          for (const rawBlock of cobEntry.blocks) {
            const block = parseCobBlockMeta(rawBlock);
            issues.push(...validateCobBlock(block, primaryResponsibility, fg, ti));

            const payerId = cobBlockOtherPayerId(block);
            if (payerId) otherPayerIds.push(payerId);
          }

          for (const line of extractServiceLines(claim.segments)) {
            for (const svd of line.svdSegments) {
              const svdPayerId = el(svd, 1);
              if (svdPayerId === '') {
                issues.push(
                  issue(
                    RULE_ID,
                    'error',
                    'SVD01 other payer identifier is required when line adjudication (2430) is present',
                    GROUP,
                    {
                      segment: 'SVD',
                      segment_index: svd.index,
                      functional_group_index: fg,
                      transaction_set_index: ti,
                      field: 'SVD01',
                    },
                  ),
                );
                continue;
              }

              if (otherPayerIds.length > 0 && !otherPayerIds.includes(svdPayerId)) {
                issues.push(
                  issue(
                    RULE_ID,
                    'error',
                    `SVD01 '${svdPayerId}' must match NM109 from a corresponding 2330B other payer loop`,
                    GROUP,
                    {
                      segment: 'SVD',
                      segment_index: svd.index,
                      functional_group_index: fg,
                      transaction_set_index: ti,
                      field: 'SVD01',
                    },
                  ),
                );
              }
            }

            if (line.svdSegments.length > 0 && !lineHasDtpQualifier(line.segments, '573')) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Adjudication date (DTP*573) is required when line-level SVD is present',
                  GROUP,
                  {
                    segment: 'SVD',
                    segment_index: line.svdSegments[0]!.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'DTP573',
                  },
                ),
              );
            }
          }
        }
      }

      return issues;
    },
  };
}
