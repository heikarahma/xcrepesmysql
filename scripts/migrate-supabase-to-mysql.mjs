import process from 'node:process';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { getPool, assertDatabaseConfigured } from '../api/_lib/database.js';
import { TABLES, prepareValue } from '../api/_lib/tables.js';

const TABLE_ORDER = [
  'units', 'categories', 'raw_materials', 'store_branches', 'store_branch_stocks',
  'toppings', 'product_menus', 'inventory_stock_logs', 'orders', 'store_settings',
  'cashier_accounts', 'superadmin_profile'
];
const PAGE_SIZE = 500;
const BATCH_SIZE = 25;

const sourceUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!sourceUrl || !sourceKey) throw new Error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (atau SUPABASE_ANON_KEY) untuk migrasi.');
assertDatabaseConfigured();

const fetchTable = async (table) => {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const response = await fetch(`${sourceUrl}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: sourceKey,
        Authorization: `Bearer ${sourceKey}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
        'Range-Unit': 'items'
      }
    });
    if (!response.ok) {
      const message = await response.text();
      if (response.status === 404 || message.includes('PGRST205')) return [];
      throw new Error(`Gagal membaca ${table}: ${response.status} ${message}`);
    }
    const page = await response.json();
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
};

const migrateBatch = async (db, tableName, rows) => {
  const table = TABLES[tableName];
  const columns = table.columns.filter((column) => rows.some((row) => row[column] !== undefined));
  const params = [];
  const groups = [];
  for (const sourceRow of rows) {
    const row = { ...sourceRow };
    if (row.password && !String(row.password).startsWith('$2')) row.password = await bcrypt.hash(String(row.password), 12);
    groups.push(`(${columns.map((column) => {
      params.push(row[column] === undefined ? null : prepareValue(table, column, row[column]));
      return '?';
    }).join(', ')})`);
  }
  const updates = columns.filter((column) => !table.primaryKey.includes(column));
  const sql = `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES ${groups.join(', ')}
    ON DUPLICATE KEY UPDATE ${updates.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')}`;
  await db.execute(sql, params);
};

const db = getPool();
try {
  for (const tableName of TABLE_ORDER) {
    const rows = await fetchTable(tableName);
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      await migrateBatch(db, tableName, rows.slice(index, index + BATCH_SIZE));
    }
    console.log(`${tableName}: ${rows.length} baris dimigrasikan`);
  }
  console.log('Migrasi Supabase ke MySQL selesai. Jalankan pengecekan sebelum mematikan Supabase.');
} finally {
  await db.end();
}
