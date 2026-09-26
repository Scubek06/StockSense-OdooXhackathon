# StockSense — Inventory Management System

> **A modular, real-time inventory management platform designed to replace manual registers, spreadsheets, and fragmented stock-tracking workflows with a centralized system.**

StockSense is a full-stack Inventory Management System (IMS) that digitizes the complete stock lifecycle — from receiving goods to internal movement, delivery, physical stock adjustments, and historical tracking.

The system is designed with a focus on **clean architecture, relational database design, modularity, validation, security, usability, and scalability**.

---

## 📌 Problem Statement

Many businesses still manage inventory using:

* Manual registers
* Excel spreadsheets
* Paper-based stock records
* Separate warehouse records
* Scattered tracking systems

These approaches make it difficult to maintain accurate stock levels, identify discrepancies, track product movement, and obtain a real-time view of warehouse operations.

### StockSense solves this by providing

* Centralized inventory management
* Real-time stock tracking
* Multi-warehouse support
* Product and category management
* Incoming and outgoing stock operations
* Internal stock transfers
* Physical stock adjustments
* Stock movement history
* Low-stock alerts
* Dashboard-based monitoring

---

# 🎯 Objectives

StockSense aims to:

1. Centralize all inventory-related operations.
2. Maintain accurate stock quantities by location.
3. Track every stock movement through a stock ledger.
4. Reduce dependency on manual inventory records.
5. Provide an intuitive interface for warehouse staff and inventory managers.
6. Prevent invalid stock operations through server-side validation.
7. Support multiple warehouses and storage locations.
8. Provide a modular architecture that can be extended as the business grows.

---

# 👥 Target Users

### Inventory Manager

Responsible for:

* Managing products
* Monitoring inventory
* Creating receipts
* Managing deliveries
* Performing stock adjustments
* Monitoring low-stock products
* Reviewing stock movement history

### Warehouse Staff

Responsible for:

* Receiving goods
* Picking products
* Shelving stock
* Performing internal transfers
* Counting physical stock
* Updating warehouse operations

---

# 🚀 Core Modules

## 1. Authentication

StockSense provides secure user authentication.

### Features

* User registration
* Login
* Logout
* Password reset
* OTP-based password recovery
* Session management
* Protected routes
* Profile management

Invalid input should generate clear user-facing validation messages instead of silent failures.

---

# 2. Inventory Dashboard

The dashboard provides a real-time overview of inventory operations.

### KPIs

* Total Products in Stock
* Low Stock Items
* Out of Stock Items
* Pending Receipts
* Pending Deliveries
* Scheduled Internal Transfers

### Dynamic Filters

Users can filter inventory information by:

* Document type
* Operation status
* Warehouse
* Location
* Product category

### Supported Document Types

```text
Receipts
Delivery Orders
Internal Transfers
Inventory Adjustments
```

### Supported Statuses

```text
Draft
Waiting
Ready
Done
Canceled
```

---

# 3. Product Management

Products can be created and managed from a centralized interface.

### Product Fields

* Product Name
* SKU / Product Code
* Category
* Unit of Measure
* Initial Stock
* Reorder Level
* Product Status

### Product Features

* Create product
* Update product
* View product
* Search by SKU
* Search by name
* Filter by category
* View stock by location
* Configure reordering rules

---

# 4. Receipts — Incoming Stock

Receipts are used when goods arrive from suppliers.

### Workflow

```text
Create Receipt
      ↓
Select Supplier
      ↓
Add Products
      ↓
Enter Received Quantity
      ↓
Validate Receipt
      ↓
Stock Increased
      ↓
Stock Movement Logged
```

### Example

A supplier delivers:

```text
Steel Rods = 50 units
```

After validation:

```text
Previous Stock = 100
Received       = +50
Current Stock  = 150
```

The transaction is also recorded in the stock ledger.

---

# 5. Delivery Orders — Outgoing Stock

Delivery orders manage products leaving the warehouse.

### Workflow

```text
Create Delivery
      ↓
Select Products
      ↓
Pick
      ↓
Pack
      ↓
Validate
      ↓
Stock Decreased
      ↓
Stock Movement Logged
```

### Example

```text
Available Chairs = 50
Delivered        = 10
Remaining        = 40
```

The system prevents users from validating a delivery when sufficient stock is unavailable.

---

# 6. Internal Transfers

Internal transfers move stock between warehouses or locations without changing the company's total inventory.

### Examples

```text
Main Warehouse → Production Floor

Rack A → Rack B

Warehouse 1 → Warehouse 2
```

### Workflow

```text
Create Transfer
      ↓
Select Source
      ↓
Select Destination
      ↓
Select Product
      ↓
Enter Quantity
      ↓
Validate
      ↓
Source Stock Decreased
      ↓
Destination Stock Increased
      ↓
Ledger Updated
```

