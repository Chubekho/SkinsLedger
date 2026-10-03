import { expect } from "vitest";
import type { Tx } from "../../db/tx.js";
import type { DomainErrorCode } from "../../domain/errors.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getWalletBalance } from "../../services/ledger.js";

export async function expectDomainError(
  run: Promise<unknown>,
  code: DomainErrorCode,
): Promise<void> {
  await expect(run).rejects.toThrow(expect.objectContaining({ code }));
}

export async function expectBalance(
  tx: Tx,
  walletId: number,
  expected: string,
): Promise<void> {
  const balance = await getWalletBalance(tx, walletId);
  expect(balance.toFixed()).toBe(new Prisma.Decimal(expected).toFixed());
}