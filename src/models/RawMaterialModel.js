export const INITIAL_RAW_MATERIALS = [];
export const INITIAL_STOCK_LOGS = [];


export const RAW_MATERIAL_STORAGE_KEY = 'master_raw_materials';
export const STOCK_LOGS_STORAGE_KEY = 'inventory_stock_logs';

export const STOCK_LOG_TYPES = {
  IN: 'IN',                   // Stok Masuk / Restok
  OUT: 'OUT',                 // Stok Keluar / Pemakaian Masak
  ADJUST: 'ADJUST',           // Penyesuaian Opname Fisik
  WASTE: 'WASTE',             // Bahan Rusak / Expired / Tumpah
  RETURN_ORDER: 'RETURN_ORDER'// Bahan Terbuang dari Pesanan Diretur / Gagal Buat
};

export const MATERIAL_WASTE_REASONS = [
  'Bahan Kedaluwarsa / Expired',
  'Bahan Basi / Berjamur / Rusak',
  'Kemasan Bocor / Rusak / Segel Terbuka',
  'Tumpah / Pecah saat Peracikan',
  'Kualitas Menurun / Tidak Layak Konsumsi',
  'Kontaminasi / Kesalahan Penyimpanan',
  'Lainnya'
];

export const ORDER_RETURN_REASONS = [
  'Adonan Gosong / Overcooked',
  'Adonan Robek / Rusak saat Dilipat',
  'Salah Racikan Topping / Resep',
  'Salah Input Pesanan Kasir',
  'Komplain Kualitas Rasa / Tekstur Pelanggan',
  'Pelanggan Membatalkan setelah Dimasak',
  'Lainnya'
];
