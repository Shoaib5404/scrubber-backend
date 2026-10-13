import { Edi837Spec } from '../edi837-spec';
import { Edi837ValidationIssue, issue } from '../types';

const FIELD_LENGTHS: Record<number, number> = {
  1: 2,
  2: 10,
  3: 2,
  4: 10,
  5: 2,
  6: 15,
  7: 2,
  8: 15,
  9: 6,
  10: 4,
  11: 1,
  12: 5,
  13: 9,
  14: 1,
  15: 1,
};
const ISA_SEGMENT_LENGTH = 106;

/**
 * Port of Laravel Edi837IsaPreValidator.
 * Nest keeps rule id ENV-ISA-PRE (Laravel uses ENV-ISA-FIXED) per parity plan.
 */
export class IsaPreValidator {
  validate(content: string, spec?: Edi837Spec | null): Edi837ValidationIssue[] {
    const normalized = content.replace(/\r\n|\r|\n/g, '');
    if (!normalized.startsWith('ISA') || normalized.length < 4) {
      return [this.issue('EDI file must start with ISA segment')];
    }
    const separator = normalized[3]!;
    const issues = this.validateFixedFields(normalized, separator, spec ?? null);

    const terminatorIndex = ISA_SEGMENT_LENGTH - 1;
    if (normalized.length <= terminatorIndex || normalized[terminatorIndex] !== '~') {
      if (issues.length === 0) {
        issues.push(
          this.issue(
            'ISA segment must be exactly 106 characters with segment terminator (~) at position 106',
            'ISA',
          ),
        );
      }
      return issues;
    }

    return issues;
  }

  private validateFixedFields(
    content: string,
    separator: string,
    spec: Edi837Spec | null,
  ): Edi837ValidationIssue[] {
    const issues: Edi837ValidationIssue[] = [];
    let position = 4;

    for (let fieldNumber = 1; fieldNumber <= 15; fieldNumber++) {
      const expectedLength = FIELD_LENGTHS[fieldNumber]!;
      const field = 'ISA' + String(fieldNumber).padStart(2, '0');
      const separatorPosition = content.indexOf(separator, position);
      if (separatorPosition < 0) {
        issues.push(this.issue(`${field} is missing or ISA segment structure is invalid`, field));
        return issues;
      }
      const actualLength = separatorPosition - position;
      if (actualLength !== expectedLength) {
        issues.push(
          this.issue(`${field} length must be exactly ${expectedLength}, got ${actualLength}`, field),
        );
      }
      const value = content.slice(position, separatorPosition);
      issues.push(...this.validateElementSpec(spec, fieldNumber, field, value));
      position = separatorPosition + 1;
    }

    if (content[position] === undefined) {
      issues.push(this.issue('ISA16 (component element separator) is required', 'ISA16'));
      return issues;
    }

    const isa16 = content[position]!;
    issues.push(...this.validateElementSpec(spec, 16, 'ISA16', isa16));

    if ((content[position + 1] ?? '') !== '~') {
      issues.push(
        this.issue(
          'ISA segment terminator (~) must immediately follow ISA16; fixed-width ISA fields may be incorrect',
          'ISA16',
        ),
      );
    }

    return issues;
  }

  private validateElementSpec(
    spec: Edi837Spec | null,
    fieldNumber: number,
    field: string,
    value: string,
  ): Edi837ValidationIssue[] {
    if (!spec) return [];
    const elementKey = 'isa' + String(fieldNumber).padStart(2, '0');
    const definition = spec.elementSpec('ISA', elementKey);
    if (!definition) return [];
    const allowed = definition.valid_values;
    if (!Array.isArray(allowed) || allowed.length === 0) return [];
    const normalized = value.trim();
    if (!allowed.includes(normalized)) {
      return [
        this.issue(
          `${field} must be one of [${(allowed as string[]).join(', ')}], got '${normalized}'`,
          field,
        ),
      ];
    }
    return [];
  }

  private issue(message: string, field?: string): Edi837ValidationIssue {
    return issue('ENV-ISA-PRE', 'error', message, 'envelope', {
      segment: 'ISA',
      field: field ?? null,
    });
  }
}
