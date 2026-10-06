import { Edi837ValidationIssue, EdiSegment, issue } from '../types';

type ElementDef = {
  required?: boolean;
  not_used?: boolean;
  min_length?: number;
  max_length?: number;
  format?: string;
  valid_values?: string[];
  required_with?: string;
  only_when?: { element?: string; equals?: string };
};

type SyntaxRule = {
  code?: string;
  if?: string;
  then_required?: string[];
  then_any_of?: string[];
  at_least_one_of?: string[];
  mutually_exclusive?: string[];
};

/** Port of Laravel Edi837SegmentElementValidator (required / length / format / syntax). */
export class SegmentElementValidator {
  validateSegment(
    segment: EdiSegment,
    segmentCode: string,
    segmentSpec: Record<string, unknown>,
    ruleId: string,
    category: string,
    functionalGroupIndex?: number | null,
    transactionSetIndex?: number | null,
  ): Edi837ValidationIssue[] {
    const elements = (segmentSpec.elements ?? {}) as Record<string, ElementDef>;
    const syntaxRules = (segmentSpec.syntax_rules ?? []) as SyntaxRule[];
    const factory = (
      message: string,
      seg: string | null,
      segIndex: number | null,
      fg: number | null | undefined,
      tx: number | null | undefined,
      field: string | null,
    ) =>
      issue(ruleId, 'error', message, category, {
        segment: seg,
        segment_index: segIndex,
        functional_group_index: fg ?? null,
        transaction_set_index: tx ?? null,
        field,
      });

    let issues = this.validateElements(
      segment,
      segmentCode,
      elements,
      factory,
      functionalGroupIndex,
      transactionSetIndex,
      syntaxRules,
    );
    if (syntaxRules.length) {
      issues = issues.concat(
        this.validateSyntaxRules(
          segment,
          segmentCode,
          syntaxRules,
          factory,
          functionalGroupIndex,
          transactionSetIndex,
          elements,
        ),
      );
    }
    return issues;
  }

  private validateElements(
    segment: EdiSegment,
    segmentCode: string,
    elements: Record<string, ElementDef>,
    issueFactory: (
      message: string,
      seg: string | null,
      segIndex: number | null,
      fg: number | null | undefined,
      tx: number | null | undefined,
      field: string | null,
    ) => Edi837ValidationIssue,
    functionalGroupIndex?: number | null,
    transactionSetIndex?: number | null,
    syntaxRules: SyntaxRule[] = [],
  ): Edi837ValidationIssue[] {
    const issues: Edi837ValidationIssue[] = [];

    for (const [elementKey, definition] of Object.entries(elements)) {
      if (!definition || typeof definition !== 'object') continue;
      const position = this.positionFromElementKey(elementKey);
      if (position == null) continue;
      const value = segment.elements[position] ?? null;
      const field = `${segmentCode.toUpperCase()}${String(position).padStart(2, '0')}`;
      const hasValue = value !== null && value !== '';

      if (definition.not_used === true) {
        if (hasValue) {
          issues.push(
            issueFactory(
              `${field} is not used and must not be sent`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              field,
            ),
          );
        }
        continue;
      }

      if (hasValue && !this.satisfiesOnlyWhen(segment, definition.only_when)) {
        issues.push(
          issueFactory(
            this.onlyWhenMessage(field, definition.only_when),
            segmentCode,
            segment.index,
            functionalGroupIndex,
            transactionSetIndex,
            field,
          ),
        );
        continue;
      }

      if (definition.required === true && this.isMissingRequiredValue(value, definition)) {
        if (!this.isCoveredByThenRequiredSyntax(segment, elementKey, syntaxRules)) {
          issues.push(
            issueFactory(
              `${field} is required`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              field,
            ),
          );
        }
        continue;
      }

      const requiredWith = definition.required_with;
      if (typeof requiredWith === 'string' && requiredWith !== '') {
        const dependsPosition = this.positionFromElementKey(requiredWith);
        const dependsValue = dependsPosition != null ? segment.elements[dependsPosition] : null;
        const dependsHasValue = dependsValue != null && dependsValue !== '';
        const dependsField = `${segmentCode.toUpperCase()}${String(dependsPosition ?? 0).padStart(2, '0')}`;
        if (dependsHasValue && !hasValue) {
          issues.push(
            issueFactory(
              `${field} is required when ${dependsField} is present`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              field,
            ),
          );
          continue;
        }
      }

      if (!hasValue || value == null) continue;

      const length = value.length;
      const min = definition.min_length;
      const max = definition.max_length;
      const minTooShort = typeof min === 'number' && length < min;
      const maxTooLong = typeof max === 'number' && length > max;
      const format = (definition.format ?? '').toUpperCase();
      const formatViolation = format !== '' && !this.isValidFormat(value, format);

      if (minTooShort) {
        issues.push(
          issueFactory(
            `${field} length must be greater than or equal to ${min}, got ${length}`,
            segmentCode,
            segment.index,
            functionalGroupIndex,
            transactionSetIndex,
            field,
          ),
        );
      }
      if (maxTooLong) {
        issues.push(
          issueFactory(
            `${field} length must be less than or equal to ${max}, got ${length}`,
            segmentCode,
            segment.index,
            functionalGroupIndex,
            transactionSetIndex,
            field,
          ),
        );
      }
      if (formatViolation) {
        issues.push(
          issueFactory(
            format === 'N' || format === 'NUMERIC' || format === 'DIGIT'
              ? `${field} must contain numeric characters only, got '${value}'`
              : `${field} must match format ${format}`,
            segmentCode,
            segment.index,
            functionalGroupIndex,
            transactionSetIndex,
            field,
          ),
        );
      }

      const allowed = definition.valid_values ?? [];
      if (Array.isArray(allowed) && allowed.length > 0) {
        const normalized = value.trim();
        if (!allowed.includes(normalized)) {
          issues.push(
            issueFactory(
              `${field} must be one of [${allowed.join(', ')}], got '${normalized}'`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              field,
            ),
          );
        }
      }
    }

    return issues;
  }

