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

export function isBackdated(
  occurredAt: Date,
  latestOccurredAt: Date | null,
): boolean {
  if (latestOccurredAt === null) return false;

  return occurredAt < latestOccurredAt;
}

export function assertNonZero(amount: Prisma.Decimal): void {
  if (amount.isZero())
    throw new DomainError(
      "AMOUNT_ZERO",
      "Wallet transaction amount must not be zero",
      { amount: amount.toString() },
    );
}
