import { Injectable } from '@nestjs/common';
import { LookupCacheService } from '../cache/lookup-cache.service';

/** Invalidate permanent lookup cache after a successful import commit. */
@Injectable()
export class LookupSyncHelper {
  constructor(private readonly lookupCache: LookupCacheService) {}

  async syncTable(table: string): Promise<void> {
    await this.lookupCache.invalidateTable(table);
  }

  async syncTables(tables: readonly string[]): Promise<void> {
    for (const table of tables) {
      await this.lookupCache.invalidateTable(table);
    }
  }
}
