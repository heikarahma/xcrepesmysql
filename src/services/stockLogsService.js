import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'inventory_stock_logs';
const DEFAULT_BRANCH_ID = 'BR-DEFAULT';
const PAGE_SIZE = 1000;
const STOCK_LOG_COLUMNS = [
  'id',
  'raw_material_id',
  'raw_material_name',
  'unit_name',
  'type',
  'amount',
  'previous_stock',
  'current_stock',
  'reason',
  'note',
  'reference_invoice',
  'order_id',
  'customer_name',
  'source_menu',
  'source_type',
  'topping_name',
  'user_name',
  'branch_id',
  'created_at'
].join(',');

const mapStockLogRow = (row) => ({
  id: row.id,
  rawMaterialId: row.raw_material_id,
  rawMaterialName: row.raw_material_name,
  unitName: row.unit_name,
  type: row.type,
  amount: Number(row.amount) || 0,
  previousStock: Number(row.previous_stock) || 0,
  currentStock: Number(row.current_stock) || 0,
  reason: row.reason || '',
  note: row.note || '',
  referenceInvoice: row.reference_invoice || null,
  orderId: row.order_id || null,
  customerName: row.customer_name || null,
  sourceMenu: row.source_menu || null,
  sourceType: row.source_type || null,
  toppingName: row.topping_name || null,
  user: row.user_name || 'Admin',
  branchId: row.branch_id || DEFAULT_BRANCH_ID,
  createdAt: row.created_at
});

const fetchStockLogsPaged = async (branchId, includeBranchFilter = true) => {
  const rows = [];
  let from = 0;

  while (true) {
    let query = database
      .from(TABLE)
      .select(STOCK_LOG_COLUMNS)
      .neq('type', 'OPNAME_REPORT')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (includeBranchFilter && branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) return { data: rows, error };

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: rows, error: null };
};

const applyStockLogPageFilters = (query, filters = {}, branchId, includeBranchFilter = true) => {
  const {
    search = '',
    type = 'ALL',
    material = 'ALL',
    dateFrom = '',
    dateTo = ''
  } = filters;

  let nextQuery = query;

  if (includeBranchFilter && branchId) {
    nextQuery = nextQuery.eq('branch_id', branchId);
  }

  if (dateFrom) {
    nextQuery = nextQuery.gte('created_at', dateFrom);
  }

  if (dateTo) {
    nextQuery = nextQuery.lte('created_at', dateTo);
  }

  if (type && type !== 'ALL') {
    if (type === 'WASTE') {
      nextQuery = nextQuery.in('type', ['WASTE', 'RETURN_ORDER']);
    } else {
      nextQuery = nextQuery.eq('type', type);
    }
  }

  if (material && material !== 'ALL') {
    nextQuery = nextQuery.eq('raw_material_name', material);
  }

  const q = String(search || '').trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
  if (q) {
    const escaped = q.replace(/[%_]/g, '\\$&');
    nextQuery = nextQuery.or([
      `raw_material_name.ilike.%${escaped}%`,
      `reason.ilike.%${escaped}%`,
      `note.ilike.%${escaped}%`,
      `reference_invoice.ilike.%${escaped}%`,
      `source_menu.ilike.%${escaped}%`,
      `topping_name.ilike.%${escaped}%`,
      `customer_name.ilike.%${escaped}%`,
      `user_name.ilike.%${escaped}%`
    ].join(','));
  }

  return nextQuery;
};

const fetchStockLogsPage = async ({ branchId, page = 1, pageSize = 10, filters = {}, includeBranchFilter = true }) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 10));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = database
    .from(TABLE)
    .select(STOCK_LOG_COLUMNS, { count: 'exact' })
    .neq('type', 'OPNAME_REPORT')
    .order('created_at', { ascending: false })
    .range(from, to);

  query = applyStockLogPageFilters(query, filters, branchId, includeBranchFilter);

  const { data, error, count } = await query;
  return { data: data || [], error, count: count || 0 };
};

