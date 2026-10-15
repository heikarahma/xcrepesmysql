import mysql from 'mysql2/promise';

let pool;

const parseMysqlUrl = (value) => {
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, ''))
  };
};

const sslConfig = () => {
  if (process.env.MYSQL_SSL === 'false') return undefined;
  return { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' };
};

export const getPool = () => {
  if (pool) return pool;

  const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
  const common = {
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: 'Z',
    decimalNumbers: false,
    ssl: sslConfig()
  };

  pool = uri
    ? mysql.createPool({ ...parseMysqlUrl(uri), ...common })
    : mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        ...common
      });

  return pool;
};

export const assertDatabaseConfigured = () => {
  if (!process.env.MYSQL_URL && !process.env.DATABASE_URL && !(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)) {
    const error = new Error('Konfigurasi MySQL belum lengkap. Isi MYSQL_URL atau MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.');
    error.statusCode = 503;
    throw error;
  }
};
