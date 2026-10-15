import { getPool, assertDatabaseConfigured } from '../_lib/database.js';
import { createSessionToken, hashPassword, sendError, verifyPassword } from '../_lib/auth.js';
import {
  assertLoginAllowed,
  clearLoginFailures,
  getLoginRateIdentity,
  recordLoginFailure
} from '../_lib/login-rate-limit.js';
import { assertJsonBodyLimit, enforceBurstLimit } from '../_lib/request-guard.js';

const normalizeJson = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    assertDatabaseConfigured();
    assertJsonBodyLimit(req, 16_000);
    enforceBurstLimit(req, res, { namespace: 'login', limit: 20, windowMs: 15 * 60 * 1000 });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      const error = new Error('Username dan kata sandi wajib diisi.');
      error.statusCode = 400;
      throw error;
    }
    if (username.length > 191 || password.length > 256) {
      const error = new Error('Username atau kata sandi tidak valid.');
      error.statusCode = 400;
      throw error;
    }

    const db = getPool();
    const rateIdentity = getLoginRateIdentity(req, username);
    await assertLoginAllowed(db, rateIdentity.rateKey, res);
    const [admins] = await db.execute(
      'SELECT id, nama, username, password, role FROM superadmin_profile WHERE LOWER(username) = ? LIMIT 1',
      [username]
    );
    let account = admins[0] || null;
    let accountTable = 'superadmin_profile';

    if (!account) {
      const [cashiers] = await db.execute(
        'SELECT id, nama, username, password, role, permissions, branch_ids, is_active FROM cashier_accounts WHERE LOWER(username) = ? LIMIT 1',
        [username]
      );
      account = cashiers[0] || null;
      accountTable = 'cashier_accounts';
    }

    if (!account || !(await verifyPassword(password, account.password))) {
      await recordLoginFailure(db, { ...rateIdentity, username }, res);
      const error = new Error('Username atau kata sandi tidak sesuai.');
      error.statusCode = 401;
      throw error;
    }
    if (accountTable === 'cashier_accounts' && !account.is_active) {
      const error = new Error('Akun ini sedang dinonaktifkan. Silakan hubungi administrator.');
      error.statusCode = 403;
      throw error;
    }

    await clearLoginFailures(db, rateIdentity.rateKey);

    if (!String(account.password).startsWith('$2')) {
      const passwordHash = await hashPassword(password);
      await db.execute(`UPDATE \`${accountTable}\` SET password = ? WHERE id = ?`, [passwordHash, account.id]);
    }

    const user = {
      id: account.id,
      nama: account.nama,
      username: account.username,
      role: account.role || (accountTable === 'superadmin_profile' ? 'superadmin' : 'kasir'),
      permissions: normalizeJson(account.permissions),
      branchIds: normalizeJson(account.branch_ids),
      loggedInAt: new Date().toISOString()
    };
    if (!['superadmin', 'admin', 'kepala_toko'].includes(user.role)) {
      user.permissions = [...new Set([...user.permissions, 'stock-opname'])];
    }

    const [branchRows] = await db.query('SELECT id, name, code, address, phone, is_active, created_at, updated_at FROM store_branches WHERE is_active = 1 ORDER BY created_at ASC');
    const allowed = user.role === 'superadmin' || ['admin', 'kepala_toko'].includes(user.role) || user.branchIds.length === 0
      ? branchRows
      : branchRows.filter((branch) => user.branchIds.includes(branch.id));
    const branches = allowed.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code || '',
      address: branch.address || '',
      phone: branch.phone || '',
      isActive: Boolean(branch.is_active),
      createdAt: branch.created_at,
      updatedAt: branch.updated_at
    }));

    res.status(200).json({ data: { token: createSessionToken(user), user, branches }, error: null });
  } catch (error) {
    sendError(res, error);
  }
}
