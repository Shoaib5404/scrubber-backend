import { Injectable } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { EdiDocumentBuilder } from './document.builder';
  import { Edi837ValidationPipeline } from './pipeline';
  import { IsaPreValidator } from './support/isa-pre.validator';
  import { Edi837ValidationResultDto, issue, toResult, isBlocking } from './types';

  @Injectable()
  export class Edi837ValidationService {
    private readonly pre = new IsaPreValidator();
    private readonly builder = new EdiDocumentBuilder();
    private readonly pipeline: Edi837ValidationPipeline;

    constructor(private readonly config: ConfigService) {
      this.pipeline = new Edi837ValidationPipeline(config);
    }

    validate(ediContent: string): Edi837ValidationResultDto {
      if (!this.config.get<boolean>('EDI837_VALIDATION_ENABLED', true)) {
        return toResult([]);
      }

      const issues = this.pre.validate(ediContent);
      if (issues.some(isBlocking)) {
        return toResult(issues);
      }

      try {
        const doc = this.builder.build(ediContent);
        issues.push(...this.pipeline.validate(doc));
      } catch (e) {
        issues.push(
          issue(
            'ENV-PARSE',
            'error',
            e instanceof Error ? e.message : 'EDI parse failed',
            'envelope',
          ),
        );
      }

      return toResult(issues);
    }

    registeredRuleIds(): string[] {
      return this.pipeline.ruleIds();
    }
  }
