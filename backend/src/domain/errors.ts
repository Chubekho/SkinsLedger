export const DOMAIN_ERROR_CODES = [
  'WALLET_NOT_FOUND',
  'WALLET_INACTIVE',
  'WALLET_KIND_MISMATCH',
  'CURRENCY_UNKNOWN',
  'AMOUNT_SCALE_EXCEEDED',
  'AMOUNT_ZERO',
  'AMOUNT_NOT_POSITIVE',
  'INSUFFICIENT_STEAM_BALANCE',
  'OPENING_BALANCE_EXISTS',
  'NO_ACTIVE_STEAM_WALLET',
  'STEAM_BALANCE_MISMATCH',
  'ACTIVITY_ACCOUNT_RULE',
  'VOID_NOT_SUPPORTED',
  'EMPTY_ENTRIES',
  'LOCK_ORDER_VIOLATION'
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export type DomainWarning = {
  readonly code: 'BACKDATED_NEGATIVE_BALANCE';
  readonly message: string;
  readonly details?: Record<string, unknown>;
};