CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('manager', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_id UUID PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revoked_tokens_expiry_idx ON revoked_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) BETWEEN 1 AND 32),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, name),
  UNIQUE (warehouse_id, code),
  UNIQUE (id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  sku TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit' CHECK (length(trim(unit)) BETWEEN 1 AND 24),
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_unique ON products (lower(sku));
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);

CREATE TABLE IF NOT EXISTS stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS stock_location_idx ON stock (location_id);

CREATE TABLE IF NOT EXISTS operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('receipt', 'delivery', 'transfer', 'adjustment')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
  source_location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  destination_location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  reference TEXT,
  party_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  CHECK (source_location_id IS DISTINCT FROM destination_location_id),
  CHECK (
    (kind = 'receipt' AND source_location_id IS NULL AND destination_location_id IS NOT NULL) OR
    (kind = 'delivery' AND source_location_id IS NOT NULL AND destination_location_id IS NULL) OR
    (kind = 'transfer' AND source_location_id IS NOT NULL AND destination_location_id IS NOT NULL) OR
    (kind = 'adjustment' AND source_location_id IS NULL AND destination_location_id IS NOT NULL)
  )
);
ALTER TABLE operations ADD COLUMN IF NOT EXISTS party_name TEXT;
CREATE INDEX IF NOT EXISTS operations_created_idx ON operations (created_at DESC);
CREATE INDEX IF NOT EXISTS operations_kind_status_idx ON operations (kind, status);

CREATE TABLE IF NOT EXISTS operation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
  UNIQUE (operation_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id BIGSERIAL PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  source_location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  destination_location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'delivery', 'transfer', 'adjustment')),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
  quantity_before NUMERIC(14,3) NOT NULL CHECK (quantity_before >= 0),
  quantity_change NUMERIC(14,3) NOT NULL,
  quantity_after NUMERIC(14,3) NOT NULL CHECK (quantity_after >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_ledger_product_created_idx ON stock_ledger (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_ledger_location_created_idx ON stock_ledger (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_ledger_operation_idx ON stock_ledger (operation_id);