  private validateSyntaxRules(
    segment: EdiSegment,
    segmentCode: string,
    syntaxRules: SyntaxRule[],
    issueFactory: (
      message: string,
      seg: string | null,
      segIndex: number | null,
      fg: number | null | undefined,
      tx: number | null | undefined,
      field: string | null,
    ) => Edi837ValidationIssue,
    functionalGroupIndex?: number | null,
    transactionSetIndex?: number | null,
    elements: Record<string, ElementDef> = {},
  ): Edi837ValidationIssue[] {
    const issues: Edi837ValidationIssue[] = [];

    for (const rule of syntaxRules) {
      const code = String(rule.code ?? 'SYNTAX');

      const atLeastOneOf = rule.at_least_one_of;
      if (Array.isArray(atLeastOneOf) && atLeastOneOf.length) {
        const optionFields: string[] = [];
        let anyPresent = false;
        for (const optionKey of atLeastOneOf) {
          if (typeof optionKey !== 'string' || !optionKey) continue;
          optionFields.push(this.fieldName(segmentCode, optionKey));
          if (this.elementHasValue(segment, optionKey)) anyPresent = true;
        }
        if (!anyPresent && optionFields.length) {
          issues.push(
            issueFactory(
              `At least one of [${optionFields.join(', ')}] is required (X12 syntax ${code})`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              optionFields[0] ?? null,
            ),
          );
        }
      }

      const mutuallyExclusive = rule.mutually_exclusive;
      if (Array.isArray(mutuallyExclusive) && mutuallyExclusive.length) {
        const presentFields: string[] = [];
        for (const optionKey of mutuallyExclusive) {
          if (typeof optionKey !== 'string' || !optionKey) continue;
          if (this.elementHasValue(segment, optionKey)) {
            presentFields.push(this.fieldName(segmentCode, optionKey));
          }
        }
        if (presentFields.length > 1) {
          issues.push(
            issueFactory(
              `Only one of [${mutuallyExclusive
                .filter((k): k is string => typeof k === 'string')
                .map((k) => this.fieldName(segmentCode, k))
                .join(', ')}] may be present (X12 syntax ${code}); found ${presentFields.join(' and ')}`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              presentFields[0] ?? null,
            ),
          );
        }
      }

      const ifKey = rule.if;
      if (typeof ifKey !== 'string' || !ifKey || !this.elementHasValue(segment, ifKey)) continue;
      if (this.elementDefinitionIsNotUsed(elements, ifKey)) continue;

      const ifField = this.fieldName(segmentCode, ifKey);
      const thenRequired = rule.then_required;
      if (Array.isArray(thenRequired)) {
        for (const requiredKey of thenRequired) {
          if (typeof requiredKey !== 'string' || !requiredKey) continue;
          if (this.elementHasValue(segment, requiredKey)) continue;
          if (this.elementDefinitionIsNotUsed(elements, requiredKey)) continue;
          const requiredField = this.fieldName(segmentCode, requiredKey);
          issues.push(
            issueFactory(
              `${requiredField} is required when ${ifField} is present (X12 syntax ${code})`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              requiredField,
            ),
          );
        }
      }

      const thenAnyOf = rule.then_any_of;
      if (Array.isArray(thenAnyOf) && thenAnyOf.length) {
        const optionFields: string[] = [];
        let anyPresent = false;
        for (const optionKey of thenAnyOf) {
          if (typeof optionKey !== 'string' || !optionKey) continue;
          optionFields.push(this.fieldName(segmentCode, optionKey));
          if (this.elementHasValue(segment, optionKey)) anyPresent = true;
        }
        if (!anyPresent && optionFields.length) {
          issues.push(
            issueFactory(
              `At least one of [${optionFields.join(', ')}] is required when ${ifField} is present (X12 syntax ${code})`,
              segmentCode,
              segment.index,
              functionalGroupIndex,
              transactionSetIndex,
              ifField,
            ),
          );
        }
      }
    }

    return issues;
  }

