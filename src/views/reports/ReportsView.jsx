import React, { useEffect, useMemo } from 'react';
import { useReport } from '../../controllers/ReportController';
import { useNavigation } from '../../controllers/UIController';
import { useAuth } from '../../controllers/AuthController';
import { SalesReportTab } from './SalesReportTab';
import { MaterialUsageReportTab } from './MaterialUsageReportTab';
import { Badge } from '../components/Badge';
import { SearchSelect } from '../components/SearchSelect';
import { 
  Package, 
  Calendar, 
  BarChart3, 
  Clock, 
  ChevronRight, 
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Receipt,
  ArrowLeft
} from 'lucide-react';

export const ReportsView = () => {
  const { activeMenu } = useNavigation();
  const { currentUser, hasPermission } = useAuth();
  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'kepala_toko';
  const isCashier = currentUser?.role === 'kasir';
  const canViewSales = typeof hasPermission === 'function' ? (hasPermission('reports-sales') || hasPermission('reports') || isSuperAdmin) : true;
  const canViewMaterials = typeof hasPermission === 'function' ? (hasPermission('reports-materials') || hasPermission('reports') || isSuperAdmin) : true;

  const {
    activeReportTab,
    setActiveReportTab,
    activeSalesSection,
    setActiveSalesSection,
    selectedOrderDetailId,
    setSelectedOrderDetailId,
    enrichedOrders = [],
    dateRangePreset,
    setDateRangePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    handleExportExcel,
    handleExportPDF
  } = useReport();

  const selectedOrder = useMemo(() => {
    if (!selectedOrderDetailId) return null;
    return (enrichedOrders || []).find(o => o.id === selectedOrderDetailId) || null;
  }, [selectedOrderDetailId, enrichedOrders]);

  // Sync active report tab and section when sidebar menu changes
  useEffect(() => {
    if (typeof setSelectedOrderDetailId === 'function') {
      setSelectedOrderDetailId(null);
    }
    if (activeMenu === 'reports-sales' || activeMenu === 'reports-sales-summary') {
      setActiveReportTab('sales');
      setActiveSalesSection('products');
    } else if (activeMenu === 'reports-sales-transactions') {
      setActiveReportTab('sales');
      setActiveSalesSection('transactions');
    } else if (activeMenu === 'reports-materials') {
      setActiveReportTab('materials');
    }
  }, [activeMenu, setActiveReportTab, setActiveSalesSection, setSelectedOrderDetailId]);

  const salesTitle = selectedOrder
    ? 'Detail Transaksi Penjualan'
    : (activeSalesSection === 'transactions'
      ? 'Riwayat Transaksi Penjualan'
      : (isSuperAdmin ? 'Summary Penjualan Menu & Laba HPP' : 'Summary Penjualan Menu & Topping'));

  const salesSubtitle = selectedOrder
    ? `Rincian lengkap pesanan #${selectedOrder.invoiceNumber}, status pembayaran kasir, serta rincian pemakaian bahan baku.`
    : (activeSalesSection === 'transactions'
      ? 'Daftar lengkap seluruh transaksi pesanan kasir, nomor invoice, kasir yang bertugas, dan status pembayaran.'
      : (isSuperAdmin
        ? 'Pantau ringkasan omset penjualan, estimasi HPP produk & extra topping, serta audit keuntungan bersih secara akurat.'
        : 'Pantau ringkasan omset penjualan porsi menu dan extra topping yang terjual.'));

  const badgeText = selectedOrder
    ? `Invoice #${selectedOrder.invoiceNumber}`
    : (activeReportTab === 'materials'
      ? 'Audit Pengurangan Stok'
      : (activeSalesSection === 'transactions' ? 'Riwayat Transaksi Kasir' : 'Omset & Performa Menu'));

  return (
    <div className="reports-page animate-fade-in" style={styles.container}>
      {/* 1. TOP HEADER SECTION */}
      <div style={styles.headerSection}>
        <div>
          {selectedOrder && (
            <button
              type="button"
              onClick={() => setSelectedOrderDetailId(null)}
              className="reports-back-btn"
              style={styles.backBtn}
              title="Kembali ke Riwayat Transaksi"
            >
              <ArrowLeft size={15} />
              <span>Kembali ke Riwayat Transaksi</span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={styles.pageTitle}>
              {activeReportTab === 'sales' ? salesTitle : 'Laporan Pengurangan Bahan Baku'}
            </h1>
            <Badge variant="primary" withDot>
              {badgeText}
            </Badge>
          </div>
          <p style={styles.pageSubtitle}>
            {activeReportTab === 'sales'
              ? salesSubtitle
              : 'Audit trail pengurangan bahan baku dari pesanan menu & extra topping kasir secara transparan.'}
          </p>
        </div>
      </div>

      {/* 2. IN-PAGE SUB-NAVIGATION TABS */}
      {!selectedOrder && (
        <div className="reports-nav-tabs" style={styles.navTabs}>
          {canViewSales && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveReportTab('sales');
                  setActiveSalesSection('products');
                }}
                className={`reports-tab-btn ${activeReportTab === 'sales' && activeSalesSection === 'products' ? 'active' : ''}`}
                style={{
                  ...styles.tabBtn,
                  ...(activeReportTab === 'sales' && activeSalesSection === 'products' ? styles.tabBtnActive : {})
                }}
              >
                <BarChart3 size={15} />
                <span>Summary Menu & Topping</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveReportTab('sales');
                  setActiveSalesSection('transactions');
                }}
                className={`reports-tab-btn ${activeReportTab === 'sales' && activeSalesSection === 'transactions' ? 'active' : ''}`}
                style={{
                  ...styles.tabBtn,
                  ...(activeReportTab === 'sales' && activeSalesSection === 'transactions' ? styles.tabBtnActive : {})
                }}
              >
                <Receipt size={15} />
                <span>Riwayat Transaksi Kasir</span>
              </button>
            </>
          )}

          {canViewMaterials && (
            <button
              type="button"
              onClick={() => setActiveReportTab('materials')}
              className={`reports-tab-btn ${activeReportTab === 'materials' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(activeReportTab === 'materials' ? styles.tabBtnActive : {})
              }}
            >
              <Package size={15} />
              <span>Audit Pengurangan Bahan</span>
            </button>
          )}
        </div>
      )}

      {/* 3. DATE RANGE PRESET FILTER BAR (DROPDOWN) & EXPORT ACTIONS */}
      {!selectedOrder && (
        <div className="reports-date-filter-card" style={styles.dateFilterCard}>

          <div className="reports-date-filter-left" style={styles.dateFilterLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neutral-700)', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Calendar size={16} color="var(--blue-500)" />
              <span>Periode Waktu:</span>
            </div>

          <div style={{ minWidth: '190px' }}>
            <SearchSelect
              options={[
                { value: 'all', label: 'Semua Waktu' },
                { value: 'today', label: 'Hari Ini' },
                { value: 'yesterday', label: 'Kemarin' },
                { value: '7days', label: '7 Hari Terakhir' },
                { value: '30days', label: '30 Hari Terakhir' },
                { value: 'this_month', label: 'Bulan Ini' },
                { value: 'custom', label: 'Pilih Tanggal / Kustom' }
              ]}
              value={dateRangePreset}
              onChange={(val) => setDateRangePreset(val)}
              placeholder="Pilih periode..."
              searchPlaceholder="Cari periode..."
              clearable={false}
              size="sm"
            />
          </div>

          {/* Custom Date Pickers */}
          {dateRangePreset === 'custom' && (
            <div className="reports-custom-date-wrapper" style={styles.customDateWrapper}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={styles.dateInput}
                title="Pilih tanggal awal / tanggal tertentu"
              />
              <span style={{ color: 'var(--neutral-400)', fontSize: '12px', fontWeight: 600 }}>s/d</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={styles.dateInput}
                title="Pilih tanggal akhir (opsional untuk rentang)"
              />
              {(customStartDate || customEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  style={styles.dateClearBtn}
                  title="Reset pilihan tanggal"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* Export Buttons - Di-take out khusus untuk Kasir pada Laporan Penjualan */}
        {!(isCashier && activeReportTab === 'sales') && (
          <div className="reports-export-actions" style={styles.exportActions}>
            <button
              onClick={handleExportExcel}
              className="reports-export-btn export-excel"
              style={styles.exportBtnExcel}
              title="Unduh laporan aktif dalam format Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet size={16} />
              <span>Unduh Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="reports-export-btn export-pdf"
              style={styles.exportBtnPdf}
              title="Unduh laporan aktif dalam format dokumen PDF (.pdf)"
            >
              <FileText size={16} />
              <span>Unduh PDF</span>
            </button>
          </div>
        )}
        </div>
      )}

      {/* 3. ACTIVE REPORT CONTENT */}
      <div style={styles.contentSection}>
        {activeReportTab === 'sales' ? (
          <SalesReportTab />
        ) : (
          <MaterialUsageReportTab />
        )}
      </div>

      <style>{`
        .reports-export-btn {
          transition: var(--transition-fast);
        }
        .export-excel:hover {
          background-color: #DCFCE7 !important;
          border-color: #86EFAC !important;
          transform: translateY(-1px);
        }
        .export-pdf:hover {
          background-color: #FEE2E2 !important;
          border-color: #FCA5A5 !important;
          transform: translateY(-1px);
        }
        @media (max-width: 1024px) {
          .reports-page {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .reports-date-filter-card {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 14px !important;
            gap: 12px !important;
          }
          .reports-date-filter-left {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            gap: 10px !important;
          }
          .reports-date-select-wrapper {
            width: 100% !important;
            min-width: 100% !important;
          }
          .reports-custom-date-wrapper {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .reports-custom-date-wrapper input {
            flex: 1 !important;
            width: 100% !important;
          }
          .reports-export-actions {
            width: 100% !important;
            display: flex !important;
            gap: 8px !important;
          }
          .reports-export-btn {
            flex: 1 !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    padding: '24px',
    maxWidth: '100%',
    margin: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  headerSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px'
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--neutral-900)',
    letterSpacing: '-0.02em',
    margin: 0
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--neutral-600)',
    marginTop: '6px',
    maxWidth: '750px',
    lineHeight: 1.5
  },
  navTabs: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#F1F5F9',
    padding: '4px',
    borderRadius: '10px',
    flexWrap: 'wrap',
    width: 'fit-content'
  },
  tabBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '0.813rem',
    fontWeight: 600,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748B',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface, #FFFFFF)',
    color: 'var(--neutral-700)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '10px',
    transition: 'all 0.15s ease'
  },
  dateFilterCard: {

    backgroundColor: '#FFFFFF',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px 18px',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px'
  },
  dateFilterLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  selectWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: '220px'
  },
  filterSelect: {
    width: '100%',
    paddingLeft: '14px',
    paddingRight: '34px',
    height: '42px',
    fontSize: '0.813rem',
    fontWeight: 600,
    color: 'var(--neutral-700)',
    boxSizing: 'border-box',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '8px',
    border: '1px solid var(--border-color)'
  },
  filterChevron: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    zIndex: 2
  },
  customDateWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap'
  },
  dateInput: {
    padding: '0 12px',
    height: '42px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontSize: '0.813rem',
    color: 'var(--neutral-700)',
    backgroundColor: 'var(--bg-surface)',
    outline: 'none',
    boxSizing: 'border-box'
  },
  dateClearBtn: {
    border: 'none',
    background: 'none',
    color: 'var(--neutral-400)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s ease'
  },
  contentSection: {
    marginTop: '6px'
  },
  exportActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  exportBtnExcel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    height: '42px',
    padding: '0 16px',
    borderRadius: '8px',
    border: '1px solid #BBF7D0',
    backgroundColor: '#F0FDF4',
    color: '#15803D',
    fontSize: '0.813rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'var(--transition-fast)'
  },
  exportBtnPdf: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    height: '42px',
    padding: '0 16px',
    borderRadius: '8px',
    border: '1px solid #FECACA',
    backgroundColor: '#FEF2F2',
    color: '#B91C1C',
    fontSize: '0.813rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'var(--transition-fast)'
  }
};
