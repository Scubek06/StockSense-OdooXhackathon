# StockSense API contract

All routes are under `/api`. JSON request and response fields use `camelCase`.
Except for the health endpoint, API routes require `Authorization: Bearer <token>`
unless marked public below. Collection responses consistently use `{ "items": [] }`;
single resources are returned directly. Errors use `{ "error": "..." }` and may
include `message` or development-only `detail`.

## Authentication

| Method and path | Auth | Request | Response |
| --- | --- | --- | --- |
| `POST /auth/register` | Public | `{ "name", "email", "password" }` | `{ "user": User, "token", "tokenType": "Bearer", "expiresAt" }` (`201`) |
| `POST /auth/login` | Public | `{ "email", "password" }` | Same session shape as register |
| `GET /auth/me` | Bearer | — | `{ "user": User }` |
| `POST /auth/reset/request` | Public | `{ "email" }` | `{ "message" }`; development also returns `"otp"` |
| `POST /auth/reset/confirm` | Public | `{ "email", "otp", "newPassword" }` | `{ "message" }` |
| `PATCH /auth/profile` | Authenticated | `{ "name"?, "email"? }` | `{ "user": User }` |
| `POST /auth/logout` | Bearer | — | `{ "message" }`; revokes the presented token |

`User` has `id`, `name`, `email`, `role`, and `createdAt`. Passwords are never
returned. Local reset OTPs are returned only when `NODE_ENV` is not `production`.
OTP expiry is configured with `OTP_EXPIRY_MINUTES`.

## Dashboard and reference data

| Method and path | Response |
| --- | --- |
| `GET /dashboard` | `{ "summary": { "totalProductsInStock", "lowStockItems", "outOfStockItems", "pendingReceipts", "pendingDeliveries", "scheduledInternalTransfers", "pendingOperations" } }`; accepts `kind`, `status`, `warehouseId`, `locationId`, `categoryId` |
| `GET /stock` | `{ "items": StockAtLocation[] }`; accepts `productId`, `warehouseId`, `locationId`, `categoryId`, `limit` |
| `GET /products` | `{ "items": Product[] }`; accepts `search`, `categoryId`, `active`, `warehouseId`, `locationId`, `limit` |
| `POST /products` | `Product` (`201`) |
| `GET /products/:id` | `Product` with `stock: StockAtLocation[]` |
| `PATCH /products/:id` | Updated `Product`; accepts any product fields |
| `PUT /products/:id` | Updated `Product`; requires `name` and `sku` |
| `DELETE /products/:id` | Empty `204` response |
| `GET /categories` | `{ "items": Category[] }` |
| `POST /categories` | `Category` (`201`) |
| `PATCH /categories/:id` | Updated `Category` |
| `DELETE /categories/:id` | Empty `204` response |
| `GET /warehouses` | `{ "items": Warehouse[] }`; warehouses include a `locations` array |
| `POST /warehouses` | `Warehouse` (`201`) |
| `GET /locations` | `{ "items": Location[] }`; accepts `warehouseId` |
| `POST /locations` | `Location` (`201`) |

Products use `name`, `sku`, `categoryId`, `unit`, `reorderLevel`, and `active`.
Categories use `name`, `description`; warehouses use `name`, `code`, `address`;
locations use `warehouseId`, `name`, `code`. Response resource rows include `id`
and timestamps where available. Product list rows additionally include `categoryName`
and numeric `onHand`. PostgreSQL numeric quantity values are serialized as decimal
strings to preserve precision.

## Operations

The operation kinds are `receipts`, `deliveries`, `transfers`, and `adjustments`.
All use the same routes, replacing `:kind` with one of those plural names:

| Method and path | Response |
| --- | --- |
| `GET /operations/:kind` | `{ "items": Operation[] }` including line items, `itemCount`, and location names; accepts `status`, `warehouseId`, `locationId`, `categoryId`, `from`, `to`, `limit` |
| `POST /operations/:kind` | New `Operation` (`201`, initially `draft`) |
| `GET /operations/:kind/:id` | `Operation` including its `items` |
| `POST /operations/:kind/:id/validate` | Validated `Operation` including its `items` |
| `PATCH /operations/:kind/:id/status` | Set an open operation to `waiting` or `ready` |
| `POST /operations/:kind/:id/cancel` | Cancel an open operation without changing stock |

Creation bodies have `items: [{ "productId", "quantity" }]` and optional
`reference`, `partyName`, `notes`. Receipts and adjustments require `destinationLocationId`;
deliveries require `sourceLocationId`; transfers require both. Adjustment item
`quantity` is the counted quantity; for other kinds it is a positive movement
quantity. Validation applies the stock changes and ledger entries atomically.

## Stock ledger

`GET /ledger` returns `{ "items": LedgerEntry[] }`. Optional filters: `productId`,
`kind`, `warehouseId`, `locationId`, `categoryId`, `from`, `to`, and `limit`.
`GET /ledger/:productId` is equivalent to filtering on `productId`.

## Health

`GET /health` and `GET /api/health` are public. They return `{ "status": "ok",
"database": "connected", "timestamp": "..." }`; unavailable PostgreSQL returns
HTTP `503` with `{ "status": "error", "database": "unavailable", "message": "..." }`.
