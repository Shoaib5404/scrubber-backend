import { validateEdi837Address } from '../../support/address.validator';
import {
  bodySegmentsInTransaction,
  eachTransaction,
  findNm1ByEntity,
  findRefAfter,
  findSegmentAfter,
} from '../../support/loop-segment-scope';
import { npiValidator } from '../../support/npi.validator';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'PROV-BILL';
const GROUP = 'provider';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

export function provBillRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const billingNm1 = findNm1ByEntity(body, '85');

        if (!billingNm1) {
          issues.push(
            issue(RULE_ID, 'error', 'Billing provider NM1*85 segment is required', GROUP, {
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
            }),
          );
          continue;
        }

        const qualifier = el(billingNm1, 8);
        const npi = el(billingNm1, 9);
        const hasNpiData = qualifier !== '' || npi !== '';

        if (hasNpiData) {
          if (qualifier !== '' && qualifier !== 'XX') {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Billing provider NPI qualifier (NM108) must be XX when present',
                GROUP,
                {
                  segment: 'NM1',
                  segment_index: billingNm1.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'NM108',
                },
              ),
            );
          }

          if (npi !== '') {
            if (!/^\d{10}$/.test(npi)) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Billing provider NPI (NM109) must be exactly 10 digits when present',
                  GROUP,
                  {
                    segment: 'NM1',
                    segment_index: billingNm1.index,
                    functional_group_index: tx.functionalGroupIndex,
                    transaction_set_index: tx.transactionSetIndex,
                    field: 'NM109',
                  },
                ),
              );
            } else if (!npiValidator.validateLuhn(npi)) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Billing provider NPI fails Luhn check validation',
                  GROUP,
                  {
                    segment: 'NM1',
                    segment_index: billingNm1.index,
                    functional_group_index: tx.functionalGroupIndex,
                    transaction_set_index: tx.transactionSetIndex,
                    field: 'NM109',
                  },
                ),
              );
            }
          }
        }

        const taxIdRef = findRefAfter(body, billingNm1.index, ['EI', 'SY']);
        if (!taxIdRef) {
          issues.push(
            issue(RULE_ID, 'error', 'Billing provider tax ID (REF*EI or REF*SY) is required', GROUP, {
              segment: 'NM1',
              segment_index: billingNm1.index,
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
            }),
          );
        } else {
          const tin = el(taxIdRef, 2);
          if (!/^\d{9}$/.test(tin)) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Billing provider tax ID must be exactly 9 numeric digits without separators',
                GROUP,
                {
                  segment: 'REF',
                  segment_index: taxIdRef.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'REF02',
                },
              ),
            );
          }
        }

        const n3 = findSegmentAfter(body, billingNm1.index, 'N3', '22');
        const n4 = findSegmentAfter(body, billingNm1.index, 'N4', '22');

        for (const finding of validateEdi837Address(n3, n4, 'Billing provider', false)) {
          issues.push(
            issue(RULE_ID, 'error', finding.message, GROUP, {
              segment: finding.segment,
              segment_index: finding.segmentIndex,
              functional_group_index: tx.functionalGroupIndex,
              transaction_set_index: tx.transactionSetIndex,
              field: finding.field,
            }),
          );
        }
      }

      return issues;
    },
  };
}
