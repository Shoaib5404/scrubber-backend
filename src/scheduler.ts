import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SchedulerHost } from './modules/queue/scheduler.host';

async function bootstrap() {
  const logger = new Logger('Scheduler');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const host = app.get(SchedulerHost);
  host.start();
  logger.log(
    'Scheduler process ready (detect-stalled-queues; optional NPI daily sync via NPI_SYNC_SCHEDULE_ENABLED)',
  );
}

void bootstrap();
