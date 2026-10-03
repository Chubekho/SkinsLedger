import { ActivityType, Prisma } from "../../generated/prisma/client.js";
import type { Tx } from "../../db/tx.js";

let seq = 0;
const uniq = (prefix: string) => `${prefix}-${++seq}-${Date.now()}`;

export async function makeAccount(tx: Tx, name?: string) {
  return tx.account.create({
    data: { accountName: name ?? uniq("acc"), registeredAt: new Date() },
  });
}

export async function makeWallet(
  tx: Tx,
  input: {
    kind: "CASH" | "STEAM_BALANCE";
    currency: string;
    accountId?: number | null;
    name?: string;
    isActive?: boolean;
  },
) {
  return tx.wallet.create({
    data: {
      accountId: input.accountId ?? null,
      name: input.name ?? uniq("wallet"),
      kind: input.kind,
      currency: input.currency,
      isActive: input.isActive ?? true,
    },
  });
}

export async function makeSteamWallet(
  tx: Tx,
  overrides: { currency?: string; isActive?: boolean } = {},
) {
  const account = await makeAccount(tx);
  const wallet = await makeWallet(tx, {
    kind: "STEAM_BALANCE",
    currency: overrides.currency ?? "EUR",
    accountId: account.id,
    isActive: overrides.isActive ?? true,
  });
  return { account, wallet };
}

/** Dựng số dư sẵn có mà KHÔNG đi qua service đang được test. */
export async function seedBalance(
  tx: Tx,
  walletId: number,
  amount: string,
  occurredAt: Date,
  accountId: number | null,
  type: ActivityType = "OPENING_BALANCE",
) {
  const activity = await tx.activity.create({
    data: { type, accountId, occurredAt },
  });
  await tx.walletTransaction.create({
    data: {
      walletId,
      activityId: activity.id,
      amount: new Prisma.Decimal(amount),
      occurredAt,
    },
  });
  return activity;
}
