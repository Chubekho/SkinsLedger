import { DomainError } from "./errors.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ActivityType, WalletKind } from "../generated/prisma/client.js";

export function assertActivityAccountRule(input: {
  type: ActivityType;
  accountId: number | null;
  walletKinds: WalletKind[];
}): void {
  const { type, accountId, walletKinds } = input;

  if (accountId !== null) return;

  if (type !== "OPENING_BALANCE") {
    throw new DomainError(
      "ACTIVITY_ACCOUNT_RULE",
      `${type} requires an accountId; only OPENING_BALANCE may omit it`,
      { type, walletKinds },
    );
  }

  const nonCash = walletKinds.filter((k) => k !== "CASH");
  if (nonCash.length > 0) {
    throw new DomainError(
      "ACTIVITY_ACCOUNT_RULE",
      `OPENING_BALANCE without accountId may only touch CASH wallets, got ${nonCash.join(", ")}`,
      { type, walletKinds },
    );
  }
}

export function assertNonZero(amount: Prisma.Decimal): void {
  if (amount.isZero())
    throw new DomainError(
      "AMOUNT_ZERO",
      "Wallet transaction amount must not be zero",
      { amount: amount.toString() },
    );
}

export function assertWalletKind(
  wallet: { id: number; kind: WalletKind },
  expected: WalletKind,
): void {
  if (wallet.kind !== expected)
    throw new DomainError(
      "WALLET_KIND_MISMATCH",
      `Wallet ${wallet.id} must be ${expected}, got ${wallet.kind}`,
      { walletId: wallet.id, expected, actual: wallet.kind },
    );
}

export function assertPositive(amounts: Record<string, Prisma.Decimal>): void {
  const nonPositive: Record<string, string> = {};
  for (const [field, value] of Object.entries(amounts)) {
    if (value.lte(0)) nonPositive[field] = value.toString();
  }

  const fields = Object.keys(nonPositive); 
  if (fields.length > 0)
    throw new DomainError(
      "AMOUNT_NOT_POSITIVE",
      `Amounts must be positive: ${fields.join(", ")}`,
      { nonPositive },
    );
}

export function isBackdated(
  occurredAt: Date,
  latestOccurredAt: Date | null,
): boolean {
  if (latestOccurredAt === null) return false;

  return occurredAt < latestOccurredAt;
}
