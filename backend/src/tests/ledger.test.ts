import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db/client.js";
import { describe, it, expect, beforeEach } from "vitest";
import { withTx, type Tx } from "../db/tx.js";
import {
  assertCanApply,
  getWalletBalance,
  lockWallet,
  lockWallets,
  recordActivity,
} from "../services/ledger.js";
import { resetDb } from "./helpers/reset-db.js";
import {
  makeAccount,
  makeCashWallet,
  makeSteamWallet,
  makeWallet,
  seedBalance,
} from "./helpers/fixtures.js";
import { expectBalance, expectDomainError } from "./helpers/assertions.js";

beforeEach(async () => {
  await resetDb();
});

const T1 = new Date("2026-09-01T00:00:00Z");
const T2 = new Date("2026-09-10T00:00:00Z");
const T3 = new Date("2026-09-20T00:00:00Z");

describe("lockWallet", () => {
  it("id không tồn tại → WALLET_NOT_FOUND", async () => {
    await expect(withTx(async (tx) => lockWallet(tx, 999_999))).rejects.toThrow(
      expect.objectContaining({ code: "WALLET_NOT_FOUND" }),
    );
  });

  it("map đúng từng cột snake_case sang camelCase", async () => {
    const { account, wallet, locked } = await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      return { account, wallet, locked: await lockWallet(tx, wallet.id) };
    });

    expect(locked).toEqual({
      id: wallet.id,
      accountId: account.id,
      kind: "STEAM_BALANCE",
      currency: "EUR",
      isActive: true,
    });
  });

  it("ví CASH có accountId = null", async () => {
    const locked = await withTx(async (tx) => {
      const wallet = await makeWallet(tx, { kind: "CASH", currency: "VND" });
      return lockWallet(tx, wallet.id);
    });

    expect(locked.accountId).toBeNull();
  });
});

describe("getWalletBalance", () => {
  it("ví rỗng → 0, không phải null", async () => {
    const balance = await withTx(async (tx) => {
      const { wallet } = await makeSteamWallet(tx);
      return getWalletBalance(tx, wallet.id);
    });

    expect(balance.equals(0)).toBe(true);
  });

  it("cộng đúng nhiều dòng", async () => {
    const balance = await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      await seedBalance(tx, wallet.id, "50", T1, account.id);
      await seedBalance(tx, wallet.id, "12.34", T2, account.id);
      return getWalletBalance(tx, wallet.id);
    });

    expect(balance.toString()).toBe("62.34");
  });
});

describe("assertCanApply", () => {
  it("ví Steam có 50, rút 80 nối cuối sổ → INSUFFICIENT_STEAM_BALANCE", async () => {
    await expect(
      withTx(async (tx) => {
        const { account, wallet } = await makeSteamWallet(tx);
        const locked = await lockWallet(tx, wallet.id);
        await seedBalance(tx, wallet.id, "50", T1, account.id);
        return assertCanApply(tx, locked, new Prisma.Decimal("-80"), T2);
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_STEAM_BALANCE" }),
    );
  });

  it("ví Steam có 50, rút 80 chèn giữa lịch sử → warning, không throw", async () => {
    const warning = await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      const locked = await lockWallet(tx, wallet.id);
      await seedBalance(tx, wallet.id, "50", T2, account.id);
      return assertCanApply(tx, locked, new Prisma.Decimal("-80"), T1);
    });

    expect(warning).toMatchObject({ code: "BACKDATED_NEGATIVE_BALANCE" });
  });

  it("ví CASH âm → hợp lệ, không warning", async () => {
    const warning = await withTx(async (tx) => {
      const wallet = await makeWallet(tx, { kind: "CASH", currency: "VND" });
      const locked = await lockWallet(tx, wallet.id);
      return assertCanApply(tx, locked, new Prisma.Decimal("-999"), T1);
    });

    expect(warning).toBeNull();
  });

  it("ví inactive → WALLET_INACTIVE", async () => {
    await expect(
      withTx(async (tx) => {
        const wallet = await makeWallet(tx, {
          kind: "CASH",
          currency: "VND",
          isActive: false,
        });
        const locked = await lockWallet(tx, wallet.id);
        return assertCanApply(tx, locked, new Prisma.Decimal("123"), T1);
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "WALLET_INACTIVE" }));
  });

  it("số lẻ vượt scale của ví → AMOUNT_SCALE_EXCEEDED", async () => {
    await expect(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        const locked = await lockWallet(tx, wallet.id);
        return assertCanApply(tx, locked, new Prisma.Decimal("12.505"), T1);
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "AMOUNT_SCALE_EXCEEDED" }),
    );
  });

  it("amount = 0 → AMOUNT_ZERO", async () => {
    await expect(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        const locked = await lockWallet(tx, wallet.id);
        return assertCanApply(tx, locked, new Prisma.Decimal("0"), T1);
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "AMOUNT_ZERO" }));
  });
});

