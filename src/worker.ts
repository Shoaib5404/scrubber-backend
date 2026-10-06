import { Logger } from '@nestjs/common';

/**
 * BullMQ worker entrypoint (Phase 6).
 * Scaffold stub — do not process jobs until queue modules are implemented.
 */
async function bootstrap() {
  const logger = new Logger('Worker');
  logger.log('Worker process started (stub). Implement BullMQ consumers in Phase 6.');
  // Keep process alive for local docker health checks during scaffold.
  setInterval(() => undefined, 60_000);
}

void bootstrap();
