-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('STEAM_BALANCE', 'CASH');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('OPENING_BALANCE', 'TOP_UP', 'PURCHASE', 'CONTAINER_CLAIM', 'WALLET_TRANSFER', 'DROP', 'TRADE_UP', 'UNBOXING', 'SALE', 'GIFT_OUT', 'LOST');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('HOLDING', 'SOLD', 'CONSUMED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'EXCHANGERATE_API');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('STEAM', 'BUFF163', 'CSFLOAT', 'CSMONEY', 'SKINPORT');

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "account_name" TEXT NOT NULL,
    "steam_id64" TEXT,
    "registered_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "name" TEXT NOT NULL,
    "kind" "WalletKind" NOT NULL,
    "currency" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" SERIAL NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" SERIAL NOT NULL,
    "type" "ActivityType" NOT NULL,
    "account_id" INTEGER,
    "counterparty" JSONB,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "market_hash_name" TEXT NOT NULL,
    "asset_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "account_id" INTEGER NOT NULL,
    "storage_unit_id" INTEGER,
    "acquired_activity_id" INTEGER NOT NULL,
    "consumed_activity_id" INTEGER,
    "acquired_price" DECIMAL(20,8),
    "cost_currency" TEXT,
    "cost_basis" DECIMAL(20,8) NOT NULL,
    "sale_price" DECIMAL(20,8),
    "sale_currency" TEXT,
    "sale_ref_price" DECIMAL(20,8),
    "sale_ref_currency" TEXT,
    "sale_rate" DECIMAL(20,8),
    "status" "ItemStatus" NOT NULL,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL,
    "tradable_after" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_movements" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "from_account_id" INTEGER NOT NULL,
    "to_account_id" INTEGER NOT NULL,
    "hold_ends_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" SERIAL NOT NULL,
    "base_currency" TEXT NOT NULL,
    "quote_currency" TEXT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "source" "RateSource" NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_prices" (
    "id" SERIAL NOT NULL,
    "market_hash_name" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_name_key" ON "accounts"("account_name");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_steam_id64_key" ON "accounts"("steam_id64");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_account_id_kind_currency_key" ON "wallets"("account_id", "kind", "currency");

-- CreateIndex
CREATE INDEX "idx_wt_wallet_time" ON "wallet_transactions"("wallet_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_wt_activity" ON "wallet_transactions"("activity_id");

-- CreateIndex
CREATE INDEX "idx_act_account" ON "activities"("account_id");

-- CreateIndex
CREATE INDEX "idx_items_status" ON "inventory_items"("status");

-- CreateIndex
CREATE INDEX "idx_items_hash" ON "inventory_items"("market_hash_name");

-- CreateIndex
CREATE INDEX "idx_items_account" ON "inventory_items"("account_id");

-- CreateIndex
CREATE INDEX "idx_items_asset" ON "inventory_items"("asset_id");

-- CreateIndex
CREATE INDEX "idx_items_storage" ON "inventory_items"("storage_unit_id");

-- CreateIndex
CREATE INDEX "idx_items_acquired" ON "inventory_items"("acquired_activity_id");

-- CreateIndex
CREATE INDEX "idx_items_consumed" ON "inventory_items"("consumed_activity_id");

-- CreateIndex
CREATE INDEX "idx_mov_item" ON "item_movements"("item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_base_currency_quote_currency_source_fetched__key" ON "exchange_rates"("base_currency", "quote_currency", "source", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "item_prices_market_hash_name_source_fetched_at_key" ON "item_prices"("market_hash_name", "source", "fetched_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_storage_unit_id_fkey" FOREIGN KEY ("storage_unit_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_acquired_activity_id_fkey" FOREIGN KEY ("acquired_activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_consumed_activity_id_fkey" FOREIGN KEY ("consumed_activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_movements" ADD CONSTRAINT "item_movements_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Create unique index
CREATE UNIQUE INDEX uq_wallet_cash ON wallets (kind, currency)
  WHERE account_id IS NULL;

ALTER TABLE activities ADD CONSTRAINT chk_activity_account
  CHECK (account_id IS NOT NULL OR type = 'OPENING_BALANCE');