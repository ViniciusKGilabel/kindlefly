export type ErrorCode =
  | 'not_connected'
  | 'auth_cancelled'
  | 'auth_failed'
  | 'kindle_address_missing'
  | 'kindle_address_invalid'
  | 'too_large'
  | 'network'
  | 'gmail_error'
  | 'extract_failed';

export const ALL_ERROR_CODES: readonly ErrorCode[] = [
  'not_connected',
  'auth_cancelled',
  'auth_failed',
  'kindle_address_missing',
  'kindle_address_invalid',
  'too_large',
  'network',
  'gmail_error',
  'extract_failed',
];

export class KfError extends Error {
  constructor(
    public code: ErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'KfError';
  }
}
