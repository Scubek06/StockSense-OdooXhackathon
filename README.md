# StockSense

StockSense is a demo-ready inventory control application for tracking products, warehouses, stock operations, and an auditable movement ledger. It replaces scattered spreadsheets and manual stock registers with a single React interface backed by a PostgreSQL database and a REST API.

## Problem statement

Manual registers and disconnected spreadsheets make it difficult to keep stock accurate across multiple storage locations, identify shortages, and explain how inventory changed. StockSense centralizes the catalog and warehouse workflows and records each stock change with its operation and before/after quantities.

## Features

- Register and sign in with password hashing, bearer-token protected APIs, profile display, logout, and a local OTP password reset flow.
- Dashboard KPIs and filters for operation type, status, warehouse, location, and category.
- Product and category management, SKU uniqueness, product search, and reorder thresholds.
- Multiple warehouses and storage locations with stock tracked by location.
- Receipts with supplier, deliveries with customer, internal transfers, and physical-count adjustments; stock changes only when validated.
- Waiting and ready states for open operations, plus cancellation without a stock change.
- Delivery validation rejects insufficient stock; transfers reject identical source and destination locations.
- Transactional stock updates and a movement ledger with quantity snapshots, operation reference, actor, and timestamp.
- Responsive dark warehouse-control UI with tactile, skeuomorphic surfaces, accessible form labels, validation feedback, and empty states.
- PostgreSQL migration and development seed data.

## Modules

| Module | Purpose |
| --- | --- |
| Dashboard | Inventory KPIs, recent moves, quick links, and operational filters |
| Products / Categories | Product catalog, SKU, unit, category, search, and reorder level |
| Warehouse | Warehouses, storage locations, and location-level stock |
| Receipts | Receive stock into a location after validation |
| Delivery orders | Dispatch stock from a location after validation |
| Internal transfers | Move stock between locations without changing total inventory |
| Adjustments | Reconcile a location to a physical count |
| Move history | Review validated stock changes |
| Profile / Settings | View the signed-in account and workspace information |

## Architecture

```text
React + Vite client
        │ REST / JSON (JWT bearer token)
        ▼
Express API ── authentication, validation, transactional inventory services
        │ parameterized SQL
        ▼
PostgreSQL
```

The application uses a conventional client/server split. Inventory writes are handled by the API; the browser does not directly access the database. Stock-changing operations lock and update the relevant stock rows and write ledger entries in the same database transaction.

## Database design

The PostgreSQL schema relates `users`, `categories`, `products`, `warehouses`, `locations`, and location-level `stock`. The shared `operations` and `operation_items` tables represent receipts, deliveries, transfers, and adjustments. `stock_ledger` records each validated location-level change, operation, product, source/destination, actor, timestamp, and before/after quantities. Reorder thresholds are stored on products. `password_reset_tokens` and `revoked_tokens` support OTP resets and server-side JWT logout. Foreign keys, unique SKU constraints, and non-negative quantity checks protect data integrity.

## Tech stack

- Frontend: React, Vite, JavaScript, CSS, Lucide icons
- Backend: Node.js, Express, REST/JSON
- Database: PostgreSQL
- Authentication: bcrypt password hashing and signed JWT bearer tokens

## Setup

### Requirements

- Node.js 20 or later and npm
- PostgreSQL 14 or later

### Configure environment

From the repository root:

```bash
cp .env.example .env
```

Set the PostgreSQL connection string and a long, random JWT secret in `.env`. Never commit `.env`.
Generate a signing secret with `openssl rand -base64 32`. In Codespaces, set `CLIENT_URL` to the forwarded client origin for port `5173` (comma-separate it with `http://localhost:5173` if both are used).

### Create the database

Create an empty PostgreSQL database matching the database name in `DATABASE_URL`, for example:

```bash
createdb stocksense
```

