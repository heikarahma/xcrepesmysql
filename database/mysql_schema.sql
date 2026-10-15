SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS raw_materials (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  unit_name VARCHAR(191) NOT NULL,
  stock DECIMAL(18,4) NOT NULL DEFAULT 0,
  price_per_unit DECIMAL(18,2) NOT NULL DEFAULT 0,
  min_stock DECIMAL(18,4) NOT NULL DEFAULT 10,
  note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_raw_materials_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_branches (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  code VARCHAR(64) NULL,
  address TEXT NULL,
  phone VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_store_branches_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_branch_stocks (
  branch_id VARCHAR(191) NOT NULL,
  raw_material_id VARCHAR(191) NOT NULL,
  stock DECIMAL(18,4) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (branch_id, raw_material_id),
  INDEX idx_branch_stocks_material (raw_material_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toppings (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  price DECIMAL(18,2) NOT NULL DEFAULT 0,
  description TEXT NULL,
  ingredients JSON NULL,
  show_on_receipt TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_menus (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  category_id VARCHAR(191) NULL,
  category_name VARCHAR(191) NULL,
  image LONGTEXT NULL,
  price DECIMAL(18,2) NOT NULL DEFAULT 0,
  promo_type VARCHAR(64) NULL,
  promo_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  ingredients JSON NULL,
  toppings JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_product_menus_name (name),
  INDEX idx_product_menus_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_stock_logs (
  id VARCHAR(191) PRIMARY KEY,
  branch_id VARCHAR(191) NOT NULL DEFAULT 'BR-DEFAULT',
  raw_material_id VARCHAR(191) NULL,
  raw_material_name VARCHAR(191) NULL,
  unit_name VARCHAR(191) NULL,
  type VARCHAR(64) NOT NULL,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  previous_stock DECIMAL(18,4) NOT NULL DEFAULT 0,
  current_stock DECIMAL(18,4) NOT NULL DEFAULT 0,
  reason TEXT NULL,
  note TEXT NULL,
  reference_invoice VARCHAR(191) NULL,
  order_id VARCHAR(191) NULL,
  customer_name VARCHAR(191) NULL,
  source_menu VARCHAR(191) NULL,
  source_type VARCHAR(64) NULL,
  topping_name VARCHAR(191) NULL,
  user_name VARCHAR(191) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_stock_logs_date (created_at DESC),
  INDEX idx_stock_logs_branch_date (branch_id, created_at DESC),
  INDEX idx_stock_logs_branch_type_date (branch_id, type, created_at DESC),
  INDEX idx_stock_logs_material (raw_material_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(191) PRIMARY KEY,
  invoice_number VARCHAR(191) NOT NULL,
  branch_id VARCHAR(191) NOT NULL DEFAULT 'BR-DEFAULT',
  date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status VARCHAR(64) NOT NULL DEFAULT 'completed',
  cashier_name VARCHAR(191) NULL,
  customer_name VARCHAR(191) NULL,
  table_number VARCHAR(64) NULL,
  items JSON NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  items_discount_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  order_discount_type VARCHAR(64) NULL,
  order_discount_value DECIMAL(18,2) NOT NULL DEFAULT 0,
  order_discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  enable_tax TINYINT(1) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_name VARCHAR(191) NULL DEFAULT 'Pajak',
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_items_count INT NOT NULL DEFAULT 0,
  payment_method VARCHAR(64) NOT NULL DEFAULT 'cash',
  cash_received DECIMAL(18,2) NOT NULL DEFAULT 0,
  change_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  return_reason TEXT NULL,
  return_note TEXT NULL,
  return_photo LONGTEXT NULL,
  return_by VARCHAR(191) NULL,
  returned_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_orders_date (date DESC),
  INDEX idx_orders_branch_date (branch_id, date DESC),
  INDEX idx_orders_branch_status_date (branch_id, status, date DESC),
  INDEX idx_orders_branch_payment_date (branch_id, payment_method, date DESC),
  INDEX idx_orders_invoice (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_settings (
  id VARCHAR(191) PRIMARY KEY DEFAULT 'store_default',
  app_name VARCHAR(191) NULL DEFAULT 'XCrepes POS',
  store_name VARCHAR(191) NULL DEFAULT 'XCrepes',
  store_tagline VARCHAR(255) NULL DEFAULT 'Good Food Good Mood',
  logo LONGTEXT NULL,
  phone VARCHAR(64) NULL,
  address TEXT NULL,
  email VARCHAR(191) NULL,
  receipt_title VARCHAR(191) NULL DEFAULT 'XCrepes',
  receipt_subtitle VARCHAR(255) NULL,
  receipt_phone VARCHAR(64) NULL,
  receipt_footer1 VARCHAR(255) NULL DEFAULT 'Terima Kasih Atas Kunjungan Anda',
  receipt_footer2 VARCHAR(255) NULL,
  paper_size VARCHAR(16) NULL DEFAULT '58mm',
  show_logo_on_receipt TINYINT(1) NOT NULL DEFAULT 0,
  show_cashier_name TINYINT(1) NOT NULL DEFAULT 1,
  show_customer_name TINYINT(1) NOT NULL DEFAULT 1,
  show_table_number TINYINT(1) NOT NULL DEFAULT 1,
  show_notes TINYINT(1) NOT NULL DEFAULT 1,
  show_toppings TINYINT(1) NOT NULL DEFAULT 1,
  enable_tax TINYINT(1) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(8,4) NOT NULL DEFAULT 10,
  tax_name VARCHAR(191) NULL DEFAULT 'Pajak',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cashier_accounts (
  id VARCHAR(191) PRIMARY KEY,
  nama VARCHAR(191) NOT NULL,
  username VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'kasir',
  permissions JSON NOT NULL,
  branch_ids JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS superadmin_profile (
  id VARCHAR(191) PRIMARY KEY DEFAULT 'usr_superadmin',
  nama VARCHAR(191) NOT NULL DEFAULT 'Super Admin',
  username VARCHAR(191) NOT NULL UNIQUE DEFAULT 'superadmin',
  password VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'superadmin',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_rate_limits (
  rate_key CHAR(64) PRIMARY KEY,
  username VARCHAR(191) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  window_started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  blocked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_login_rate_limits_updated (updated_at),
  INDEX idx_login_rate_limits_blocked (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO store_settings (id) VALUES ('store_default')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO store_branches (id, name, code, address, phone, is_active)
VALUES ('BR-DEFAULT', 'XCrepes Pusat', 'PUSAT', '', '', 1)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO store_branch_stocks (branch_id, raw_material_id, stock)
SELECT 'BR-DEFAULT', id, stock FROM raw_materials
ON DUPLICATE KEY UPDATE stock = VALUES(stock);
