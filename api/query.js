import { getPool, assertDatabaseConfigured } from './_lib/database.js';
import { getRequestUser, hashPassword, isAdmin, requireUser, sendError } from './_lib/auth.js';
import { assertJsonBodyLimit, enforceBurstLimit } from './_lib/request-guard.js';
import { assertColumn, getTable, normalizeRow, prepareValue } from './_lib/tables.js';

const READ_ONLY_PUBLIC_TABLES = new Set(['store_settings']);
const ADMIN_WRITE_TABLES = new Set(['cashier_accounts', 'superadmin_profile', 'store_branches']);
const ADMIN_READ_TABLES = new Set(['cashier_accounts', 'superadmin_profile']);
const WRITE_PERMISSIONS = {
  units: ['unit'],
  categories: ['category'],
  raw_materials: ['raw-material', 'kasir', 'stock-opname', 'returns'],
  store_branch_stocks: ['raw-material', 'kasir', 'stock-opname', 'returns'],
  toppings: ['topping'],
  product_menus: ['product-menu'],
  inventory_stock_logs: ['raw-material', 'kasir', 'stock-opname', 'returns', 'category'],
  orders: ['kasir', 'returns'],
  store_settings: ['settings']
};
const ALLOWED_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'not_like', 'not_ilike', 'in']);
const MAX_BATCH_ROWS = 100;
const MAX_FILTERS = 20;
const MAX_IN_VALUES = 500;
const MAX_OR_CONDITIONS = 20;
const MAX_SELECT_ROWS = 250;
const DEFAULT_SELECT_ROWS = 100;
const MAX_SELECT_COLUMNS = 30;

const assertQueryComplexity = (body) => {
  if (Array.isArray(body.filters) && body.filters.length > MAX_FILTERS) {
    throw Object.assign(new Error(`Filter maksimal ${MAX_FILTERS} per request.`), { statusCode: 400 });
  }
  if (String(body.or || '').length > 4000 || String(body.or || '').split(',').filter(Boolean).length > MAX_OR_CONDITIONS) {
    throw Object.assign(new Error(`Kondisi OR maksimal ${MAX_OR_CONDITIONS} per request.`), { statusCode: 400 });
  }
  if (Array.isArray(body.values) && body.values.length > MAX_BATCH_ROWS) {
    throw Object.assign(new Error(`Operasi batch maksimal ${MAX_BATCH_ROWS} baris per request.`), { statusCode: 400 });
  }
  if (body.range) {
    const from = Math.max(0, Number(body.range.from) || 0);
    const to = Math.max(from, Number(body.range.to) || 0);
    if (to - from + 1 > MAX_SELECT_ROWS || from > 1_000_000) {
      throw Object.assign(new Error(`Rentang data maksimal ${MAX_SELECT_ROWS} baris per request.`), { statusCode: 400 });
    }
  }
};

const parseColumns = (table, raw = '*') => {
  const requested = (!raw || raw === '*')
    ? (table.defaultColumns || table.columns)
    : String(raw)
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  if (requested.length > MAX_SELECT_COLUMNS) {
    throw Object.assign(new Error(`Kolom respons maksimal ${MAX_SELECT_COLUMNS} per request.`), { statusCode: 400 });
  }
  return requested.map((column) => {
      assertColumn(table, column);
      return column;
    })
    .filter((column) => !(table.secret || []).includes(column));
};

const stripTransactionImages = (value) => {
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return []; }
  }
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const { image, imageUrl, photo, thumbnail, ...cleanItem } = item || {};
    return {
      ...cleanItem,
      toppings: Array.isArray(cleanItem.toppings)
        ? cleanItem.toppings.map((topping) => {
            const { image: toppingImage, imageUrl: toppingImageUrl, photo: toppingPhoto, ...cleanTopping } = topping || {};
            return cleanTopping;
          })
        : []
    };
  });
};

