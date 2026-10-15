import React, { useEffect, useState, Suspense, lazy } from 'react';

// Controllers [C]
import { 
  UIProvider,
  useNavigation,
  AuthProvider,
  useAuth,
  UnitProvider, 
  useUnit, 
  CategoryProvider, 
  useCategory,
  RawMaterialProvider, 
  useRawMaterial,
  ToppingProvider, 
  useTopping,
  ProductMenuProvider, 
  useProductMenu,
  OrderProvider,
  useOrder,
  SettingsProvider,
  useSettings,
  ReportProvider,
  StockOpnameProvider,
  useStockOpname
} from './controllers';

// Views [V] - Layout & Common
import { Sidebar } from './views/components/Sidebar';
import { Navbar } from './views/components/Navbar';
import { ToastContainer } from './views/components/Toast';
import { SystemLoadingModal } from './views/components/SystemLoadingModal';
import { ImagePreviewModal } from './views/components/ImagePreviewModal';
import { MySQLConfigBanner } from './views/components/MySQLConfigBanner';
import { TableSkeleton, CardSkeleton, InlineSpinner } from './views/components/LoadingSkeleton';

// Helper to lazily load named exports
const lazyNamed = (importer, name) => lazy(() => importer().then(module => ({ default: module[name] })));

// Views [V] - Auth (Lazy)
const LoginView = lazyNamed(() => import('./views/auth/LoginView'), 'LoginView');

// Views [V] - POS Kasir (Lazy)
const KasirOrderView = lazyNamed(() => import('./views/pos/KasirOrderView'), 'KasirOrderView');

// Views [V] - Master Data (Lazy)
const UnitListView = lazyNamed(() => import('./views/master/unit/UnitListView'), 'UnitListView');
const CategoryListView = lazyNamed(() => import('./views/master/category/CategoryListView'), 'CategoryListView');
const ToppingListView = lazyNamed(() => import('./views/master/topping/ToppingListView'), 'ToppingListView');
const ProductMenuListView = lazyNamed(() => import('./views/master/productMenu/ProductMenuListView'), 'ProductMenuListView');

// Views [V] - Inventori & Stok (Lazy)
const RawMaterialListView = lazyNamed(() => import('./views/inventory/rawMaterial/RawMaterialListView'), 'RawMaterialListView');
const StockOpnameView = lazyNamed(() => import('./views/inventory/rawMaterial/StockOpnameView'), 'StockOpnameView');

// Views [V] - Retur & Laporan (Lazy)
const ReturnsManagementView = lazyNamed(() => import('./views/returns/ReturnsManagementView'), 'ReturnsManagementView');
const ReportsView = lazyNamed(() => import('./views/reports/ReportsView'), 'ReportsView');

// Views [V] - Settings & Multi-Cabang & Kelola Kasir (Lazy)
const SettingsView = lazyNamed(() => import('./views/settings/SettingsView'), 'SettingsView');
const BranchManagementSection = lazyNamed(() => import('./views/settings/BranchManagementSection'), 'BranchManagementSection');
const CashierManagementView = lazyNamed(() => import('./views/cashier/CashierManagementView'), 'CashierManagementView');

// Modals [V] - Satuan Ukur (Lazy)
const UnitFormModal = lazyNamed(() => import('./views/master/unit/UnitFormModal'), 'UnitFormModal');
const UnitDeleteModal = lazyNamed(() => import('./views/master/unit/UnitDeleteModal'), 'UnitDeleteModal');

// Modals [V] - Kategori (Lazy)
const CategoryFormModal = lazyNamed(() => import('./views/master/category/CategoryFormModal'), 'CategoryFormModal');
const CategoryDeleteModal = lazyNamed(() => import('./views/master/category/CategoryDeleteModal'), 'CategoryDeleteModal');
const CategoryReorderModal = lazyNamed(() => import('./views/master/category/CategoryReorderModal'), 'CategoryReorderModal');

// Modals [V] - Topping (Lazy)
const ToppingFormModal = lazyNamed(() => import('./views/master/topping/ToppingFormModal'), 'ToppingFormModal');
const ToppingDeleteModal = lazyNamed(() => import('./views/master/topping/ToppingDeleteModal'), 'ToppingDeleteModal');

// Modals [V] - Menu Produk (Lazy)
const ProductMenuFormModal = lazyNamed(() => import('./views/master/productMenu/ProductMenuFormModal'), 'ProductMenuFormModal');
const ProductMenuDeleteModal = lazyNamed(() => import('./views/master/productMenu/ProductMenuDeleteModal'), 'ProductMenuDeleteModal');

