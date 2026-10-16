import { database, isDatabaseConfigured } from '../lib/database';
import { stripImagesFromTransactionItems } from '../utils/imageCompression';

const TABLE = 'orders';
const DEFAULT_BRANCH_ID = 'BR-DEFAULT';
const PAGE_SIZE = 250;
const ORDER_COLUMNS = [
  'id',
  'invoice_number',
  'branch_id',
  'date',
  'status',
  'cashier_name',
  'customer_name',
  'table_number',
  'items',
  'subtotal',
  'items_discount_total',
  'order_discount_type',
  'order_discount_value',
  'order_discount_amount',
  'discount',
  'enable_tax',
  'tax_rate',
  'tax_amount',
  'tax_name',
  'total_amount',
  'total_items_count',
  'payment_method',
  'cash_received',
  'change_amount',
  'return_reason',
  'return_note',
  'return_by',
  'returned_at',
  'created_at'
].join(',');

const mapOrderRow = (row) => {
  const subtotal = Number(row.subtotal) || 0;
  const discount = Number(row.discount) || 0;
  const totalAmount = Number(row.total_amount) || 0;
  const baseAfterDisc = Math.max(0, subtotal - discount);

  let taxAmount = Number(row.tax_amount) || 0;
  let taxRate = Number(row.tax_rate) || 0;
  let taxName = row.tax_name || 'Pajak';
  let enableTax = row.enable_tax !== undefined ? Boolean(row.enable_tax) : false;

  if (taxAmount === 0 && totalAmount > baseAfterDisc) {
    taxAmount = Math.max(0, totalAmount - baseAfterDisc);
    if (baseAfterDisc > 0) {
      taxRate = Math.round((taxAmount / baseAfterDisc) * 100);
    }
    enableTax = true;
  }

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    branchId: row.branch_id || DEFAULT_BRANCH_ID,
    date: row.date,
    status: row.status || 'completed',
    cashierName: row.cashier_name || 'Kasir',
    customerName: row.customer_name || 'Pelanggan Umum',
    tableNumber: row.table_number || '',
    items: Array.isArray(row.items) ? row.items : [],
    subtotal,
    itemsDiscountTotal: Number(row.items_discount_total) || 0,
    orderDiscountType: row.order_discount_type || 'none',
    orderDiscountValue: Number(row.order_discount_value) || 0,
    orderDiscountAmount: Number(row.order_discount_amount) || 0,
    discount,
    enableTax,
    taxRate,
    taxAmount,
    taxName,
    totalAmount,
    totalItemsCount: Number(row.total_items_count) || 0,
    paymentMethod: row.payment_method || 'cash',
    cashReceived: Number(row.cash_received) || 0,
    changeAmount: Number(row.change_amount) || 0,
    returnReason: row.return_reason || null,
    returnNote: row.return_note || null,
    returnPhoto: null,
    returnBy: row.return_by || null,
    returnedAt: row.returned_at || null,
    cancelReason: row.status === 'cancelled' ? (row.return_reason?.startsWith('[BATAL] ') ? row.return_reason.replace('[BATAL] ', '') : (row.return_reason || 'Dibatalkan oleh Admin')) : null,
    cancelNote: row.status === 'cancelled' ? (row.return_note || '') : null,
    cancelBy: row.status === 'cancelled' ? (row.return_by || 'Admin') : null,
    cancelledAt: row.status === 'cancelled' ? row.returned_at : null,
    createdAt: row.created_at
  };
};

