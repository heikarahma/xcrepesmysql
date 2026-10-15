import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const SOURCE_URL = process.env.SUPABASE_URL;
const SOURCE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SOURCE_URL || !SOURCE_KEY) {
  throw new Error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (atau SUPABASE_ANON_KEY) di .env.');
}

const supabase = createClient(SOURCE_URL, SOURCE_KEY);

const TABLES = [
  'units',
  'categories',
  'raw_materials',
  'toppings',
  'product_menus',
  'inventory_stock_logs',
  'orders',
  'store_settings',
  'cashier_accounts',
  'superadmin_profile'
];

function escapeSqlValue(val) {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'object') {
    // Array or Object -> JSONB format in PostgreSQL
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  if (typeof val === 'string') {
    return `'${val.replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function generateInsertStatements(tableName, rows) {
  if (!rows || rows.length === 0) return `-- No data in table ${tableName}\n`;

  const columns = Object.keys(rows[0]);
  const colList = columns.map(c => `"${c}"`).join(', ');

  const valuesClauses = rows.map(row => {
    const valList = columns.map(col => escapeSqlValue(row[col])).join(', ');
    return `(${valList})`;
  }).join(',\n');

  return `INSERT INTO public.${tableName} (${colList})
VALUES
${valuesClauses}
ON CONFLICT (id) DO UPDATE SET
${columns.filter(c => c !== 'id').map(c => `  "${c}" = EXCLUDED."${c}"`).join(',\n')};
`;
}

async function exportAll() {
  console.log('🚀 Memulai ekspor data dari Supabase:', SOURCE_URL);

  const backupDir = path.resolve('database_backup');
  const dataDir = path.resolve('database_backup/data');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const allData = {};
  const insertSqlBlocks = [];

  for (const table of TABLES) {
    console.log(`⏳ Mengambil data tabel: ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`❌ Gagal mengambil tabel ${table}:`, error.message);
      continue;
    }

    allData[table] = data || [];
    console.log(`✅ Tabel ${table}: berhasil diambil ${allData[table].length} baris.`);

    // Simpan file JSON per tabel
    fs.writeFileSync(
      path.join(dataDir, `${table}.json`),
      JSON.stringify(allData[table], null, 2),
      'utf-8'
    );

    // Buat blok SQL INSERT
    if (allData[table].length > 0) {
      insertSqlBlocks.push(`-- ==============================================================================`);
      insertSqlBlocks.push(`-- DATA UNTUK TABEL: ${table.toUpperCase()} (${allData[table].length} baris)`);
      insertSqlBlocks.push(`-- ==============================================================================`);
      insertSqlBlocks.push(generateInsertStatements(table, allData[table]));
      insertSqlBlocks.push('');
    }
  }

  // Simpan all_data.json
  fs.writeFileSync(
    path.join(dataDir, 'all_data.json'),
    JSON.stringify(allData, null, 2),
    'utf-8'
  );
  console.log(`📁 File JSON lengkap tersimpan di database_backup/data/`);

  // Baca schema dasar dari supabase_schema.sql
  const schemaPath = path.resolve('supabase_schema.sql');
  let baseSchema = '';
  if (fs.existsSync(schemaPath)) {
    baseSchema = fs.readFileSync(schemaPath, 'utf-8');
    // Hapus baris SEED INITIAL SYSTEM DEFAULTS bawaan agar digantikan dengan data asli live
    const seedMarker = '-- SEED INITIAL SYSTEM DEFAULTS';
    if (baseSchema.includes(seedMarker)) {
      baseSchema = baseSchema.substring(0, baseSchema.indexOf(seedMarker)).trim();
    }
  }

  // Rakit file SQL gabungan (Schema DDL + Data asli Supabase)
  const fullSql = `-- ==============================================================================
-- DATABASE LENGKAP XCREPES POS: STRUKTUR SCHEMA & DATA SALINAN ASLI
-- Diekspor dari Supabase: ${SOURCE_URL}
-- Tanggal Ekspor: ${new Date().toISOString()}
-- ==============================================================================

${baseSchema}

-- ==============================================================================
-- SALINAN DATA LIVE ASLI SUPABASE (${Object.values(allData).reduce((a, b) => a + b.length, 0)} TOTAL BARIS)
-- ==============================================================================

${insertSqlBlocks.join('\n')}

-- SELESAI: Seluruh struktur tabel, index, RLS policy, realtime, dan data telah berhasil disiapkan!
`;

  const outputSqlPath = path.join(backupDir, 'new_database_full_with_data.sql');
  fs.writeFileSync(outputSqlPath, fullSql, 'utf-8');
  console.log(`🎉 File SQL lengkap berhasil dibuat di: ${outputSqlPath}`);

  // Simpan juga salinan langsung di root proyek agar sangat mudah dibuka/ditemukan
  const rootSqlPath = path.resolve('new_database_full_with_data.sql');
  fs.writeFileSync(rootSqlPath, fullSql, 'utf-8');
  console.log(`🎉 Salinan SQL di root proyek: ${rootSqlPath}`);
}

exportAll().catch(err => {
  console.error('Fatal Error saat ekspor:', err);
  process.exit(1);
});
