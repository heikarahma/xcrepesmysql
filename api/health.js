import { getPool, assertDatabaseConfigured } from './_lib/database.js';
import { sendError } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });
  try {
    assertDatabaseConfigured();
    await getPool().query('SELECT 1');
    res.status(200).json({ data: { status: 'ok', database: 'mysql' }, error: null });
  } catch (error) {
    sendError(res, error);
  }
}
