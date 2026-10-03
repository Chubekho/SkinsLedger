export const DOMAIN_ERROR_CODES = [
  // ── Wallet ──────────────────────────────────────────────
  "WALLET_NOT_FOUND",
  "WALLET_INACTIVE",
  "WALLET_KIND_MISMATCH",
  "NO_ACTIVE_STEAM_WALLET",

  // ── Amount & currency ───────────────────────────────────
  "CURRENCY_UNKNOWN",
  "AMOUNT_SCALE_EXCEEDED",
  "AMOUNT_ZERO",
  "AMOUNT_NOT_POSITIVE",

  // ── Balance (#5, đối soát F3) ───────────────────────────
  "INSUFFICIENT_STEAM_BALANCE",
  "STEAM_BALANCE_MISMATCH",

  // ── Opening balance (F1, #12, #13) ──────────────────────
  "OPENING_BALANCE_EXISTS",
  "OPENING_BALANCE_NEGATIVE",
  "OPENING_BALANCE_NOT_FIRST",

  // ── Activity / ledger (recordActivity, voidActivity) ────
  "ACTIVITY_ACCOUNT_RULE",
  "EMPTY_ENTRIES",
  "LOCK_ORDER_VIOLATION",
  "VOID_NOT_SUPPORTED",
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
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export type DomainWarning = {
  readonly code: "BACKDATED_NEGATIVE_BALANCE";
  readonly message: string;
  readonly details?: Record<string, unknown>;
};