If PostgreSQL is not installed in Codespaces but Docker is available, start a local development database with a generated password:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker run --name stocksense-postgres -e POSTGRES_USER=stocksense \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_DB=stocksense \
  -p 5432:5432 -d postgres:16-alpine
```

Set `DATABASE_URL` in `.env` to `postgresql://stocksense:<generated-password>@localhost:5432/stocksense`.

Apply the schema and seed demo data:

```bash
npm run migrate
npm run seed
```

### Install and run

```bash
npm install
npm install --prefix client
```

Run the API and frontend in separate terminals:

```bash
npm run dev
npm run dev --prefix client
```

The Express API uses port `3000`; Vite serves the client on port `5173` and proxies `/api` requests to the API. In GitHub Codespaces, forward both ports. The seed script creates a demo user, example catalog, locations, and opening stock recorded in the ledger. Set `DEMO_PASSWORD` in `.env` to choose the demo password; if it is unset, the development seed generates and prints a random one.

Build the production client with:

```bash
npm run build --prefix client
```

## Environment variables

See `.env.example` for the authoritative variable list. Configure the PostgreSQL URL, JWT signing secret (at least 24 characters), API port, OTP expiry, and client origin there. Local reset codes are returned only outside production; add a real mail/SMS provider before public deployment.

## API overview

All routes are under `/api`. Protected routes accept `Authorization: Bearer <token>`.

| Resource | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/logout`, `POST /api/auth/reset/request`, `POST /api/auth/reset/confirm` |
| Catalog | `GET/POST /api/products`, `PATCH/PUT/DELETE /api/products/:id`, `GET/POST/PATCH/DELETE /api/categories` |
| Warehouses | `GET/POST /api/warehouses`, `GET/POST /api/locations` |
| Stock | `GET /api/stock` |
| Dashboard | `GET /api/dashboard` (supports `kind`, `status`, `warehouseId`, `locationId`, and `categoryId`) |
| Operations | `GET/POST /api/operations/receipts`, `/deliveries`, `/transfers`, `/adjustments`; `PATCH /api/operations/:type/:id/status`, `POST /api/operations/:type/:id/validate`, `POST /api/operations/:type/:id/cancel` |
| Ledger | `GET /api/ledger` |

Validation failures return an HTTP error with a user-readable message. A document is created as a draft; its stock effect and ledger entries are applied only when its validate route succeeds.

## Demo workflow

1. Register an account and sign in.
2. Create a product such as **Steel** and set its SKU, unit, category, and reorder level.
3. Create a receipt for 100 units at a warehouse location. Confirm it is still a draft and stock has not yet changed.
4. Validate the receipt and check the product’s on-hand quantity and the move history.
5. Create and validate a transfer of 20 units to a Production Rack; verify source and destination quantities.
6. Create and validate a delivery for 10 units from the Production Rack.
7. Create an inventory adjustment using the counted physical quantity and validate it.
8. Check the ledger for each validated operation, then return to the dashboard and review the KPIs.

## Security

- Passwords are stored as bcrypt hashes; secrets are loaded from environment variables.
- Inventory and account APIs require authentication, and SQL values are parameterized.
- Server-side validation and database constraints guard identifiers, quantities, SKUs, and stock availability.
- Stock changes and ledger writes share database transactions.
- Logout revokes the server-side token; tokens also expire according to server configuration. Use HTTPS and a real mail/SMS OTP provider before deploying a password-reset flow publicly.

## Hackathon evaluation alignment

StockSense demonstrates a usable React/Express/PostgreSQL architecture, relational constraints, secured REST endpoints, transactional inventory workflows, operational dashboard filters, a complete demo path, and a restrained skeuomorphic warehouse interface. The demo avoids external database-as-a-service dependencies and does not claim integrations that are not included.

## Future scope

- Richer pick/pack and delivery tracking.
- Production OTP delivery, reset-attempt rate limiting, and fine-grained role permissions.
- CSV import/export, barcode scanning, and supplier/customer records.
- More advanced reporting, audit exports, and automated reorder suggestions.
