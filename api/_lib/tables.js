export const TABLES = {
  units: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'created_at', 'updated_at'],
    booleans: [],
    json: []
  },
  categories: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'description', 'created_at', 'updated_at'],
    booleans: [],
    json: []
  },
  raw_materials: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'unit_name', 'stock', 'price_per_unit', 'min_stock', 'note', 'created_at', 'updated_at'],
    booleans: [],
    json: []
  },
  store_branch_stocks: {
    primaryKey: ['branch_id', 'raw_material_id'],
    columns: ['branch_id', 'raw_material_id', 'stock', 'updated_at'],
    booleans: [],
    json: []
  },
  toppings: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'price', 'description', 'ingredients', 'show_on_receipt', 'created_at', 'updated_at'],
    booleans: ['show_on_receipt'],
    json: ['ingredients']
  },
  product_menus: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'category_id', 'category_name', 'image', 'price', 'promo_type', 'promo_amount', 'ingredients', 'toppings', 'is_active', 'created_at', 'updated_at'],
    booleans: ['is_active'],
    json: ['ingredients', 'toppings']
  },
  inventory_stock_logs: {
    primaryKey: ['id'],
    columns: ['id', 'branch_id', 'raw_material_id', 'raw_material_name', 'unit_name', 'type', 'amount', 'previous_stock', 'current_stock', 'reason', 'note', 'reference_invoice', 'order_id', 'customer_name', 'source_menu', 'source_type', 'topping_name', 'user_name', 'created_at'],
    booleans: [],
    json: []
  },
  orders: {
    primaryKey: ['id'],
    columns: ['id', 'invoice_number', 'branch_id', 'date', 'status', 'cashier_name', 'customer_name', 'table_number', 'items', 'subtotal', 'items_discount_total', 'order_discount_type', 'order_discount_value', 'order_discount_amount', 'discount', 'enable_tax', 'tax_rate', 'tax_amount', 'tax_name', 'total_amount', 'total_items_count', 'payment_method', 'cash_received', 'change_amount', 'return_reason', 'return_note', 'return_photo', 'return_by', 'returned_at', 'created_at', 'updated_at'],
    defaultColumns: ['id', 'invoice_number', 'branch_id', 'date', 'status', 'cashier_name', 'customer_name', 'table_number', 'items', 'subtotal', 'items_discount_total', 'order_discount_type', 'order_discount_value', 'order_discount_amount', 'discount', 'enable_tax', 'tax_rate', 'tax_amount', 'tax_name', 'total_amount', 'total_items_count', 'payment_method', 'cash_received', 'change_amount', 'return_reason', 'return_note', 'return_by', 'returned_at', 'created_at'],
    booleans: ['enable_tax'],
    json: ['items']
  },
  store_settings: {
    primaryKey: ['id'],
    columns: ['id', 'app_name', 'store_name', 'store_tagline', 'logo', 'phone', 'address', 'email', 'receipt_title', 'receipt_subtitle', 'receipt_phone', 'receipt_footer1', 'receipt_footer2', 'paper_size', 'show_logo_on_receipt', 'show_cashier_name', 'show_customer_name', 'show_table_number', 'show_notes', 'show_toppings', 'enable_tax', 'tax_rate', 'tax_name', 'updated_at'],
    booleans: ['show_logo_on_receipt', 'show_cashier_name', 'show_customer_name', 'show_table_number', 'show_notes', 'show_toppings', 'enable_tax'],
    json: []
  },
  store_branches: {
    primaryKey: ['id'],
    columns: ['id', 'name', 'code', 'address', 'phone', 'is_active', 'created_at', 'updated_at'],
    booleans: ['is_active'],
    json: []
  },
  cashier_accounts: {
    primaryKey: ['id'],
    columns: ['id', 'nama', 'username', 'password', 'role', 'permissions', 'branch_ids', 'is_active', 'created_at', 'updated_at'],
    booleans: ['is_active'],
    json: ['permissions', 'branch_ids'],
    secret: ['password']
  },
  superadmin_profile: {
    primaryKey: ['id'],
    columns: ['id', 'nama', 'username', 'password', 'role', 'updated_at'],
    booleans: [],
    json: [],
    secret: ['password']
  }
};

export const getTable = (name) => TABLES[name] || null;

export const assertColumn = (table, column) => {
  if (!table.columns.includes(column)) {
    const error = new Error(`Kolom tidak diizinkan: ${column}`);
    error.statusCode = 400;
    throw error;
  }
  return `\`${column}\``;
};

export const normalizeRow = (table, row) => {
  if (!row) return row;
  const normalized = { ...row };
  for (const column of table.json || []) {
    if (typeof normalized[column] === 'string') {
      try { normalized[column] = JSON.parse(normalized[column]); } catch { /* keep legacy value */ }
    }
  }
  for (const column of table.booleans || []) {
    if (normalized[column] !== null && normalized[column] !== undefined) {
      normalized[column] = Boolean(normalized[column]);
    }
  }
  for (const column of table.secret || []) delete normalized[column];
  return normalized;
};

export const prepareValue = (table, column, value) => {
  if ((table.json || []).includes(column)) {
    if (typeof value === 'string') {
      try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
    }
    return JSON.stringify(value ?? []);
  }
  if ((table.booleans || []).includes(column)) return value ? 1 : 0;
  if ((column === 'date' || column.endsWith('_at')) && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return value;
};
