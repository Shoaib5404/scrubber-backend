import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  SAFE_MESSAGES,
  errorCodeForStatus,
} from './error-codes';

export type PublicErrorBody = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: ErrorCode;
  requestId?: string;
  path?: string;
  /** Preserved when the application already returned structured field errors. */
  errors?: Record<string, string[]>;
};

export type NormalizedException = {
  status: number;
  body: PublicErrorBody;
  /** True when the failure should be logged as unexpected. */
  logAsUnexpected: boolean;
  original: unknown;
};

const TECHNICAL_TITLE_PATTERNS: RegExp[] = [
  /^internal server error$/i,
  /^http exception$/i,
  /prisma/i,
  /queryfailederror/i,
  /econnrefused/i,
  /etimedout/i,
  /enotfound/i,
  /socket hang up/i,
  /stack trace/i,
  // Stack-frame style: "at Object.<anonymous> (file:line:col)"
  /\bat\s+\S+\s+\([^)]+:\d+:\d+\)/i,
  /select\s+.+\s+from\s+/i,
  /insert\s+into\s+/i,
  /update\s+.+\s+set\s+/i,
  // Likely secret leakage (not ordinary words like "password" / "credentials")
  /password\s*[=:]/i,
  /secret\s*[=:]/i,
  /access[_-]?key\s*[=:]/i,
  /private[_-]?key\s*[=:]/i,
  /bearer\s+[a-z0-9\-._~+/]+=*/i,
];

function isTechnicalMessage(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return TECHNICAL_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function safePublicMessage(status: number, candidate: string | null): string {
  if (candidate && !isTechnicalMessage(candidate) && status < 500) {
    return candidate;
  }

  switch (status) {
    case 401:
      return candidate && !isTechnicalMessage(candidate)
        ? candidate
        : SAFE_MESSAGES.UNAUTHENTICATED;
    case 403:
      return candidate && !isTechnicalMessage(candidate)
        ? candidate
        : SAFE_MESSAGES.ACCESS_DENIED;
    case 404:
      return candidate && !isTechnicalMessage(candidate)
        ? candidate
        : SAFE_MESSAGES.NOT_FOUND;
    case 409:
      return candidate && !isTechnicalMessage(candidate)
        ? candidate
        : SAFE_MESSAGES.CONFLICT;
    case 413:
      return SAFE_MESSAGES.PAYLOAD_TOO_LARGE;
    case 429:
      return SAFE_MESSAGES.RATE_LIMIT;
    case 502:
      return SAFE_MESSAGES.BAD_GATEWAY;
    case 503:
      return SAFE_MESSAGES.UNAVAILABLE;
    case 504:
      return SAFE_MESSAGES.TIMEOUT;
    default:
      if (status >= 500) {
        return SAFE_MESSAGES.INTERNAL;
      }
      return candidate && !isTechnicalMessage(candidate)
        ? candidate
        : SAFE_MESSAGES.VALIDATION;
  }
}

function extractMessage(exceptionResponse: unknown): string | null {
  if (typeof exceptionResponse === 'string') {
    return exceptionResponse;
  }
  if (
    typeof exceptionResponse === 'object' &&
    exceptionResponse !== null &&
    'message' in exceptionResponse
  ) {
    const message = (exceptionResponse as { message: unknown }).message;
    if (Array.isArray(message)) {
      return message.map(String).join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return null;
}

function extractErrors(
  exceptionResponse: unknown,
): Record<string, string[]> | undefined {
  if (
    typeof exceptionResponse !== 'object' ||
    exceptionResponse === null ||
    !('errors' in exceptionResponse)
  ) {
    return undefined;
  }

  const errors = (exceptionResponse as { errors: unknown }).errors;
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) {
    return undefined;
  }

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = value;
    } else if (typeof value === 'string') {
      result[key] = [value];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mapPrismaException(exception: unknown): {
  status: number;
  message: string;
  code: ErrorCode;
} | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        message: SAFE_MESSAGES.CONFLICT,
        code: ErrorCode.RESOURCE_CONFLICT,
      };
    }
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: SAFE_MESSAGES.NOT_FOUND,
        code: ErrorCode.RESOURCE_NOT_FOUND,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: SAFE_MESSAGES.INTERNAL,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
    };
  }

  if (
    exception instanceof Prisma.PrismaClientInitializationError ||
    exception instanceof Prisma.PrismaClientRustPanicError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: SAFE_MESSAGES.UNAVAILABLE,
      code: ErrorCode.SERVICE_TEMPORARILY_UNAVAILABLE,
    };
  }

  return null;
}

export function normalizeException(
  exception: unknown,
  options: { requestId?: string; path?: string } = {},
): NormalizedException {
  const prismaMapped = mapPrismaException(exception);
  if (prismaMapped) {
    const title = prismaMapped.message;
    return {
      status: prismaMapped.status,
      logAsUnexpected: prismaMapped.status >= 500,
      original: exception,
      body: {
        type: 'about:blank',
        title,
        status: prismaMapped.status,
        detail:
          prismaMapped.status >= 500
            ? 'An unexpected error occurred.'
            : title,
        code: prismaMapped.code,
        requestId: options.requestId,
        path: options.path,
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const rawMessage = extractMessage(exceptionResponse);
    const title = safePublicMessage(status, rawMessage);
    const errors = extractErrors(exceptionResponse);

    return {
      status,
      logAsUnexpected: status >= 500,
      original: exception,
      body: {
        type: 'about:blank',
        title,
        status,
        detail: status >= 500 ? 'An unexpected error occurred.' : title,
        code: errorCodeForStatus(status),
        requestId: options.requestId,
        path: options.path,
        ...(errors ? { errors } : {}),
      },
    };
  }

  const status = HttpStatus.INTERNAL_SERVER_ERROR;
  return {
    status,
    logAsUnexpected: true,
    original: exception,
    body: {
      type: 'about:blank',
      title: SAFE_MESSAGES.INTERNAL,
      status,
      detail: 'An unexpected error occurred.',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      requestId: options.requestId,
      path: options.path,
    },
  };
}