const buildCondition = (table, filter, params) => {
  const operator = filter.operator;
  if (!ALLOWED_OPERATORS.has(operator)) throw Object.assign(new Error(`Operator tidak didukung: ${operator}`), { statusCode: 400 });
  const column = assertColumn(table, filter.column);
  const value = filter.value;

  if (operator === 'in') {
    if (!Array.isArray(value) || value.length === 0) return '1 = 0';
    if (value.length > MAX_IN_VALUES) {
      throw Object.assign(new Error(`Nilai filter IN maksimal ${MAX_IN_VALUES}.`), { statusCode: 400 });
    }
    params.push(...value.map((item) => prepareValue(table, filter.column, item)));
    return `${column} IN (${value.map(() => '?').join(', ')})`;
  }

  const sqlOperator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'LIKE', not_like: 'NOT LIKE', not_ilike: 'NOT LIKE' }[operator];
  params.push(prepareValue(table, filter.column, value));
  return `${column} ${sqlOperator} ?`;
};

const parseOrExpression = (table, expression, params) => {
  if (!expression) return null;
  const parts = String(expression).split(',').filter(Boolean);
  if (parts.length > MAX_OR_CONDITIONS) {
    throw Object.assign(new Error(`Kondisi OR maksimal ${MAX_OR_CONDITIONS} per request.`), { statusCode: 400 });
  }
  const conditions = parts.map((part) => {
    const [column, operator, ...valueParts] = part.split('.');
    return buildCondition(table, { column, operator, value: valueParts.join('.') }, params);
  });
  return conditions.length ? `(${conditions.join(' OR ')})` : null;
};

const buildWhere = (table, filters = [], orExpression = '', params = []) => {
  const conditions = filters.map((filter) => buildCondition(table, filter, params));
  const orCondition = parseOrExpression(table, orExpression, params);
  if (orCondition) conditions.push(orCondition);
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
};

const sanitizeInput = async (tableName, table, values) => {
  const rows = Array.isArray(values) ? values : [values];
  return Promise.all(rows.map(async (row) => {
    const clean = table.columns.includes('updated_at') && row?.updated_at === undefined
      ? { updated_at: new Date() }
      : {};
    for (const [column, rawValue] of Object.entries(row || {})) {
      assertColumn(table, column);
      if (column === 'password' && ['cashier_accounts', 'superadmin_profile'].includes(tableName)) {
        if (rawValue) {
          const minimum = tableName === 'superadmin_profile' ? 6 : 4;
          if (String(rawValue).length < minimum) {
            throw Object.assign(new Error(`Kata sandi minimal ${minimum} karakter.`), { statusCode: 400 });
          }
          clean[column] = await hashPassword(String(rawValue));
        }
        continue;
      }
      if (tableName === 'orders' && column === 'return_photo') {
        clean[column] = null;
        continue;
      }
      const safeValue = tableName === 'orders' && column === 'items'
        ? stripTransactionImages(rawValue)
        : rawValue;
      clean[column] = prepareValue(table, column, safeValue);
    }
    return clean;
  }));
};

const selectRowsByKeys = async (db, tableName, table, rows, selectedColumns) => {
  const usable = rows.filter((row) => table.primaryKey.every((key) => row[key] !== undefined));
  if (!usable.length) return [];
  const params = [];
  const keyClauses = usable.map((row) => `(${table.primaryKey.map((key) => {
    params.push(row[key]);
    return `${assertColumn(table, key)} = ?`;
  }).join(' AND ')})`);
  const columnsSql = selectedColumns.map((column) => assertColumn(table, column)).join(', ');
  const [result] = await db.execute(`SELECT ${columnsSql} FROM \`${tableName}\` WHERE ${keyClauses.join(' OR ')}`, params);
  return result.map((row) => normalizeRow(table, row));
};

