/**
 * Stable machine-readable error codes for the public API contract.
 * Additive — does not replace the existing Problem Details fields.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  SERVICE_TEMPORARILY_UNAVAILABLE: 'SERVICE_TEMPORARILY_UNAVAILABLE',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  BAD_GATEWAY: 'BAD_GATEWAY',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Safe defaults for unexpected / sensitive failures shown to API consumers. */
export const SAFE_MESSAGES = {
  INTERNAL:
    'Something went wrong while processing your request. Please try again.',
  UNAVAILABLE: 'This service is temporarily unavailable. Please try again shortly.',
  TIMEOUT: 'This request is taking longer than expected. Please try again.',
  BAD_GATEWAY: 'An upstream service failed. Please try again shortly.',
  NETWORK_GENERIC: 'We could not complete your request. Please try again.',
  CONFLICT:
    'This information conflicts with an existing record. Please review it and try again.',
  NOT_FOUND: 'We could not find the requested record.',
  RATE_LIMIT: "You're making requests too quickly. Please wait a moment and try again.",
  PAYLOAD_TOO_LARGE:
    'This file or request is too large. Please reduce its size and try again.',
  VALIDATION: 'Please check the highlighted fields and try again.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  ACCESS_DENIED: "You don't have permission to perform this action.",
} as const;

export function errorCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.ACCESS_DENIED;
    case 404:
      return ErrorCode.RESOURCE_NOT_FOUND;
    case 409:
      return ErrorCode.RESOURCE_CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 422:
      return ErrorCode.UNPROCESSABLE_ENTITY;
    case 429:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case 502:
      return ErrorCode.BAD_GATEWAY;
    case 503:
      return ErrorCode.SERVICE_TEMPORARILY_UNAVAILABLE;
    case 504:
      return ErrorCode.REQUEST_TIMEOUT;
    default:
      return status >= 500
        ? ErrorCode.INTERNAL_SERVER_ERROR
        : ErrorCode.VALIDATION_FAILED;
  }
}
