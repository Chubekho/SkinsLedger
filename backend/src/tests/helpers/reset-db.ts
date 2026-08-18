import { prisma } from "../../db/client.js";

export async function resetDb(): Promise<void> {
//   await prisma.$executeRawUnsafe(`
//     TRUNCATE TABLE "wallet_transactions", "activities", "inventory_items", ...
//     RESTART IDENTITY CASCADE
//   `);
}