### Important Rule

An internal transfer does **not** change the total quantity of stock.

It only changes its location.

---

# 7. Inventory Adjustments

Inventory adjustments reconcile system stock with physical stock.

### Example

System records:

```text
Steel = 100 kg
```

Physical count:

```text
Steel = 97 kg
```

Adjustment:

```text
Difference = -3 kg
```

After validation:

```text
System Stock = 97 kg
```

The adjustment is permanently recorded in the stock ledger.

---

# 8. Stock Ledger

The Stock Ledger is one of the most important components of StockSense.

Every stock-changing operation generates a ledger entry.

### Ledger records include

* Product
* SKU
* Source location
* Destination location
* Quantity
* Operation type
* Reference document
* Previous quantity
* Quantity changed
* Resulting quantity
* User
* Timestamp

### Example

| Operation  | Product | Location          | Quantity | Effect          |
| ---------- | ------- | ----------------- | -------: | --------------- |
| Receipt    | Steel   | Main Warehouse    |      100 | +100            |
| Transfer   | Steel   | Main → Production |      100 | Location Change |
| Delivery   | Steel   | Production        |       20 | -20             |
| Adjustment | Steel   | Production        |        3 | -3              |

This provides traceability for every inventory movement.

---

# 🏭 Warehouse Management

StockSense supports multiple warehouses and storage locations.

### Example

```text
Warehouse 1
│
├── Rack A
├── Rack B
└── Production Area

Warehouse 2
│
├── Rack A
└── Finished Goods
```

Stock can therefore be tracked at a location level rather than only at the global product level.

---

# 🔔 Low Stock & Reordering

Products can have configurable reorder levels.

Example:

```text
Product: Steel Rod
Current Stock: 15
Reorder Level: 20
```

The system identifies the product as:

```text
LOW STOCK
```

If stock reaches zero:

```text
OUT OF STOCK
```

These conditions are surfaced through the dashboard.

---

# 🔍 Search & Filtering

StockSense provides smart inventory discovery through:

* Product name search
* SKU search
* Category filtering
* Warehouse filtering
* Location filtering
* Operation type filtering
* Status filtering
* Date-based movement history

---

# 🧩 Navigation

The application follows a modular sidebar structure.

```text
Dashboard

Products
├── All Products
├── Categories
└── Reordering Rules

Operations
├── Receipts
├── Delivery Orders
├── Inventory Adjustments
└── Move History

Warehouse
├── Warehouses
└── Locations

Settings

Profile
├── My Profile
└── Logout
```

---

# 🏗️ Architecture

StockSense follows a modular full-stack architecture.

```text
┌──────────────────────────────┐
│          Frontend            │
│                              │
│ Dashboard / Forms / Tables   │
│ Filters / Validation / UI    │
└──────────────┬───────────────┘
               │
               │ REST API
               ▼
┌──────────────────────────────┐
│          Backend             │
│                              │
│ Authentication              │
│ Product Service              │
│ Inventory Service            │
│ Receipt Service              │
│ Delivery Service             │
│ Transfer Service             │
│ Adjustment Service           │
│ Ledger Service               │
└──────────────┬───────────────┘
               │
               │ SQL
               ▼
┌──────────────────────────────┐
│      Relational Database     │
│                              │
│ Users                        │
│ Products                     │
│ Warehouses                   │
│ Locations                    │
│ Operations                   │
│ Stock                        │
│ Stock Ledger                 │
└──────────────────────────────┘
```

The architecture intentionally avoids unnecessary dependence on Backend-as-a-Service platforms.

---

# 🗄️ Database Design

The application uses a relational database to maintain structured inventory data.

### Main entities

```text
users
products
categories
warehouses
locations
stock
receipts
receipt_items
deliveries
delivery_items
internal_transfers
transfer_items
inventory_adjustments
stock_ledger
reorder_rules
```

### Relationships

```text
Category
   │
   └── Products
          │
          ├── Stock
          │      └── Location
          │
          ├── Receipts
          ├── Deliveries
          ├── Transfers
          └── Adjustments

Warehouse
   │
   └── Locations
          │
          └── Stock
```

Database constraints and transactions should be used to maintain inventory consistency.

---

# 🔐 Security

Security is considered at both the application and database levels.

### Security practices

* Password hashing
* Protected API endpoints
* Authentication middleware
* Role-aware authorization
* Server-side validation
* Input sanitization
* SQL injection prevention
* Secure session handling
* Environment variables for secrets
* No hardcoded credentials
* Controlled error responses

Sensitive credentials must never be committed to the repository.

---

# ✅ Validation

StockSense performs validation on both the client and server.

Examples:

```text
Invalid email
        ↓
"Please enter a valid email address."
```

```text
Delivery quantity > available stock
        ↓
"Insufficient stock available."
```

