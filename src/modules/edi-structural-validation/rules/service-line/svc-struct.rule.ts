import { FieldFormatValidator } from '../../support/field-format.validator';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  PatientBirthDateResolver,
  patientBirthDateResolver,
} from '../../support/patient-birth-date.resolver';
import {
  extractServiceLines,
  serviceLineChargeAmount,
  serviceLineNumber,
  serviceLineUnits,
} from '../../support/parsed-claim.helpers';
import { validateProcedureComposite } from '../../support/procedure-code.validator';
import {
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'SVC-STRUCT';
const GROUP = 'service_line';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Laravel is_numeric — accepts leading-decimal amounts like .01 */
function isNumericAmount(value: string): boolean {
  if (value === '') return false;
  return /^-?(?:\d+\.?\d*|\.\d+)$/.test(value);
}

export function svcStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      const componentSeparator = doc.componentSeparator;
      const today = todayStart();

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const fg = tx.functionalGroupIndex;
        const ti = tx.transactionSetIndex;

        for (const claim of extractClaims(body)) {
          const birthDate = patientBirthDateResolver.resolve(body, claim.clm.index);
          const lines = extractServiceLines(claim.segments);

          if (lines.length === 0) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'At least one service line (LX/SV1) is required per claim',
                GROUP,
                {
                  segment: 'CLM',
                  segment_index: claim.clm.index,
                  functional_group_index: fg,
                  transaction_set_index: ti,
                },
              ),
            );
            continue;
          }

          let expectedLine = 1;
          for (const line of lines) {
            const lineNum = Number(serviceLineNumber(line)) || 0;
            if (lineNum !== expectedLine) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  `LX01 must be sequential starting at 1; expected ${expectedLine}, got ${lineNum}`,
                  GROUP,
                  {
                    segment: 'LX',
                    segment_index: line.lx.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'LX01',
                  },
                ),
              );
            }
            expectedLine++;

            for (const finding of validateProcedureComposite(el(line.sv1, 1), componentSeparator)) {
              issues.push(
                issue(RULE_ID, finding.severity, finding.message, GROUP, {
                  segment: 'SV1',
                  segment_index: line.sv1.index,
                  functional_group_index: fg,
                  transaction_set_index: ti,
                  field: finding.field,
                }),
              );
            }

            const charge = serviceLineChargeAmount(line);
            if (charge === '' || !isNumericAmount(charge) || Number(charge) <= 0) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'SV102 line charge amount must be greater than zero',
                  GROUP,
                  {
                    segment: 'SV1',
                    segment_index: line.sv1.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'SV102',
                  },
                ),
              );
            }

            const units = serviceLineUnits(line);
            if (units === '' || !isNumericAmount(units) || Number(units) <= 0) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'SV104 units must be greater than zero',
                  GROUP,
                  {
                    segment: 'SV1',
                    segment_index: line.sv1.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'SV104',
                  },
                ),
              );
            }

            const dtp = line.serviceDate;
            if (!dtp) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Service date (DTP*472) is required for each service line',
                  GROUP,
                  {
                    segment: 'SV1',
                    segment_index: line.sv1.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'DTP472',
                  },
                ),
              );
              continue;
            }

            const dateValue = el(dtp, 3);
            const format = el(dtp, 2);
            if (format !== 'D8' || !FieldFormatValidator.isValidD8(dateValue)) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'DTP*472 must use D8 format with a valid CCYYMMDD date',
                  GROUP,
                  {
                    segment: 'DTP',
                    segment_index: dtp.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'DTP03',
                  },
                ),
              );
              continue;
            }

            const serviceDate = PatientBirthDateResolver.parseD8(dateValue);
            if (!serviceDate) continue;

            if (serviceDate.getTime() > today.getTime()) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Service date (DTP*472) cannot be in the future',
                  GROUP,
                  {
                    segment: 'DTP',
                    segment_index: dtp.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'DTP03',
                  },
                ),
              );
            }

            if (birthDate && serviceDate.getTime() < birthDate.getTime()) {
              issues.push(
                issue(
                  RULE_ID,
                  'error',
                  'Service date (DTP*472) cannot be before patient birth date',
                  GROUP,
                  {
                    segment: 'DTP',
                    segment_index: dtp.index,
                    functional_group_index: fg,
                    transaction_set_index: ti,
                    field: 'DTP03',
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