const executeSelect = async (db, tableName, table, body) => {
  const selectedColumns = parseColumns(table, body.select?.columns);
  const params = [];
  const where = buildWhere(table, body.filters, body.or, params);
  const columnsSql = selectedColumns.map((column) => assertColumn(table, column)).join(', ');
  let sql = `SELECT ${columnsSql} FROM \`${tableName}\`${where}`;

  if (body.order?.column) {
    sql += ` ORDER BY ${assertColumn(table, body.order.column)} ${body.order.ascending === false ? 'DESC' : 'ASC'}`;
  }

  let limit = body.limit
    ? Math.max(1, Math.min(MAX_SELECT_ROWS, Number(body.limit) || 1))
    : (body.single || body.maybeSingle ? 1 : DEFAULT_SELECT_ROWS);
  let offset = 0;
  if (body.range) {
    offset = Math.max(0, Number(body.range.from) || 0);
    limit = Math.max(1, Math.min(MAX_SELECT_ROWS, Number(body.range.to) - offset + 1));
  }
  // TiDB's MySQL-compatible prepared statements reject placeholders in LIMIT/OFFSET.
  // Both values are normalized finite integers above, so interpolation is safe here.
  sql += ` LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}`;

  const [rows] = await db.execute(sql, params);
  let count = null;
  if (body.select?.count === 'exact') {
    const countParams = [];
    const countWhere = buildWhere(table, body.filters, body.or, countParams);
    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM \`${tableName}\`${countWhere}`, countParams);
    count = Number(countRows[0]?.total || 0);
  }

  const normalized = rows.map((row) => normalizeRow(table, row));
  return { data: body.single || body.maybeSingle ? (normalized[0] || null) : normalized, count };
};

const executeInsert = async (db, tableName, table, body, upsert = false) => {
  const rows = await sanitizeInput(tableName, table, body.values);
  if (!rows.length) return { data: [], count: null };
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) throw Object.assign(new Error('Data insert kosong.'), { statusCode: 400 });
  const params = [];
  const valuesSql = rows.map((row) => `(${columns.map((column) => {
    params.push(row[column] === undefined ? null : row[column]);
    return '?';
  }).join(', ')})`).join(', ');
  let sql = `INSERT INTO \`${tableName}\` (${columns.map((column) => assertColumn(table, column)).join(', ')}) VALUES ${valuesSql}`;
  if (upsert) {
    const conflictKeys = body.onConflict
      ? String(body.onConflict).split(',').map((value) => value.trim())
      : table.primaryKey;
    conflictKeys.forEach((key) => assertColumn(table, key));
    const updates = columns.filter((column) => !conflictKeys.includes(column));
    sql += updates.length
      ? ` ON DUPLICATE KEY UPDATE ${updates.map((column) => `${assertColumn(table, column)} = VALUES(${assertColumn(table, column)})`).join(', ')}`
      : ` ON DUPLICATE KEY UPDATE ${assertColumn(table, conflictKeys[0])} = ${assertColumn(table, conflictKeys[0])}`;
  }
  await db.execute(sql, params);

  const selectedColumns = parseColumns(table, body.select?.columns);
  const data = body.returning
    ? await selectRowsByKeys(db, tableName, table, rows, selectedColumns)
    : null;
  return { data: body.single || body.maybeSingle ? (data?.[0] || null) : data, count: null };
};

const executeUpdate = async (db, tableName, table, body) => {
  const [values] = await sanitizeInput(tableName, table, body.values);
  const entries = Object.entries(values || {});
  if (!entries.length) throw Object.assign(new Error('Data update kosong.'), { statusCode: 400 });
  if (!body.filters?.length) throw Object.assign(new Error('Update tanpa filter ditolak.'), { statusCode: 400 });
  const params = entries.map(([, value]) => value);
  const setSql = entries.map(([column]) => `${assertColumn(table, column)} = ?`).join(', ');
  const where = buildWhere(table, body.filters, body.or, params);
  await db.execute(`UPDATE \`${tableName}\` SET ${setSql}${where}`, params);

  let data = null;
  if (body.returning) {
    const result = await executeSelect(db, tableName, table, body);
    data = result.data;
  }
  return { data, count: null };
};

