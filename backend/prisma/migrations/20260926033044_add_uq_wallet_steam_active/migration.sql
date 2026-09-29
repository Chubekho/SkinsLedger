-- This is an empty migration.
CREATE UNIQUE INDEX uq_wallet_steam_active ON wallets (account_id)
  WHERE kind = 'STEAM_BALANCE' AND is_active;