import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { LookupImportVerifyService } from '../cache/lookup-import-verify.service';

interface Options {
  list?: boolean;
}

/**
 * Dummy-row verification for import → Redis lookup cache:
 * insert 1–2 rows → invalidate+warm → assert Redis → flush Redis → delete DB rows.
 */
@Command({
  name: 'redis:verify-lookup-imports',
  arguments: '[tables...]',
  description:
    'Verify lookup tables: dummy DB rows → Redis warm → assert markers → flush Redis + DB',
  argsDescription: {
    tables: 'Optional subset of fixture tables; default = all fixtures',
  },
})
export class RedisVerifyLookupImportsCommand extends CommandRunner {
  private readonly logger = new Logger(RedisVerifyLookupImportsCommand.name);

  constructor(private readonly verify: LookupImportVerifyService) {
    super();
  }

  async run(passedParams: string[], options: Options): Promise<void> {
    if (options.list) {
      for (const f of this.verify.fixtures()) {
        this.logger.log(`  ${f.table}`);
      }
      return;
    }

    const tables = passedParams.length > 0 ? passedParams : undefined;
    this.logger.log(
      tables
        ? `Verifying ${tables.length} table(s): ${tables.join(', ')}`
        : `Verifying all ${this.verify.fixtures().length} fixture table(s)…`,
    );

    const results = await this.verify.verifyAll(tables);
    let failed = 0;
    for (const r of results) {
      if (r.ok) {
        this.logger.log(`OK  ${r.table}  (${r.steps.length} steps)`);
      } else {
        failed += 1;
        this.logger.error(`FAIL ${r.table}: ${r.error}`);
        this.logger.error(`     steps: ${r.steps.join(' → ')}`);
      }
    }

    this.logger.log(`Done: ${results.length - failed}/${results.length} passed`);
    if (failed > 0) process.exitCode = 1;
  }

  @Option({
    flags: '--list',
    description: 'List fixture tables and exit',
  })
  parseList(): boolean {
    return true;
  }
}
