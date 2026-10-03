import { describe, it, expect, beforeEach } from "vitest";
import { withTx } from "../db/tx.js";
import { makeSteamWallet, makeWallet, seedBalance } from "./helpers/fixtures.js";
import { recordOpeningBalance } from "../services/opening-balance.js";
import { resetDb } from "./helpers/reset-db.js";
import { expectBalance, expectDomainError } from "./helpers/assertions.js";
import { isDomainError } from "../domain/errors.js";
import { prisma } from "../db/client.js";

const T1 = new Date("2026-09-01T00:00:00Z");
const T2 = new Date("2026-09-10T00:00:00Z");

beforeEach(async () => {
  await resetDb();
});

describe("recordOpeningBalance", () => {
  it("ví STEAM EUR '100': ghi đúng activity + dòng tiền", async () => {
    await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      const result = await recordOpeningBalance(tx, {
        walletId: wallet.id,
        amount: "100",
        occurredAt: T2,
      });

      const activity = await tx.activity.findUniqueOrThrow({
        where: { id: result.activityId },
      });
      const walletTx = await tx.walletTransaction.findFirstOrThrow({
        where: { activityId: result.activityId },
      });

      expect(activity.type).toBe("OPENING_BALANCE");
      expect(activity.accountId).toBe(account.id);
      expect(activity.occurredAt.getTime()).toBe(T2.getTime());
      expect(walletTx.occurredAt.getTime()).toBe(T2.getTime());
      expect(result.warnings).toEqual([]);
      await expectBalance(tx, wallet.id, "100");
    });
  });

  it("ví CASH '-5000000': thành công, activity.accountId = null", async () => {
    await withTx(async (tx) => {
      const wallet = await makeWallet(tx, { kind: "CASH", currency: "VND" });
      const result = await recordOpeningBalance(tx, {
        walletId: wallet.id,
        amount: "-5000000",
        occurredAt: T2,
      });

      const activity = await tx.activity.findUniqueOrThrow({
        where: { id: result.activityId },
      });
      expect(activity.accountId).toBeNull();
      // chứng minh ví CASH thật sự giữ được số âm
      await expectBalance(tx, wallet.id, "-5000000");
    });
  });

  it("ví STEAM '-1.00' → OPENING_BALANCE_NEGATIVE", async () => {
    // expectDomainError thay khối expect(...).rejects.toThrow(...)
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "-1.00",
          occurredAt: T2,
        });
      }),
      "OPENING_BALANCE_NEGATIVE",
    );
  });

  it("F1 không coi '-0' là âm (.lt, không phải isNegative)", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx);
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "-0.00",
          occurredAt: T2,
        });
      }),
      "AMOUNT_ZERO",
    );
  });
});

describe("recordOpeningBalance() #12", () => {
  it("opening 2 lần trên cùng ví → OPENING_BALANCE_EXISTS ở lần 2", async () => {
    const walletId = await withTx(async (tx) => {
      const { wallet } = await makeSteamWallet(tx);
      await recordOpeningBalance(tx, {
        walletId: wallet.id,
        amount: "100",
        occurredAt: T2,
      });
      return wallet.id;
    });

    await expectDomainError(
      withTx(async (tx) => {
        await recordOpeningBalance(tx, {
          walletId,
          amount: "100",
          occurredAt: T1,
        });
      }),
      "OPENING_BALANCE_EXISTS",
    );
  });

  it("opening ví A rồi ví B → cả hai thành công (luật theo từng ví)", async () => {
    await withTx(async (tx) => {
      const { wallet: walletA } = await makeSteamWallet(tx);
      const { wallet: walletB } = await makeSteamWallet(tx);

      await recordOpeningBalance(tx, {
        walletId: walletA.id,
        amount: "100",
        occurredAt: T2,
      });
      await recordOpeningBalance(tx, {
        walletId: walletB.id,
        amount: "100",
        occurredAt: T2,
      });

      await expectBalance(tx, walletA.id, "100");
      await expectBalance(tx, walletB.id, "100");
    });
  });

  it("dòng tiền thuộc activity KHÁC opening không tính là 'đã có opening'", async () => {
    await withTx(async (tx) => {
      const { account, wallet } = await makeSteamWallet(tx);
      await seedBalance(tx, wallet.id, "100", T2, account.id, "TOP_UP");

      await recordOpeningBalance(tx, {
        walletId: wallet.id,
        amount: "100",
        occurredAt: T1,
      });

      await expectBalance(tx, wallet.id, "200");
    });
  });
});

