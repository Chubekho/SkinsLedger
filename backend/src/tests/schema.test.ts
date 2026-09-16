import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { resetDb } from "./helpers/reset-db.js";
import { seed } from "../db/seed.js";
import { TABLES } from "./helpers/reset-db.js";

beforeEach(async () => {
  await resetDb();
});

describe("schema", () => {
  it("query được cả 8 bảng", async () => {
    for (const table of TABLES) {
      await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1;`);
    }
  });

  it("create rows then resetDb", async () => {
    await prisma.account.create({
      data: { accountName: "test", registeredAt: new Date("2020-01-01") },
    });
    await resetDb();
    expect(await prisma.account.count()).toBe(0);
  });
});

describe("seed", () => {
  it("seed chạy 2 lần không nhân đôi", async () => {
    await seed();
    const first = await prisma.account.findMany({ orderBy: { id: "asc" } });
    expect(first).toHaveLength(4);
    expect(await prisma.wallet.count()).toBe(3);

    await seed();
    const second = await prisma.account.findMany({ orderBy: { id: "asc" } });
    expect(second).toHaveLength(4);
    expect(await prisma.wallet.count()).toBe(3);

    expect(second.map((a) => a.id)).toEqual(first.map((a) => a.id)); // ← id giữ nguyên
  });

  it("Check cash.account_id === null", async () => {
    await prisma.wallet.create({
      data: { accountId: null, name: "test", kind: "CASH", currency: "VND" },
    });
    const cash = await prisma.wallet.findFirst({ where: { kind: "CASH" } });
    expect(cash?.accountId).toBeNull();
    expect(cash?.currency).toBe("VND");
  });

  it("không tạo được 2 ví CASH trùng", async () => {
    const data = {
      accountId: null,
      name: "test",
      kind: "CASH",
      currency: "VND",
    } as const;

    await prisma.wallet.create({ data });

    await expect(
      prisma.wallet.create({ data: { ...data, name: "test2" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("check on other tables", () => {
  it("check activity account", async () => {
    await expect(
      prisma.activity.create({
        data: { type: "TOP_UP", accountId: null, occurredAt: new Date() },
      }),
    ).rejects.toThrow(/chk_activity_account/);
  });
});
