import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { opnameReportsService } from '../services/opnameReportsService';
import { useRawMaterial } from './RawMaterialController';
import { useAuth } from './AuthController';
import { subscribeToTable, isDatabaseConfigured } from '../lib/database';
import { getLocalDateStr, formatDateIndonesian } from '../utils/dateUtils';
import { toast } from '../views/components/Toast';

const StockOpnameContext = createContext();

export const useStockOpname = () => {
  const context = useContext(StockOpnameContext);
  if (!context) {
    throw new Error('useStockOpname must be used within a StockOpnameProvider');
  }
  return context;
};

export const canKasirEditReport = (opnameDateOrReport, optionalReport) => {
  const report = (typeof opnameDateOrReport === 'object' && opnameDateOrReport !== null) ? opnameDateOrReport : optionalReport;
  const opnameDate = typeof opnameDateOrReport === 'string' ? opnameDateOrReport : (report?.opnameDate || report?.date);

  // If report is applied/locked by Admin -> Kasir CANNOT edit
  if (report && (report.isApplied || report.status === 'APPLIED' || report.appliedAt || report.isLockedForKasir || report.needsReapply)) {
    return false;
  }
  if (report && report.status === 'VOID') {
    return false;
  }

  if (!opnameDate) return false;
  const today = getLocalDateStr();
  if (opnameDate === today) return true;
  const dToday = new Date(today + 'T00:00:00');
  const dReport = new Date(opnameDate + 'T00:00:00');
  const diffTime = dToday.getTime() - dReport.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 1 && diffDays >= 0;
};