export const stockLogsService = {
  async getStockLogs(branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    let { data, error } = await fetchStockLogsPaged(branchId, true);

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const retry = await fetchStockLogsPaged(branchId, false);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('stockLogsService.getStockLogs error:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(mapStockLogRow),
      error: null
    };
  },

  async getStockLogsPage({ branchId = DEFAULT_BRANCH_ID, page = 1, pageSize = 10, filters = {} } = {}) {
    if (!isDatabaseConfigured()) return { data: [], count: 0, error: null };
    let { data, error, count } = await fetchStockLogsPage({
      branchId,
      page,
      pageSize,
      filters,
      includeBranchFilter: true
    });

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const retry = await fetchStockLogsPage({
        branchId,
        page,
        pageSize,
        filters,
        includeBranchFilter: false
      });
      data = retry.data;
      error = retry.error;
      count = retry.count;
    }

    if (error) {
      console.error('stockLogsService.getStockLogsPage error:', error);
      return { data: [], count: 0, error };
    }

    return {
      data: (data || []).map(mapStockLogRow),
      count: count || 0,
      error: null
    };
  },

  async getStockLogById(id) {
    if (!isDatabaseConfigured()) return { data: null, error: null };
    if (!id) return { data: null, error: new Error('Stock log id is required') };

    const { data, error } = await database
      .from(TABLE)
      .select(STOCK_LOG_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('stockLogsService.getStockLogById error:', error);
      return { data: null, error };
    }

    return {
      data: data ? mapStockLogRow(data) : null,
      error: null
    };
  },

  async createStockLog(log) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      id: log.id,
      raw_material_id: log.rawMaterialId,
      raw_material_name: log.rawMaterialName,
      unit_name: log.unitName,
      type: log.type,
      amount: Number(log.amount) || 0,
      previous_stock: Number(log.previousStock) || 0,
      current_stock: Number(log.currentStock) || 0,
      reason: log.reason || null,
      note: log.note || null,
      reference_invoice: log.referenceInvoice || null,
      order_id: log.orderId || null,
      customer_name: log.customerName || null,
      source_menu: log.sourceMenu || null,
      source_type: log.sourceType || null,
      topping_name: log.toppingName || null,
      user_name: log.user || 'Admin',
      branch_id: log.branchId || DEFAULT_BRANCH_ID,
      created_at: log.createdAt || new Date().toISOString()
    };

    let { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const { branch_id, ...fallbackPayload } = payload;
      const retry = await database
        .from(TABLE)
        .insert([fallbackPayload])
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('stockLogsService.createStockLog error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  async createStockLogsBatch(logs) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    if (!Array.isArray(logs) || logs.length === 0) return { data: [], error: null };

    const payloads = logs.map(log => ({
      id: log.id,
      raw_material_id: log.rawMaterialId,
      raw_material_name: log.rawMaterialName,
      unit_name: log.unitName,
      type: log.type,
      amount: Number(log.amount) || 0,
      previous_stock: Number(log.previousStock) || 0,
      current_stock: Number(log.currentStock) || 0,
      reason: log.reason || null,
      note: log.note || null,
      reference_invoice: log.referenceInvoice || null,
      order_id: log.orderId || null,
      customer_name: log.customerName || null,
      source_menu: log.sourceMenu || null,
      source_type: log.sourceType || null,
      topping_name: log.toppingName || null,
      user_name: log.user || 'Admin',
      branch_id: log.branchId || DEFAULT_BRANCH_ID,
      created_at: log.createdAt || new Date().toISOString()
    }));

    let { data, error } = await database
      .from(TABLE)
      .insert(payloads);

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const retry = await database
        .from(TABLE)
        .insert(payloads.map(({ branch_id, ...payload }) => payload));
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('stockLogsService.createStockLogsBatch error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  }
};
