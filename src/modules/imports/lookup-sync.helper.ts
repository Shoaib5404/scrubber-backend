import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { LookupWarmService } from '../cache/lookup-warm.service';

/**
 * Post-import lookup cache sync: invalidate Redis DB 1 for the table, then
 * optionally warm from Postgres (LOOKUP_CACHE_WARM_ON_IMPORT).
 * Failures are logged — imports must not fail because Redis is down.
 */
@Injectable()
export class LookupSyncHelper {
  private readonly logger = new Logger(LookupSyncHelper.name);

  constructor(
    private readonly lookupCache: LookupCacheService,
    private readonly warm: LookupWarmService,
    private readonly config: ConfigService,
  ) {}

  async syncTable(table: string): Promise<void> {
    try {
      await this.lookupCache.invalidateTable(table);
      if (
        this.lookupCache.isEnabled() &&
        this.config.get<boolean>('LOOKUP_CACHE_WARM_ON_IMPORT', true)
      ) {
        const result = await this.warm.warmTable(table);
        if (!result.ok) {
          this.logger.warn(`Lookup warm after import [${table}]: ${result.detail}`);
        }
      }
    } catch (e) {
      this.logger.warn(
        `Lookup sync after import [${table}] failed (import still OK): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async syncTables(tables: readonly string[]): Promise<void> {
    for (const table of tables) {
      await this.syncTable(table);
    }
  }
}
