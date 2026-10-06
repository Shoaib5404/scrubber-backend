import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const title =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            'message' in exceptionResponse
          ? Array.isArray((exceptionResponse as { message: unknown }).message)
            ? (exceptionResponse as { message: string[] }).message.join(', ')
            : String((exceptionResponse as { message: unknown }).message)
          : 'Internal Server Error';

    if (status >= 500) {
      this.logger.error(exception);
    }

    response.status(status).json({
      type: 'about:blank',
      title,
      status,
      detail: status >= 500 ? 'An unexpected error occurred.' : title,
    });
  }
}
