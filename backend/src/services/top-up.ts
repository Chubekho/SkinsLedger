import { type Tx } from "../db/tx.js";
import { DomainWarning } from "../domain/errors.js";
import { assertPositive, assertWalletKind } from "../domain/ledger-rules.js";
import { Prisma } from "../generated/prisma/client.js";
import { LedgerEntry, lockWallets, recordActivity } from "./ledger.js";

export async function recordTopUp(
  tx: Tx,
  input: {
    cashWalletId: number;
    steamWalletId: number;
    cashAmount: string;
    steamAmount: string;
    occurredAt: Date;
    note?: string;
  },
): Promise<{ activityId: number; warnings: DomainWarning[] }> {
  const cashAmount = new Prisma.Decimal(input.cashAmount);
  const steamAmount = new Prisma.Decimal(input.steamAmount);
  assertPositive({ cashAmount, steamAmount });

  // Khoá theo id tăng dần, nhưng trả về đúng thứ tự VAI TRÒ đã truyền vào
  const [cashWallet, steamWallet] = await lockWallets(tx, [
    input.cashWalletId,
    input.steamWalletId,
  ]);
  assertWalletKind(cashWallet, "CASH");
  assertWalletKind(steamWallet, "STEAM_BALANCE");

  const entries: LedgerEntry[] = [
    { wallet: cashWallet, amount: cashAmount.neg() },
    { wallet: steamWallet, amount: steamAmount },
  ].sort((a, b) => a.wallet.id - b.wallet.id);

  return recordActivity(tx, {
    type: "TOP_UP",
    accountId: steamWallet.accountId,
    occurredAt: input.occurredAt,
    note: input.note,
    entries,
  });
}
