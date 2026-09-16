import { withTx } from "./tx.js";
import type { Account, Wallet } from "../generated/prisma/client.js";

const ACCOUNTS = [
  {
    name: "Main account",
    steamId64: "76561198954171163",
    registeredAt: new Date("2019-04-13"),
  },
  {
    name: "Sub account (Nitler)",
    steamId64: "76561199086063407",
    registeredAt: new Date("2020-08-27"),
  },
  {
    name: "Farming account 1 (TRALALERO TRALALA)",
    steamId64: "76561199068550920",
    registeredAt: new Date("2020-06-22"),
  },
  {
    name: "Farming account 2 (kwd)",
    steamId64: "76561199087593458",
    registeredAt: new Date("2020-09-02"),
  },
] as const;

const WALLETS = [
  {
    ownerName: "Main account",
    name: "Steam Main (EUR)",
    kind: "STEAM_BALANCE",
    currency: "EUR",
  },
  {
    ownerName: "Sub account (Nitler)",
    name: "Steam Sub (VND)",
    kind: "STEAM_BALANCE",
    currency: "VND_STEAM",
  },
  {
    ownerName: null,
    name: "Tiền mặt VND",
    kind: "CASH",
    currency: "VND",
  },
] as const;

export async function seed(): Promise<{
  accountsLen: number;
  walletsLen: number;
}> {
  const accounts: Account[] = [];
  const wallets: Wallet[] = [];
  const idByName = new Map<string, number>();

  await withTx(async (tx) => {
    for (const acc of ACCOUNTS) {
      const accRow = await tx.account.upsert({
        where: { accountName: acc.name },
        update: { steamId64: acc.steamId64, registeredAt: acc.registeredAt },
        create: {
          accountName: acc.name,
          steamId64: acc.steamId64,
          registeredAt: acc.registeredAt,
        },
      });
      accounts.push(accRow);
      idByName.set(accRow.accountName, accRow.id);
    }

    for (const w of WALLETS) {
      if (w.ownerName === null) {
        const existing = await tx.wallet.findFirst({
          where: {
            accountId: null,
            kind: w.kind,
            currency: w.currency,
          },
        });

        const walletRow =
          existing ??
          (await tx.wallet.create({
            data: {
              accountId: null,
              name: w.name,
              kind: w.kind,
              currency: w.currency,
            },
          }));
        wallets.push(walletRow);
      } else {
        const accountId = idByName.get(w.ownerName);
        if (accountId === undefined) {
          throw new Error(
            `Không tìm thấy account "${w.ownerName}" cho ví "${w.name}"`,
          );
        }
        const walletRow = await tx.wallet.upsert({
          where: {
            accountId_kind_currency: {
              accountId,
              kind: w.kind,
              currency: w.currency,
            },
          },
          update: {
            name: w.name,
          },
          create: {
            accountId,
            name: w.name,
            kind: w.kind,
            currency: w.currency,
          },
        });
        wallets.push(walletRow);
      }
    }
  });
  return {
    accountsLen: accounts.length,
    walletsLen: wallets.length,
  };
}
