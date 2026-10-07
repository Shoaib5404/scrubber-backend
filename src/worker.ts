import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QueueWorkerHost } from './modules/queue/queue-worker.host';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const host = app.get(QueueWorkerHost);
  await host.start();
  logger.log('BullMQ worker process ready');
}

void bootstrap();
