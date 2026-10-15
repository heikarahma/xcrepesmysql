/**
 * UserModel & Auth Constants
 * Mengelola struktur data pengguna (Super Admin & Kasir), kredensial default,
 * serta pemetaan hak akses fitur berdasarkan menu sidebar.
 */

export const AUTH_USER_STORAGE_KEY = 'pos_authenticated_user';
export const CASHIERS_STORAGE_KEY = 'pos_cashier_accounts';
export const SUPERADMIN_STORAGE_KEY = 'pos_superadmin_profile';

// Role Constants
export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin', // Kepala Toko
  KASIR: 'kasir'
};

export const hasAdminPrivileges = (role) => 
  role === ROLES.SUPERADMIN || role === ROLES.ADMIN || role === 'kepala_toko';

export const isStoreAdminRole = (role) => 
  role === ROLES.ADMIN || role === 'kepala_toko';

export const getRoleDisplayName = (role) => {
  if (role === ROLES.SUPERADMIN) return 'Super Admin';
  if (role === ROLES.ADMIN || role === 'kepala_toko') return 'Kepala Toko';
  return 'Kasir POS';
};

// Akun permanen Super Admin default
export const DEFAULT_SUPERADMIN = {
  id: 'usr_superadmin',
  nama: 'Super Admin',
  username: 'superadmin',
  password: '',
  role: 'superadmin'
};


// Daftar seluruh fitur / menu sidebar yang dapat diatur hak aksesnya (Toggle On/Off)
export const NAV_FEATURES = [
  {
    key: 'kasir',
    label: 'Kasir POS (Buat Pesanan)',
    group: 'PENJUALAN & KASIR',
    iconName: 'ShoppingBag',
    description: 'Akses modul transaksi penjualan, keranjang belanja, pembayaran, dan cetak struk kasir'
  },
  {
    key: 'unit',
    label: 'Satuan Ukur',
    group: 'MASTER DATA',
    iconName: 'Ruler',
    description: 'Akses manajemen data master satuan ukur bahan baku (UOM)'
  },
  {
    key: 'category',
    label: 'Kategori Produk',
    group: 'MASTER DATA',
    iconName: 'Layers',
    description: 'Akses manajemen data master kategori produk dan menu'
  },
  {
    key: 'topping',
    label: 'Data Topping',
    group: 'MASTER DATA',
    iconName: 'Sparkles',
    description: 'Akses manajemen data master topping dan harga tambahan'
  },
  {
    key: 'product-menu',
    label: 'Menu Produk',
    group: 'MASTER DATA',
    iconName: 'Cookie',
    description: 'Akses manajemen daftar menu makanan crêpes & minuman'
  },
  {
    key: 'raw-material',
    label: 'Stok Bahan Baku',
    group: 'INVENTORI & STOK',
    iconName: 'Package',
    description: 'Akses pantau stok bahan baku dan pencatatan stok masuk (restok) bagi kasir'
  },
  {
    key: 'stock-opname',
    label: 'Stock Opname',
    group: 'INVENTORI & STOK',
    iconName: 'ClipboardCheck',
    description: 'Akses pencatatan stok fisik aktual harian dan rekonsiliasi selisih stok bahan baku'
  },
  {
    key: 'returns',
    label: 'Retur & Kerusakan (Waste)',
    group: 'RETUR & KERUSAKAN',
    iconName: 'RotateCcw',
    description: 'Akses audit pesanan gagal masak / diretur dan pencatatan bahan baku rusak / expired'
  },
  {
    key: 'reports-sales',
    label: 'Laporan Penjualan & Laba HPP',
    group: 'LAPORAN & ANALITIK',
    iconName: 'TrendingUp',
    description: 'Akses grafik analitik omset, laba kotor, HPP, serta ekspor PDF & Excel'
  },
  {
    key: 'reports-materials',
    label: 'Laporan Pengurangan Bahan Baku',
    group: 'LAPORAN & ANALITIK',
    iconName: 'Package',
    description: 'Akses rekapitulasi estimasi pemakaian bahan baku berdasarkan pesanan'
  },
  {
    key: 'settings',
    label: 'Pengaturan Struk & Toko',
    group: 'PENGATURAN & SISTEM',
    iconName: 'Sliders',
    description: 'Akses konfigurasi profil toko, logo, dan tata letak cetak nota kasir'
  }
];

// Akun kasir awal (kosong)
export const INITIAL_CASHIERS = [];

