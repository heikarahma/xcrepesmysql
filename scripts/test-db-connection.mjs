import 'dotenv/config';
import mysql from 'mysql2/promise';

console.log('=== UJI KONEKSI DATABASE MYSQL & API CHECKOUT ===\n');

const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
const host = process.env.MYSQL_HOST;
const hasConfig = Boolean(uri || (host && process.env.MYSQL_USER && process.env.MYSQL_DATABASE));

if (!hasConfig) {
  console.log('⚠️  Status: Credential MySQL belum diatur pada lingkungan lokal (.env).');
  console.log('ℹ️  Untuk menghubungkan ke MySQL lokal atau cloud:');
  console.log('   1. Salin .env.example menjadi .env:');
  console.log('      cp .env.example .env');
  console.log('   2. Isi MYSQL_URL atau parameter MYSQL_HOST, USER, PASSWORD, DATABASE.');
  console.log('   3. Isi AUTH_SECRET (minimal 32 karakter).');
  console.log('   4. Jalankan kembali: node scripts/test-db-connection.mjs\n');
  console.log('ℹ️  Pada Vercel Functions:');
  console.log('   Variabel MYSQL_URL, MYSQL_SSL, dan AUTH_SECRET diatur langsung');
  console.log('   di menu Project Settings -> Environment Variables pada Dashboard Vercel.\n');
  process.exit(0);
}

try {
  console.log('1. Menguji koneksi langsung ke MySQL...');
  const poolConfig = uri
    ? {
        uri,
        ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
      }
    : {
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
      };

  const pool = mysql.createPool(poolConfig);
  const [ping] = await pool.query('SELECT 1 AS connected, NOW() AS server_time');
  console.log('✅ Koneksi MySQL Berhasil!', ping[0]);

  console.log('\n2. Memeriksa tabel-tabel utama...');
  const requiredTables = ['orders', 'store_branch_stocks', 'raw_materials', 'inventory_stock_logs', 'store_branches'];
  const [tableRows] = await pool.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
    [requiredTables]
  );
  const existingTables = tableRows.map(r => r.table_name || r.TABLE_NAME);
  for (const t of requiredTables) {
    if (existingTables.includes(t)) {
      console.log(`   ✅ Tabel '${t}' ditemukan.`);
    } else {
      console.log(`   ⚠️  Tabel '${t}' belum ditemukan. Jalankan: npm run db:setup`);
    }
  }

  await pool.end();
  console.log('\n✅ Seluruh pengujian koneksi database MySQL selesai dengan sukses.');
} catch (err) {
  console.error('\n❌ Gagal terhubung ke database MySQL:', err.message);
  process.exit(1);
}
