import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { categoriesService } from '../services/categoriesService';
import { subscribeToTable } from '../lib/database';
import { useUnit } from './UnitController';

const CategoryContext = createContext();

export const useCategory = () => {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error('useCategory must be used within a CategoryProvider');
  }
  return context;
};

export const useCategoryController = useCategory;

export const CategoryProvider = ({ children }) => {
  const { showToast } = useUnit();

  const CATEGORY_ORDER_STORAGE_KEY = 'xcrepes_category_order';

  // 1. Master Categories State (Cloud Database via MySQL)
  const [categories, setCategories] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(CATEGORY_ORDER_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Search, Filter & Sorting State (defaults to 'custom' order for tabs)
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('custom'); // 'custom' | 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'
  
  // 3. Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  // 4. Selection State (for Batch Actions)
  const [selectedIds, setSelectedIds] = useState([]);

  // 5. Modals State
  const [formModalState, setFormModalState] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    category: null
  });

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    category: null,
    isBatch: false
  });

  // Modal State for Reordering Categories
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);

  const openReorderModal = () => setIsReorderModalOpen(true);
  const closeReorderModal = () => setIsReorderModalOpen(false);

  // Fetch Categories & Custom Order from MySQL
  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [catsRes, orderRes] = await Promise.all([
        categoriesService.getCategories(),
        categoriesService.getCategoryOrder()
      ]);

      if (catsRes.error) {
        setError(catsRes.error.message || 'Gagal memuat kategori dari server.');
      } else {
        setCategories(catsRes.data || []);
      }

      if (orderRes.data && Array.isArray(orderRes.data)) {
        setCategoryOrder(orderRes.data);
        try {
          localStorage.setItem(CATEGORY_ORDER_STORAGE_KEY, JSON.stringify(orderRes.data));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and Realtime sync
  useEffect(() => {
    fetchCategories();

    const channel = subscribeToTable('categories', () => {
      fetchCategories();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [fetchCategories]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchTerm, sortBy]);

  // CRUD Actions:
  // A. Create Category
  const addCategory = async (name, description = '') => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Nama kategori wajib diisi.' };
    }

    const isDuplicate = categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      return { success: false, error: `Kategori "${trimmed}" sudah ada.` };
    }

    const nextNumber = categories.length > 0 
      ? Math.max(...categories.map(c => parseInt(c.id.replace('CAT-', '')) || 0)) + 1 
      : 1;
    const formattedId = `CAT-${String(nextNumber).padStart(3, '0')}`;

    setIsSubmitting(true);
    try {
      const { data, error: err } = await categoriesService.createCategory({
        id: formattedId,
        name: trimmed,
        description
      });
      if (err) {
        showToast(`Gagal menambahkan kategori: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setCategories(prev => [data, ...prev]);
      showToast(`Kategori "${trimmed}" berhasil ditambahkan ke cloud.`, 'success', 'Berhasil Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // B. Update Category
  const updateCategory = async (id, name, description = '') => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Nama kategori wajib diisi.' };
    }

    const isDuplicate = categories.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      return { success: false, error: `Kategori "${trimmed}" sudah dipakai.` };
    }

    setIsSubmitting(true);
    try {
      const { data, error: err } = await categoriesService.updateCategory(id, {
        name: trimmed,
        description
      });
      if (err) {
        showToast(`Gagal mengubah kategori: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setCategories(prev => prev.map(c => c.id === id ? data : c));
      showToast(`Kategori "${trimmed}" berhasil diperbarui.`, 'success', 'Perubahan Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // C. Delete Category
  const deleteCategory = async (id) => {
    const target = categories.find(c => c.id === id);
    setIsSubmitting(true);
    try {
      const { error: err } = await categoriesService.deleteCategory(id);
      if (err) {
        showToast(`Gagal menghapus kategori: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setCategories(prev => prev.filter(c => c.id !== id));
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      showToast(`Kategori "${target ? target.name : id}" telah dihapus dari cloud.`, 'info', 'Data Dihapus');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // D. Batch Delete Categories
  const deleteBatchCategories = async (ids) => {
    setIsSubmitting(true);
    try {
      const { error: err } = await categoriesService.deleteCategoriesBatch(ids);
      if (err) {
        showToast(`Gagal menghapus masal: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setCategories(prev => prev.filter(c => !ids.includes(c.id)));
      setSelectedIds([]);
      showToast(`${ids.length} kategori telah dihapus dari cloud.`, 'info', 'Hapus Masal');
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

  // Categories sorted by custom order for POS tabs and master lists
  const sortedCategories = useMemo(() => {
    if (!categoryOrder || categoryOrder.length === 0) {
      return [...categories];
    }
    return [...categories].sort((a, b) => {
      const indexA = categoryOrder.indexOf(a.id);
      const indexB = categoryOrder.indexOf(b.id);
      const posA = indexA !== -1 ? indexA : 9999;
      const posB = indexB !== -1 ? indexB : 9999;
      if (posA !== posB) return posA - posB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [categories, categoryOrder]);

  // Update whole category order array
  const updateCategoryOrder = async (newOrderArray) => {
    if (!Array.isArray(newOrderArray)) return { success: false };
    setCategoryOrder(newOrderArray);
    try {
      localStorage.setItem(CATEGORY_ORDER_STORAGE_KEY, JSON.stringify(newOrderArray));
    } catch (e) {}

    try {
      await categoriesService.saveCategoryOrder(newOrderArray);
    } catch (err) {
      console.warn('Failed saving category order to MySQL:', err);
    }

    showToast('Urutan kategori berhasil disimpan & disinkronkan.', 'success', 'Urutan Diperbarui');
    return { success: true };
  };

  // Move a category to a specific 1-indexed position (e.g. 1st, 2nd, etc.)
  const moveCategoryPosition = async (categoryId, targetPos1Indexed) => {
    const currentList = sortedCategories.map(c => c.id);
    const currentIndex = currentList.indexOf(categoryId);
    if (currentIndex === -1) return { success: false };

    const targetIndex = Math.max(0, Math.min(currentList.length - 1, targetPos1Indexed - 1));
    if (currentIndex === targetIndex) return { success: true };

    const updated = [...currentList];
    const [movedItem] = updated.splice(currentIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    return updateCategoryOrder(updated);
  };

  // Move a category delta up (-1) or down (+1)
  const moveCategoryDelta = async (categoryId, delta) => {
    const currentList = sortedCategories.map(c => c.id);
    const currentIndex = currentList.indexOf(categoryId);
    if (currentIndex === -1) return { success: false };
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= currentList.length) return { success: false };

    const updated = [...currentList];
    const temp = updated[currentIndex];
    updated[currentIndex] = updated[targetIndex];
    updated[targetIndex] = temp;

    return updateCategoryOrder(updated);
  };

  // Filtered & Sorted Categories (Memoized)
  const filteredCategories = useMemo(() => {
    let result = [...categories];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'custom') {
        const indexA = categoryOrder.indexOf(a.id);
        const indexB = categoryOrder.indexOf(b.id);
        const posA = indexA !== -1 ? indexA : 9999;
        const posB = indexB !== -1 ? indexB : 9999;
        if (posA !== posB) return posA - posB;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name, 'id');
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'id');
      if (sortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

    return result;
  }, [categories, categoryOrder, searchTerm, sortBy]);

  // Paginated Categories
  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCategories.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCategories, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage) || 1;

  // Modal Control Helpers
  const openAddModal = () => {
    setFormModalState({ isOpen: true, mode: 'add', category: null });
  };

  const openEditModal = (category) => {
    setFormModalState({ isOpen: true, mode: 'edit', category });
  };

  const closeFormModal = () => {
    setFormModalState({ isOpen: false, mode: 'add', category: null });
  };

  const openDeleteModal = (category) => {
    setDeleteModalState({ isOpen: true, category, isBatch: false });
  };

  const openBatchDeleteModal = () => {
    setDeleteModalState({ isOpen: true, category: null, isBatch: true });
  };

  const closeDeleteModal = () => {
    setDeleteModalState({ isOpen: false, category: null, isBatch: false });
  };

  return (
    <CategoryContext.Provider
      value={{
        categories: sortedCategories,
        rawCategories: categories,
        categoryOrder,
        updateCategoryOrder,
        moveCategoryPosition,
        moveCategoryDelta,
        isReorderModalOpen,
        openReorderModal,
        closeReorderModal,
        isLoading,
        error,
        isSubmitting,
        refetch: fetchCategories,
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
        filteredCategories,
        paginatedCategories,
        totalPages,
        totalItems: filteredCategories.length,
        totalAllCategories: categories.length,
        addCategory,
        updateCategory,
        deleteCategory,
        deleteBatchCategories,
        formModalState,
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
    </CategoryContext.Provider>
  );
};

export const CategoryController = CategoryProvider;