// Modals [V] - Stok Bahan Baku & Waste (Lazy)
const RawMaterialFormModal = lazyNamed(() => import('./views/inventory/rawMaterial/RawMaterialFormModal'), 'RawMaterialFormModal');
const RawMaterialDeleteModal = lazyNamed(() => import('./views/inventory/rawMaterial/RawMaterialDeleteModal'), 'RawMaterialDeleteModal');
const StockAdjustModal = lazyNamed(() => import('./views/inventory/rawMaterial/StockAdjustModal'), 'StockAdjustModal');
const WasteRecordModal = lazyNamed(() => import('./views/inventory/rawMaterial/WasteRecordModal'), 'WasteRecordModal');

// Modals [V] - POS Kasir & Retur (Lazy)
const ToppingSelectionModal = lazyNamed(() => import('./views/pos/ToppingSelectionModal'), 'ToppingSelectionModal');
const PaymentModal = lazyNamed(() => import('./views/pos/PaymentModal'), 'PaymentModal');
const ReceiptModal = lazyNamed(() => import('./views/pos/ReceiptModal'), 'ReceiptModal');
const OrderReturnModal = lazyNamed(() => import('./views/pos/OrderReturnModal'), 'OrderReturnModal');
const OrderCancelModal = lazyNamed(() => import('./views/pos/OrderCancelModal'), 'OrderCancelModal');
const OrderRevisionModal = lazyNamed(() => import('./views/pos/OrderRevisionModal'), 'OrderRevisionModal');

// Modals [V] - Kelola Kasir & Konfigurasi Profil Super Admin (Lazy)
const CashierFormModal = lazyNamed(() => import('./views/cashier/CashierFormModal'), 'CashierFormModal');
const CashierDeleteModal = lazyNamed(() => import('./views/cashier/CashierDeleteModal'), 'CashierDeleteModal');
const SuperAdminProfileModal = lazyNamed(() => import('./views/profile/SuperAdminProfileModal'), 'SuperAdminProfileModal');

