import { beforeEach, describe, it, expect } from "vitest";
import { prisma } from "../db/client.js";
import { withTx, type Tx } from "../db/tx.js";
import { resetDb } from "./helpers/reset-db.js";

beforeEach(async () => {
  await resetDb();
});

describe("Tx brand", () => {
  it("không cho truyền PrismaClient thay cho Tx", () => {
    // @ts-expect-error — prisma toàn cục không phải Tx
    const bad: Tx = prisma;
    expect(bad).toBeDefined();
  });

  it("withTx cấp đúng Tx và rollback khi callback throw", async () => {
    const name = `tx-rollback-${Date.now()}`;

    await expect(
      withTx(async (tx) => {
        await tx.account.create({
          data: { accountName: name, registeredAt: new Date() },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const found = await prisma.account.findUnique({
      where: { accountName: name },
    });
    expect(found).toBeNull();
  });
});
