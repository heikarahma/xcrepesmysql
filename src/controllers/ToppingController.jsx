import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { toppingsService } from '../services/toppingsService';
import { subscribeToTable } from '../lib/database';
import { useUnit } from './UnitController';
import { useRawMaterial } from './RawMaterialController';
import { useAuth } from './AuthController';
import { stripBranchFromId } from '../models/BranchModel';

const ToppingContext = createContext();

export const useTopping = () => {
  const context = useContext(ToppingContext);
  if (!context) {
    throw new Error('useTopping must be used within a ToppingProvider');
  }
  return context;
};

export const useToppingController = useTopping;

export const ToppingProvider = ({ children }) => {
  const { showToast } = useUnit();
  const { rawMaterials } = useRawMaterial();
  const { currentUser } = useAuth();
  const activeBranchId = currentUser?.activeBranchId || 'BR-DEFAULT';

  // 1. Cloud Database State via MySQL
  const [toppings, setToppings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Search, Filter & Sorting State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  
  // 3. Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  // 4. Selection State (for Batch Actions)
  const [selectedIds, setSelectedIds] = useState([]);

  // 5. Modals State
  const [formModalState, setFormModalState] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    item: null
  });

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    item: null,
    isBatch: false
  });

  // Fetch Toppings from MySQL
  const fetchToppings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await toppingsService.getToppings(activeBranchId);
      if (fetchErr) {
        setError(fetchErr.message || 'Gagal memuat topping dari server.');
      } else {
        setToppings(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch toppings:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  // Initial fetch and Realtime sync
  useEffect(() => {
    fetchToppings();

    const channel = subscribeToTable('toppings', () => {
      fetchToppings();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [fetchToppings]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Reset selection when pagination changes
  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, itemsPerPage, searchTerm]);

  // Helper to calculate estimated recipe cost (HPP) per topping
  const calculateToppingCost = (ingredients = []) => {
    return ingredients.reduce((total, ing) => {
      const rawMat = rawMaterials.find(m => m.id === ing.rawMaterialId || m.name === ing.rawMaterialName);
      const pricePerUnit = rawMat ? rawMat.pricePerUnit : 0;
      return total + (pricePerUnit * (Number(ing.quantity) || 0));
    }, 0);
  };

  // Computed Filtered & Sorted Toppings
  const filteredToppings = useMemo(() => {
    let result = [...toppings];

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      result = result.filter(item => 
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.id && item.id.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '', 'id');
      if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '', 'id');
      if (sortBy === 'price-asc') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'price-desc') return (b.price || 0) - (a.price || 0);
      if (sortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

    return result;
  }, [toppings, searchTerm, sortBy]);

  // Paginated Toppings
  const paginatedToppings = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredToppings.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredToppings, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredToppings.length / itemsPerPage) || 1;

  // CRUD Actions:
  // A. Create Topping
  const addTopping = async (data) => {
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Nama topping wajib diisi.' };
    }

    const isDuplicate = toppings.some(
      t => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: `Topping "${trimmedName}" sudah ada.` };
    }

    const nextNumber = toppings.length > 0
      ? Math.max(...toppings.map(t => parseInt(stripBranchFromId(t.id).replace('TOP-', '')) || 0)) + 1
      : 1;
    const formattedId = `TOP-${String(nextNumber).padStart(3, '0')}`;

    setIsSubmitting(true);
    try {
      const { data: newTop, error: err } = await toppingsService.createTopping({
        id: formattedId,
        name: trimmedName,
        price: Math.max(0, Number(data.price) || 0),
        description: data.description || '',
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        showOnReceipt: data.showOnReceipt !== false,
        branchId: activeBranchId
      });

      if (err) {
        showToast(`Gagal menambahkan topping: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }

      setToppings(prev => [newTop, ...prev]);
      showToast(`Topping "${trimmedName}" berhasil ditambahkan ke cloud.`, 'success', 'Berhasil Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // B. Update Topping
  const updateTopping = async (id, data) => {
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Nama topping wajib diisi.' };
    }

    const isDuplicate = toppings.some(
      t => t.id !== id && t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: `Topping "${trimmedName}" sudah dipakai.` };
    }

    setIsSubmitting(true);
    try {
      const { data: updatedTop, error: err } = await toppingsService.updateTopping(id, {
        name: trimmedName,
        price: Math.max(0, Number(data.price) || 0),
        description: data.description || '',
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        showOnReceipt: data.showOnReceipt !== undefined ? Boolean(data.showOnReceipt) : true
      });

      if (err) {
        showToast(`Gagal mengubah topping: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }

      setToppings(prev => prev.map(t => t.id === id ? updatedTop : t));
      showToast(`Topping "${trimmedName}" berhasil diperbarui.`, 'success', 'Perubahan Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // C. Delete Topping
  const deleteTopping = async (id) => {
    const target = toppings.find(t => t.id === id);
    setIsSubmitting(true);
    try {
      const { error: err } = await toppingsService.deleteTopping(id);
      if (err) {
        showToast(`Gagal menghapus topping: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setToppings(prev => prev.filter(t => t.id !== id));
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      showToast(`Topping "${target ? target.name : id}" telah dihapus dari cloud.`, 'info', 'Data Dihapus');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // D. Batch Delete Toppings
  const deleteBatchToppings = async (ids) => {
    setIsSubmitting(true);
    try {
      const { error: err } = await toppingsService.deleteToppingsBatch(ids);
      if (err) {
        showToast(`Gagal menghapus masal: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setToppings(prev => prev.filter(t => !ids.includes(t.id)));
      setSelectedIds([]);
      showToast(`${ids.length} topping telah dihapus dari cloud.`, 'info', 'Hapus Masal');
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

  // Modal Control Helpers
  const openAddModal = () => {
    setFormModalState({ isOpen: true, mode: 'add', item: null });
  };

  const openEditModal = (item) => {
    setFormModalState({ isOpen: true, mode: 'edit', item });
  };

  const closeFormModal = () => {
    setFormModalState({ isOpen: false, mode: 'add', item: null });
  };

  const openDeleteModal = (item) => {
    setDeleteModalState({ isOpen: true, item, isBatch: false });
  };

  const openBatchDeleteModal = () => {
    setDeleteModalState({ isOpen: true, item: null, isBatch: true });
  };

  const closeDeleteModal = () => {
    setDeleteModalState({ isOpen: false, item: null, isBatch: false });
  };

  const copyToppingsFromBranch = async (sourceBranchId = 'BR-DEFAULT') => {
    setIsSubmitting(true);
    try {
      const { count, error: err } = await toppingsService.copyFromBranch(sourceBranchId, activeBranchId);
      if (err) {
        showToast(err.message || 'Gagal menyalin topping', 'error');
        return { success: false, error: err.message };
      }
      showToast(`Berhasil menyalin ${count} topping ke cabang ini!`, 'success');
      await fetchToppings();
      return { success: true, count };
    } catch (err) {
      showToast(err.message, 'error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ToppingContext.Provider
      value={{
        toppings,
        activeBranchId,
        isLoading,
        error,
        isSubmitting,
        refetch: fetchToppings,
        copyToppingsFromBranch,
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
        filteredToppings,
        paginatedToppings,
        totalPages,
        totalItems: filteredToppings.length,
        totalAllToppings: toppings.length,
        calculateToppingCost,
        addTopping,
        updateTopping,
        deleteTopping,
        deleteBatchToppings,
        formModalState,
        availableRawMaterials: rawMaterials || [],
        rawMaterials: rawMaterials || [],
        openAddModal,
        openEditModal,
        closeFormModal,
        deleteModalState,
        openDeleteModal,
        openBatchDeleteModal,
        closeDeleteModal
      }}
    >
      {children}
    </ToppingContext.Provider>
  );
};

export const ToppingController = ToppingProvider;
