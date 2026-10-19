export type ErrorCode =
  | 'not_connected'
  | 'auth_cancelled'
  | 'auth_failed'
  | 'scope_missing'
  | 'kindle_address_missing'
  | 'kindle_address_invalid'
  | 'too_large'
  | 'network'
  | 'gmail_error'
  | 'extract_failed'
  | 'restricted_page';

export const ALL_ERROR_CODES: readonly ErrorCode[] = [
  'not_connected',
  'auth_cancelled',
  'auth_failed',
  'scope_missing',
  'kindle_address_missing',
  'kindle_address_invalid',
  'too_large',
  'network',
  'gmail_error',
  'extract_failed',
  'restricted_page',
];

export class KfError extends Error {
  constructor(
    public code: ErrorCode,
    detail?: string,
    /** HTTP status (gmail_error). */
    public status?: number,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'KfError';
  }
}
