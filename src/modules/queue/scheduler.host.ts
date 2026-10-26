import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NpiOrderingReferringSyncService } from '../imports/npi-ordering-referring/npi-ordering-referring-sync.service';
import {
  currentNpiSyncSlotKey,
  formatNpiSyncSlots,
  NPI_SYNC_TZ,
} from './npi-sync-schedule';
import {
  NPI_SYNC_LAST_RUN_KEY,
  NPI_SYNC_LOCK_KEY,
  NPI_SYNC_LOCK_TTL_MS,
  SCHEDULER_INTERVAL_MS,
  SCHEDULER_LOCK_KEY,
} from './queue.constants';
import { createBullRedisConnection } from './redis.connection';
import { DetectStalledQueuesService } from './detect-stalled-queues.service';

/**
 * Distributed scheduler:
 * - detect-stalled-queues every 5m (Redis lock, Laravel withoutOverlapping)
 * - optional twice-daily npi-ordering-referrings:sync at 00:00 and 12:00 America/New_York when
 *   `NPI_SYNC_SCHEDULE_ENABLED=true`
 */
@Injectable()
export class SchedulerHost implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerHost.name);
  private readonly connection;
  private timer: NodeJS.Timeout | null = null;
  private readonly lockTtlMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly detectStalled: DetectStalledQueuesService,
    private readonly npiSync: NpiOrderingReferringSyncService,
  ) {
    this.connection = createBullRedisConnection(config);
    this.lockTtlMs = this.config.get<number>('SCHEDULER_LOCK_TTL_MS', SCHEDULER_INTERVAL_MS - 5_000);
  }

  start(): void {
    const npiEnabled = this.config.get<boolean>('NPI_SYNC_SCHEDULE_ENABLED', false);
    this.logger.log(
      `Scheduler host started (detect-stalled-queues every 5m; NPI sync ${
        npiEnabled ? `ENABLED @ ${formatNpiSyncSlots()} ${NPI_SYNC_TZ}` : 'disabled'
      })`,
    );
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SCHEDULER_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.connection.disconnect();
  }

  /** Exposed for tests — stalled detection + optional NPI sync tick. */
  async tick(): Promise<boolean> {
    const stalledRan = await this.runStalledDetection();
    await this.maybeRunNpiSync();
    return stalledRan;
  }

  private async runStalledDetection(): Promise<boolean> {
    const token = `${process.pid}:${Date.now()}`;
    const acquired = await this.connection.set(
      SCHEDULER_LOCK_KEY,
      token,
      'PX',
      Math.max(1_000, this.lockTtlMs),
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.debug('Scheduler lock held by another replica; skipping stalled tick');
      return false;
    }
    try {
      await this.detectStalled.run();
      return true;
    } finally {
      await this.releaseLock(SCHEDULER_LOCK_KEY, token);
    }
  }

  /**
   * Twice-daily at 00:00 and 12:00 America/New_York (Redis slot key + withoutOverlapping lock).
   */
  async maybeRunNpiSync(now: Date = new Date()): Promise<boolean> {
    if (!this.config.get<boolean>('NPI_SYNC_SCHEDULE_ENABLED', false)) {
      return false;
    }

    const slotKey = currentNpiSyncSlotKey(now);
    if (slotKey === null) {
      return false;
    }

    const lastRun = await this.connection.get(NPI_SYNC_LAST_RUN_KEY);
    if (lastRun === slotKey) {
      return false;
    }

    const token = `${process.pid}:npi:${Date.now()}`;
    const acquired = await this.connection.set(
      NPI_SYNC_LOCK_KEY,
      token,
      'PX',
      NPI_SYNC_LOCK_TTL_MS,
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.debug('NPI sync lock held by another replica; skipping');
      return false;
    }

    try {
      const lastAfterLock = await this.connection.get(NPI_SYNC_LAST_RUN_KEY);
      if (lastAfterLock === slotKey) {
        return false;
      }

      this.logger.log(
        `Starting scheduled NPI ordering/referring sync for ${slotKey} (${NPI_SYNC_TZ})`,
      );
      const result = await this.npiSync.run({});
      if (!result.ok) {
        this.logger.error(`Scheduled NPI sync failed: ${result.reason ?? 'unknown'}`);
        return false;
      }

      await this.connection.set(NPI_SYNC_LAST_RUN_KEY, slotKey);
      this.logger.log(
        `Scheduled NPI sync finished for ${slotKey}${result.skipped ? ' (skipped — no new dataset)' : ''}`,
      );
      return true;
    } catch (e: unknown) {
      this.logger.error(
        `Scheduled NPI sync threw: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    } finally {
      await this.releaseLock(NPI_SYNC_LOCK_KEY, token);
    }
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end`;
    try {
      await this.connection.eval(script, 1, key, token);
    } catch {
      // lock TTL will expire
    }
  }
}