describe("recordActivity", () => {
  it("TOP_UP mà accountId null → ACTIVITY_ACCOUNT_RULE", async () => {
    await expect(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        const locked = await lockWallet(tx, wallet.id);
        return recordActivity(tx, {
          type: "TOP_UP",
          accountId: null,
          occurredAt: T1,
          entries: [{ wallet: locked, amount: new Prisma.Decimal("36") }],
        });
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "ACTIVITY_ACCOUNT_RULE" }),
    );
  });

  it("OPENING_BALANCE ví Steam mà accountId null → ACTIVITY_ACCOUNT_RULE", async () => {
    await expect(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        const locked = await lockWallet(tx, wallet.id);
        return recordActivity(tx, {
          type: "OPENING_BALANCE",
          accountId: null,
          occurredAt: T1,
          entries: [{ wallet: locked, amount: new Prisma.Decimal("36") }],
        });
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "ACTIVITY_ACCOUNT_RULE" }),
    );
  });

  it("OPENING_BALANCE ví CASH accountId null → ghi đúng 1 activity + 1 dòng tiền", async () => {
    const { activityId, warnings } = await withTx(async (tx) => {
      const cashWallet = await makeCashWallet(tx);
      const locked = await lockWallet(tx, cashWallet.id);
      return recordActivity(tx, {
        type: "OPENING_BALANCE",
        accountId: null,
        occurredAt: T1,
        note: "vốn khởi tạo",
        entries: [{ wallet: locked, amount: new Prisma.Decimal("36") }],
      });
    });

    expect(warnings).toEqual([]);

    const activity = await prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      include: { walletTransactions: true },
    });

    expect(activity.type).toBe("OPENING_BALANCE");
    expect(activity.accountId).toBeNull();
    expect(activity.occurredAt).toEqual(T1);
    expect(activity.walletTransactions).toHaveLength(1);
    expect(activity.walletTransactions[0]?.amount.toString()).toBe("36");
    expect(activity.walletTransactions[0]?.occurredAt).toEqual(T1);
  });

  it("entries rỗng → EMPTY_ENTRIES", async () => {
    await expect(
      withTx(async (tx) =>
        recordActivity(tx, {
          type: "OPENING_BALANCE",
          accountId: null,
          occurredAt: T1,
          entries: [],
        }),
      ),
    ).rejects.toThrow(expect.objectContaining({ code: "EMPTY_ENTRIES" }));
  });

  it("entries không sắp theo walletId tăng dần → LOCK_ORDER_VIOLATION", async () => {
    await expect(
      withTx(async (tx) => {
        const account = await makeAccount(tx);
        const cash = await makeWallet(tx, { kind: "CASH", currency: "VND" });
        const steam = await makeWallet(tx, {
          kind: "STEAM_BALANCE",
          currency: "EUR",
          accountId: account.id,
        });
        const lockedSteam = await lockWallet(tx, steam.id);
        const lockedCash = await lockWallet(tx, cash.id);

        // accountId có giá trị → #11 không nổ, chắc chắn lỗi là do THỨ TỰ
        return recordActivity(tx, {
          type: "TOP_UP",
          accountId: account.id,
          occurredAt: T1,
          entries: [
            { wallet: lockedSteam, amount: new Prisma.Decimal("100") },
            { wallet: lockedCash, amount: new Prisma.Decimal("-2100000") },
          ],
        });
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "LOCK_ORDER_VIOLATION" }),
    );
  });

  it("một entry lỗi → không ghi gì cả", async () => {
    await expect(
      withTx(async (tx) => {
        const account = await makeAccount(tx);
        const cash = await makeWallet(tx, { kind: "CASH", currency: "VND" });
        const steam = await makeWallet(tx, {
          kind: "STEAM_BALANCE",
          currency: "EUR",
          accountId: account.id,
        });
        // cash tạo trước nên id nhỏ hơn → khoá và xếp entry theo đúng thứ tự
        const lockedCash = await lockWallet(tx, cash.id);
        const lockedSteam = await lockWallet(tx, steam.id);

        return recordActivity(tx, {
          type: "TOP_UP",
          accountId: account.id,
          occurredAt: T1,
          entries: [
            { wallet: lockedCash, amount: new Prisma.Decimal("-999") }, // hợp lệ
            { wallet: lockedSteam, amount: new Prisma.Decimal("-80") }, // ví rỗng → lỗi
          ],
        });
      }),
    ).rejects.toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_STEAM_BALANCE" }),
    );

    expect(await prisma.activity.count()).toBe(0);
    expect(await prisma.walletTransaction.count()).toBe(0);
  });
});

