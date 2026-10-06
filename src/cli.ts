import { Logger } from '@nestjs/common';

/**
 * Nest Commander entrypoint stub.
 * Real Artisan-parity commands land in SP-8 (Phase 12).
 */
async function bootstrap() {
  const logger = new Logger('Cli');
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    logger.log('Neo Scrubber CLI stub (no commands registered yet).');
    logger.log('Usage (future): npm run cli -- <command>');
    logger.log('Commands will be ported from Laravel Artisan in Phase 12.');
    return;
  }

  logger.error(`Unknown command: ${args.join(' ')}`);
  logger.error('No CLI commands are registered yet (Phase 12).');
  process.exitCode = 1;
}

void bootstrap();