describe("recordOpeningBalance() #13", () => {
  it("opening SAU dòng hiện có → OPENING_BALANCE_NOT_FIRST", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { account, wallet } = await makeSteamWallet(tx);
        await seedBalance(tx, wallet.id, "100", T1, account.id, "TOP_UP");
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "100",
          occurredAt: T2,
        });
      }),
      "OPENING_BALANCE_NOT_FIRST",
    );
  });

  it("opening BẰNG đúng mốc dòng hiện có → OPENING_BALANCE_NOT_FIRST", async () => {
    // Test biên: đổi `>=` thành `>` trong service thì test này phải đỏ
    await expectDomainError(
      withTx(async (tx) => {
        const { account, wallet } = await makeSteamWallet(tx);
        await seedBalance(tx, wallet.id, "100", T1, account.id, "TOP_UP");
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "100",
          occurredAt: T1,
        });
      }),
      "OPENING_BALANCE_NOT_FIRST",
    );
  });
});

describe("recordOpeningBalance() — luật kế thừa", () => {
  it("Opening trên ví inactive", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx, {
          isActive: false,
        });
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "100",
          occurredAt: T1,
        });
      }),
      "WALLET_INACTIVE",
    );
  });

  it("Opening nhưng amount vượt scale", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        const { wallet } = await makeSteamWallet(tx, {
          currency: "EUR",
        });
        await recordOpeningBalance(tx, {
          walletId: wallet.id,
          amount: "100.5123",
          occurredAt: T1,
        });
      }),
      "AMOUNT_SCALE_EXCEEDED",
    );
  });

  it("Opening trên ví không tồn tại", async () => {
    await expectDomainError(
      withTx(async (tx) => {
        await recordOpeningBalance(tx, {
          walletId: 99999,
          amount: "100",
          occurredAt: T1,
        });
      }),
      "WALLET_NOT_FOUND",
    );
  });
});

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("recordOpeningBalance() #12 dưới tải song song", () => {
  it("2 transaction cùng lúc trên 1 ví: B phải chờ khoá rồi bị EXISTS", async () => {
    // 1. Dựng ví và COMMIT. A và B là 2 connection khác nhau,
    //    nếu ví chỉ nằm trong 1 transaction chưa commit thì B không thấy.
    const walletId = await withTx(async (tx) => {
      const { wallet } = await makeSteamWallet(tx);
      return wallet.id;
    });

    // 2. Hai cổng. Giữ hàm resolve ở ngoài để mình mở được từ test.
    let release!: () => void; // cổng giữ A: mở thì A mới commit
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markAWrote!: () => void; // tín hiệu "A đã ghi xong, đang cầm khoá"
    const aWrote = new Promise<void>((resolve) => {
      markAWrote = resolve;
    });

    // 3. A: ghi opening rồi KHÔNG commit, đứng chờ cổng.
    //    Không await ở đây, để A chạy nền.
    const txA = withTx(async (tx) => {
      await recordOpeningBalance(tx, {
        walletId,
        amount: "100",
        occurredAt: T1,
      });
      markAWrote();
      await gate;
    });

    try {
      await aWrote; // chắc chắn A đã cầm khoá rồi mới chạy B

      // 4. B: cùng ví. Gói kết quả thành chuỗi để không bị reject lơ lửng:
      //    thành công -> "fulfilled", lỗi domain -> mã lỗi.
      const outcomeB = withTx(async (tx) => {
        await recordOpeningBalance(tx, {
          walletId,
          amount: "100",
          occurredAt: T1, // EXISTS được kiểm trước #13 nên B vẫn ra đúng mã
        });
      }).then(
        () => "fulfilled",
        (e: unknown) => (isDomainError(e) ? e.code : "NOT_A_DOMAIN_ERROR"),
      );

      // 5. Phép kiểm quan trọng nhất: sau 200ms B vẫn chưa xong = đang bị treo.
      //    Bỏ FOR UPDATE thì B chạy xong ngay, dòng này đỏ.
      const early = await Promise.race([
        outcomeB,
        delay(200).then(() => "pending"),
      ]);
      expect(early).toBe("pending");

      // 6. Mở cổng: A commit, nhả khoá, B được chạy tiếp.
      release();
      await txA; // A phải thành công
      expect(await outcomeB).toBe("OPENING_BALANCE_EXISTS");
    } finally {
      release(); // dù assert nào ném lỗi, A cũng không bị treo mãi
    }

    // 7. Sau cùng, trong DB chỉ có đúng 1 opening cho ví này.
    const openings = await prisma.walletTransaction.count({
      where: { walletId, activity: { type: "OPENING_BALANCE" } },
    });
    expect(openings).toBe(1);
  });
});