  private isMissingRequiredValue(value: string | null, definition: ElementDef): boolean {
    if (value === null || value === '') return true;
    const minLength = definition.min_length;
    if (typeof minLength === 'number' && minLength > 0) return false;
    return value.trim() === '';
  }

  private satisfiesOnlyWhen(segment: EdiSegment, onlyWhen?: { element?: string; equals?: string }): boolean {
    if (!onlyWhen) return true;
    const dependsOn = onlyWhen.element;
    const expected = onlyWhen.equals;
    if (typeof dependsOn !== 'string' || typeof expected !== 'string') return true;
    const dependsPosition = this.positionFromElementKey(dependsOn);
    if (dependsPosition == null) return true;
    return (segment.elements[dependsPosition] ?? '').trim() === expected;
  }

  private onlyWhenMessage(field: string, onlyWhen?: { element?: string; equals?: string }): string {
    const dependsOn = String(onlyWhen?.element ?? '').toUpperCase();
    const expected = String(onlyWhen?.equals ?? '');
    if (dependsOn && expected) return `${field} must not be sent unless ${dependsOn}=${expected}`;
    return `${field} must not be sent for this situational condition`;
  }

  private isCoveredByThenRequiredSyntax(segment: EdiSegment, elementKey: string, syntaxRules: SyntaxRule[]): boolean {
    const normalizedKey = elementKey.toLowerCase();
    for (const rule of syntaxRules) {
      const ifKey = rule.if;
      if (typeof ifKey !== 'string' || !ifKey || !this.elementHasValue(segment, ifKey)) continue;
      const thenRequired = rule.then_required;
      if (!Array.isArray(thenRequired)) continue;
      if (thenRequired.some((k) => typeof k === 'string' && k.toLowerCase() === normalizedKey)) return true;
    }
    return false;
  }

  private elementDefinitionIsNotUsed(elements: Record<string, ElementDef>, elementKey: string): boolean {
    const definition = elements[elementKey.toLowerCase()] ?? elements[elementKey];
    return !!definition && definition.not_used === true;
  }

  private positionFromElementKey(key: string): number | null {
    const match = /(\d{2})$/.exec(key);
    return match ? Number(match[1]) : null;
  }

  private fieldName(segmentCode: string, elementKey: string): string {
    const position = this.positionFromElementKey(elementKey) ?? 0;
    return `${segmentCode.toUpperCase()}${String(position).padStart(2, '0')}`;
  }

  private elementHasValue(segment: EdiSegment, elementKey: string): boolean {
    const position = this.positionFromElementKey(elementKey);
    if (position == null) return false;
    const value = segment.elements[position];
    return value !== null && value !== undefined && value !== '';
  }

  private isValidFormat(value: string, format: string): boolean {
    switch (format) {
      case 'N':
      case 'NUMERIC':
      case 'DIGIT':
        return /^\d+$/.test(value);
      case 'YYMMDD':
        return /^\d{6}$/.test(value);
      case 'CCYYMMDD':
        return /^\d{8}$/.test(value);
      case 'HHMM':
        return /^\d{4}$/.test(value) && Number(value.slice(0, 2)) <= 23 && Number(value.slice(2, 4)) <= 59;
      case 'HHMM OR HHMMSS OR HHMMSSDD':
        return /^\d{4}(\d{2}(\d{2})?)?$/.test(value);
      default:
        return true;
    }
  }
}
