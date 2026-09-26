import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const email = (process.env.DEMO_EMAIL || 'demo@stocksense.local').toLowerCase();
const password = process.env.DEMO_PASSWORD || randomBytes(24).toString('base64url');

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('StockSense Demo', $1, $2, 'manager')
       ON CONFLICT (lower(email)) DO UPDATE
       SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [email, await bcrypt.hash(password, 12)]
    );
    const categoryIds = {};
    for (const [name, description] of [
      ['Raw Materials', 'Materials used in production'],
      ['Finished Goods', 'Ready-to-ship products'],
      ['Packaging', 'Shipping and packing supplies']
    ]) {
      const row = await client.query(
        `INSERT INTO categories (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [name, description]
      );
      categoryIds[name] = row.rows[0].id;
    }
    const warehouse = await client.query(
      `INSERT INTO warehouses (name, code, address) VALUES ('Central Warehouse', 'CENTRAL', '100 Market Street')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    const locationRows = {};
    for (const [name, code] of [['Receiving', 'RECV'], ['Main Storage', 'MAIN'], ['Dispatch', 'SHIP']]) {
      const row = await client.query(
        `INSERT INTO locations (warehouse_id, name, code) VALUES ($1, $2, $3)
         ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [warehouse.rows[0].id, name, code]
      );
      locationRows[code] = row.rows[0].id;
    }
    const products = [
      { name: 'Steel Rod 10mm', sku: 'STL-ROD-10', category: 'Raw Materials', unit: 'pcs', reorder: 25, qty: 120 },
      { name: 'Office Chair', sku: 'CHR-OFF-01', category: 'Finished Goods', unit: 'pcs', reorder: 10, qty: 8 },
      { name: 'Shipping Carton', sku: 'PKG-BOX-01', category: 'Packaging', unit: 'pcs', reorder: 30, qty: 0 }
    ];
    for (const product of products) {
      const result = await client.query(
        `INSERT INTO products (name, sku, category_id, unit, reorder_level)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (lower(sku)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [product.name, product.sku, categoryIds[product.category], product.unit, product.reorder]
      );
      const productId = result.rows[0].id;
      const locationId = product.sku === 'CHR-OFF-01' ? locationRows.SHIP : locationRows.MAIN;
      const reference = `SEED-${product.sku}`;
      const seededReceipt = product.qty > 0
        ? await client.query("SELECT id FROM operations WHERE reference = $1 AND kind = 'receipt'", [reference])
        : { rowCount: 0 };
      const stockInsert = await client.query(
        `INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (product_id, location_id) DO NOTHING`,
        [productId, locationId, product.qty]
      );
      if (product.qty > 0 && stockInsert.rowCount && !seededReceipt.rowCount) {
        const operation = await client.query(
          `INSERT INTO operations (kind, status, destination_location_id, reference, notes, created_by, validated_by, validated_at)
           VALUES ('receipt', 'done', $1, $2, 'Seeded opening stock', $3, $3, now())
           RETURNING id`,
          [locationId, reference, user.rows[0].id]
        );
        await client.query('INSERT INTO operation_items (operation_id, product_id, quantity) VALUES ($1, $2, $3)',
          [operation.rows[0].id, productId, product.qty]);
        await client.query(
          `INSERT INTO stock_ledger
           (operation_id, product_id, location_id, destination_location_id, movement_type, quantity, quantity_before, quantity_change, quantity_after, created_by)
           VALUES ($1, $2, $3, $3, 'receipt', $4, 0, $4, $4, $5)`,
          [operation.rows[0].id, productId, locationId, product.qty, user.rows[0].id]
        );
      }
    }
    await client.query('COMMIT');
    console.log(process.env.NODE_ENV === 'production'
      ? 'Seed data ready.'
      : `Seed data ready. Demo login: ${email} / ${password}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(`Database seeding failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
