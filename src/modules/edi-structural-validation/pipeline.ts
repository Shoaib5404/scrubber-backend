import { ConfigService } from '@nestjs/config';
  import { Edi837ValidationIssue, Edi837ValidationRule, EdiDocument } from './types';
  import { createStructuralRules } from './rules/pipeline.rules';

  export class Edi837ValidationPipeline {
    private readonly rules: Edi837ValidationRule[];

    constructor(private readonly config: ConfigService) {
      this.rules = createStructuralRules();
    }

    validate(doc: EdiDocument): Edi837ValidationIssue[] {
      const enabledRules = this.config.get<string[] | null>('EDI837_ENABLED_RULES', null);
      const groupsRaw = this.config.get<string>('EDI837_RULE_GROUPS', '');
      const disabledGroups = new Set(
        groupsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.startsWith('!') )
          .map((s) => s.slice(1)),
      );

      const issues: Edi837ValidationIssue[] = [];
      for (const rule of this.rules) {
        if (enabledRules && !enabledRules.includes(rule.id())) continue;
        if (disabledGroups.has(rule.group())) continue;
        const groupFlag = this.config.get<boolean | undefined>(`EDI837_VALIDATE_${rule.group().toUpperCase()}`);
        if (groupFlag === false) continue;
        issues.push(...rule.validate(doc));
      }
      return issues;
    }

    ruleIds(): string[] {
      return this.rules.map((r) => r.id());
    }
  }
