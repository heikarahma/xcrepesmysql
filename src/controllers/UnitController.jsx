import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { unitsService } from '../services/unitsService';
import { subscribeToTable, isDatabaseConfigured } from '../lib/database';
import { useUI } from './UIController';
import { useAuth } from './AuthController';

const UnitContext = createContext();

export const useUnit = () => {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error('useUnit must be used within a UnitProvider');
  }
  return context;
};

export const useUnitController = useUnit;

export const UnitProvider = ({ children }) => {
  // Toast remains available here for older modules; navigation lives in UIController.
  const { showToast } = useUI();
  const { currentUser } = useAuth();

  // 1. Master Units State (Cloud Database via MySQL)
  const [units, setUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Search, Filter & Sorting State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc'); // 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'
  
  // 3. Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  // 4. Selection State (for Batch Actions)
  const [selectedIds, setSelectedIds] = useState([]);

  // 5. Modals State
  const [formModalState, setFormModalState] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    unit: null
  });

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    unit: null,
    isBatch: false
  });

  // Fetch Units from MySQL
  const fetchUnits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await unitsService.getUnits();
      if (fetchErr) {
        setError(fetchErr.message || 'Gagal memuat data satuan dari server.');
      } else {
        setUnits(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch units:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and Realtime sync
  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return undefined;
    }
    fetchUnits();

    // Subscribe to real-time changes
    const channel = subscribeToTable('units', () => {
      fetchUnits();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [currentUser, fetchUnits]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchTerm, sortBy]);

  // CRUD Actions:
  // A. Create Unit
  const addUnit = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Nama satuan wajib diisi.' };
    }

    const isDuplicate = units.some(u => u.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      return { success: false, error: `Satuan "${trimmed}" sudah ada.` };
    }

    const nextNumber = units.length > 0 
      ? Math.max(...units.map(u => parseInt(u.id.replace('UOM-', '')) || 0)) + 1 
      : 1;
    const formattedId = `UOM-${String(nextNumber).padStart(3, '0')}`;

    setIsSubmitting(true);
    try {
      const { data, error: err } = await unitsService.createUnit({ id: formattedId, name: trimmed });
      if (err) {
        showToast(`Gagal menambahkan satuan: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setUnits(prev => [data, ...prev]);
      showToast(`Satuan "${trimmed}" berhasil ditambahkan ke database cloud.`, 'success', 'Berhasil Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // B. Update Unit
  const updateUnit = async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Nama satuan wajib diisi.' };
    }

    const isDuplicate = units.some(u => u.id !== id && u.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      return { success: false, error: `Satuan "${trimmed}" sudah dipakai.` };
    }

    setIsSubmitting(true);
    try {
      const { data, error: err } = await unitsService.updateUnit(id, { name: trimmed });
      if (err) {
        showToast(`Gagal mengubah satuan: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setUnits(prev => prev.map(u => u.id === id ? data : u));
      showToast(`Satuan "${trimmed}" berhasil diperbarui.`, 'success', 'Perubahan Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // C. Delete Unit
  const deleteUnit = async (id) => {
    const target = units.find(u => u.id === id);
    setIsSubmitting(true);
    try {
      const { error: err } = await unitsService.deleteUnit(id);
      if (err) {
        showToast(`Gagal menghapus satuan: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setUnits(prev => prev.filter(u => u.id !== id));
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      showToast(`Satuan "${target ? target.name : id}" telah dihapus dari cloud.`, 'info', 'Data Dihapus');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // D. Batch Delete Units
  const deleteBatchUnits = async (ids) => {
    setIsSubmitting(true);
    try {
      const { error: err } = await unitsService.deleteUnitsBatch(ids);
      if (err) {
        showToast(`Gagal menghapus masal: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setUnits(prev => prev.filter(u => !ids.includes(u.id)));
      setSelectedIds([]);
      showToast(`${ids.length} satuan telah dihapus dari cloud.`, 'info', 'Hapus Masal');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // Selection Handlers
  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (currentPageIds) => {
    const allSelected = currentPageIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  // Filtered & Sorted Units (Memoized)
  const filteredUnits = useMemo(() => {
    let result = [...units];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(u => 
        u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name, 'id');
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'id');
      if (sortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

    return result;
  }, [units, searchTerm, sortBy]);

  // Paginated Units
  const paginatedUnits = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredUnits.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredUnits, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredUnits.length / itemsPerPage) || 1;

  // Modal Control Helpers
  const openAddModal = () => {
    setFormModalState({ isOpen: true, mode: 'add', unit: null });
  };

  const openEditModal = (unit) => {
    setFormModalState({ isOpen: true, mode: 'edit', unit });
  };

  const closeFormModal = () => {
    setFormModalState({ isOpen: false, mode: 'add', unit: null });
  };

  const openDeleteModal = (unit) => {
    setDeleteModalState({ isOpen: true, unit, isBatch: false });
  };

  const openBatchDeleteModal = () => {
    setDeleteModalState({ isOpen: true, unit: null, isBatch: true });
  };

  const closeDeleteModal = () => {
    setDeleteModalState({ isOpen: false, unit: null, isBatch: false });
  };

  return (
    <UnitContext.Provider
      value={{
        units,
        isLoading,
        error,
        isSubmitting,
        refetch: fetchUnits,
        searchTerm,
        setSearchTerm,
        sortBy,
        setSortBy,
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        selectedIds,
        toggleSelect,
        toggleSelectAll,
        filteredUnits,
        paginatedUnits,
        totalPages,
        totalItems: filteredUnits.length,
        totalAllUnits: units.length,
        addUnit,
        updateUnit,
        deleteUnit,
        deleteBatchUnits,
        formModalState,
        openAddModal,
        openEditModal,
        closeFormModal,
        deleteModalState,
        openDeleteModal,
        openBatchDeleteModal,
        closeDeleteModal,
        showToast
      }}
    >
      {children}
    </UnitContext.Provider>
  );
};

export const UnitController = UnitProvider;
