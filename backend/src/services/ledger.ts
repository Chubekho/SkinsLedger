import { type Tx } from "../db/tx.js";
import { DomainError, type DomainWarning } from "../domain/errors.js";
import {
  assertActivityAccountRule,
  assertNonZero,
  isBackdated,
} from "../domain/ledger-rules.js";
import { assertFitsScale } from "../domain/money.js";
import {
  type ActivityType,
  type WalletKind,
  Prisma,
} from "../generated/prisma/client.js";

export type LockedWallet = {
  id: number;
  accountId: number | null;
  kind: WalletKind;
  currency: string;
  isActive: boolean;
};

export type LedgerEntry = { wallet: LockedWallet; amount: Prisma.Decimal };

export async function lockWallet(
  tx: Tx,
  walletId: number,
): Promise<LockedWallet> {
  const rows = await tx.$queryRaw<LockedWallet[]>`
  SELECT id,
         account_id AS "accountId",
         kind,
         currency,
         is_active  AS "isActive"
  FROM wallets
  WHERE id = ${walletId}
  FOR UPDATE
`;
  if (rows[0] === undefined) {
    throw new DomainError(
      "WALLET_NOT_FOUND",
      `Wallet with id = ${walletId} is not found`,
      { walletId },
    );
  }
  return rows[0];
}

export async function getWalletBalance(
  tx: Tx,
  walletId: number,
): Promise<Prisma.Decimal> {
  const result = await tx.walletTransaction.aggregate({
    _sum: { amount: true },
    where: { walletId },
  });
  return result._sum.amount ?? Prisma.Decimal(0);
}

export async function getLatestOccurredAt(
  tx: Tx,
  walletId: number,
): Promise<Date | null> {
  const result = await tx.walletTransaction.aggregate({
    _max: { occurredAt: true },
    where: { walletId },
  });
  return result._max.occurredAt;
}

export async function assertCanApply(
  tx: Tx,
  wallet: LockedWallet,
  amount: Prisma.Decimal,
  occurredAt: Date,
): Promise<DomainWarning | null> {
  if (!wallet.isActive)
    throw new DomainError(
      "WALLET_INACTIVE",
      `Cannot transact with a wallet that has an inactive status.`,
      { walletId: wallet.id, isWalletActive: wallet.isActive },
    );

  assertFitsScale(amount, wallet.currency);
  assertNonZero(amount);
  if (wallet.kind === "CASH") return null;

  const agg = await tx.walletTransaction.aggregate({
    _sum: { amount: true },
    _max: { occurredAt: true },
    where: { walletId: wallet.id },
  });

  const balance = agg._sum.amount ?? new Prisma.Decimal(0);
  const latest = agg._max.occurredAt;

  if (balance.plus(amount).isNegative()) {
    if (isBackdated(occurredAt, latest)) {
      return {
        code: "BACKDATED_NEGATIVE_BALANCE",
        message: `Backdated entry on wallet ${wallet.id} leaves the balance at ${balance.plus(amount).toString()}. Recorded anyway — likely an earlier transaction has not been entered yet.`,
        details: {
          walletId: wallet.id,
          balance: balance.toString(),
          amount: amount.toString(),
          occurredAt: occurredAt.toISOString(),
          latestOccurredAt: latest?.toISOString() ?? null,
        },
      };
    } else {
      throw new DomainError(
        "INSUFFICIENT_STEAM_BALANCE",
        `Wallet ${wallet.id} has ${balance.toString()}, applying ${amount.toString()} would make it negative`,
        {
          walletId: wallet.id,
          balance: balance.toString(),
          amount: amount.toString(),
          resulting: balance.plus(amount).toString(),
        },
      );
    }
  }
  return null;
}

export async function recordActivity(
  tx: Tx,
  input: {
    type: ActivityType;
    accountId: number | null;
    occurredAt: Date;
    note?: string;
    counterparty?: Prisma.InputJsonValue;
    entries: LedgerEntry[];
  },
): Promise<{ activityId: number; warnings: DomainWarning[] }> {
  const { type, accountId, occurredAt, note, counterparty, entries } = input;

  if (entries.length === 0) {
    throw new DomainError(
      "EMPTY_ENTRIES",
      `${type} requires at least one wallet entry`,
      { type },
    );
  }

  const ids = entries.map((e) => e.wallet.id);
  const sorted = [...ids].sort((a, b) => a - b);
  if (ids.join() !== sorted.join()) {
    throw new DomainError(
      "LOCK_ORDER_VIOLATION",
      `Entries must be ordered by wallet id ascending to prevent deadlock, got ${ids.join(", ")}`,
      { walletIds: ids },
    );
  }

  const walletKinds: WalletKind[] = entries.map((e) => e.wallet.kind);
  assertActivityAccountRule({
    type,
    accountId,
    walletKinds,
  });

  const warnings: DomainWarning[] = [];
  for (const e of entries) {
    const warning = await assertCanApply(tx, e.wallet, e.amount, occurredAt);
    if (warning !== null) warnings.push(warning);
  }

  const activity = await tx.activity.create({
    data: { type, accountId, counterparty, note, occurredAt },
  });

  for (const e of entries) {
    await tx.walletTransaction.create({
      data: {
        walletId: e.wallet.id,
        activityId: activity.id,
        amount: e.amount,
        occurredAt: occurredAt,
      },
    });
  }

  return {
    activityId: activity.id,
    warnings,
  };
}
