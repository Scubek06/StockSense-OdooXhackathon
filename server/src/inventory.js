import { Router } from 'express';
import { pool, inTransaction } from './db.js';
import { requireAuth } from './auth.js';
import {
  validateBody, categorySchema, productSchema, warehouseSchema, locationSchema,
  operationSchema, operationStatusSchema
} from './validation.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const routesByKind = {
  receipt: 'receipts',
  delivery: 'deliveries',
  transfer: 'transfers',
  adjustment: 'adjustments'
};
const kindsByRoute = Object.fromEntries(Object.entries(routesByKind).map(([kind, route]) => [route, kind]));

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function pageLimit(value, defaultValue = 100) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw badRequest('limit must be an integer from 1 to 500.');
  return parsed;
}

function addFilter(where, values, sql, value) {
  values.push(value);
  where.push(sql.replace('?', `$${values.length}`));
}

function operationFilters(query, alias = 'o') {
  const where = [];
  const values = [];
  const kindFilter = query.kind ?? query.documentType ?? query.type;
  if (kindFilter) {
    if (!Object.hasOwn(routesByKind, kindFilter)) throw badRequest('Invalid operation type filter.');
    addFilter(where, values, `${alias}.kind = ?`, kindFilter);
  }
  if (query.status) {
    if (!['draft', 'waiting', 'ready', 'done', 'canceled'].includes(query.status)) throw badRequest('Invalid operation status filter.');
    addFilter(where, values, `${alias}.status = ?`, query.status);
  }
  if (query.warehouseId) {
    addFilter(where, values,
      `EXISTS (SELECT 1 FROM locations wl WHERE wl.warehouse_id = ? AND wl.id IN (${alias}.source_location_id, ${alias}.destination_location_id))`,
      query.warehouseId);
  }
  if (query.locationId) {
    addFilter(where, values, `? IN (${alias}.source_location_id, ${alias}.destination_location_id)`, query.locationId);
  }
  if (query.categoryId) {
    addFilter(where, values,
      `EXISTS (SELECT 1 FROM operation_items oi JOIN products p ON p.id = oi.product_id WHERE oi.operation_id = ${alias}.id AND p.category_id = ?)`,
      query.categoryId);
  }
  if (query.from) addFilter(where, values, `${alias}.created_at >= ?::timestamptz`, query.from);
  if (query.to) addFilter(where, values, `${alias}.created_at < (?::date + INTERVAL '1 day')`, query.to);
  return { where, values };
}

function stockFilters(query, alias = 's') {
  const where = ['p.active = true'];
  const values = [];
  if (query.warehouseId) addFilter(where, values,
    `EXISTS (SELECT 1 FROM locations fl WHERE fl.id = ${alias}.location_id AND fl.warehouse_id = ?)`, query.warehouseId);
  if (query.locationId) addFilter(where, values, `${alias}.location_id = ?`, query.locationId);
  if (query.categoryId) addFilter(where, values, `p.category_id = ?`, query.categoryId);
  return { where, values };
}