const fetchOrdersPaged = async (branchId, includeBranchFilter = true) => {
  const rows = [];
  let from = 0;

  while (true) {
    let query = database
      .from(TABLE)
      .select(ORDER_COLUMNS)
      .order('date', { ascending: false })
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

const applyOrderPageFilters = (query, filters = {}, branchId, includeBranchFilter = true) => {
  const {
    search = '',
    payment = 'ALL',
    orderType = 'ALL',
    dateFrom = '',
    dateTo = ''
  } = filters;

  let nextQuery = query;

  if (includeBranchFilter && branchId) {
    nextQuery = nextQuery.eq('branch_id', branchId);
  }

  if (dateFrom) {
    nextQuery = nextQuery.gte('date', dateFrom);
  }

  if (dateTo) {
    nextQuery = nextQuery.lte('date', dateTo);
  }

  if (payment && payment !== 'ALL') {
    nextQuery = nextQuery.eq('payment_method', payment);
  }

  if (orderType && orderType !== 'ALL') {
    if (orderType === 'takeaway') {
      nextQuery = nextQuery.or('table_number.ilike.%take%,table_number.ilike.%bungkus%');
    } else if (orderType === 'dineIn') {
      nextQuery = nextQuery.not('table_number', 'ilike', '%take%').not('table_number', 'ilike', '%bungkus%');
    }
  }

  const q = String(search || '').trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
  if (q) {
    const escaped = q.replace(/[%_]/g, '\\$&');
    nextQuery = nextQuery.or([
      `invoice_number.ilike.%${escaped}%`,
      `customer_name.ilike.%${escaped}%`,
      `cashier_name.ilike.%${escaped}%`,
      `table_number.ilike.%${escaped}%`
    ].join(','));
  }

  return nextQuery;
};

const fetchOrdersPage = async ({ branchId, page = 1, pageSize = 10, filters = {}, includeBranchFilter = true }) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(250, Math.max(1, Number(pageSize) || 10));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = database
    .from(TABLE)
    .select(ORDER_COLUMNS, { count: 'exact' })
    .order('date', { ascending: false })
    .range(from, to);

  query = applyOrderPageFilters(query, filters, branchId, includeBranchFilter);

  const { data, error, count } = await query;
  return { data: data || [], error, count: count || 0 };
};

export const ordersService = {
  async getOrders(branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    let { data, error } = await fetchOrdersPaged(branchId, true);

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const retry = await fetchOrdersPaged(branchId, false);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('ordersService.getOrders error:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(mapOrderRow),
      error: null
    };
  },

  async getOrdersPage({ branchId = DEFAULT_BRANCH_ID, page = 1, pageSize = 10, filters = {} } = {}) {
    if (!isDatabaseConfigured()) return { data: [], count: 0, error: null };
    let { data, error, count } = await fetchOrdersPage({
      branchId,
      page,
      pageSize,
      filters,
      includeBranchFilter: true
    });

    if (error && (error.code === 'PGRST204' || String(error.message || '').includes('branch_id'))) {
      const retry = await fetchOrdersPage({
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
      console.error('ordersService.getOrdersPage error:', error);
      return { data: [], count: 0, error };
    }

    return {
      data: (data || []).map(mapOrderRow),
      count: count || 0,
      error: null
    };
  },

  async getOrderById(id) {
    if (!isDatabaseConfigured()) return { data: null, error: null };
    if (!id) return { data: null, error: new Error('Order id is required') };

    const { data, error } = await database
      .from(TABLE)
      .select(ORDER_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('ordersService.getOrderById error:', error);
      return { data: null, error };
    }

    return {
      data: data ? mapOrderRow(data) : null,
      error: null
    };
  },

  async createOrder(order) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const basePayload = {
      id: order.id,
      invoice_number: order.invoiceNumber,
      date: order.date || new Date().toISOString(),
      status: order.status || 'completed',
      branch_id: order.branchId || DEFAULT_BRANCH_ID,
      cashier_name: order.cashierName || 'Kasir',
      customer_name: order.customerName || 'Pelanggan Umum',
      table_number: order.tableNumber || '',
      items: stripImagesFromTransactionItems(order.items),
      subtotal: Number(order.subtotal) || 0,
      items_discount_total: Number(order.itemsDiscountTotal) || 0,
      order_discount_type: order.orderDiscountType || 'none',
      order_discount_value: Number(order.orderDiscountValue) || 0,
      order_discount_amount: Number(order.orderDiscountAmount) || 0,
      discount: Number(order.discount) || 0,
      total_amount: Number(order.totalAmount) || 0,
      total_items_count: Number(order.totalItemsCount) || 0,
      payment_method: order.paymentMethod || 'cash',
      cash_received: Number(order.cashReceived) || 0,
      change_amount: Number(order.changeAmount) || 0,
      return_reason: order.returnReason || null,
      return_note: order.returnNote || null,
      return_by: order.returnBy || null,
      returned_at: order.returnedAt || null,
      created_at: new Date().toISOString()
    };

    const fullPayload = {
      ...basePayload,
      enable_tax: Boolean(order.enableTax),
      tax_rate: Number(order.taxRate) || 0,
      tax_amount: Number(order.taxAmount) || 0,
      tax_name: order.taxName || 'Pajak'
    };

    let { data, error } = await database
      .from(TABLE)
      .insert([fullPayload])
      .select(ORDER_COLUMNS)
      .single();

    // Fallback if newer columns don't exist in remote orders table
    if (error && (error.code === 'PGRST204' || String(error.message).includes('column'))) {
      const { branch_id, ...fallbackBasePayload } = basePayload;
      const retry = await database
        .from(TABLE)
        .insert([fallbackBasePayload])
        .select(ORDER_COLUMNS)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('ordersService.createOrder error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        invoiceNumber: data.invoice_number,
        branchId: data.branch_id || order.branchId || DEFAULT_BRANCH_ID,
        date: data.date,
        status: data.status,
        cashierName: data.cashier_name,
        customerName: data.customer_name,
        tableNumber: data.table_number,
        items: data.items,
        subtotal: Number(data.subtotal) || 0,
        itemsDiscountTotal: Number(data.items_discount_total) || 0,
        orderDiscountType: data.order_discount_type,
        orderDiscountValue: Number(data.order_discount_value) || 0,
        orderDiscountAmount: Number(data.order_discount_amount) || 0,
        discount: Number(data.discount) || 0,
        enableTax: Boolean(order.enableTax),
        taxRate: Number(order.taxRate) || 0,
        taxAmount: Number(order.taxAmount) || 0,
        taxName: order.taxName || 'Pajak',
        totalAmount: Number(data.total_amount) || 0,
        totalItemsCount: Number(data.total_items_count) || 0,
        paymentMethod: data.payment_method,
        cashReceived: Number(data.cash_received) || 0,
        changeAmount: Number(data.change_amount) || 0,
        createdAt: data.created_at
      },
      error: null
    };
  },

  async updateOrderReturn(id, { reason, note, photo: _photo, user }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        status: 'returned',
        return_reason: reason,
        return_note: note || '',
        return_by: user || 'Kasir',
        returned_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(ORDER_COLUMNS)
      .single();

    if (error) {
      console.error('ordersService.updateOrderReturn error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  async cancelOrder(id, { reason, note, user }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        status: 'cancelled',
        return_reason: reason ? `[BATAL] ${reason}` : '[BATAL] Dibatalkan oleh Admin',
        return_note: note || '',
        return_by: user || 'Super Admin',
        returned_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(ORDER_COLUMNS)
      .single();

    if (error) {
      console.error('ordersService.cancelOrder error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  async updateOrder(id, payload) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const cleanPayload = { ...payload };
    if (cleanPayload.items) cleanPayload.items = stripImagesFromTransactionItems(cleanPayload.items);
    delete cleanPayload.return_photo;
    delete cleanPayload.returnPhoto;
    const { data, error } = await database
      .from(TABLE)
      .update(cleanPayload)
      .eq('id', id)
      .select(ORDER_COLUMNS)
      .single();

    if (error) {
      console.error('ordersService.updateOrder error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  }
};
