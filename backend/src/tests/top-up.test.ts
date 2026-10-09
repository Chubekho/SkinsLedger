import { describe, it, expect, beforeEach } from "vitest";
import { withTx, type Tx } from "../db/tx.js";
import { recordTopUp } from "../services/top-up.js";
import { makeCashWallet, makeSteamWallet } from "./helpers/fixtures.js";
import { resetDb } from "./helpers/reset-db.js";
import { expectBalance, expectDomainError } from "./helpers/assertions.js";
import { Prisma } from "../generated/prisma/client.js";

const T1 = new Date("2026-09-01T00:00:00Z");
const T2 = new Date("2026-09-10T00:00:00Z");

const BASE = { cashAmount: "2100000", steamAmount: "100", occurredAt: T1 };

beforeEach(async () => {
  await resetDb();
});

// Ví nào tạo trước thì id nhỏ hơn (resetDb restart identity).
// Phải test CẢ HAI chiều: viết cứng entries = [cash, steam] chỉ đỏ ở chiều 1,
// viết cứng entries = [steam, cash] chỉ đỏ ở chiều 2.
describe("recordTopUp() — luồng đúng", () => {
  it("id Steam < id cash: trừ cash, cộng Steam, đúng 2 dòng", async () => {
    await withTx(async (tx) => {
      const { account, wallet: steam } = await makeSteamWallet(tx);
      const cash = await makeCashWallet(tx);

      const result = await recordTopUp(tx, {
        ...BASE,
        cashWalletId: cash.id,
        steamWalletId: steam.id,
      });

      const activity = await tx.activity.findUniqueOrThrow({
        where: { id: result.activityId },
      });
      const rows = await tx.walletTransaction.findMany({
        where: { activityId: result.activityId },
      });

      expect(activity.type).toBe("TOP_UP");
      expect(activity.accountId).toBe(account.id);
      expect(activity.occurredAt.getTime()).toBe(T1.getTime());
      expect(rows).toHaveLength(2); // invariant #2
      expect(result.warnings).toEqual([]);
      await expectBalance(tx, cash.id, "-2100000");
      await expectBalance(tx, steam.id, "100");
    });
  });

  it("id cash < id Steam: kết quả y hệt", async () => {
    await withTx(async (tx) => {
      const cash = await makeCashWallet(tx);
      const { wallet: steam } = await makeSteamWallet(tx);

      const result = await recordTopUp(tx, {
        ...BASE,
        cashWalletId: cash.id,
        steamWalletId: steam.id,
      });

      const rows = await tx.walletTransaction.findMany({
        where: { activityId: result.activityId },
      });
      expect(rows).toHaveLength(2);
      await expectBalance(tx, cash.id, "-2100000");
      await expectBalance(tx, steam.id, "100");
    });
  });
});

// Mỗi luật một ca: chỉ chứng minh F2 CÓ GỌI phép kiểm.
// Ca biên (0, -0, nhiều trường) đã nằm ở ledger-rules.test.ts.
describe("recordTopUp() — F2 gọi đủ các phép kiểm", () => {
  it("cashAmount âm → AMOUNT_NOT_POSITIVE", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet: steam } = await makeSteamWallet(tx);
        const cash = await makeCashWallet(tx);
        await recordTopUp(tx, {
          ...BASE,
          cashAmount: "-1",
          cashWalletId: cash.id,
          steamWalletId: steam.id,
        });
      }),
      "AMOUNT_NOT_POSITIVE",
    );
  });

  // Ca thực tế nhất: người gọi truyền nhầm vai. Code cũ gán vai theo kind
  // sẽ lặng lẽ "sửa giúp" ở ca này thay vì báo lỗi.
  it("đảo vai (id Steam vào cashWalletId, id cash vào steamWalletId) → WALLET_KIND_MISMATCH", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet: steam } = await makeSteamWallet(tx);
        const cash = await makeCashWallet(tx);
        await recordTopUp(tx, {
          ...BASE,
          cashWalletId: steam.id,
          steamWalletId: cash.id,
        });
      }),
      "WALLET_KIND_MISMATCH",
    );
  });

  // Vai cash sai, vai Steam đúng → chỉ dòng assertWalletKind(cashWallet, ...) bắt được.
  it("cùng id ví Steam cho cả hai vai → WALLET_KIND_MISMATCH", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet: steam } = await makeSteamWallet(tx);
        await recordTopUp(tx, {
          ...BASE,
          cashWalletId: steam.id,
          steamWalletId: steam.id,
        });
      }),
      "WALLET_KIND_MISMATCH",
    );
  });

  // Vai cash đúng, vai Steam sai → chỉ dòng assertWalletKind(steamWallet, ...) bắt được.
  it("cùng id ví cash cho cả hai vai → WALLET_KIND_MISMATCH", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const cash = await makeCashWallet(tx);
        await recordTopUp(tx, {
          ...BASE,
          cashWalletId: cash.id,
          steamWalletId: cash.id,
        });
      }),
      "WALLET_KIND_MISMATCH",
    );
  });
});

describe("recordTopUp() — tỷ giá suy ra được, không cần lưu (E5)", () => {
  async function topUpRates(tx: Tx) {
    return tx.$queryRaw<{ id: number; gia_nap: Prisma.Decimal }[]>`
      SELECT a.id,
             -MAX(CASE WHEN w.kind = 'CASH' THEN wt.amount END)
             / MAX(CASE WHEN w.kind = 'STEAM_BALANCE' THEN wt.amount END) AS gia_nap
      FROM activities a
      JOIN wallet_transactions wt ON wt.activity_id = a.id
      JOIN wallets w ON w.id = wt.wallet_id
      WHERE a.type = 'TOP_UP'
      GROUP BY a.id
      ORDER BY a.id
    `;
  }

  it("mỗi lần TOP_UP ra đúng tỷ giá của lần đó, không trộn lẫn", async () => {
    await withTx(async (tx) => {
      const { wallet: steam } = await makeSteamWallet(tx);
      const cash = await makeCashWallet(tx);
      const ids = { cashWalletId: cash.id, steamWalletId: steam.id };

      // Hai lần nạp, tỷ giá KHÁC nhau. Recipe gộp sai (quên GROUP BY a.id) sẽ ra một con số trung bình thay vì 21000 và 22000.
      const first = await recordTopUp(tx, {
        ...ids,
        cashAmount: "2100000",
        steamAmount: "100",
        occurredAt: T1,
      });
      const second = await recordTopUp(tx, {
        ...ids,
        cashAmount: "1100000",
        steamAmount: "50",
        occurredAt: T2,
      });

      const rates = await topUpRates(tx);

      expect(rates.map((r) => r.id)).toEqual([
        first.activityId,
        second.activityId,
      ]);
      // numeric chia numeric trong Postgres ra số có nhiều số 0 lẻ (21000.0000…),
      // nên so bằng .eq(), không so chuỗi
      expect(rates[0]?.gia_nap.eq("21000")).toBe(true);
      expect(rates[1]?.gia_nap.eq("22000")).toBe(true);
    });
  });
});
