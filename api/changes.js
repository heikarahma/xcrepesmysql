import { getPool, assertDatabaseConfigured } from './_lib/database.js';
import { getRequestUser, requireUser, sendError } from './_lib/auth.js';
import { enforceBurstLimit } from './_lib/request-guard.js';

const SCOPES = {
  auth: [['superadmin_profile', 'updated_at'], ['cashier_accounts', 'updated_at'], ['store_branches', 'updated_at']],
  inventory: [['raw_materials', 'updated_at'], ['store_branch_stocks', 'updated_at'], ['inventory_stock_logs', 'created_at']],
  categories: [['categories', 'updated_at'], ['inventory_stock_logs', 'created_at']],
  units: [['units', 'updated_at']],
  toppings: [['toppings', 'updated_at']],
  product_menus: [['product_menus', 'updated_at']],
  orders: [['orders', 'updated_at']],
  store_settings: [['store_settings', 'updated_at']],
  inventory_stock_logs: [['inventory_stock_logs', 'created_at']]
};

const collectSources = (scope) => {
  const selectedScopes = scope === 'all' ? Object.keys(SCOPES) : [scope];
  const unique = new Map();
  for (const selectedScope of selectedScopes) {
    for (const [table, timestamp] of SCOPES[selectedScope]) {
      unique.set(`${table}:${timestamp}`, [table, timestamp]);
    }
  }
  return { selectedScopes, sources: [...unique.values()] };
};

const getSnapshots = async (db, sources) => {
  const sql = sources.map(([table, timestamp]) => (
    `SELECT '${table}:${timestamp}' AS source_key, COUNT(*) AS row_count, MAX(\`${timestamp}\`) AS latest FROM \`${table}\``
  )).join(' UNION ALL ');
  const [rows] = await db.query(sql);
  return new Map(rows.map((row) => [
    row.source_key,
    [row.source_key.split(':')[0], Number(row.row_count || 0), row.latest || null]
  ]));
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });
  try {
    assertDatabaseConfigured();
    const scope = String(req.query?.scope || '');
    if (scope !== 'all' && !SCOPES[scope]) {
      throw Object.assign(new Error('Scope sinkronisasi tidak valid.'), { statusCode: 400 });
    }
    const user = getRequestUser(req);
    if (scope !== 'store_settings' && !user) requireUser(req);
    enforceBurstLimit(req, res, {
      namespace: 'changes',
      identity: user?.sub || '',
      limit: 30,
      windowMs: 60_000
    });

    const db = getPool();
    const { selectedScopes, sources } = collectSources(scope);
    const snapshotMap = await getSnapshots(db, sources);
    const signatures = Object.fromEntries(selectedScopes.map((selectedScope) => {
      const snapshots = SCOPES[selectedScope].map(([table, timestamp]) => (
        snapshotMap.get(`${table}:${timestamp}`)
      ));
      return [selectedScope, JSON.stringify(snapshots)];
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      data: scope === 'all' ? { signatures } : { signature: signatures[scope] },
      error: null
    });
  } catch (error) {
    sendError(res, error);
  }
}