```text
Transfer source = destination
        ↓
"Source and destination locations must be different."
```

```text
Negative quantity
        ↓
"Quantity must be greater than zero."
```

Validation errors should be clear, actionable, and user-friendly.

---

# 📊 Inventory Flow

The complete inventory lifecycle can be represented as:

```text
                 SUPPLIER
                    │
                    ▼
              ┌───────────┐
              │  RECEIPT  │
              └─────┬─────┘
                    │
                    ▼
              ┌───────────┐
              │   STOCK   │
              └─────┬─────┘
                    │
              ┌─────┴─────┐
              │           │
              ▼           ▼
         INTERNAL      DELIVERY
         TRANSFER      ORDER
              │           │
              ▼           ▼
          LOCATION      CUSTOMER
           CHANGE
              │
              ▼
        STOCK ADJUSTMENT
              │
              ▼
        ┌──────────────┐
        │ STOCK LEDGER │
        └──────────────┘
```

---

# 🛠️ Technology Stack

> The final stack should use technologies appropriate for a production-style full-stack application and a relational database.

### Frontend

* React
* HTML5
* CSS3
* JavaScript
* Responsive UI components

### Backend

* Node.js
* Express.js
* REST APIs

### Database

* PostgreSQL

### Development Tools

* Git
* GitHub
* VS Code
* Postman / API testing tools

---

# 📁 Project Structure

```text
stocksense/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middleware/
│   │   ├── validators/
│   │   ├── utils/
│   │   └── config/
│   └── package.json
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema/
│
├── docs/
│   ├── architecture/
│   └── api/
│
├── .env.example
├── .gitignore
├── README.md
└── package.json
```

---

# ⚙️ Local Development

## Prerequisites

Install:

* Node.js
* npm
* PostgreSQL
* Git

Verify installation:

```bash
node --version
npm --version
psql --version
git --version
```

---

## 1. Clone Repository

```bash
git clone <repository-url>
cd stocksense
```

---

## 2. Configure Environment Variables

Create the required environment files using the provided examples.

```bash
cp .env.example .env
```

Configure:

```env
DATABASE_URL=
JWT_SECRET=
OTP_EXPIRY=
PORT=
CLIENT_URL=
```

Never commit `.env` files.

---

## 3. Install Dependencies

```bash
npm install
```

Install frontend and backend dependencies according to their respective package configuration.

---

## 4. Setup Database

Create the PostgreSQL database and execute the project's migrations.

Example:

```bash
createdb stocksense
```

Then run:

```bash
npm run migrate
```

Seed development data if available:

```bash
npm run seed
```

---

## 5. Start Development Server

```bash
npm run dev
```

The frontend and backend should then be available through their configured development ports.

---

# 🔌 API Design

The backend exposes modular REST endpoints.

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/verify-otp
POST /api/auth/reset-password
POST /api/auth/logout
```

### Products

```text
GET    /api/products
POST   /api/products
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id
```

### Receipts

```text
GET  /api/receipts
POST /api/receipts
GET  /api/receipts/:id
POST /api/receipts/:id/validate
```

### Deliveries

```text
GET  /api/deliveries
POST /api/deliveries
GET  /api/deliveries/:id
POST /api/deliveries/:id/validate
```

### Transfers

```text
GET  /api/transfers
POST /api/transfers
GET  /api/transfers/:id
POST /api/transfers/:id/validate
```

### Adjustments

```text
GET  /api/adjustments
POST /api/adjustments
POST /api/adjustments/:id/validate
```

### Ledger

```text
GET /api/ledger
GET /api/ledger/:productId
```

### Dashboard

```text
GET /api/dashboard/summary
GET /api/dashboard/operations
```

---

# 🔄 Stock Transaction Rules

Stock changes must occur only when an operation is successfully validated.

### Receipt

```text
Stock = Stock + Received Quantity
```

### Delivery

```text
Stock = Stock - Delivered Quantity
```

### Internal Transfer

```text
Source Location = Source Location - Quantity
Destination Location = Destination Location + Quantity
```

### Adjustment

```text
Stock = Counted Quantity
```

Every successful stock mutation must create a corresponding ledger record.

---

# 🧪 Testing

Testing should cover:

### Authentication

* Valid registration
* Duplicate email
* Invalid email
* Incorrect password
* OTP expiration
* Invalid OTP
* Password reset

### Products

* Product creation
* Duplicate SKU
* Invalid quantity
* Category filtering
* Product search

### Inventory

* Receipt validation
* Delivery validation
* Insufficient stock
* Internal transfer
* Invalid source/destination
* Stock adjustment
* Ledger consistency

### Security

* Unauthorized API requests
* Invalid authentication tokens
* Role-based access
* Malicious input
* SQL injection attempts

---

# 📈 Performance & Scalability

StockSense is designed so that additional functionality can be introduced without rewriting the entire application.

Potential future extensions include:

* Barcode scanning
* QR code support
* Purchase orders
* Sales orders
* Supplier management
* Customer management
* Advanced analytics
* Audit logs
* Role-based permissions
* Automated purchase suggestions
* Inventory forecasting
* Export to CSV/PDF

---

# 🤖 Optional Intelligent Features

AI should only be introduced where it provides genuine business value.

Potential applications include:

* Demand forecasting
* Stock replenishment suggestions
* Inventory anomaly detection
* Natural-language inventory queries
* Automated inventory insights

AI functionality should remain modular and must not become a dependency for basic inventory operations.

---

# 🎨 UI/UX Principles

The interface follows:

* Consistent color system
* Clear visual hierarchy
* Responsive layouts
* Intuitive navigation
* Meaningful empty states
* Loading states
* Error states
* Confirmation dialogs
* Accessible form controls
* Consistent tables and filters
* Clear success/error feedback

The primary goal is to make common inventory operations quick and understandable for warehouse staff.

---

# 🌱 Git & Collaboration

Development follows a collaborative Git workflow.

Example:

```text
main
 │
 ├── feature/authentication
 ├── feature/products
 ├── feature/receipts
 ├── feature/deliveries
 ├── feature/transfers
 └── feature/dashboard
