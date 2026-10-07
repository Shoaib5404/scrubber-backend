import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { ClaimValidationModule } from '../claim-validation/claim-validation.module';
import { EdiParserModule } from '../edi-parser/edi-parser.module';
import { PasswordService } from '../auth/password.service';
import { QueueModule } from '../queue/queue.module';
import { ApiClientCreateCommand } from './api-client-create.command';
import { ApiClientIssuerService } from './api-client-issuer.service';
import { BatchTestCommand } from './batch-test.command';
import { BatchValidateCommand } from './batch-validate.command';
import { DetectStalledQueuesCommand } from './detect-stalled-queues.command';
import { EdiParseCommand } from './edi-parse.command';
import { NcciRulesCacheFetchCommand } from './ncci-rules-cache-fetch.command';
import { QueueTestCommand } from './queue-test.command';
import { ReferenceApiIssueCommand } from './reference-api-issue.command';
import { RedisFlushCommand } from './redis-flush.command';
import { RedisLookupFlushCommand } from './redis-lookup-flush.command';
import { RedisLookupStatusCommand } from './redis-lookup-status.command';
import { RedisSeedLookupsCommand } from './redis-seed-lookups.command';
import { StatusCheckCommand } from './status-check.command';

/**
 * SP-8 Task 19 group 9 — small CLI module for ops commands that don't belong under
 * ImportsModule: NCCI cache inspection, lookup-cache maintenance, and stalled-queue
 * detection. LookupCacheModule/NcciRulesCacheService are `@Global()` (see
 * lookup-cache.module.ts), so only QueueModule needs an explicit import here
 * (for DetectStalledQueuesService).
 *
 * SP-8 Task 19 group 10 — api-client:create, reference-api:issue, redis:flush,
 * status:check, batch:validate, edi:parse, queue:test, batch:test.
 *
 * `BatchesModule`, `ClaimValidationModule`, and `EdiParserModule` are imported directly
 * (not just transitively via `QueueModule`/`BatchesModule`) because none of them export the
 * providers this group needs (`BatchIngestService`, `ClaimValidationService`,
 * `ModelDrivenEdiParser`) through `QueueModule`'s own `exports` array — Nest module
 * encapsulation requires importing the module that actually exports a provider, not just a
 * module that happens to import it. `PrismaModule`/`LookupCacheModule` stay implicit via
 * their `@Global()` registration in `CliModule`. `PasswordService` is a plain,
 * dependency-free `@Injectable` (no `AuthModule` import needed — pulling in the full
 * `AuthModule` would also register its global HTTP guards, e.g. `ThrottlerGuard`, which have
 * no place in a `nest-commander` process and are deliberately avoided here).
 *
 * `BatchesModule` and `QueueModule` have their own mutual `forwardRef()` (see
 * `batches.module.ts` / `queue.module.ts`); importing both of them here, as a third,
 * non-cyclic consumer, does not reintroduce that cycle.
 */
@Module({
  imports: [QueueModule, BatchesModule, ClaimValidationModule, EdiParserModule],
  providers: [
    NcciRulesCacheFetchCommand,
    RedisLookupFlushCommand,
    RedisLookupStatusCommand,
    RedisSeedLookupsCommand,
    DetectStalledQueuesCommand,
    PasswordService,
    ApiClientIssuerService,
    ApiClientCreateCommand,
    ReferenceApiIssueCommand,
    RedisFlushCommand,
    StatusCheckCommand,
    BatchValidateCommand,
    EdiParseCommand,
    QueueTestCommand,
    BatchTestCommand,
  ],
})
export class OpsCliModule {}
