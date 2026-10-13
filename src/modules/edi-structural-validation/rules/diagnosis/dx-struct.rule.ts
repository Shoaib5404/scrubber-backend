import {
  claimDiagnoses,
  extractServiceLines,
  serviceLineDiagnosisPointers,
} from '../../support/parsed-claim.helpers';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  issue,
} from '../../types';

const RULE_ID = 'DX-STRUCT';
const GROUP = 'diagnosis';

export function dxStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      const componentSeparator = doc.componentSeparator;

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;

        for (const claim of extractClaims(body)) {
          const diagnoses = claimDiagnoses(claim.segments, componentSeparator);
          let hasPrincipal = false;

          for (const diagnosis of diagnoses) {
            if (diagnosis.qualifier === 'ABK' || diagnosis.qualifier === 'BK') {
              hasPrincipal = true;
            }
            if (diagnosis.code.includes('.')) {
              issues.push(
                issue(
                  RULE_ID,
                  'warning',
                  'Diagnosis codes in HI should not include decimal points in EDI',
                  GROUP,
                  {
                    segment: 'HI',
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'HI',
                  },
                ),
              );
            }
          }

          const diagnosisCount = diagnoses.length;

          if (diagnoses.length === 0 || !hasPrincipal) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Principal diagnosis (HI*ABK or HI*BK) is required on each claim',
                GROUP,
                {
                  segment: 'HI',
                  segment_index: claim.clm.index,
                  functional_group_index: fg,
                  transaction_set_index: ti,
                },
              ),
            );
          }

          if (diagnosisCount > 12) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'A claim may contain at most 12 diagnosis codes in HI segments',
                GROUP,
                {
                  segment: 'HI',
                  functional_group_index: fg,
                  transaction_set_index: ti,
                  field: 'HI',
                },
              ),
            );
          }

          for (const line of extractServiceLines(claim.segments)) {
            const pointers = serviceLineDiagnosisPointers(line, componentSeparator);

            if (pointers.length === 0) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'At least one diagnosis pointer (SV107) is required per service line',
                  GROUP,
                  {
                    segment: 'SV1',
                    segment_index: line.sv1.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'SV107',
                  },
                ),
              );
              continue;
            }

            for (const pointer of pointers) {
              if (pointer < 1 || pointer > diagnosisCount) {
                issues.push(
                  issue(
                    RULE_ID,
                    'error',
                    `Diagnosis pointer ${pointer} on line ${line.index + 1} references a non-existent HI diagnosis`,
                    GROUP,
                    {
                      segment: 'SV1',
                      segment_index: line.sv1.index,
                      functional_group_index: fg,
                      transaction_set_index: ti,
                      field: 'SV107',
                    },
                  ),
                );
              }
            }
          }
        }
      }

      return issues;
    },
  };
}
