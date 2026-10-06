import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { createRuleContext, createStructuralRules } from './rules/pipeline.rules';
import { Edi837RuleContext, Edi837ValidationIssue, Edi837ValidationRule, EdiDocument } from './types';

export class Edi837ValidationPipeline {
  private readonly rules: Edi837ValidationRule[];
  private readonly ctx: Edi837RuleContext;

  constructor(private readonly config: ConfigService) {
    this.rules = createStructuralRules();
    const specPath = resolve(
      process.cwd(),
      this.config.get<string>('EDI837_SPEC_PATH', './edi/837p/models'),
    );
    this.ctx = createRuleContext(specPath);
  }

  validate(doc: EdiDocument): Edi837ValidationIssue[] {
    const enabledRules = this.config.get<string[] | null>('EDI837_ENABLED_RULES', null);
    const issues: Edi837ValidationIssue[] = [];
    for (const rule of this.rules) {
      if (enabledRules && !enabledRules.includes(rule.id())) continue;
      const groupFlag = this.config.get<boolean | undefined>(
        `EDI837_VALIDATE_${rule.group().toUpperCase()}`,
      );
      if (groupFlag === false) continue;
      issues.push(...rule.validate(doc, this.ctx));
    }
    return issues;
  }

  ruleIds(): string[] {
    return this.rules.map((r) => r.id());
  }
}
