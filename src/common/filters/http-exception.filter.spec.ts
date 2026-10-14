import {
  BadRequestException,
  ArgumentsHost,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  function createHost(overrides?: {
    requestId?: string;
    url?: string;
    method?: string;
  }) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = {
      requestId: overrides?.requestId ?? 'test-request-id',
      header: jest.fn().mockReturnValue(undefined),
      originalUrl: overrides?.url ?? '/api/v1/auth/login?token=secret',
      url: overrides?.url ?? '/api/v1/auth/login?token=secret',
      method: overrides?.method ?? 'POST',
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    return { host, status, json, request };
  }

  it('returns Problem Details with additive code/requestId and no query secrets', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new UnauthorizedException('Invalid credentials.'), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'about:blank',
        title: 'Invalid credentials.',
        status: 401,
        detail: 'Invalid credentials.',
        code: 'UNAUTHENTICATED',
        requestId: 'test-request-id',
        path: '/api/v1/auth/login',
      }),
    );
  });

  it('never exposes unexpected exception messages in the response body', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error('password=super-secret stack at Object.<anonymous>'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.title).toBe(
      'Something went wrong while processing your request. Please try again.',
    );
    expect(JSON.stringify(body)).not.toMatch(/password|super-secret|stack/i);
  });

  it('keeps joined validation messages for 400 responses', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(
      new BadRequestException({
        message: ['email must be an email'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'email must be an email',
        detail: 'email must be an email',
        code: 'VALIDATION_FAILED',
      }),
    );
  });
});