const executeDelete = async (db, tableName, table, body) => {
  if (!body.filters?.length) throw Object.assign(new Error('Delete tanpa filter ditolak.'), { statusCode: 400 });
  const params = [];
  const where = buildWhere(table, body.filters, body.or, params);
  await db.execute(`DELETE FROM \`${tableName}\`${where}`, params);
  return { data: null, count: null };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });
  try {
    assertDatabaseConfigured();
    assertJsonBodyLimit(req, 2_000_000);
    const body = req.body || {};
    assertQueryComplexity(body);
    const table = getTable(body.table);
    if (!table) throw Object.assign(new Error('Tabel tidak diizinkan.'), { statusCode: 400 });
    const operation = body.operation || 'select';
    const user = getRequestUser(req);
    enforceBurstLimit(req, res, {
      namespace: 'query',
      identity: user?.sub || '',
      limit: 120,
      windowMs: 60_000
    });

    if (!(operation === 'select' && READ_ONLY_PUBLIC_TABLES.has(body.table))) requireUser(req);
    if (operation === 'select' && ADMIN_READ_TABLES.has(body.table) && !isAdmin(user)) {
      throw Object.assign(new Error('Anda tidak memiliki izin untuk membaca data akun.'), { statusCode: 403 });
    }
    if (operation !== 'select' && ADMIN_WRITE_TABLES.has(body.table) && !isAdmin(user)) {
      throw Object.assign(new Error('Anda tidak memiliki izin untuk mengubah data ini.'), { statusCode: 403 });
    }
    if (operation !== 'select' && body.table === 'superadmin_profile' && user?.role !== 'superadmin') {
      throw Object.assign(new Error('Hanya Super Admin yang dapat mengubah profil ini.'), { statusCode: 403 });
    }
    if (operation !== 'select' && !isAdmin(user) && WRITE_PERMISSIONS[body.table]) {
      const allowed = WRITE_PERMISSIONS[body.table].some((permission) => user?.permissions?.includes(permission));
      if (!allowed) throw Object.assign(new Error('Hak akses akun tidak mencakup operasi ini.'), { statusCode: 403 });
    }

    const db = getPool();
    if (operation !== 'select' && body.table === 'cashier_accounts' && user?.role !== 'superadmin') {
      const inputRows = Array.isArray(body.values) ? body.values : [body.values || {}];
      if (inputRows.some((row) => ['admin', 'kepala_toko', 'superadmin'].includes(row.role))) {
        throw Object.assign(new Error('Hanya Super Admin yang dapat membuat atau menetapkan akun administrator.'), { statusCode: 403 });
      }
      const idFilter = body.filters?.find((filter) => filter.column === 'id' && ['eq', 'in'].includes(filter.operator));
      const ids = idFilter ? (Array.isArray(idFilter.value) ? idFilter.value : [idFilter.value]) : [];
      if (ids.length) {
        const [targets] = await db.execute(
          `SELECT role FROM cashier_accounts WHERE id IN (${ids.map(() => '?').join(', ')})`,
          ids
        );
        if (targets.some((target) => ['admin', 'kepala_toko', 'superadmin'].includes(target.role))) {
          throw Object.assign(new Error('Hanya Super Admin yang dapat mengubah akun administrator.'), { statusCode: 403 });
        }
      }
    }
    let result;
    if (operation === 'select') result = await executeSelect(db, body.table, table, body);
    else if (operation === 'insert') result = await executeInsert(db, body.table, table, body, false);
    else if (operation === 'upsert') result = await executeInsert(db, body.table, table, body, true);
    else if (operation === 'update') result = await executeUpdate(db, body.table, table, body);
    else if (operation === 'delete') result = await executeDelete(db, body.table, table, body);
    else throw Object.assign(new Error('Operasi database tidak didukung.'), { statusCode: 400 });

    res.status(200).json({ ...result, error: null });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      error.statusCode = 409;
      error.message = 'Data dengan ID, nama, atau username tersebut sudah ada.';
    }
    sendError(res, error);
  }
}
