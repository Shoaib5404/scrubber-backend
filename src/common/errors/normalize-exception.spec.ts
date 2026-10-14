import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, SAFE_MESSAGES } from './error-codes';
import { normalizeException } from './normalize-exception';

describe('normalizeException', () => {
  it('preserves user-facing 401 business messages', () => {
    const result = normalizeException(
      new UnauthorizedException('Invalid credentials.'),
    );
    expect(result.status).toBe(401);
    expect(result.body.title).toBe('Invalid credentials.');
    expect(result.body.detail).toBe('Invalid credentials.');
    expect(result.body.code).toBe(ErrorCode.UNAUTHENTICATED);
    expect(result.body.type).toBe('about:blank');
  });

  it('preserves account-deactivated messaging for auth flows', () => {
    const result = normalizeException(
      new UnauthorizedException('Your account has been deactivated.'),
    );
    expect(result.body.title).toBe('Your account has been deactivated.');
  });

  it('preserves structured field errors on 422', () => {
    const result = normalizeException(
      new UnprocessableEntityException({
        message: 'Validation failed',
        errors: { client_id: ['Invalid client credentials.'] },
      }),
    );
    expect(result.status).toBe(422);
    expect(result.body.title).toBe('Validation failed');
    expect(result.body.errors).toEqual({
      client_id: ['Invalid client credentials.'],
    });
  });

  it('maps validation arrays into a joined title without leaking framework names', () => {
    const result = normalizeException(
      new BadRequestException(['email must be an email', 'password must be longer']),
    );
    expect(result.status).toBe(400);
    expect(result.body.title).toContain('email must be an email');
    expect(result.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('keeps forbidden and not-found business messages', () => {
    expect(
      normalizeException(new ForbiddenException('Feature required.')).body.title,
    ).toBe('Feature required.');
    expect(
      normalizeException(new NotFoundException('Batch not found.')).body.title,
    ).toBe('Batch not found.');
    expect(
      normalizeException(new ConflictException('Already exists.')).body.title,
    ).toBe('Already exists.');
  });

  it('hides unexpected exceptions behind a safe public body', () => {
    const result = normalizeException(
      new Error('ECONNREFUSED 127.0.0.1:5432 prisma QueryFailedError'),
    );
    expect(result.status).toBe(500);
    expect(result.body.title).toBe(SAFE_MESSAGES.INTERNAL);
    expect(result.body.detail).toBe('An unexpected error occurred.');
    expect(result.body.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(result.logAsUnexpected).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(/ECONNREFUSED|prisma|5432/i);
  });

  it('maps Prisma unique conflicts to 409 without schema details', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    const result = normalizeException(error);
    expect(result.status).toBe(409);
    expect(result.body.title).toBe(SAFE_MESSAGES.CONFLICT);
    expect(JSON.stringify(result.body)).not.toContain('email');
  });

  it('maps Prisma not-found to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const result = normalizeException(error);
    expect(result.status).toBe(404);
    expect(result.body.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it('includes requestId and sanitized path when provided', () => {
    const result = normalizeException(new NotFoundException('Missing'), {
      requestId: 'req-123',
      path: '/api/v1/batches/1',
    });
    expect(result.body.requestId).toBe('req-123');
    expect(result.body.path).toBe('/api/v1/batches/1');
  });
});
