import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = await fs.readFile(path.join(root, 'database', 'mysql_schema.sql'), 'utf8');
const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!initialPassword || initialPassword.length < 8) {
  throw new Error('Isi INITIAL_ADMIN_PASSWORD minimal 8 karakter di .env sebelum menjalankan setup.');
}

const common = {
  multipleStatements: true,
  timezone: 'Z',
  ssl: process.env.MYSQL_SSL === 'false'
    ? undefined
    : { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
};

let connection;
if (process.env.MYSQL_URL || process.env.DATABASE_URL) {
  const url = new URL(process.env.MYSQL_URL || process.env.DATABASE_URL);
  connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...common
  });
} else {
  const database = process.env.MYSQL_DATABASE;
  if (!/^[a-zA-Z0-9_]+$/.test(database || '')) throw new Error('MYSQL_DATABASE tidak valid.');
  const base = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    ...common
  };
  const bootstrap = await mysql.createConnection(base);
  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await bootstrap.end();
  connection = await mysql.createConnection({ ...base, database });
}

try {
  await connection.query(schema);
  const [orderUpdatedAt] = await connection.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'updated_at' LIMIT 1`
  );
  if (orderUpdatedAt.length === 0) {
    await connection.query(
      'ALTER TABLE orders ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at'
    );
  }
  const passwordHash = await bcrypt.hash(initialPassword, 12);
  await connection.execute(
    `INSERT INTO superadmin_profile (id, nama, username, password, role)
     VALUES ('usr_superadmin', 'Super Admin', 'superadmin', ?, 'superadmin')
     ON DUPLICATE KEY UPDATE id = VALUES(id)`,
    [passwordHash]
  );
  console.log('MySQL schema siap. Login awal: superadmin (password dari INITIAL_ADMIN_PASSWORD).');
} finally {
  await connection.end();
}