export const StockOpnameProvider = ({ children }) => {
  const { rawMaterials = [], applyOpnameReportToStock, refetch: refetchRawMaterials } = useRawMaterial();
  const { currentUser, storeName = 'XCrepes POS' } = useAuth();
  const activeBranchId = currentUser?.activeBranchId || 'BR-DEFAULT';
  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin' || currentUser?.role === 'kepala_toko';

  // 1. All Opname Reports from Cloud / DB
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Active Kasir Draft & Workflow State
  const todayStr = useMemo(() => getLocalDateStr(), []);
  const [activeDate, setActiveDate] = useState(() => getLocalDateStr());
  const [draftStocks, setDraftStocks] = useState({}); // { [matId]: number | string }
  const [draftNotes, setDraftNotes] = useState({}); // { [matId]: string }
  const [kasirStep, setKasirStep] = useState('INPUT'); // 'INPUT' | 'REVIEW' | 'SUCCESS'
  const [lastSubmittedReport, setLastSubmittedReport] = useState(null);
  const [editingReportId, setEditingReportId] = useState(null);

  // 3. Admin Filters & Navigation
  const [adminFilters, setAdminFilters] = useState({
    dateRange: 'ALL', // 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'CUSTOM'
    customStartDate: '',
    customEndDate: '',
    cashierName: 'ALL',
    status: 'ALL', // 'ALL' | 'SUBMITTED' | 'DRAFT' | 'VOID'
    discrepancy: 'ALL', // 'ALL' | 'DISCREPANCY_ONLY' | 'MATCH_ONLY'
    adminCorrected: 'ALL', // 'ALL' | 'CORRECTED_ONLY'
    searchQuery: ''
  });
  const [selectedReportForDetail, setSelectedReportForDetail] = useState(null);

  // Fetch reports from cloud
  const fetchReports = useCallback(async () => {
    try {
      const { data, error } = await opnameReportsService.getOpnameReports(activeBranchId);
      if (error) {
        console.error('Error fetching opname reports:', error);
      } else {
        setReports(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching opname reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    fetchReports();

    // Setup realtime subscription
    const unsubscribe = subscribeToTable('inventory_stock_logs', (payload) => {
      if (payload?.eventType === 'POLL' || payload?.new?.type === 'OPNAME_REPORT' || payload?.old?.type === 'OPNAME_REPORT') {
        fetchReports();
      }
    });

    return () => {
      if (unsubscribe) unsubscribe.unsubscribe();
    };
  }, [fetchReports]);

  // Today's active report if already submitted
  const todayReport = useMemo(() => {
    return reports.find(
      r => (r.branchId || activeBranchId) === activeBranchId && (r.opnameDate === todayStr || r.date === todayStr || r.id === `OPNAME-${activeBranchId}-${todayStr}`) && r.status !== 'VOID'
    ) || null;
  }, [reports, todayStr]);

  // Active raw materials from Master Data (sorted by name or category)
  const activeMasterMaterials = useMemo(() => {
    return (rawMaterials || []).filter(m => m.isActive !== false);
  }, [rawMaterials]);

  // Load draft from localStorage on mount or activeDate change
  useEffect(() => {
    if (editingReportId) return; // In edit mode of existing report, handled separately
    try {
      const draftKey = `pos_opname_draft_${activeBranchId}_${activeDate}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraftStocks(parsed.stocks || {});
        setDraftNotes(parsed.notes || {});
      } else {
        setDraftStocks({});
        setDraftNotes({});
      }
    } catch (e) {
      console.warn('Error reading opname draft from localStorage:', e);
    }
  }, [activeDate, editingReportId, activeBranchId]);

  // Save draft to localStorage whenever stocks change
  const saveDraftLocally = useCallback((newStocks, newNotes) => {
    try {
      const draftKey = `pos_opname_draft_${activeBranchId}_${activeDate}`;
      localStorage.setItem(draftKey, JSON.stringify({
        stocks: newStocks,
        notes: newNotes,
        updatedAt: new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Error writing opname draft to localStorage:', e);
    }
  }, [activeDate, activeBranchId]);

  // Update actual stock for a specific material in draft
  const updateDraftStock = useCallback((rawMaterialId, value) => {
    setDraftStocks(prev => {
      const updated = { ...prev };
      if (value === '' || value === null || value === undefined) {
        delete updated[rawMaterialId];
      } else {
        updated[rawMaterialId] = value;
      }
      saveDraftLocally(updated, draftNotes);
      return updated;
    });
  }, [draftNotes, saveDraftLocally]);

  // Update note for a specific material in draft
  const updateDraftNote = useCallback((rawMaterialId, note) => {
    setDraftNotes(prev => {
      const updated = { ...prev, [rawMaterialId]: note };
      saveDraftLocally(draftStocks, updated);
      return updated;
    });
  }, [draftStocks, saveDraftLocally]);

  // Kasir Draft Calculation & Completeness
  const draftSummary = useMemo(() => {
    const totalMaterials = activeMasterMaterials.length;
    let countedCount = 0;
    let matchCount = 0;
    let deficitCount = 0;
    let surplusCount = 0;
    let totalDifferenceValue = 0;
    const uncountedList = [];

    const itemsEnriched = activeMasterMaterials.map(mat => {
      const rawVal = draftStocks[mat.id];
      const hasActual = rawVal !== undefined && rawVal !== null && rawVal !== '' && !isNaN(Number(rawVal));
      const actualStock = hasActual ? Number(rawVal) : null;
      const systemStock = Number(mat.stock ?? mat.currentStock ?? 0);
      const diff = hasActual ? Math.round((actualStock - systemStock) * 1000) / 1000 : null;
      const pricePerUnit = Number(mat.pricePerUnit || mat.price_per_unit || 0);

      let status = 'UNCOUNTED';
      if (hasActual) {
        countedCount++;
        if (diff === 0) {
          status = 'MATCH';
          matchCount++;
        } else if (diff < 0) {
          status = 'DEFICIT';
          deficitCount++;
          totalDifferenceValue += diff * pricePerUnit;
        } else {
          status = 'SURPLUS';
          surplusCount++;
          totalDifferenceValue += diff * pricePerUnit;
        }
      } else {
        uncountedList.push(mat);
      }

      return {
        rawMaterialId: mat.id,
        name: mat.name,
        categoryName: mat.categoryName || '-',
        unitName: mat.unitName || 'Unit',
        systemStock,
        actualStock,
        difference: diff,
        status,
        pricePerUnit,
        isActiveInMaster: true,
        note: draftNotes[mat.id] || ''
      };
    });

    const progressPercent = totalMaterials > 0 ? Math.round((countedCount / totalMaterials) * 100) : 0;
    const isComplete = totalMaterials > 0 && countedCount === totalMaterials;

    return {
      totalMaterials,
      countedCount,
      uncountedCount: totalMaterials - countedCount,
      progressPercent,
      isComplete,
      uncountedList,
      matchCount,
      deficitCount,
      surplusCount,
      hasDiscrepancy: deficitCount > 0 || surplusCount > 0,
      totalDifferenceValue,
      items: itemsEnriched
    };
  }, [activeMasterMaterials, draftStocks, draftNotes]);

  // Start or open existing report for editing
  const startEditingReport = useCallback((report) => {
    if (!report) return;
    if (!isSuperAdmin && (report.isApplied || report.status === 'APPLIED')) {
      toast.error('Laporan ini telah disetujui & diterapkan oleh Admin. Laporan sudah dikunci dan tidak dapat diubah lagi.');
      return;
    }
    setEditingReportId(report.id);
    setActiveDate(report.opnameDate || report.date);

    const stocks = {};
    const notes = {};
    (report.items || []).forEach(item => {
      const matId = item.rawMaterialId || item.id;
      if (item.actualStock !== null && item.actualStock !== undefined) {
        stocks[matId] = item.actualStock;
      }
      if (item.note || item.adminNote) {
        notes[matId] = item.note || item.adminNote;
      }
    });

    setDraftStocks(stocks);
    setDraftNotes(notes);
    setKasirStep('INPUT');
  }, [isSuperAdmin]);

  // Cancel edit mode and reset draft
  const cancelEditMode = useCallback(() => {
    setEditingReportId(null);
    setActiveDate(todayStr);
    try {
      const draftKey = `pos_opname_draft_${activeBranchId}_${todayStr}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraftStocks(parsed.stocks || {});
        setDraftNotes(parsed.notes || {});
      } else {
        setDraftStocks({});
        setDraftNotes({});
      }
    } catch {
      setDraftStocks({});
      setDraftNotes({});
    }
    setKasirStep('INPUT');
  }, [todayStr, activeBranchId]);

  // Submit Opname Report (Kasir & Super Admin)
  const submitOpnameReport = useCallback(async () => {
    if (!draftSummary.isComplete) {
      const uncountedCount = draftSummary.uncountedCount;
      toast.error(`${uncountedCount} bahan baku belum diisi. Lengkapi seluruh stok aktual sebelum mengirim laporan.`);
      return { success: false, uncountedCount };
    }

    setIsSubmitting(true);
    try {
      const targetDate = activeDate || todayStr;
      const reportId = editingReportId || `OPNAME-${activeBranchId}-${targetDate}`;
      const existing = reports.find(r => (r.branchId || activeBranchId) === activeBranchId && (r.id === reportId || r.opnameDate === targetDate));
      const isNew = !existing && !editingReportId;

      // Check conflict if creating new report
      if (isNew) {
        const conflict = reports.find(r => (r.branchId || activeBranchId) === activeBranchId && (r.opnameDate === targetDate || r.date === targetDate) && r.status !== 'VOID');
        if (conflict) {
          if (conflict.isApplied || conflict.status === 'APPLIED') {
            toast.error(`Laporan Stock Opname untuk tanggal ${targetDate} sudah diterapkan oleh Admin dan tidak dapat diubah.`);
            setIsSubmitting(false);
            return { success: false, locked: true };
          }
          toast.error(`Laporan Stock Opname untuk tanggal ${targetDate} sudah ada.`);
          setIsSubmitting(false);
          return { success: false, conflict: true, existingReport: conflict };
        }
      } else {
        if (!isSuperAdmin && (existing?.isApplied || existing?.status === 'APPLIED')) {
          toast.error(`Laporan Stock Opname tanggal ${targetDate} sudah diterapkan oleh Admin dan tidak dapat diubah lagi.`);
          setIsSubmitting(false);
          return { success: false, locked: true };
        }
      }

      const now = new Date().toISOString();
      const currentUserObj = {
        id: currentUser?.id || 'usr_cashier',
        name: currentUser?.nama || 'Kasir',
        role: currentUser?.role || 'kasir'
      };

      const auditAction = isNew ? 'SUBMIT' : (isSuperAdmin ? 'ADMIN_CORRECTION' : 'CASHIER_EDIT');
      const auditEntry = {
        id: `audit_${Date.now()}`,
        timestamp: now,
        user: currentUserObj.name,
        role: currentUserObj.role,
        action: auditAction,
        field: 'all',
        oldValue: existing ? `Versi ${existing.version || 1}` : null,
        newValue: existing ? `Versi ${(existing.version || 1) + 1}` : 'Versi 1',
        reason: isNew ? 'Pengiriman laporan awal' : 'Pembaruan data stok opname',
        summary: isNew 
          ? `Laporan stock opname dibuat dan dikirim oleh ${currentUserObj.name}`
          : `Laporan diedit dan dikirim ulang oleh ${currentUserObj.name}`
      };

      const versionNumber = existing ? (existing.version || 1) + 1 : 1;
      const versionSnapshot = {
        versionNumber,
        timestamp: now,
        user: currentUserObj.name,
        role: currentUserObj.role,
        reason: isNew ? 'Laporan awal' : 'Revisi laporan',
        summaryChanges: `${draftSummary.totalMaterials} bahan, Cocok: ${draftSummary.matchCount}, Selisih: ${draftSummary.deficitCount + draftSummary.surplusCount}`,
        itemsSnapshot: draftSummary.items.map(i => ({
          rawMaterialId: i.rawMaterialId,
          name: i.name,
          actualStock: i.actualStock,
          systemStock: i.systemStock,
          difference: i.difference,
          status: i.status
        }))
      };

      const finalReport = {
        id: reportId,
        branchId: activeBranchId,
        opnameDate: targetDate,
        date: targetDate,
        displayDate: formatDateIndonesian(targetDate),
        status: 'SUBMITTED',
        version: versionNumber,
        createdBy: existing ? existing.createdBy : currentUserObj,
        createdAt: existing ? existing.createdAt : now,
        submittedBy: currentUserObj,
        submittedAt: now,
        lastModifiedBy: currentUserObj,
        lastModifiedAt: now,
        items: draftSummary.items,
        summary: {
          totalMaterials: draftSummary.totalMaterials,
          totalCounted: draftSummary.countedCount,
          matchCount: draftSummary.matchCount,
          deficitCount: draftSummary.deficitCount,
          surplusCount: draftSummary.surplusCount,
          hasDiscrepancy: draftSummary.hasDiscrepancy,
          totalDifferenceValue: draftSummary.totalDifferenceValue
        },
        auditTrail: [...(existing?.auditTrail || []), auditEntry],
        versions: [...(existing?.versions || []), versionSnapshot]
      };

      const { data, error } = await opnameReportsService.saveOpnameReport(finalReport, isNew);
      if (error) {
        if (error.status === 409 || error.conflict) {
          toast.error(`Konflik: Laporan tanggal ${targetDate} sudah ada.`);
          return { success: false, conflict: true };
        }
        toast.error(`Gagal menyimpan laporan: ${error.message || 'Kesalahan server'}`);
        return { success: false, error };
      }

      // Clear local draft for this date
      try {
        localStorage.removeItem(`pos_opname_draft_${activeBranchId}_${targetDate}`);
      } catch (e) {
        console.warn('Failed clearing local draft:', e);
      }

      setLastSubmittedReport(finalReport);
      setEditingReportId(null);
      setKasirStep('SUCCESS');
      toast.success('Laporan Stock Opname berhasil dikirim!');
      fetchReports();
      return { success: true, report: finalReport };
    } catch (err) {
      console.error('Submit opname report error:', err);
      toast.error('Terjadi kesalahan saat mengirim laporan.');
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  }, [draftSummary, activeDate, todayStr, editingReportId, reports, currentUser, fetchReports, activeBranchId]);

  // Admin Stock Correction with Mandatory Reason
  const submitAdminCorrection = useCallback(async (reportId, updatedItemsMap, mandatoryReason) => {
    if (!mandatoryReason || !mandatoryReason.trim()) {
      toast.error('Alasan perubahan wajib diisi sebelum menyimpan koreksi!');
      return { success: false, message: 'Alasan perubahan wajib diisi.' };
    }

    const report = reports.find(r => r.id === reportId);
    if (!report) {
      toast.error('Laporan tidak ditemukan.');
      return { success: false };
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const adminUserObj = {
        id: currentUser?.id || 'usr_admin',
        name: currentUser?.nama || (currentUser?.role === 'superadmin' ? 'Super Admin' : 'Kepala Toko'),
        role: currentUser?.role || 'admin'
      };

      const auditEntries = [];
      let hasChanges = false;

      const updatedItems = (report.items || []).map(item => {
        const matId = item.rawMaterialId || item.id;
        if (updatedItemsMap[matId] !== undefined) {
          const newActualStock = Number(updatedItemsMap[matId]);
          const oldActualStock = Number(item.actualStock ?? 0);

          if (newActualStock !== oldActualStock) {
            hasChanges = true;
            const sysStock = Number(item.systemStock ?? 0);
            const newDiff = Math.round((newActualStock - sysStock) * 1000) / 1000;
            let newStatus = 'MATCH';
            if (newDiff < 0) newStatus = 'DEFICIT';
            else if (newDiff > 0) newStatus = 'SURPLUS';

            auditEntries.push({
              id: `audit_adj_${Date.now()}_${matId}`,
              timestamp: now,
              user: adminUserObj.name,
              role: adminUserObj.role,
              action: 'ADMIN_CORRECTION',
              field: `actualStock (${item.name})`,
              oldValue: `${oldActualStock} ${item.unitName}`,
              newValue: `${newActualStock} ${item.unitName}`,
              reason: mandatoryReason.trim(),
              summary: `${item.name}: ${oldActualStock} -> ${newActualStock} ${item.unitName} (Alasan: ${mandatoryReason.trim()})`
            });

            return {
              ...item,
              actualStock: newActualStock,
              difference: newDiff,
              status: newStatus
            };
          }
        }
        return item;
      });

      if (!hasChanges) {
        toast.info('Tidak ada perubahan nilai stok aktual.');
        setIsSubmitting(false);
        return { success: true, noChanges: true };
      }

      // Recalculate summary
      let matchCount = 0;
      let deficitCount = 0;
      let surplusCount = 0;
      let totalDiffValue = 0;

      updatedItems.forEach(item => {
        const diff = item.difference || 0;
        const price = item.pricePerUnit || 0;
        if (item.status === 'MATCH') matchCount++;
        else if (item.status === 'DEFICIT') {
          deficitCount++;
          totalDiffValue += diff * price;
        } else if (item.status === 'SURPLUS') {
          surplusCount++;
          totalDiffValue += diff * price;
        }
      });

      const nextVersion = (report.version || 1) + 1;
      const versionSnapshot = {
        versionNumber: nextVersion,
        timestamp: now,
        user: adminUserObj.name,
        role: adminUserObj.role,
        reason: mandatoryReason.trim(),
        summaryChanges: `Koreksi oleh Admin: ${auditEntries.length} bahan diubah (${mandatoryReason.trim()})`,
        itemsSnapshot: updatedItems.map(i => ({
          rawMaterialId: i.rawMaterialId,
          name: i.name,
          actualStock: i.actualStock,
          systemStock: i.systemStock,
          difference: i.difference,
          status: i.status
        }))
      };

      const wasApplied = Boolean(report.isApplied || report.status === 'APPLIED' || report.appliedAt || report.isLockedForKasir);

      const previousSnapshot = report.appliedSnapshot || (wasApplied ? {
        items: report.items,
        summary: report.summary,
        version: report.version,
        appliedAt: report.appliedAt,
        appliedBy: report.appliedBy,
        appliedNotes: report.appliedNotes
      } : null);

      const previousDraftSnapshot = report.previousDraftSnapshot || (!wasApplied ? {
        items: report.items,
        summary: report.summary,
        version: report.version
      } : null);

      const correctedReport = {
        ...report,
        branchId: report.branchId || activeBranchId,
        version: nextVersion,
        isApplied: false,
        needsReapply: wasApplied,
        isLockedForKasir: true,
        appliedSnapshot: previousSnapshot,
        previousDraftSnapshot: previousDraftSnapshot,
        status: wasApplied ? 'NEEDS_REAPPLY' : (report.status === 'APPLIED' ? 'SUBMITTED' : report.status),
        lastModifiedBy: adminUserObj,
        lastModifiedAt: now,
        items: updatedItems,
        summary: {
          ...report.summary,
          matchCount,
          deficitCount,
          surplusCount,
          hasDiscrepancy: deficitCount > 0 || surplusCount > 0,
          totalDifferenceValue: totalDiffValue
        },
        auditTrail: [...(report.auditTrail || []), ...auditEntries],
        versions: [...(report.versions || []), versionSnapshot]
      };

      const { data, error } = await opnameReportsService.saveOpnameReport(correctedReport, false);
      if (error) {
        toast.error(`Gagal menyimpan koreksi: ${error.message}`);
        return { success: false, error };
      }

      if (wasApplied) {
        toast.info('Perubahan disimpan. Silakan klik tombol "Terapkan Ulang ke Stok Sistem" untuk memperbarui saldo inventaris!');
      } else {
        toast.success('Koreksi stok berhasil disimpan dan dicatat ke Audit Trail.');
      }
      fetchReports();
      setSelectedReportForDetail(correctedReport);
      return { success: true, report: correctedReport };
    } catch (err) {
      console.error('Error submitting admin correction:', err);
      toast.error('Terjadi kesalahan saat menyimpan koreksi.');
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  }, [reports, currentUser, fetchReports, activeBranchId]);

  // Helper for Kasir permission check
  const canKasirEdit = useCallback((opnameDateOrReport, optionalReport) => {
    const report = (typeof opnameDateOrReport === 'object' && opnameDateOrReport !== null) 
      ? opnameDateOrReport 
      : (optionalReport || reports.find(r => (r.opnameDate === opnameDateOrReport || r.date === opnameDateOrReport) && r.status !== 'VOID'));
    return canKasirEditReport(opnameDateOrReport, report);
  }, [reports]);

  // Admin Apply Stock Opname to Inventory (Commit actual stock & lock report permanently)
  const applyOpnameToInventory = useCallback(async (reportId, { notes = '' } = {}) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak: Hanya Super Admin yang berhak menerapkan penyesuaian stok sistem.');
      return { success: false, error: 'Akses Ditolak' };
    }

    const report = reports.find(r => r.id === reportId);
    if (!report) {
      toast.error('Laporan tidak ditemukan.');
      return { success: false, error: 'Laporan tidak ditemukan' };
    }

    if ((report.isApplied || report.status === 'APPLIED') && !report.needsReapply) {
      toast.info('Laporan stock opname ini sudah pernah diterapkan ke sistem.');
      return { success: false, error: 'Already applied' };
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const adminUserObj = {
        id: currentUser?.id || 'usr_admin',
        name: currentUser?.nama || (currentUser?.role === 'superadmin' ? 'Super Admin' : 'Kepala Toko'),
        role: currentUser?.role || 'admin'
      };

      // 1. Update physical counts into rawMaterials and generate stock logs (ADJUST)
      if (applyOpnameReportToStock) {
        const stockRes = await applyOpnameReportToStock(report, notes, adminUserObj);
        if (!stockRes.success) {
          throw new Error(stockRes.error || 'Gagal memperbarui stok di inventaris');
        }
      }

      // 2. Audit Trail Entry
      const isReapply = Boolean(report.needsReapply);
      const auditEntry = {
        id: `audit_apply_${Date.now()}`,
        timestamp: now,
        user: adminUserObj.name,
        role: adminUserObj.role,
        action: isReapply ? 'REAPPLY_TO_INVENTORY' : 'APPLY_TO_INVENTORY',
        field: 'status',
        oldValue: report.status,
        newValue: 'APPLIED',
        reason: notes || (isReapply ? 'Penerapan ulang stok aktual setelah revisi admin' : 'Penerapan stok aktual ke sistem'),
        summary: isReapply
          ? `Perubahan stok aktual diterapkan ulang ke saldo sistem oleh ${adminUserObj.name}. Laporan tetap terkunci bagi kasir.`
          : `Stok aktual diterapkan ke saldo sistem oleh ${adminUserObj.name}. Laporan dikunci secara permanen.`
      };

      // 3. Mark report as APPLIED and permanently locked
      const appliedReport = {
        ...report,
        branchId: report.branchId || activeBranchId,
        status: 'APPLIED',
        isApplied: true,
        needsReapply: false,
        isLockedForKasir: true,
        appliedAt: now,
        appliedBy: adminUserObj,
        appliedNotes: notes || '',
        appliedSnapshot: {
          items: report.items,
          summary: report.summary,
          version: report.version,
          appliedAt: now,
          appliedBy: adminUserObj,
          appliedNotes: notes || ''
        },
        lastModifiedBy: adminUserObj,
        lastModifiedAt: now,
        auditTrail: [...(report.auditTrail || []), auditEntry]
      };

      // 4. Save updated report in MySQL / service
      await opnameReportsService.saveOpnameReport(appliedReport, false);

      // 5. Clear draft for that date so kasir cannot edit
      const reportDate = report.opnameDate || report.date;
      try {
        localStorage.removeItem(`pos_opname_draft_${activeBranchId}_${reportDate}`);
        localStorage.removeItem(`xcrepes_stock_opname_draft_${activeBranchId}`);
      } catch (e) {}

      // 6. Refresh reports and detail view if open
      await fetchReports();
      if (selectedReportForDetail?.id === reportId) {
        setSelectedReportForDetail(appliedReport);
      }
      if (refetchRawMaterials) {
        await refetchRawMaterials();
      }

      toast.success(isReapply
        ? `Perubahan stok aktual berhasil diterapkan ulang ke inventaris sistem!`
        : `Stok aktual berhasil diterapkan ke sistem & laporan tanggal ${report.displayDate || reportDate} telah dikunci!`
      );
      return { success: true, report: appliedReport };
    } catch (err) {
      console.error('applyOpnameToInventory error:', err);
      toast.error(`Gagal menerapkan stok: ${err.message || 'Kesalahan sistem'}`);
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  }, [isSuperAdmin, reports, currentUser, applyOpnameReportToStock, fetchReports, selectedReportForDetail, refetchRawMaterials, activeBranchId]);

  // Admin Cancel Revision (Revert to previous applied or draft snapshot)
  const cancelAdminCorrection = useCallback(async (reportId) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak: Hanya Super Admin yang dapat membatalkan perubahan.');
      return { success: false, error: 'Akses Ditolak' };
    }

    const report = reports.find(r => r.id === reportId);
    if (!report) {
      toast.error('Laporan tidak ditemukan.');
      return { success: false, error: 'Laporan tidak ditemukan' };
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const adminUserObj = {
        id: currentUser?.id || 'usr_admin',
        name: currentUser?.nama || (currentUser?.role === 'superadmin' ? 'Super Admin' : 'Kepala Toko'),
        role: currentUser?.role || 'admin'
      };

      let revertedItems = null;
      let revertedSummary = null;
      let revertedIsApplied = false;
      let revertedStatus = 'SUBMITTED';

      if (report.appliedSnapshot) {
        revertedItems = report.appliedSnapshot.items;
        revertedSummary = report.appliedSnapshot.summary;
        revertedIsApplied = true;
        revertedStatus = 'APPLIED';
      } else if (report.previousDraftSnapshot) {
        revertedItems = report.previousDraftSnapshot.items;
        revertedSummary = report.previousDraftSnapshot.summary;
        revertedIsApplied = false;
        revertedStatus = 'SUBMITTED';
      } else if (report.versions && report.versions.length > 1) {
        const prevVer = report.versions[report.versions.length - 2];
        if (prevVer?.itemsSnapshot) {
          revertedItems = (report.items || []).map(cur => {
            const prevItem = prevVer.itemsSnapshot.find(pi => (pi.rawMaterialId || pi.id) === (cur.rawMaterialId || cur.id));
            if (prevItem) {
              return {
                ...cur,
                actualStock: prevItem.actualStock,
                difference: prevItem.difference,
                status: prevItem.status
              };
            }
            return cur;
          });
        }
        revertedIsApplied = Boolean(report.appliedAt);
        revertedStatus = revertedIsApplied ? 'APPLIED' : 'SUBMITTED';
      }

      if (!revertedItems) {
        toast.error('Data versi sebelumnya tidak ditemukan.');
        return { success: false, error: 'Snapshot not found' };
      }

      const auditEntry = {
        id: `audit_cancel_${Date.now()}`,
        timestamp: now,
        user: adminUserObj.name,
        role: adminUserObj.role,
        action: 'CANCEL_CORRECTION',
        field: 'items',
        oldValue: 'Revisi Admin',
        newValue: revertedIsApplied ? 'Versi Diterapkan' : 'Versi Sebelumnya',
        reason: 'Pembatalan perubahan laporan oleh Admin',
        summary: `Perubahan laporan dibatalkan oleh ${adminUserObj.name}. Data dikembalikan ke ${revertedIsApplied ? 'stok yang diterapkan sebelumnya' : 'versi sebelumnya'}.`
      };

      const revertedReport = {
        ...report,
        branchId: report.branchId || activeBranchId,
        items: revertedItems,
        summary: revertedSummary || report.summary,
        isApplied: revertedIsApplied,
        needsReapply: false,
        isLockedForKasir: true,
        status: revertedStatus,
        lastModifiedBy: adminUserObj,
        lastModifiedAt: now,
        auditTrail: [...(report.auditTrail || []), auditEntry]
      };

      await opnameReportsService.saveOpnameReport(revertedReport, false);
      await fetchReports();
      if (selectedReportForDetail?.id === reportId) {
        setSelectedReportForDetail(revertedReport);
      }

      toast.success('Perubahan laporan berhasil dibatalkan.');
      return { success: true, report: revertedReport };
    } catch (err) {
      console.error('cancelAdminCorrection error:', err);
      toast.error(`Gagal membatalkan perubahan: ${err.message || 'Kesalahan sistem'}`);
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  }, [isSuperAdmin, reports, currentUser, fetchReports, selectedReportForDetail, activeBranchId]);

  // Admin Void Report
  const voidReport = useCallback(async (reportId, reason) => {
    if (!reason || !reason.trim()) {
      toast.error('Alasan pembatalan laporan wajib diisi!');
      return { success: false };
    }

    setIsSubmitting(true);
    try {
      const adminUserObj = {
        id: currentUser?.id || 'usr_admin',
        name: currentUser?.nama || (currentUser?.role === 'superadmin' ? 'Super Admin' : 'Kepala Toko'),
        role: currentUser?.role || 'admin'
      };

      const { data, error } = await opnameReportsService.voidOpnameReport(reportId, reason.trim(), adminUserObj);
      if (error) {
        toast.error(`Gagal membatalkan laporan: ${error.message}`);
        return { success: false, error };
      }

      toast.success('Laporan berhasil dibatalkan (Status: VOID). Histori tetap tersimpan.');
      fetchReports();
      if (selectedReportForDetail?.id === reportId) {
        setSelectedReportForDetail(prev => prev ? { ...prev, status: 'VOID' } : null);
      }
      return { success: true };
    } catch (err) {
      console.error('Error voiding report:', err);
      toast.error('Terjadi kesalahan saat membatalkan laporan.');
      return { success: false, error: err };
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, fetchReports, selectedReportForDetail]);

  // Filtered reports for Admin Dashboard
  const filteredReports = useMemo(() => {
    let list = [...reports];

    // Filter by Status
    if (adminFilters.status !== 'ALL') {
      list = list.filter(r => r.status === adminFilters.status);
    }

    // Filter by Cashier
    if (adminFilters.cashierName !== 'ALL') {
      list = list.filter(r => {
        const creator = r.createdBy?.name || '';
        const submitter = r.submittedBy?.name || '';
        return creator.toLowerCase() === adminFilters.cashierName.toLowerCase() ||
               submitter.toLowerCase() === adminFilters.cashierName.toLowerCase();
      });
    }

    // Filter by Discrepancy
    if (adminFilters.discrepancy === 'DISCREPANCY_ONLY') {
      list = list.filter(r => r.summary?.hasDiscrepancy === true);
    } else if (adminFilters.discrepancy === 'MATCH_ONLY') {
      list = list.filter(r => r.summary?.hasDiscrepancy === false);
    }

    // Filter by Admin Correction
    if (adminFilters.adminCorrected === 'CORRECTED_ONLY') {
      list = list.filter(r => (r.auditTrail || []).some(a => a.action === 'ADMIN_CORRECTION'));
    }

    // Filter by Date Range
    const today = getLocalDateStr();
    if (adminFilters.dateRange === 'TODAY') {
      list = list.filter(r => (r.opnameDate || r.date) === today);
    } else if (adminFilters.dateRange === 'YESTERDAY') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      list = list.filter(r => (r.opnameDate || r.date) === yesterday);
    } else if (adminFilters.dateRange === 'LAST_7_DAYS') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      list = list.filter(r => (r.opnameDate || r.date) >= sevenDaysAgo);
    } else if (adminFilters.dateRange === 'THIS_MONTH') {
      const firstDay = today.slice(0, 7) + '-01';
      list = list.filter(r => (r.opnameDate || r.date) >= firstDay);
    } else if (adminFilters.dateRange === 'CUSTOM' && adminFilters.customStartDate && adminFilters.customEndDate) {
      list = list.filter(r => {
        const d = r.opnameDate || r.date;
        return d >= adminFilters.customStartDate && d <= adminFilters.customEndDate;
      });
    }

    // Filter by Search Query
    if (adminFilters.searchQuery.trim()) {
      const q = adminFilters.searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const idMatch = (r.id || '').toLowerCase().includes(q);
        const dateMatch = (r.displayDate || r.opnameDate || '').toLowerCase().includes(q);
        const userMatch = (r.createdBy?.name || '').toLowerCase().includes(q) || (r.submittedBy?.name || '').toLowerCase().includes(q);
        const itemMatch = (r.items || []).some(i => (i.name || '').toLowerCase().includes(q));
        return idMatch || dateMatch || userMatch || itemMatch;
      });
    }

    return list.sort((a, b) => (b.opnameDate || b.date || '').localeCompare(a.opnameDate || a.date || ''));
  }, [reports, adminFilters]);

  // Admin Dashboard Statistics
  const adminStats = useMemo(() => {
    const totalReports = reports.length;
    const submittedCount = reports.filter(r => r.status === 'SUBMITTED').length;
    const hasTodayReport = Boolean(todayReport);
    const discrepancyCount = reports.filter(r => r.status === 'SUBMITTED' && r.summary?.hasDiscrepancy).length;
    const correctedCount = reports.filter(r => (r.auditTrail || []).some(a => a.action === 'ADMIN_CORRECTION')).length;

    return {
      totalReports,
      submittedCount,
      hasTodayReport,
      discrepancyCount,
      correctedCount
    };
  }, [reports, todayReport]);

  const value = {
    // State
    reports,
    filteredReports,
    isLoading,
    isSubmitting,
    todayReport,
    activeDate,
    setActiveDate,
    editingReportId,
    kasirStep,
    setKasirStep,
    lastSubmittedReport,
    activeMasterMaterials,
    draftStocks,
    draftNotes,
    draftSummary,
    adminFilters,
    setAdminFilters,
    selectedReportForDetail,
    setSelectedReportForDetail,
    adminStats,

    // Methods
    updateDraftStock,
    updateDraftNote,
    startEditingReport,
    cancelEditMode,
    submitOpnameReport,
    submitAdminCorrection,
    cancelAdminCorrection,
    applyOpnameToInventory,
    voidReport,
    fetchReports,
    canKasirEdit
  };

  return (
    <StockOpnameContext.Provider value={value}>
      {children}
    </StockOpnameContext.Provider>
  );
};
