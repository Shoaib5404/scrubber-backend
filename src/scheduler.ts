import { Logger } from '@nestjs/common';

/**
 * Scheduler entrypoint (Phase 6).
 * Scaffold stub — do not enable recurring jobs until Laravel schedules are inventoried.
 */
async function bootstrap() {
  const logger = new Logger('Scheduler');
  logger.log('Scheduler process started (stub). Implement locked schedules in Phase 6.');
  setInterval(() => undefined, 60_000);
}

void bootstrap();