```

Each contributor should work on a dedicated feature branch and submit changes through pull requests.

Commits should describe the actual change:

```text
feat: add product management API
feat: implement receipt validation
fix: prevent negative stock
feat: add inventory dashboard
fix: validate duplicate SKU
```

---

# 📋 Hackathon Evaluation Alignment

StockSense is designed around the technical areas emphasized by the Odoo Hackathon.

| Evaluation Area    | StockSense Approach                          |
| ------------------ | -------------------------------------------- |
| Database Design    | Relational PostgreSQL model                  |
| Backend/API        | Modular REST API                             |
| Coding Standards   | Separation of concerns                       |
| Modularity         | Independent domain modules                   |
| Frontend Design    | Consistent responsive UI                     |
| Performance        | Efficient queries and indexed fields         |
| Scalability        | Service-based modular architecture           |
| Security           | Authentication, authorization and validation |
| Usability          | Simple inventory workflows                   |
| Debugging          | Structured errors and logging                |
| Problem Solving    | Complete inventory lifecycle                 |
| Data Integrity     | Transactions + stock ledger                  |
| Team Collaboration | Git feature-branch workflow                  |

---

# 🚧 Development Philosophy

StockSense follows these principles:

### 1. Build from scratch

Core inventory functionality should be implemented within the application rather than depending heavily on third-party backend platforms.

### 2. Database first

Inventory is fundamentally a data-consistency problem. Database relationships, constraints, transactions, and indexing are treated as first-class design concerns.

### 3. Validate everything

User input should never be blindly trusted.

### 4. Keep modules independent

Each domain should have a clear responsibility.

```text
Authentication
Products
Inventory
Receipts
Deliveries
Transfers
Adjustments
Ledger
Dashboard
```

### 5. Every stock movement must be traceable

No silent inventory changes.

### 6. UI should reflect business logic

The interface should make invalid operations difficult to perform.

---

# 📸 Mockup

The initial UI/UX reference for StockSense:

[View StockSense Excalidraw Mockup](https://link.excalidraw.com/l/65VNwvy7c4X/3ENvQFu9o8R)

---

# 🗺️ Roadmap

### Phase 1 — Foundation

* [x] Project setup
* [ ] Database schema
* [ ] Authentication
* [ ] User profile
* [ ] Application layout

### Phase 2 — Inventory

* [ ] Products
* [ ] Categories
* [ ] Warehouses
* [ ] Locations
* [ ] Stock tracking

### Phase 3 — Operations

* [ ] Receipts
* [ ] Delivery Orders
* [ ] Internal Transfers
* [ ] Inventory Adjustments
* [ ] Stock Ledger

### Phase 4 — Dashboard

* [ ] Inventory KPIs
* [ ] Dynamic filters
* [ ] Low-stock alerts
* [ ] Operation summaries

### Phase 5 — Quality

* [ ] API testing
* [ ] Security testing
* [ ] Input validation
* [ ] Error handling
* [ ] Performance optimization
* [ ] UI refinement

### Phase 6 — Deployment

* [ ] Production database
* [ ] Backend deployment
* [ ] Frontend deployment
* [ ] Environment configuration
* [ ] Final testing

---

# 👨‍💻 Team

**StockSense — Odoo Hackathon**

Built with a focus on:

> **Clean Architecture • Strong Database Design • Modular Development • Real-World Usability**

---

# 📄 License

This project is developed for the Odoo Hackathon and educational/professional evaluation purposes.
