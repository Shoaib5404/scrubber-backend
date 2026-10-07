import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SCHEDULER_INTERVAL_MS,
  SCHEDULER_LOCK_KEY,
} from './queue.constants';
import { createBullRedisConnection } from './redis.connection';
import { DetectStalledQueuesService } from './detect-stalled-queues.service';

/**
 * Distributed scheduler — only one replica runs detect-stalled-queues
 * (Laravel withoutOverlapping via Redis lock).
 *
 * NOTE (SP-8 Task 20): Laravel's `npi-ordering-referrings:sync` daily 06:00 America/New_York
 * schedule entry is commented out in bootstrap/app.php — it was never enabled in production.
 * Per the Task 20 ruling, this schedule stays DISABLED here too pending product re-approval.
 * Do not add a tick for `npi-ordering-referrings:sync` to this host without that sign-off; run it
 * manually via `npm run cli -- npi-ordering-referrings:sync` in the meantime. See
 * NPI_SYNC_SCHEDULE_ENABLED in env.schema.ts (currently unread by any scheduler — documentation
 * only).
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
  ) {
    this.connection = createBullRedisConnection(config);
    this.lockTtlMs = this.config.get<number>('SCHEDULER_LOCK_TTL_MS', SCHEDULER_INTERVAL_MS - 5_000);
  }

  start(): void {
    this.logger.log('Scheduler host started (detect-stalled-queues every 5m with Redis lock)');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SCHEDULER_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.connection.disconnect();
  }

  /** Exposed for tests — acquire lock then run stalled detection. */
  async tick(): Promise<boolean> {
    const token = `${process.pid}:${Date.now()}`;
    const acquired = await this.connection.set(
      SCHEDULER_LOCK_KEY,
      token,
      'PX',
      Math.max(1_000, this.lockTtlMs),
      'NX',
    );
    if (acquired !== 'OK') {
      this.logger.debug('Scheduler lock held by another replica; skipping tick');
      return false;
    }
    try {
      await this.detectStalled.run();
      return true;
    } finally {
      // Best-effort unlock only if we still own the token
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end`;
      try {
        await this.connection.eval(script, 1, SCHEDULER_LOCK_KEY, token);
      } catch {
        // lock TTL will expire
      }
    }
  }
}
