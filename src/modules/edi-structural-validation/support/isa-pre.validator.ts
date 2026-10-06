import { Edi837ValidationIssue, issue } from '../types';

const FIELD_LENGTHS: Record<number, number> = {
  1: 2, 2: 10, 3: 2, 4: 10, 5: 2, 6: 15, 7: 2, 8: 15, 9: 6, 10: 4, 11: 1, 12: 5, 13: 9, 14: 1, 15: 1,
};
const ISA_SEGMENT_LENGTH = 106;

/** Port of Laravel Edi837IsaPreValidator */
export class IsaPreValidator {
  validate(content: string): Edi837ValidationIssue[] {
    const normalized = content.replace(/\r\n|\r|\n/g, '');
    if (!normalized.startsWith('ISA') || normalized.length < 4) {
      return [issue('ENV-ISA-PRE', 'error', 'EDI file must start with ISA segment', 'envelope', { segment: 'ISA' })];
    }
    const separator = normalized[3];
    const issues = this.validateFixedFields(normalized, separator);
    const terminatorIndex = ISA_SEGMENT_LENGTH - 1;
    if (normalized.length <= terminatorIndex || normalized[terminatorIndex] !== '~') {
      if (issues.length === 0) {
        issues.push(
          issue(
            'ENV-ISA-PRE',
            'error',
            'ISA segment must be exactly 106 characters with segment terminator (~) at position 106',
            'envelope',
            { segment: 'ISA', field: 'ISA' },
          ),
        );
      }
    }
    return issues;
  }

  private validateFixedFields(content: string, separator: string): Edi837ValidationIssue[] {
    const issues: Edi837ValidationIssue[] = [];
    let position = 4;
    for (let fieldNumber = 1; fieldNumber <= 15; fieldNumber++) {
      const expectedLength = FIELD_LENGTHS[fieldNumber];
      const field = 'ISA' + String(fieldNumber).padStart(2, '0');
      const separatorPosition = content.indexOf(separator, position);
      if (separatorPosition < 0) {
        issues.push(issue('ENV-ISA-PRE', 'error', `Missing separator after ${field}`, 'envelope', { segment: 'ISA', field }));
        break;
      }
      const actualLength = separatorPosition - position;
      if (actualLength !== expectedLength) {
        issues.push(
          issue(
            'ENV-ISA-PRE',
            'error',
            `${field} must be exactly ${expectedLength} characters (found ${actualLength})`,
            'envelope',
            { segment: 'ISA', field },
          ),
        );
      }
      position = separatorPosition + 1;
    }
    return issues;
  }
}
