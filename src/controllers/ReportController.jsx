import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useOrder } from './OrderController';
import { useRawMaterial } from './RawMaterialController';
import { useProductMenu } from './ProductMenuController';
import { useTopping } from './ToppingController';
import { useSettings } from './SettingsController';
import { useAuth } from './AuthController';
import { useNavigation } from './UIController';
import {
  getPeriodLabel,
  exportProductPerformanceToExcel,
  exportProductPerformanceToPDF,
  exportTransactionHistoryToExcel,
  exportTransactionHistoryToPDF,
  exportCompleteSalesReportToExcel,
  exportMaterialUsageToExcel,
  exportMaterialUsageToPDF
} from '../utils/reportExportUtils';

const ReportContext = createContext();

export const useReport = () => {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReport must be used within a ReportProvider');
  }
  return context;
};

export const useReportController = useReport;

export const ReportProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { activeMenu } = useNavigation();
  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'kepala_toko';
  const isCashier = currentUser?.role === 'kasir';
  const isReportRoute = activeMenu === 'reports' ||
    activeMenu === 'reports-sales' ||
    activeMenu === 'reports-sales-summary' ||
    activeMenu === 'reports-sales-transactions' ||
    activeMenu === 'reports-materials';
  const { fetchOrdersPage } = useOrder();
  const { rawMaterials = [], fetchStockLogsPage } = useRawMaterial();
  const { productMenus = [] } = useProductMenu();
  const { toppings = [] } = useTopping();
  const { settings = {} } = useSettings();
  const storeName = currentUser?.activeBranchName || settings.storeName || settings.appName || 'XCrepes POS';

  // Active Submenu Tab: 'sales' | 'materials'
  const [activeReportTab, setActiveReportTab] = useState('sales');

  // Active Sales Sub-tab: 'products' | 'transactions'
  const [activeSalesSection, setActiveSalesSection] = useState('products');

  // Date Range Filter Preset: 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'custom'
  const [dateRangePreset, setDateRangePreset] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Sales Tab Specific Filters
  const [salesSearchTerm, setSalesSearchTerm] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('ALL'); // 'ALL' | 'cash' | 'qris' | 'card'
  const [salesItemTypeFilter, setSalesItemTypeFilter] = useState('MENU'); // 'MENU' | 'TOPPING'
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState(null);

  // Material Usage Tab Specific Filters
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [materialIdFilter, setMaterialIdFilter] = useState('ALL');
  const [materialEventTypeFilter, setMaterialEventTypeFilter] = useState('ALL'); // 'ALL' | 'SALE' | 'MANUAL_OUT' | 'ADJUST'
  const [reportOrders, setReportOrders] = useState([]);
  const [reportStockLogs, setReportStockLogs] = useState([]);

  // Helper: Date Bounds Calculator
  const getDateBounds = (preset) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (preset) {
      case 'today':
        return { start: todayStart, end: todayEnd };
      case 'yesterday': {
        const yStart = new Date(todayStart);
        yStart.setDate(yStart.getDate() - 1);
        const yEnd = new Date(todayEnd);
        yEnd.setDate(yEnd.getDate() - 1);
        return { start: yStart, end: yEnd };
      }
      case '7days': {
        const s7 = new Date(todayStart);
        s7.setDate(s7.getDate() - 6);
        return { start: s7, end: todayEnd };
      }
      case '30days': {
        const s30 = new Date(todayStart);
        s30.setDate(s30.getDate() - 29);
        return { start: s30, end: todayEnd };
      }
      case 'this_month': {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return { start: mStart, end: todayEnd };
      }
      case 'custom': {
        if (!customStartDate && !customEndDate) {
          return { start: new Date(0), end: new Date(2099, 11, 31) };
        }
        let cStart = customStartDate ? new Date(`${customStartDate}T00:00:00`) : new Date(0);
        let cEnd = customEndDate
          ? new Date(`${customEndDate}T23:59:59.999`)
          : (customStartDate ? new Date(`${customStartDate}T23:59:59.999`) : new Date());

        if (customStartDate && customEndDate && cStart > cEnd) {
          const temp = cStart;
          cStart = cEnd;
          cEnd = temp;
        }
        return { start: cStart, end: cEnd };
      }
      case 'all':
      default:
        return { start: new Date(0), end: new Date(2099, 11, 31) };
    }
  };

  const reportDateFilters = useMemo(() => {
    const { start, end } = getDateBounds(dateRangePreset);
    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString()
    };
  }, [dateRangePreset, customStartDate, customEndDate]);

  useEffect(() => {
    if (!isReportRoute || activeReportTab !== 'sales' || typeof fetchOrdersPage !== 'function') return undefined;
    let active = true;
    const load = async () => {
      const pageSize = 250;
      const maxRows = 2000;
      const rows = [];
      for (let page = 1; rows.length < maxRows; page += 1) {
        const result = await fetchOrdersPage({ page, pageSize, filters: reportDateFilters });
        if (result.error || !active) return;
        const batch = result.data || [];
        rows.push(...batch);
        if (batch.length < pageSize || rows.length >= Number(result.count || 0)) break;
      }
      if (active) setReportOrders(rows.slice(0, maxRows));
    };
    load();
    return () => { active = false; };
  }, [isReportRoute, activeReportTab, fetchOrdersPage, reportDateFilters]);

  useEffect(() => {
    if (!isReportRoute || activeReportTab !== 'materials' || typeof fetchStockLogsPage !== 'function') return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      const pageSize = 250;
      const maxRows = 2000;
      const rows = [];
      const databaseType = ['WASTE', 'ADJUST', 'IN', 'OUT'].includes(materialEventTypeFilter)
        ? materialEventTypeFilter
        : 'ALL';
      const filters = {
        ...reportDateFilters,
        search: materialSearchTerm,
        material: materialIdFilter,
        type: databaseType
      };
      for (let page = 1; rows.length < maxRows; page += 1) {
        const result = await fetchStockLogsPage({ page, pageSize, filters });
        if (result.error || !active) return;
        const batch = result.data || [];
        rows.push(...batch);
        if (batch.length < pageSize || rows.length >= Number(result.count || 0)) break;
      }
      if (active) setReportStockLogs(rows.slice(0, maxRows));
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    isReportRoute,
    activeReportTab,
    fetchStockLogsPage,
    reportDateFilters,
    materialSearchTerm,
    materialIdFilter,
    materialEventTypeFilter
  ]);

  // Helper: Lookup Price per Unit of Raw Material
  const getMaterialPrice = (rawMaterialId) => {
    const found = rawMaterials.find(m => m.id === rawMaterialId);
    return found ? (Number(found.pricePerUnit) || 0) : 0;
  };

  // Helper: Calculate Recipe HPP for a Base Menu
  const calculateMenuUnitHPP = (menu) => {
    if (!menu || !Array.isArray(menu.ingredients) || menu.ingredients.length === 0) return 0;
    return menu.ingredients.reduce((sum, ing) => {
      const pricePerUnit = getMaterialPrice(ing.rawMaterialId);
      const qty = Number(ing.quantity) || 0;
      return sum + (pricePerUnit * qty);
    }, 0);
  };

  // Helper: Calculate Recipe HPP for a Topping
  const calculateToppingUnitHPP = (top) => {
    if (!top || !Array.isArray(top.ingredients) || top.ingredients.length === 0) return 0;
    return top.ingredients.reduce((sum, ing) => {
      const pricePerUnit = getMaterialPrice(ing.rawMaterialId);
      const qty = Number(ing.quantity) || 0;
      return sum + (pricePerUnit * qty);
    }, 0);
  };

  // 1. FILTERED ORDERS by Date Range
  const filteredOrders = useMemo(() => {
    if (!isReportRoute) return [];

    const { start, end } = getDateBounds(dateRangePreset);

    return reportOrders.filter(order => {
      const orderDate = new Date(order.date || order.createdAt || Date.now());
      if (orderDate < start || orderDate > end) return false;
      return true;
    });
  }, [reportOrders, isReportRoute, dateRangePreset, customStartDate, customEndDate]);

  // 2. DETAILED ENRICHED ORDERS (with individual HPP calculation)
  const enrichedOrders = useMemo(() => {
    return filteredOrders.map(order => {
      let orderTotalHPP = 0;

      const enrichedItems = (order.items || []).map(item => {
        const itemQty = Number(item.quantity) || 1;
        const matchedMenu = productMenus.find(m => m.id === item.menuId);
        const menuUnitHpp = calculateMenuUnitHPP(matchedMenu || item);
        const menuTotalHpp = menuUnitHpp * itemQty;

        // Toppings HPP
        let toppingsUnitHpp = 0;
        const enrichedToppings = (item.toppings || []).map(t => {
          const matchedTop = toppings.find(top => top.id === (t.id || t.toppingId));
          const topUnitHpp = calculateToppingUnitHPP(matchedTop || t);
          toppingsUnitHpp += topUnitHpp;
          return {
            ...t,
            unitHpp: topUnitHpp,
            totalHpp: topUnitHpp * itemQty
          };
        });

        const itemUnitHpp = menuUnitHpp + toppingsUnitHpp;
        const itemTotalHpp = itemUnitHpp * itemQty;
        orderTotalHPP += itemTotalHpp;

        const itemTotalRevenue = (Number(item.unitPrice) || 0) * itemQty;
        const itemProfit = itemTotalRevenue - itemTotalHpp;

        return {
          ...item,
          menuUnitHpp,
          toppingsUnitHpp,
          itemUnitHpp,
          itemTotalHpp,
          itemTotalRevenue,
          itemProfit,
          enrichedToppings
        };
      });

      const grossRevenue = Number(order.totalAmount) || 0;
      const netProfit = grossRevenue - orderTotalHPP;
      const marginPercent = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

      return {
        ...order,
        enrichedItems,
        orderTotalHPP,
        grossRevenue,
        netProfit,
        marginPercent
      };
    });
  }, [filteredOrders, productMenus, toppings, rawMaterials]);

  // 3. SALES KPI SUMMARY
  const salesSummary = useMemo(() => {
    const activeOrders = enrichedOrders.filter(o => o.status !== 'cancelled' && o.status !== 'returned');
    const totalTransactions = activeOrders.length;
    let totalGrossRevenue = 0;
    let totalEstimatedHPP = 0;
    let totalMenuQtySold = 0;
    let totalToppingQtySold = 0;

    activeOrders.forEach(order => {
      totalGrossRevenue += order.grossRevenue;
      totalEstimatedHPP += order.orderTotalHPP;

      (order.items || []).forEach(it => {
        const q = Number(it.quantity) || 1;
        totalMenuQtySold += q;
        if (Array.isArray(it.toppings)) {
          totalToppingQtySold += it.toppings.length * q;
        }
      });
    });

    const totalNetProfit = totalGrossRevenue - totalEstimatedHPP;
    const grossProfitMargin = totalGrossRevenue > 0 ? (totalNetProfit / totalGrossRevenue) * 100 : 0;

    return {
      totalTransactions,
      totalGrossRevenue,
      totalEstimatedHPP,
      totalNetProfit,
      grossProfitMargin,
      totalMenuQtySold,
      totalToppingQtySold,
      totalAllItemsSold: totalMenuQtySold + totalToppingQtySold
    };
  }, [enrichedOrders]);

  // 4. PER-PRODUCT (MENU & EXTRA TOPPING) PERFORMANCE AGGREGATION
  const productPerformanceList = useMemo(() => {
    const menuMap = {};
    const toppingMap = {};

    enrichedOrders.forEach(order => {
      if (order.status === 'cancelled' || order.status === 'returned') return;
      (order.items || []).forEach(item => {
        const qty = Number(item.quantity) || 1;
        const menuKey = item.menuId || item.name;

        // Base Menu Tracking
        if (!menuMap[menuKey]) {
          const matchedMenu = productMenus.find(m => m.id === item.menuId);
          const unitHpp = calculateMenuUnitHPP(matchedMenu || item);
          menuMap[menuKey] = {
            id: item.menuId || menuKey,
            name: item.name,
            type: 'MENU',
            categoryName: item.categoryName || 'Menu Produk',
            basePrice: Number(item.basePrice) || (Number(item.unitPrice) - (Number(item.toppingsTotal) || 0)) || 0,
            unitHpp,
            qtySold: 0,
            grossRevenue: 0,
            totalHpp: 0
          };
        }
        const menuEntry = menuMap[menuKey];
        menuEntry.qtySold += qty;
        const itemBaseRev = menuEntry.basePrice * qty;
        menuEntry.grossRevenue += itemBaseRev;
        menuEntry.totalHpp += menuEntry.unitHpp * qty;

        // Extra Topping Tracking
        if (Array.isArray(item.toppings)) {
          item.toppings.forEach(t => {
            const topId = t.id || t.toppingId || t.name;
            if (!toppingMap[topId]) {
              const matchedTop = toppings.find(tp => tp.id === topId);
              const topUnitHpp = calculateToppingUnitHPP(matchedTop || t);
              toppingMap[topId] = {
                id: topId,
                name: t.name || matchedTop?.name || 'Extra Topping',
                type: 'TOPPING',
                categoryName: 'Extra Topping',
                basePrice: Number(t.price) || 0,
                unitHpp: topUnitHpp,
                qtySold: 0,
                grossRevenue: 0,
                totalHpp: 0
              };
            }
            const topEntry = toppingMap[topId];
            topEntry.qtySold += qty;
            topEntry.grossRevenue += topEntry.basePrice * qty;
            topEntry.totalHpp += topEntry.unitHpp * qty;
          });
        }
      });
    });

    const menuList = Object.values(menuMap).map(m => {
      const netProfit = m.grossRevenue - m.totalHpp;
      const margin = m.grossRevenue > 0 ? (netProfit / m.grossRevenue) * 100 : 0;
      return {
        ...m,
        netProfit,
        margin
      };
    });

    const toppingList = Object.values(toppingMap).map(t => {
      const netProfit = t.grossRevenue - t.totalHpp;
      const margin = t.grossRevenue > 0 ? (netProfit / t.grossRevenue) * 100 : 0;
      return {
        ...t,
        netProfit,
        margin
      };
    });

    let combined = [];
    if (salesItemTypeFilter === 'ALL') {
      combined = [...menuList, ...toppingList];
    } else if (salesItemTypeFilter === 'MENU') {
      combined = menuList;
    } else if (salesItemTypeFilter === 'TOPPING') {
      combined = toppingList;
    }

    if (salesSearchTerm && salesSearchTerm.trim()) {
      const q = salesSearchTerm.toLowerCase().trim();
      combined = combined.filter(item => 
        (item.name || '').toLowerCase().includes(q) ||
        (item.categoryName || '').toLowerCase().includes(q)
      );
    }

    // Sort by highest revenue descending
    return combined.sort((a, b) => b.grossRevenue - a.grossRevenue);
  }, [enrichedOrders, productMenus, toppings, rawMaterials, salesItemTypeFilter, salesSearchTerm]);

  // 4.B COMPREHENSIVE MENU SALES WITH ATTACHED TOPPINGS BREAKDOWN
  const menuSalesWithToppings = useMemo(() => {
    const menuMap = {};
    let totalOrderItemsCount = 0;
    let itemsWithToppingCount = 0;
    let totalMenuBaseRevenue = 0;
    let totalToppingRevenue = 0;

    enrichedOrders.forEach(order => {
      if (order.status === 'cancelled' || order.status === 'returned') return;
      (order.items || []).forEach(item => {
        const qty = Number(item.quantity) || 1;
        const menuKey = item.menuId || item.name;
        totalOrderItemsCount += qty;

        if (!menuMap[menuKey]) {
          const matchedMenu = productMenus.find(m => m.id === item.menuId);
          const unitHpp = calculateMenuUnitHPP(matchedMenu || item);
          menuMap[menuKey] = {
            id: item.menuId || menuKey,
            name: item.name,
            categoryName: item.categoryName || 'Menu Produk',
            basePrice: Number(item.basePrice) || (Number(item.unitPrice) - (Number(item.toppingsTotal) || 0)) || 0,
            unitHpp,
            qtySold: 0,
            menuGrossRevenue: 0,
            menuTotalHpp: 0,
            toppingsMap: {},
            totalToppingQty: 0,
            totalToppingRevenue: 0,
            totalToppingHpp: 0
          };
        }

        const menuEntry = menuMap[menuKey];
        menuEntry.qtySold += qty;
        const itemBaseRev = menuEntry.basePrice * qty;
        menuEntry.menuGrossRevenue += itemBaseRev;
        menuEntry.menuTotalHpp += menuEntry.unitHpp * qty;
        totalMenuBaseRevenue += itemBaseRev;

        const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
        if (hasToppings) {
          itemsWithToppingCount += qty;
          item.toppings.forEach(t => {
            const topId = t.id || t.toppingId || t.name;
            if (!menuEntry.toppingsMap[topId]) {
              const matchedTop = toppings.find(tp => tp.id === topId);
              const topUnitHpp = calculateToppingUnitHPP(matchedTop || t);
              menuEntry.toppingsMap[topId] = {
                id: topId,
                name: t.name || matchedTop?.name || 'Extra Topping',
                price: Number(t.price) || 0,
                unitHpp: topUnitHpp,
                qtySold: 0,
                grossRevenue: 0,
                totalHpp: 0,
                netProfit: 0
              };
            }
            const tEntry = menuEntry.toppingsMap[topId];
            const tQty = (Number(t.quantity) || 1) * qty;
            tEntry.qtySold += tQty;
            const tRev = tEntry.price * tQty;
            const tHpp = tEntry.unitHpp * tQty;
            tEntry.grossRevenue += tRev;
            tEntry.totalHpp += tHpp;
            tEntry.netProfit = tEntry.grossRevenue - tEntry.totalHpp;

            menuEntry.totalToppingQty += tQty;
            menuEntry.totalToppingRevenue += tRev;
            menuEntry.totalToppingHpp += tHpp;
            totalToppingRevenue += tRev;
          });
        }
      });
    });

    let list = Object.values(menuMap).map(m => {
      const toppingsList = Object.values(m.toppingsMap).sort((a, b) => b.qtySold - a.qtySold);
      const totalCombinedRevenue = m.menuGrossRevenue + m.totalToppingRevenue;
      const totalCombinedHpp = m.menuTotalHpp + m.totalToppingHpp;
      const totalCombinedNetProfit = totalCombinedRevenue - totalCombinedHpp;
      const combinedMargin = totalCombinedRevenue > 0 ? (totalCombinedNetProfit / totalCombinedRevenue) * 100 : 0;

      return {
        ...m,
        toppingsList,
        totalCombinedRevenue,
        totalCombinedHpp,
        totalCombinedNetProfit,
        combinedMargin
      };
    });

    // Global Topping ranking
    const globalToppingMap = {};
    list.forEach(m => {
      m.toppingsList.forEach(t => {
        if (!globalToppingMap[t.id]) {
          globalToppingMap[t.id] = { ...t, qtySold: 0, grossRevenue: 0, totalHpp: 0, netProfit: 0 };
        }
        globalToppingMap[t.id].qtySold += t.qtySold;
        globalToppingMap[t.id].grossRevenue += t.grossRevenue;
        globalToppingMap[t.id].totalHpp += t.totalHpp;
        globalToppingMap[t.id].netProfit += t.netProfit;
      });
    });
    const globalToppingList = Object.values(globalToppingMap).sort((a, b) => b.qtySold - a.qtySold);

    // Filter by search term if provided
    if (salesSearchTerm && salesSearchTerm.trim()) {
      const q = salesSearchTerm.toLowerCase().trim();
      list = list.filter(item => 
        (item.name || '').toLowerCase().includes(q) ||
        (item.categoryName || '').toLowerCase().includes(q) ||
        item.toppingsList.some(t => (t.name || '').toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.totalCombinedRevenue - a.totalCombinedRevenue);

    const topSellingMenu = list.length > 0 ? list[0] : null;
    const topSellingTopping = globalToppingList.length > 0 ? globalToppingList[0] : null;

    const totalGrossRev = totalMenuBaseRevenue + totalToppingRevenue;
    const toppingAttachRate = totalOrderItemsCount > 0 ? (itemsWithToppingCount / totalOrderItemsCount) * 100 : 0;
    const toppingRevenueShare = totalGrossRev > 0 ? (totalToppingRevenue / totalGrossRev) * 100 : 0;

    return {
      list,
      topSellingMenu,
      topSellingTopping,
      globalToppingList,
      totalOrderItemsCount,
      itemsWithToppingCount,
      toppingAttachRate,
      totalMenuBaseRevenue,
      totalToppingRevenue,
      toppingRevenueShare
    };
  }, [enrichedOrders, productMenus, toppings, rawMaterials, salesSearchTerm]);


  // 5. MATERIAL USAGE / DEDUCTION AUDIT LOGS
  const materialDeductionLogs = useMemo(() => {
    if (!isReportRoute) return [];

    const { start, end } = getDateBounds(dateRangePreset);

    return reportStockLogs
      .filter(log => {
        // Filter by date
        const logDate = new Date(log.createdAt || Date.now());
        if (logDate < start || logDate > end) return false;

        // Filter material id
        if (materialIdFilter !== 'ALL' && log.rawMaterialId !== materialIdFilter) {
          return false;
        }

        // Filter event type
        if (materialEventTypeFilter === 'SALE') {
          const isSale = Boolean(log.referenceInvoice || log.orderId || (log.note && log.note.toLowerCase().includes('pesanan')));
          if (!isSale || log.type === 'WASTE') return false;
        } else if (materialEventTypeFilter === 'WASTE') {
          if (log.type !== 'WASTE' && log.type !== 'RETURN_ORDER') return false;
        } else if (materialEventTypeFilter === 'MANUAL_OUT') {
          const isSale = Boolean(log.referenceInvoice || log.orderId || (log.note && log.note.toLowerCase().includes('pesanan')));
          if (log.type !== 'OUT' || isSale) return false;
        } else if (materialEventTypeFilter === 'ADJUST') {
          if (log.type !== 'ADJUST') return false;
        }

        // Search text
        if (materialSearchTerm.trim()) {
          const q = materialSearchTerm.toLowerCase().trim();
          const matchMat = (log.rawMaterialName || '').toLowerCase().includes(q);
          const matchNote = (log.note || '').toLowerCase().includes(q);
          const matchReason = (log.reason || '').toLowerCase().includes(q);
          const matchInv = (log.referenceInvoice || '').toLowerCase().includes(q);
          const matchMenu = (log.sourceMenu || '').toLowerCase().includes(q);
          const matchTop = (log.toppingName || '').toLowerCase().includes(q);
          const matchCustomer = (log.customerName || '').toLowerCase().includes(q);
          if (!matchMat && !matchNote && !matchReason && !matchInv && !matchMenu && !matchTop && !matchCustomer) {
            return false;
          }
        }

        return true;
      })
      .map(log => {
        const mat = rawMaterials.find(m => m.id === log.rawMaterialId);
        const pricePerUnit = mat ? (Number(mat.pricePerUnit) || 0) : 0;
        const totalEstimatedValue = (Number(log.amount) || 0) * pricePerUnit;

        // Determine event label badge
        let eventCategory = 'MANUAL_OUT';
        let eventBadgeText = 'Pemakaian Manual';
        let badgeColor = 'amber';

        if (log.type === 'WASTE') {
          eventCategory = 'WASTE';
          eventBadgeText = 'Bahan Rusak / Expired (Waste)';
          badgeColor = 'red';
        } else if (log.type === 'RETURN_ORDER') {
          eventCategory = 'RETURN_ORDER';
          eventBadgeText = 'Retur Pesanan Gagal Buat';
          badgeColor = 'red';
        } else if (log.referenceInvoice || log.orderId || (log.note && log.note.toLowerCase().includes('pesanan'))) {
          eventCategory = 'SALE';
          eventBadgeText = log.sourceType === 'TOPPING' ? 'Penjualan (Extra Topping)' : 'Penjualan (Menu Kasir)';
          badgeColor = 'blue';
        } else if (log.type === 'ADJUST') {
          eventCategory = 'ADJUST';
          eventBadgeText = 'Penyesuaian Stok Opname';
          badgeColor = 'purple';
        } else if (log.type === 'IN') {
          eventCategory = 'IN';
          eventBadgeText = 'Stok Masuk / Restok';
          badgeColor = 'green';
        }

        return {
          ...log,
          pricePerUnit,
          totalEstimatedValue,
          eventCategory,
          eventBadgeText,
          badgeColor
        };
      });
  }, [reportStockLogs, rawMaterials, isReportRoute, dateRangePreset, customStartDate, customEndDate, materialIdFilter, materialEventTypeFilter, materialSearchTerm]);

  // 6. MATERIAL USAGE KPI SUMMARY
  const materialSummary = useMemo(() => {
    let totalDeductionsCount = 0;
    let totalCostDeducted = 0;
    const materialFrequency = {};

    materialDeductionLogs.forEach(log => {
      if (log.type === 'OUT' || log.eventCategory === 'SALE') {
        totalDeductionsCount += 1;
        totalCostDeducted += log.totalEstimatedValue || 0;

        const name = log.rawMaterialName || 'Bahan';
        materialFrequency[name] = (materialFrequency[name] || 0) + (Number(log.amount) || 0);
      }
    });

    let topMaterial = { name: '-', amount: 0 };
    Object.entries(materialFrequency).forEach(([name, amount]) => {
      if (amount > topMaterial.amount) {
        topMaterial = { name, amount: Math.round(amount * 100) / 100 };
      }
    });

    return {
      totalDeductionsCount,
      totalCostDeducted,
      topMaterial,
      totalFilteredRows: materialDeductionLogs.length
    };
  }, [materialDeductionLogs]);

  // Derived human readable period label
  const periodLabel = useMemo(() => {
    return getPeriodLabel(dateRangePreset, customStartDate, customEndDate);
  }, [dateRangePreset, customStartDate, customEndDate]);

  // Excel export handler
  const handleExportExcel = () => {
    if (isCashier && activeReportTab === 'sales') return;

    if (activeReportTab === 'sales') {
      const isCombined = salesItemTypeFilter === 'COMBINED';
      const itemsToExport = isCombined ? menuSalesWithToppings.list : productPerformanceList;
      const activeFilterLabel = isCombined ? 'Ringkasan Menu & Topping' : salesItemTypeFilter === 'MENU' ? 'Menu Utama' : salesItemTypeFilter === 'TOPPING' ? 'Extra Topping' : 'Semua Item';
      const activePaymentLabel = salesPaymentFilter === 'cash' ? 'Tunai (Cash)' : salesPaymentFilter === 'qris' ? 'QRIS' : salesPaymentFilter === 'debit' ? 'Kartu Debit' : salesPaymentFilter === 'card' ? 'Kartu Kredit' : 'Semua Pembayaran';
      exportCompleteSalesReportToExcel({
        items: itemsToExport,
        orders: enrichedOrders,
        periodLabel,
        activeFilter: activeFilterLabel,
        activePaymentFilter: activePaymentLabel,
        storeName,
        showProfitMetrics: isSuperAdmin
      });
    } else {
      const selectedMat = rawMaterials.find(m => m.id === materialIdFilter);
      const activeMatLabel = selectedMat ? `${selectedMat.name} (${selectedMat.unitName})` : 'Semua Bahan Baku';
      let activeEventLabel = 'Semua Penyebab Mutasi';
      if (materialEventTypeFilter === 'SALE') activeEventLabel = 'Hanya Penjualan Kasir POS';
      else if (materialEventTypeFilter === 'MANUAL_OUT') activeEventLabel = 'Pemakaian Manual Dapur';
      else if (materialEventTypeFilter === 'ADJUST') activeEventLabel = 'Penyesuaian Stok Opname';

      exportMaterialUsageToExcel({
        logs: materialDeductionLogs,
        periodLabel,
        activeMaterial: activeMatLabel,
        activeEventType: activeEventLabel,
        searchTerm: materialSearchTerm,
        storeName
      });
    }
  };

  // PDF export handler
  const handleExportPDF = () => {
    if (isCashier && activeReportTab === 'sales') return;

    if (activeReportTab === 'sales') {
      if (activeSalesSection === 'products') {
        const isCombined = salesItemTypeFilter === 'COMBINED';
        const itemsToExport = isCombined ? menuSalesWithToppings.list : productPerformanceList;
        const activeFilterLabel = isCombined ? 'Ringkasan Menu & Topping' : salesItemTypeFilter === 'MENU' ? 'Menu Utama' : salesItemTypeFilter === 'TOPPING' ? 'Extra Topping' : 'Semua Item';
        exportProductPerformanceToPDF({
          items: itemsToExport,
          salesSummary,
          menuToppingSummary: menuSalesWithToppings,
          periodLabel,
          activeFilter: activeFilterLabel,
          searchTerm: salesSearchTerm,
          storeName,
          showProfitMetrics: isSuperAdmin
        });
      } else {
        const activePaymentLabel = salesPaymentFilter === 'cash' ? 'Tunai (Cash)' : salesPaymentFilter === 'qris' ? 'QRIS' : salesPaymentFilter === 'debit' ? 'Kartu Debit' : salesPaymentFilter === 'card' ? 'Kartu Kredit' : 'Semua Pembayaran';
        exportTransactionHistoryToPDF({
          orders: enrichedOrders,
          periodLabel,
          activePaymentFilter: activePaymentLabel,
          searchTerm: salesSearchTerm,
          storeName,
          showProfitMetrics: isSuperAdmin
        });
      }
    } else {
      const selectedMat = rawMaterials.find(m => m.id === materialIdFilter);
      const activeMatLabel = selectedMat ? `${selectedMat.name} (${selectedMat.unitName})` : 'Semua Bahan Baku';
      let activeEventLabel = 'Semua Penyebab Mutasi';
      if (materialEventTypeFilter === 'SALE') activeEventLabel = 'Hanya Penjualan Kasir POS';
      else if (materialEventTypeFilter === 'MANUAL_OUT') activeEventLabel = 'Pemakaian Manual Dapur';
      else if (materialEventTypeFilter === 'ADJUST') activeEventLabel = 'Penyesuaian Stok Opname';

      exportMaterialUsageToPDF({
        logs: materialDeductionLogs,
        periodLabel,
        activeMaterial: activeMatLabel,
        activeEventType: activeEventLabel,
        searchTerm: materialSearchTerm,
        storeName
      });
    }
  };

  return (
    <ReportContext.Provider
      value={{
        // Navigation / Submenu
        activeReportTab,
        setActiveReportTab,
        activeSalesSection,
        setActiveSalesSection,

        // Date Range
        dateRangePreset,
        setDateRangePreset,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        periodLabel,

        // Export Actions
        handleExportExcel,
        handleExportPDF,

        // Sales Tab Props
        salesSearchTerm,
        setSalesSearchTerm,
        salesPaymentFilter,
        setSalesPaymentFilter,
        salesItemTypeFilter,
        setSalesItemTypeFilter,
        selectedOrderDetailId,
        setSelectedOrderDetailId,
        enrichedOrders,
        salesSummary,
        productPerformanceList,
        menuSalesWithToppings,


        // Material Usage Tab Props
        materialSearchTerm,
        setMaterialSearchTerm,
        materialIdFilter,
        setMaterialIdFilter,
        materialEventTypeFilter,
        setMaterialEventTypeFilter,
        materialDeductionLogs,
        materialSummary,
        availableRawMaterials: rawMaterials
      }}
    >
      {children}
    </ReportContext.Provider>
  );
};

export const ReportController = ReportProvider;
