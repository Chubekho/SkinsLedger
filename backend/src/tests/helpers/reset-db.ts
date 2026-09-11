// src/tests/helpers/reset-db.ts
import { prisma } from '../../db/client.js';

const TABLES = [
  'item_movements',
  'inventory_items',
  'wallet_transactions',
  'item_prices',
  'exchange_rates',
  'activities',
  'wallets',
  'accounts',
] as const;

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`
  );
}