function ModuleLoadingFallback({ activeMenu }) {
  if (activeMenu === 'kasir') {
    return (
      <div style={{ padding: '24px' }}>
        <InlineSpinner text="Memuat antarmuka Kasir POS..." />
        <CardSkeleton count={8} />
      </div>
    );
  }
  if (activeMenu?.startsWith('reports')) {
    return (
      <div style={{ padding: '24px' }}>
        <InlineSpinner text="Memuat modul Laporan & Analitik..." />
        <TableSkeleton rows={6} cols={6} />
      </div>
    );
  }
  if (activeMenu === 'stock-opname' || activeMenu === 'raw-material') {
    return (
      <div style={{ padding: '24px' }}>
        <InlineSpinner text="Memuat modul Inventori & Stok..." />
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }
  return (
    <div style={{ padding: '24px' }}>
      <InlineSpinner text="Memuat modul..." />
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}

function MainLayout() {
  const { activeMenu, setActiveMenu } = useNavigation();
  const { currentUser, hasPermission } = useAuth();
  const { photoPreviewModalState, closePhotoPreviewModal } = useRawMaterial();

  // Route Guard: Pastikan kasir tidak membuka menu yang hak aksesnya dinonaktifkan
  useEffect(() => {
    if (currentUser?.role === 'kasir') {
      let isAllowed = false;
      if (activeMenu === 'reports' || activeMenu === 'reports-sales' || activeMenu === 'reports-sales-summary' || activeMenu === 'reports-sales-transactions' || activeMenu === 'reports-materials') {
        isAllowed = hasPermission('reports-sales') || hasPermission('reports-materials');
      } else {
        isAllowed = hasPermission(activeMenu);
      }

      // Jika menu yang aktif saat ini tidak diizinkan, arahkan ke menu pertama yang diizinkan
      if (!isAllowed) {
        const candidateMenus = ['kasir', 'product-menu', 'category', 'topping', 'raw-material', 'stock-opname', 'returns', 'reports-sales-summary', 'reports-sales-transactions', 'reports-materials', 'settings', 'unit'];
        const firstPermitted = candidateMenus.find(m => hasPermission(m));
        if (firstPermitted) {
          setActiveMenu(firstPermitted);
        }
      }
    }
  }, [activeMenu, currentUser, hasPermission, setActiveMenu]);

  const renderActiveModule = () => {
    switch (activeMenu) {
      case 'kasir':
        return <KasirOrderView />;
      case 'product-menu':
        return <ProductMenuListView />;
      case 'category':
        return <CategoryListView />;
      case 'topping':
        return <ToppingListView />;
      case 'raw-material':
        return <RawMaterialListView />;
      case 'stock-opname':
        return <StockOpnameView />;
      case 'returns':
        return <ReturnsManagementView />;
      case 'settings':
        return <SettingsView />;
      case 'branch-management':
        return (currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'kepala_toko') ? <BranchManagementSection /> : <KasirOrderView />;
      case 'reports':
      case 'reports-sales':
      case 'reports-sales-summary':
      case 'reports-sales-transactions':
      case 'reports-materials':
        return <ReportsView />;
      case 'cashier-management':
        return (currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'kepala_toko') ? <CashierManagementView /> : <KasirOrderView />;
      case 'unit':
      default:
        return <UnitListView />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Nav */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="app-main">
        <MySQLConfigBanner />
        <Navbar />
        
        <main className={`app-content ${activeMenu === 'returns' ? 'app-content-returns' : ''}`}>
          <Suspense fallback={<ModuleLoadingFallback activeMenu={activeMenu} />}>
            {renderActiveModule()}
          </Suspense>
        </main>
      </div>

      {/* Lazy Modals wrapped in Suspense */}
      <Suspense fallback={null}>
        {/* Modals for Satuan Ukur */}
        <UnitFormModal />
        <UnitDeleteModal />

        {/* Modals for Kategori */}
        <CategoryFormModal />
        <CategoryDeleteModal />
        <CategoryReorderModal />

        {/* Modals for Topping */}
        <ToppingFormModal />
        <ToppingDeleteModal />

        {/* Modals for Menu Produk */}
        <ProductMenuFormModal />
        <ProductMenuDeleteModal />

        {/* Modals for Stok Bahan Baku & Waste */}
        <RawMaterialFormModal />
        <RawMaterialDeleteModal />
        <StockAdjustModal />
        <WasteRecordModal />

        {/* Modals for Kasir POS & Retur Pesanan & Pembatalan & Revisi */}
        <ToppingSelectionModal />
        <PaymentModal />
        <ReceiptModal />
        <OrderReturnModal />
        <OrderCancelModal />
        <OrderRevisionModal />

        {/* Modals for Manajemen Kasir (Super Admin) */}
        <CashierFormModal />
        <CashierDeleteModal />

        {/* Modal Konfigurasi Profil Super Admin */}
        <SuperAdminProfileModal />
      </Suspense>

      {/* Modal Zoom / Preview Bukti Foto */}
      <ImagePreviewModal
        isOpen={photoPreviewModalState?.isOpen}
        onClose={closePhotoPreviewModal}
        photoUrl={photoPreviewModalState?.photoUrl}
        title={photoPreviewModalState?.title}
        meta={photoPreviewModalState?.meta}
      />

      {/* Global Toast */}
      <ToastContainer />
    </div>
  );
}

function AuthenticatedApp() {
  const { currentUser } = useAuth();

  // Jika pengguna belum login, tampilkan Halaman Login
  if (!currentUser) {
    return (
      <Suspense fallback={
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
          <InlineSpinner text="Memuat formulir login..." />
        </div>
      }>
        <LoginView />
        <ToastContainer />
      </Suspense>
    );
  }

  // Jika sudah login, tampilkan Layout Aplikasi Utama
  return <MainLayout />;
}

function SystemLoadingGate() {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: unitLoading } = useUnit();
  const { isLoading: settingsLoading } = useSettings();
  const { isLoading: categoryLoading } = useCategory();
  const { isLoading: rawMaterialLoading } = useRawMaterial();
  const { isLoading: stockOpnameLoading } = useStockOpname();
  const { isLoading: toppingLoading } = useTopping();
  const { isLoading: productMenuLoading } = useProductMenu();
  const { isLoading: orderLoading } = useOrder();
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const isLoadingPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('previewLoading');

  const isSystemLoading = Boolean(
    authLoading ||
    unitLoading ||
    settingsLoading ||
    categoryLoading ||
    rawMaterialLoading ||
    stockOpnameLoading ||
    toppingLoading ||
    productMenuLoading ||
    orderLoading
  );

  useEffect(() => {
    if (!isSystemLoading) {
      setShowLoadingModal(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowLoadingModal(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isSystemLoading]);

  return <SystemLoadingModal isOpen={isLoadingPreview || showLoadingModal} />;
}

function AuthenticatedDataApp() {
  const { currentUser } = useAuth();

  if (!currentUser) return <AuthenticatedApp />;

  return (
    <CategoryProvider>
        <RawMaterialProvider>
          <StockOpnameProvider>
            <ToppingProvider>
              <ProductMenuProvider>
                <OrderProvider>
                  <ReportProvider>
                    <AuthenticatedApp />
                    <SystemLoadingGate />
                  </ReportProvider>
                </OrderProvider>
              </ProductMenuProvider>
            </ToppingProvider>
          </StockOpnameProvider>
        </RawMaterialProvider>
    </CategoryProvider>
  );
}

function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <UnitProvider>
          <SettingsProvider>
            <AuthenticatedDataApp />
          </SettingsProvider>
        </UnitProvider>
      </AuthProvider>
    </UIProvider>
  );
}

export default App;
