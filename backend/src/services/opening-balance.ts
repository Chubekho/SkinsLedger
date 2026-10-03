import { type Tx } from "../db/tx.js";
import { type DomainWarning, DomainError } from "../domain/errors.js";
import { Prisma } from "../generated/prisma/client.js";
import { lockWallet, recordActivity } from "./ledger.js";

export async function recordOpeningBalance(
  tx: Tx,
  input: { walletId: number; amount: string; occurredAt: Date; note?: string },
): Promise<{ activityId: number; warnings: DomainWarning[] }> {
  const { walletId, amount, occurredAt, note } = input;
  const openingAmount = new Prisma.Decimal(amount);

  const lockedWallet = await lockWallet(tx, walletId);
  if (lockedWallet.kind === "STEAM_BALANCE" && openingAmount.lt(0))
    throw new DomainError(
      "OPENING_BALANCE_NEGATIVE",
      `Cannot initialize with a negative balance.`,
      { walletId, amount },
    );

  // #12
  const existingOpening = await tx.walletTransaction.findFirst({
    select: { activityId: true },
    where: {
      walletId,
      activity: {
        type: "OPENING_BALANCE",
      },
    },
  });

  if (existingOpening)
    throw new DomainError(
      "OPENING_BALANCE_EXISTS",
      `Wallet with id = ${walletId} already has an opening balance`,
      { walletId, activityId: existingOpening.activityId },
    );

  // #13
  const earliestOccurredAt = (
    await tx.walletTransaction.aggregate({
      _min: { occurredAt: true },
      where: { walletId },
    })
  )._min.occurredAt;

  if (earliestOccurredAt !== null && occurredAt >= earliestOccurredAt)
    throw new DomainError(
      "OPENING_BALANCE_NOT_FIRST",
      `Opening balance for wallet ${walletId} must be strictly earlier than its earliest entry (${earliestOccurredAt.toISOString()}), got ${occurredAt.toISOString()}. Use an earlier date.`,
      {
        walletId,
        occurredAt: occurredAt.toISOString(),
        earliestOccurredAt: earliestOccurredAt.toISOString(),
      },
    );

  return await recordActivity(tx, {
    type: "OPENING_BALANCE",
    accountId: lockedWallet.accountId,
    occurredAt,
    note,
    entries: [{ wallet: lockedWallet, amount: openingAmount }],
  });
}