inventoryRouter.get(['/categories', '/products/categories'], async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ORDER BY c.name`
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

inventoryRouter.post(['/categories', '/products/categories'], validateBody(categorySchema), async (request, response, next) => {
  try {
    const { name, description } = request.body;
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name, description ?? null]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.patch(['/categories/:id', '/products/categories/:id'], validateBody(categorySchema.partial()), async (request, response, next) => {
  try {
    const result = await pool.query(
      `UPDATE categories SET name = COALESCE($2, name),
                             description = CASE WHEN $4 THEN $3 ELSE description END
       WHERE id = $1 RETURNING id, name, description, created_at`,
      [request.params.id, request.body.name, request.body.description, Object.hasOwn(request.body, 'description')]
    );
    if (!result.rowCount) throw badRequest('Category not found.', 404);
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.delete(['/categories/:id', '/products/categories/:id'], async (request, response, next) => {
  try {
    await inTransaction(async (client) => {
      const category = await client.query(
        'SELECT id FROM categories WHERE id = $1 FOR UPDATE',
        [request.params.id]
      );
      if (!category.rowCount) throw badRequest('Category not found.', 404);

      const assignedProducts = await client.query(
        'SELECT EXISTS (SELECT 1 FROM products WHERE category_id = $1) AS in_use',
        [request.params.id]
      );
      if (assignedProducts.rows[0].in_use) {
        throw badRequest('This category cannot be deleted because it is assigned to one or more products.', 409);
      }

      await client.query('DELETE FROM categories WHERE id = $1', [request.params.id]);
    });
    response.status(204).end();
  } catch (error) { next(error); }
});

inventoryRouter.get('/products', async (request, response, next) => {
  try {
    const values = [];
    const where = [];
    const stockJoin = [];
    if (request.query.categoryId) addFilter(where, values, 'p.category_id = ?', request.query.categoryId);
    if (request.query.search) {
      values.push(`%${String(request.query.search).slice(0, 100)}%`);
      where.push(`(p.name ILIKE $${values.length} OR p.sku ILIKE $${values.length})`);
    }
    if (request.query.active !== undefined) {
      if (!['true', 'false'].includes(request.query.active)) throw badRequest('active must be true or false.');
      addFilter(where, values, 'p.active = ?', request.query.active === 'true');
    }
    if (request.query.warehouseId || request.query.locationId) {
      if (request.query.warehouseId) {
        values.push(request.query.warehouseId);
        stockJoin.push(`EXISTS (SELECT 1 FROM locations fl WHERE fl.id = s.location_id AND fl.warehouse_id = $${values.length})`);
      }
      if (request.query.locationId) {
        values.push(request.query.locationId);
        stockJoin.push(`s.location_id = $${values.length}`);
      }
    }
    const result = await pool.query(
      `SELECT p.id, p.name, p.sku, p.unit, p.reorder_level, p.active, p.category_id,
              c.name AS category_name, p.created_at, p.updated_at,
              COALESCE(SUM(s.quantity), 0) AS on_hand
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN stock s ON s.product_id = p.id ${stockJoin.length ? `AND ${stockJoin.join(' AND ')}` : ''}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY p.id, c.name ORDER BY p.name LIMIT ${pageLimit(request.query.limit)}`,
      values
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

inventoryRouter.post('/products', validateBody(productSchema), async (request, response, next) => {
  try {
    const { name, sku, categoryId, unit, reorderLevel, active } = request.body;
    const result = await pool.query(
      `INSERT INTO products (name, sku, category_id, unit, reorder_level, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, sku, category_id, unit, reorder_level, active, created_at, updated_at`,
      [name, sku, categoryId ?? null, unit ?? 'unit', reorderLevel ?? 0, active ?? true]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.get('/products/:id', async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.sku, p.category_id, c.name AS category_name,
              p.unit, p.reorder_level, p.active, p.created_at, p.updated_at,
              COALESCE(json_agg(json_build_object(
                'locationId', l.id, 'location', l.name, 'warehouseId', w.id,
                'warehouse', w.name, 'quantity', s.quantity
              ) ORDER BY w.name, l.name) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS stock
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN stock s ON s.product_id = p.id
       LEFT JOIN locations l ON l.id = s.location_id
       LEFT JOIN warehouses w ON w.id = l.warehouse_id
       WHERE p.id = $1 GROUP BY p.id, c.name`,
      [request.params.id]
    );
    if (!result.rowCount) throw badRequest('Product not found.', 404);
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.patch('/products/:id', validateBody(productSchema.partial()), async (request, response, next) => {
  try {
    const { name, sku, categoryId, unit, reorderLevel, active } = request.body;
    const result = await pool.query(
      `UPDATE products SET name = COALESCE($2, name), sku = COALESCE($3, sku),
       category_id = CASE WHEN $4::boolean THEN $5::uuid ELSE category_id END,
       unit = COALESCE($6, unit), reorder_level = COALESCE($7, reorder_level),
       active = COALESCE($8, active), updated_at = now()
       WHERE id = $1
       RETURNING id, name, sku, category_id, unit, reorder_level, active, created_at, updated_at`,
      [request.params.id, name, sku, categoryId !== undefined, categoryId ?? null, unit, reorderLevel, active]
    );
    if (!result.rowCount) throw badRequest('Product not found.', 404);
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.put('/products/:id', validateBody(productSchema), async (request, response, next) => {
  try {
    const { name, sku, categoryId, unit, reorderLevel, active } = request.body;
    const result = await pool.query(
      `UPDATE products SET name = $2, sku = $3, category_id = $4, unit = $5,
       reorder_level = $6, active = $7, updated_at = now()
       WHERE id = $1
       RETURNING id, name, sku, category_id, unit, reorder_level, active, created_at, updated_at`,
      [request.params.id, name, sku, categoryId ?? null, unit ?? 'unit', reorderLevel ?? 0, active ?? true]
    );
    if (!result.rowCount) throw badRequest('Product not found.', 404);
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.delete('/products/:id', async (request, response, next) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [request.params.id]);
    if (!result.rowCount) throw badRequest('Product not found.', 404);
    response.status(204).end();
  } catch (error) { next(error); }
});

inventoryRouter.get('/warehouses', async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.name, w.code, w.address,
       COALESCE(json_agg(json_build_object('id', l.id, 'name', l.name, 'code', l.code)
         ORDER BY l.name) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS locations
       FROM warehouses w LEFT JOIN locations l ON l.warehouse_id = w.id
       GROUP BY w.id ORDER BY w.name`
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

inventoryRouter.post('/warehouses', validateBody(warehouseSchema), async (request, response, next) => {
  try {
    const { name, code, address } = request.body;
    const result = await pool.query(
      'INSERT INTO warehouses (name, code, address) VALUES ($1, $2, $3) RETURNING id, name, code, address',
      [name, code, address ?? null]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.get('/locations', async (request, response, next) => {
  try {
    const values = [];
    const where = [];
    if (request.query.warehouseId) addFilter(where, values, 'l.warehouse_id = ?', request.query.warehouseId);
    const result = await pool.query(
      `SELECT l.id, l.name, l.code, l.warehouse_id, w.name AS warehouse_name
       FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY w.name, l.name`,
      values
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

inventoryRouter.post('/locations', validateBody(locationSchema), async (request, response, next) => {
  try {
    const { warehouseId, name, code } = request.body;
    const result = await pool.query(
      `INSERT INTO locations (warehouse_id, name, code) VALUES ($1, $2, $3)
       RETURNING id, name, code, warehouse_id`,
      [warehouseId, name, code]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.patch('/locations/:id', validateBody(locationSchema), async (request, response, next) => {
  try {
    const { warehouseId, name, code } = request.body;
    const result = await pool.query(
      `UPDATE locations
       SET warehouse_id = $2, name = $3, code = $4
       WHERE id = $1
       RETURNING id, name, code, warehouse_id`,
      [request.params.id, warehouseId, name, code]
    );
    if (!result.rowCount) throw badRequest('Location not found.', 404);
    response.json(result.rows[0]);
  } catch (error) { next(error); }
});

inventoryRouter.delete('/locations/:id', async (request, response, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM locations WHERE id = $1 RETURNING id',
      [request.params.id]
    );
    if (!result.rowCount) throw badRequest('Location not found.', 404);
    response.status(204).end();
  } catch (error) {
    if (error.code === '23001' || error.code === '23503') {
      return response.status(409).json({
        error: 'This location cannot be deleted because it is in use by inventory or operation history.'
      });
    }
    next(error);
  }
});

inventoryRouter.get('/stock', async (request, response, next) => {
  try {
    const values = [];
    const where = [];
    if (request.query.productId) addFilter(where, values, 's.product_id = ?', request.query.productId);
    if (request.query.locationId) addFilter(where, values, 's.location_id = ?', request.query.locationId);
    if (request.query.warehouseId) addFilter(where, values, 'l.warehouse_id = ?', request.query.warehouseId);
    if (request.query.categoryId) addFilter(where, values, 'p.category_id = ?', request.query.categoryId);
    const result = await pool.query(
      `SELECT s.product_id, p.name AS product_name, p.sku, p.unit, p.reorder_level,
              s.location_id, l.name AS location_name, w.id AS warehouse_id,
              w.name AS warehouse_name, s.quantity, s.updated_at
       FROM stock s JOIN products p ON p.id = s.product_id
       JOIN locations l ON l.id = s.location_id JOIN warehouses w ON w.id = l.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.name, w.name, l.name LIMIT ${pageLimit(request.query.limit)}`,
      values
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

async function createOperation(kind, request, response, next) {
  try {
    const { items, reference, partyName, notes, sourceLocationId, destinationLocationId } = request.body;
    const created = await inTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO operations (kind, source_location_id, destination_location_id, reference, party_name, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [kind, sourceLocationId ?? null, destinationLocationId ?? null, reference ?? null, partyName ?? null, notes ?? null, request.user.id]
      );
      for (const item of items) {
        if (kind !== 'adjustment' && item.quantity <= 0) {
          throw badRequest('Operation quantities must be greater than zero.');
        }
        const product = await client.query('SELECT id FROM products WHERE id = $1 AND active = true', [item.productId]);
        if (!product.rowCount) throw badRequest(`Product ${item.productId} was not found or is inactive.`);
        await client.query(
          'INSERT INTO operation_items (operation_id, product_id, quantity) VALUES ($1, $2, $3)',
          [inserted.rows[0].id, item.productId, item.quantity]
        );
      }
      return inserted.rows[0];
    });
    response.status(201).json(await getOperation(kind, created.id));
  } catch (error) { next(error); }
}

async function getOperation(kind, id) {
  const result = await pool.query(
    `SELECT o.*,
       json_build_object('id', sl.id, 'name', sl.name, 'warehouseId', sw.id, 'warehouse', sw.name) AS source_location,
       json_build_object('id', dl.id, 'name', dl.name, 'warehouseId', dw.id, 'warehouse', dw.name) AS destination_location,
       COALESCE(json_agg(json_build_object('productId', p.id, 'name', p.name, 'sku', p.sku,
         'unit', p.unit, 'quantity', oi.quantity) ORDER BY p.name)
         FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS items
     FROM operations o
     LEFT JOIN locations sl ON sl.id = o.source_location_id
     LEFT JOIN warehouses sw ON sw.id = sl.warehouse_id
     LEFT JOIN locations dl ON dl.id = o.destination_location_id
     LEFT JOIN warehouses dw ON dw.id = dl.warehouse_id
     LEFT JOIN operation_items oi ON oi.operation_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.id = $1 AND o.kind = $2
     GROUP BY o.id, sl.id, sw.id, dl.id, dw.id`,
    [id, kind]
  );
  return result.rows[0];
}

async function validateOperation(kind, id, userId) {
  return inTransaction(async (client) => {
    const operationResult = await client.query(
      'SELECT * FROM operations WHERE id = $1 AND kind = $2 FOR UPDATE',
      [id, kind]
    );
    if (!operationResult.rowCount) throw badRequest('Operation not found.', 404);
    const operation = operationResult.rows[0];
    if (!['draft', 'waiting', 'ready'].includes(operation.status)) {
      throw badRequest(`Only draft, waiting, or ready operations may be validated (current status: ${operation.status}).`, 409);
    }
    const items = await client.query(
      'SELECT product_id, quantity FROM operation_items WHERE operation_id = $1 ORDER BY product_id',
      [id]
    );
    if (!items.rowCount) throw badRequest('Cannot validate an operation without items.');

    for (const item of items.rows) {
      const productId = item.product_id;
      const requested = Number(item.quantity);
      const sourceId = operation.source_location_id;
      const destinationId = operation.destination_location_id;
      const locationIds = [...new Set([sourceId, destinationId].filter(Boolean))].sort();

      if (destinationId) {
        await client.query(
          'INSERT INTO stock (product_id, location_id, quantity) VALUES ($1, $2, 0) ON CONFLICT (product_id, location_id) DO NOTHING',
          [productId, destinationId]
        );
      }
      const locked = await client.query(
        `SELECT location_id, quantity FROM stock
         WHERE product_id = $1 AND location_id = ANY($2::uuid[])
         ORDER BY location_id FOR UPDATE`,
        [productId, locationIds]
      );
      const quantityByLocation = new Map(locked.rows.map((row) => [row.location_id, Number(row.quantity)]));
      const sourceQuantity = sourceId ? (quantityByLocation.get(sourceId) ?? 0) : null;
      const destinationQuantity = destinationId ? (quantityByLocation.get(destinationId) ?? 0) : null;

      if ((kind === 'delivery' || kind === 'transfer') && sourceQuantity < requested) {
        throw badRequest(`Insufficient stock for product ${productId}: ${sourceQuantity} available, ${requested} requested.`, 409);
      }
      if (kind === 'receipt') {
        const after = destinationQuantity + requested;
        await client.query(
          'UPDATE stock SET quantity = $3, updated_at = now() WHERE product_id = $1 AND location_id = $2',
          [productId, destinationId, after]
        );
        await addLedger(client, operation, item, destinationId, requested, destinationQuantity, requested, after, userId);
      } else if (kind === 'delivery') {
        const after = sourceQuantity - requested;
        await client.query(
          'UPDATE stock SET quantity = $3, updated_at = now() WHERE product_id = $1 AND location_id = $2',
          [productId, sourceId, after]
        );
        await addLedger(client, operation, item, sourceId, requested, sourceQuantity, -requested, after, userId);
      } else if (kind === 'transfer') {
        const sourceAfter = sourceQuantity - requested;
        const destinationAfter = destinationQuantity + requested;
        await client.query('UPDATE stock SET quantity = $3, updated_at = now() WHERE product_id = $1 AND location_id = $2',
          [productId, sourceId, sourceAfter]);
        await client.query('UPDATE stock SET quantity = $3, updated_at = now() WHERE product_id = $1 AND location_id = $2',
          [productId, destinationId, destinationAfter]);
        await addLedger(client, operation, item, sourceId, requested, sourceQuantity, -requested, sourceAfter, userId);
        await addLedger(client, operation, item, destinationId, requested, destinationQuantity, requested, destinationAfter, userId);
      } else {
        const difference = requested - destinationQuantity;
        await client.query('UPDATE stock SET quantity = $3, updated_at = now() WHERE product_id = $1 AND location_id = $2',
          [productId, destinationId, requested]);
        await addLedger(client, operation, item, destinationId, requested, destinationQuantity, difference, requested, userId);
      }
    }
    await client.query(
      `UPDATE operations SET status = 'done', validated_by = $2, validated_at = now() WHERE id = $1`,
      [id, userId]
    );
    return getOperationWithClient(client, kind, id);
  });
}

async function addLedger(client, operation, item, locationId, quantity, before, change, after, userId) {
  await client.query(
    `INSERT INTO stock_ledger
     (operation_id, product_id, location_id, source_location_id, destination_location_id,
      movement_type, quantity, quantity_before, quantity_change, quantity_after, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [operation.id, item.product_id, locationId, operation.source_location_id,
      operation.destination_location_id, operation.kind, quantity, before, change, after, userId]
  );
}

async function getOperationWithClient(client, kind, id) {
  const result = await client.query(
    `SELECT o.*, COALESCE(json_agg(json_build_object('productId', p.id, 'name', p.name,
       'sku', p.sku, 'quantity', oi.quantity) ORDER BY p.name)
       FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS items
     FROM operations o LEFT JOIN operation_items oi ON oi.operation_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.id = $1 AND o.kind = $2 GROUP BY o.id`,
    [id, kind]
  );
  return result.rows[0];
}

for (const [path, kind] of Object.entries(kindsByRoute)) {
  const operationPaths = [`/${path}`, `/operations/${path}`];
  inventoryRouter.get(operationPaths, async (request, response, next) => {
    try {
      const { where, values } = operationFilters({ ...request.query, kind });
      const result = await pool.query(
        `SELECT o.id, o.kind, o.status, o.reference, o.party_name, o.notes, o.created_at, o.validated_at,
          o.source_location_id, sl.name AS source_location, sw.name AS source_warehouse,
          o.destination_location_id, dl.name AS destination_location, dw.name AS destination_warehouse,
          u.name AS created_by,
          (SELECT count(*) FROM operation_items oi WHERE oi.operation_id = o.id)::int AS item_count,
          (SELECT COALESCE(json_agg(json_build_object(
             'productId', p.id, 'name', p.name, 'sku', p.sku, 'quantity', oi.quantity
           ) ORDER BY p.name), '[]'::json)
           FROM operation_items oi JOIN products p ON p.id = oi.product_id
           WHERE oi.operation_id = o.id) AS items
         FROM operations o LEFT JOIN locations sl ON sl.id = o.source_location_id
         LEFT JOIN warehouses sw ON sw.id = sl.warehouse_id
         LEFT JOIN locations dl ON dl.id = o.destination_location_id
         LEFT JOIN warehouses dw ON dw.id = dl.warehouse_id
         LEFT JOIN users u ON u.id = o.created_by
         WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT ${pageLimit(request.query.limit)}`,
        values
      );
      response.json({ items: result.rows });
    } catch (error) { next(error); }
  });
  inventoryRouter.post(operationPaths, validateBody(operationSchema(kind)),
    (request, response, next) => createOperation(kind, request, response, next));
  inventoryRouter.get(operationPaths.map((base) => `${base}/:id`), async (request, response, next) => {
    try {
      const operation = await getOperation(kind, request.params.id);
      if (!operation) throw badRequest('Operation not found.', 404);
      response.json(operation);
    } catch (error) { next(error); }
  });
  inventoryRouter.post(operationPaths.map((base) => `${base}/:id/validate`), async (request, response, next) => {
    try {
      const operation = await validateOperation(kind, request.params.id, request.user.id);
      response.json(operation);
    } catch (error) { next(error); }
  });
  inventoryRouter.patch(operationPaths.map((base) => `${base}/:id/status`), validateBody(operationStatusSchema), async (request, response, next) => {
    try {
      const result = await pool.query(
        `UPDATE operations SET status = $3
         WHERE id = $1 AND kind = $2 AND status IN ('draft', 'waiting', 'ready')
         RETURNING id, kind, status, reference`,
        [request.params.id, kind, request.body.status]
      );
      if (!result.rowCount) throw badRequest('Operation not found or already finalized.', 409);
      response.json(result.rows[0]);
    } catch (error) { next(error); }
  });
  inventoryRouter.post(operationPaths.map((base) => `${base}/:id/cancel`), async (request, response, next) => {
    try {
      const result = await pool.query(
        `UPDATE operations SET status = 'canceled'
         WHERE id = $1 AND kind = $2 AND status IN ('draft', 'waiting', 'ready')
         RETURNING id, kind, status`,
        [request.params.id, kind]
      );
      if (!result.rowCount) throw badRequest('Operation not found or cannot be canceled after validation.', 409);
      response.json(result.rows[0]);
    } catch (error) { next(error); }
  });
}

async function listLedger(request, response, next) {
  try {
    const where = [];
    const values = [];
    if (request.query.productId) addFilter(where, values, 'sl.product_id = ?', request.query.productId);
    const kindFilter = request.query.kind ?? request.query.documentType ?? request.query.type;
    if (kindFilter) {
      if (!Object.hasOwn(routesByKind, kindFilter)) throw badRequest('Invalid ledger operation type.');
      addFilter(where, values, 'sl.movement_type = ?', kindFilter);
    }
    if (request.query.warehouseId) addFilter(where, values,
      'EXISTS (SELECT 1 FROM locations fl WHERE fl.id = sl.location_id AND fl.warehouse_id = ?)', request.query.warehouseId);
    if (request.query.locationId) addFilter(where, values, 'sl.location_id = ?', request.query.locationId);
    if (request.query.categoryId) addFilter(where, values, 'p.category_id = ?', request.query.categoryId);
    if (request.query.from) addFilter(where, values, 'sl.created_at >= ?::timestamptz', request.query.from);
    if (request.query.to) addFilter(where, values, 'sl.created_at < (?::date + INTERVAL \'1 day\')', request.query.to);
    const result = await pool.query(
      `SELECT sl.id, sl.operation_id, sl.product_id, p.name AS product_name, p.sku,
        sl.location_id, l.name AS location_name, w.id AS warehouse_id, w.name AS warehouse_name,
        sl.source_location_id, src.name AS source_location, sl.destination_location_id, dst.name AS destination_location,
        sl.movement_type, sl.quantity, sl.quantity_before, sl.quantity_change, sl.quantity_after,
        sl.created_by, u.name AS user_name, sl.created_at, o.reference
       FROM stock_ledger sl JOIN products p ON p.id = sl.product_id
       JOIN locations l ON l.id = sl.location_id JOIN warehouses w ON w.id = l.warehouse_id
       JOIN operations o ON o.id = sl.operation_id
       LEFT JOIN locations src ON src.id = sl.source_location_id
       LEFT JOIN locations dst ON dst.id = sl.destination_location_id
       LEFT JOIN users u ON u.id = sl.created_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY sl.created_at DESC, sl.id DESC LIMIT ${pageLimit(request.query.limit)}`,
      values
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
}

inventoryRouter.get('/ledger', listLedger);
inventoryRouter.get('/ledger/:productId', (request, response, next) => {
  request.query.productId = request.params.productId;
  return listLedger(request, response, next);
});

inventoryRouter.get(['/dashboard/summary', '/dashboard'], async (request, response, next) => {
  try {
    const { where, values } = stockFilters(request.query);
    const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const stockResult = await pool.query(
      `WITH by_product AS (
         SELECT p.id, p.reorder_level, COALESCE(SUM(s.quantity), 0) AS quantity
         FROM products p LEFT JOIN stock s ON s.product_id = p.id
         LEFT JOIN locations l ON l.id = s.location_id
         ${filterSql}
         GROUP BY p.id
       )
       SELECT count(*) FILTER (WHERE quantity > 0)::int AS products_in_stock,
              count(*) FILTER (WHERE quantity > 0 AND quantity <= reorder_level)::int AS low_stock_items,
              count(*) FILTER (WHERE quantity = 0)::int AS out_of_stock_items
       FROM by_product`,
      values
    );
    const { where: opWhere, values: opValues } = operationFilters(request.query);
    const pendingResult = await pool.query(
      `SELECT kind, count(*)::int AS count FROM operations o
       WHERE status IN ('draft', 'waiting', 'ready')
       ${opWhere.length ? `AND ${opWhere.join(' AND ')}` : ''}
       GROUP BY kind`,
      opValues
    );
    const pending = Object.fromEntries(Object.keys(routesByKind).map((kind) => [kind, 0]));
    for (const row of pendingResult.rows) pending[row.kind] = row.count;
    response.json({ summary: {
      totalProductsInStock: stockResult.rows[0].products_in_stock,
      lowStockItems: stockResult.rows[0].low_stock_items,
      outOfStockItems: stockResult.rows[0].out_of_stock_items,
      pendingReceipts: pending.receipt,
      pendingDeliveries: pending.delivery,
      scheduledInternalTransfers: pending.transfer,
      pendingOperations: pending
    } });
  } catch (error) { next(error); }
});

inventoryRouter.get('/dashboard/operations', async (request, response, next) => {
  try {
    const { where, values } = operationFilters(request.query);
    const result = await pool.query(
      `SELECT o.id, o.kind, o.status, o.reference, o.created_at, o.validated_at,
        sl.name AS source_location, sw.name AS source_warehouse,
        dl.name AS destination_location, dw.name AS destination_warehouse,
        (SELECT count(*) FROM operation_items oi WHERE oi.operation_id = o.id)::int AS item_count
       FROM operations o LEFT JOIN locations sl ON sl.id = o.source_location_id
       LEFT JOIN warehouses sw ON sw.id = sl.warehouse_id
       LEFT JOIN locations dl ON dl.id = o.destination_location_id
       LEFT JOIN warehouses dw ON dw.id = dl.warehouse_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.created_at DESC LIMIT ${pageLimit(request.query.limit)}`,
      values
    );
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});