describe("recordActivity() — #13 vế 2: dòng tiền phải sau opening", () => {
  async function writeEntry(
    tx: Tx,
    walletId: number,
    accountId: number,
    occurredAt: Date,
  ) {
    const wallet = await lockWallet(tx, walletId);
    return recordActivity(tx, {
      type: "TOP_UP",
      accountId,
      occurredAt,
      entries: [{ wallet, amount: new Prisma.Decimal("10") }],
    });
  }
  
  it("ghi TRƯỚC mốc opening → ENTRY_BEFORE_OPENING", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { account, wallet } = await makeSteamWallet(tx);
        await seedBalance(tx, wallet.id, "100", T2, account.id); // opening
        await writeEntry(tx, wallet.id, account.id, T1);
      }),
      "ENTRY_BEFORE_OPENING",
    );
  });

  it("ghi BẰNG mốc opening → ENTRY_BEFORE_OPENING", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { account, wallet } = await makeSteamWallet(tx);
        await seedBalance(tx, wallet.id, "100", T2, account.id);
        await writeEntry(tx, wallet.id, account.id, T2);
      }),
      "ENTRY_BEFORE_OPENING",
    );
  });

  it("ghi SAU mốc opening → qua", async () => {
    await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      await seedBalance(tx, wallet.id, "100", T2, account.id);
      await writeEntry(tx, wallet.id, account.id, T3);
      await expectBalance(tx, wallet.id, "110");
    });
  });

  it("ví chưa có opening → ghi mốc nào cũng qua", async () => {
    await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      await writeEntry(tx, wallet.id, account.id, T1);
      await expectBalance(tx, wallet.id, "10");
    });
  });

  it("id ví khác id activity opening → vẫn tìm đúng opening của ví", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        await makeSteamWallet(tx); // ví nháp, chiếm id 1
        const { account, wallet } = await makeSteamWallet(tx);
        await seedBalance(tx, wallet.id, "100", T2, account.id); // activity id 1
        await writeEntry(tx, wallet.id, account.id, T1);
      }),
      "ENTRY_BEFORE_OPENING",
    );
  });

  it("ví CASH có opening, ghi trước mốc → vẫn bị chặn", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const cash = await makeCashWallet(tx);
        const account = await makeAccount(tx); // TOP_UP bắt buộc có accountId (chk_activity_account)
        await seedBalance(tx, cash.id, "-500000", T2, null);
        await writeEntry(tx, cash.id, account.id, T1);
      }),
      "ENTRY_BEFORE_OPENING",
    );
  });
});

describe("lockWallets()", () => {
  it("trả về theo thứ tự đầu vào, kể cả khi id truyền vào giảm dần", async () => {
    await withTx(async (tx) => {
      const { wallet: low } = await makeSteamWallet(tx);
      const { wallet: high } = await makeSteamWallet(tx); // tạo sau → id lớn hơn
      const result = await lockWallets(tx, [high.id, low.id]); // truyền giảm dần
      expect(result.map((w) => w.id)).toEqual([high.id, low.id]);
    });
  });

  it("cùng một id hai lần → cùng ví ở cả hai vị trí, không lỗi", async () => {
    await withTx(async (tx) => {
      const { wallet } = await makeSteamWallet(tx);
      const [x, y] = await lockWallets(tx, [wallet.id, wallet.id]);
      expect([x.id, y.id]).toEqual([wallet.id, wallet.id]);
    });
  });

  it("một id không tồn tại → WALLET_NOT_FOUND", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        await lockWallets(tx, [wallet.id, 999999]);
      }),
      "WALLET_NOT_FOUND",
    );
  });
});
