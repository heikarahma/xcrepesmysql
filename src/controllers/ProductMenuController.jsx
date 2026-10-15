import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { productMenusService } from '../services/productMenusService';
import { subscribeToTable } from '../lib/database';
import { useUnit } from './UnitController';
import { useRawMaterial } from './RawMaterialController';
import { useAuth } from './AuthController';
import { stripBranchFromId } from '../models/BranchModel';

const ProductMenuContext = createContext();

export const useProductMenu = () => {
  const context = useContext(ProductMenuContext);
  if (!context) {
    throw new Error('useProductMenu must be used within a ProductMenuProvider');
  }
  return context;
};

export const useProductMenuController = useProductMenu;

export const ProductMenuProvider = ({ children }) => {
  const { showToast } = useUnit();
  const { rawMaterials } = useRawMaterial();
  const { currentUser } = useAuth();
  const activeBranchId = currentUser?.activeBranchId || 'BR-DEFAULT';

  // 1. Cloud Database State via MySQL
  const [productMenus, setProductMenus] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Search, Filter & Sorting State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // 3. Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // 4. Modals State
  const [formModalState, setFormModalState] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    item: null
  });

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    item: null
  });

  // Fetch Product Menus from MySQL
  const fetchProductMenus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await productMenusService.getProductMenus(activeBranchId);
      if (fetchErr) {
        setError(fetchErr.message || 'Gagal memuat menu produk dari server.');
      } else {
        setProductMenus(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch product menus:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  // Initial fetch and Realtime sync
  useEffect(() => {
    fetchProductMenus();

    const channel = subscribeToTable('product_menus', () => {
      fetchProductMenus();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [fetchProductMenus]);

  // Reset pagination when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  // Helper to calculate estimated recipe cost (HPP) per menu
  const calculateMenuCost = (ingredients = []) => {
    return ingredients.reduce((total, ing) => {
      const rawMat = rawMaterials.find(m => m.id === ing.rawMaterialId || m.name === ing.rawMaterialName);
      const pricePerUnit = rawMat ? rawMat.pricePerUnit : 0;
      return total + (pricePerUnit * (Number(ing.quantity) || 0));
    }, 0);
  };

  // Computed Filtered & Sorted Product Menus
  const filteredMenus = useMemo(() => {
    let result = [...productMenus];

    // Filter by Category
    if (categoryFilter !== 'all') {
      result = result.filter(item => item.categoryId === categoryFilter);
    }

    // Search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(query))
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name, 'id');
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name, 'id');
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

    return result;
  }, [productMenus, categoryFilter, searchTerm, sortBy]);

  // Paginated Menus
  const paginatedMenus = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredMenus.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMenus, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredMenus.length / itemsPerPage) || 1;

  // CRUD Actions:
  // A. Create Menu
  const addProductMenu = async (data) => {
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Nama menu produk wajib diisi.' };
    }

    const isDuplicate = productMenus.some(
      m => m.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: `Menu dengan nama "${trimmedName}" sudah ada.` };
    }

    const nextNumber = productMenus.length > 0
      ? Math.max(...productMenus.map(m => parseInt(stripBranchFromId(m.id).replace('MENU-', '')) || 0)) + 1
      : 1;
    const formattedId = `MENU-${String(nextNumber).padStart(3, '0')}`;

    setIsSubmitting(true);
    try {
      const { data: newMenu, error: err } = await productMenusService.createProductMenu({
        id: formattedId,
        name: trimmedName,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        image: data.image || '',
        price: Math.max(0, Number(data.price) || 0),
        promoType: data.promoType || null,
        promoAmount: Number(data.promoAmount) || 0,
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        toppings: Array.isArray(data.toppings) ? data.toppings : [],
        isActive: data.isActive !== false
      }, activeBranchId);

      if (err) {
        showToast(`Gagal menambahkan menu: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }

      setProductMenus(prev => [newMenu, ...prev]);
      showToast(`Menu "${trimmedName}" berhasil disimpan ke cloud.`, 'success', 'Berhasil Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // B. Update Menu
  const updateProductMenu = async (id, data) => {
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Nama menu produk wajib diisi.' };
    }

    const isDuplicate = productMenus.some(
      m => m.id !== id && m.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: `Menu dengan nama "${trimmedName}" sudah dipakai.` };
    }

    setIsSubmitting(true);
    try {
      const { data: updatedMenu, error: err } = await productMenusService.updateProductMenu(id, {
        name: trimmedName,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        image: data.image || '',
        price: Math.max(0, Number(data.price) || 0),
        promoType: data.promoType || null,
        promoAmount: Number(data.promoAmount) || 0,
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        toppings: Array.isArray(data.toppings) ? data.toppings : [],
        isActive: data.isActive !== false
      });

      if (err) {
        showToast(`Gagal mengubah menu: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }

      setProductMenus(prev => prev.map(m => m.id === id ? updatedMenu : m));
      showToast(`Menu "${trimmedName}" berhasil diperbarui.`, 'success', 'Perubahan Disimpan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  // C. Nonaktifkan Menu (soft delete)
  const deleteProductMenu = async (id) => {
    const target = productMenus.find(m => m.id === id);
    setIsSubmitting(true);
    try {
      const { data: updatedMenu, error: err } = await productMenusService.deleteProductMenu(id);
      if (err) {
        showToast(`Gagal menonaktifkan menu: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setProductMenus(prev => prev.map(m => m.id === id ? updatedMenu : m));
      showToast(`Menu "${target ? target.name : id}" dinonaktifkan dan tidak tampil di kasir.`, 'info', 'Menu Dinonaktifkan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  const activateProductMenu = async (id) => {
    const target = productMenus.find(m => m.id === id);
    setIsSubmitting(true);
    try {
      const { data: updatedMenu, error: err } = await productMenusService.activateProductMenu(id);
      if (err) {
        showToast(`Gagal mengaktifkan menu: ${err.message}`, 'error', 'Error Database');
        return { success: false, error: err.message };
      }
      setProductMenus(prev => prev.map(m => m.id === id ? updatedMenu : m));
      showToast(`Menu "${target ? target.name : id}" aktif kembali dan tampil di kasir.`, 'success', 'Menu Diaktifkan');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
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
    setDeleteModalState({ isOpen: true, item });
  };

  const closeDeleteModal = () => {
    setDeleteModalState({ isOpen: false, item: null });
  };

  const copyMenusFromBranch = async (sourceBranchId = 'BR-DEFAULT') => {
    setIsSubmitting(true);
    try {
      const { count, error: err } = await productMenusService.copyFromBranch(sourceBranchId, activeBranchId);
      if (err) {
        showToast(err.message || 'Gagal menyalin menu', 'error');
        return { success: false, error: err.message };
      }
      showToast(`Berhasil menyalin ${count} menu ke cabang ini!`, 'success');
      await fetchProductMenus();
      return { success: true, count };
    } catch (err) {
      showToast(err.message, 'error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProductMenuContext.Provider
      value={{
        productMenus,
        menus: productMenus,
        activeBranchId,
        isLoading,
        error,
        isSubmitting,
        refetch: fetchProductMenus,
        copyMenusFromBranch,
        searchTerm,
        setSearchTerm,
        sortBy,
        setSortBy,
        categoryFilter,
        setCategoryFilter,
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        filteredMenus,
        paginatedMenus,
        totalPages,
        totalItems: filteredMenus.length,
        totalAllMenus: productMenus.length,
        calculateMenuCost,
        addProductMenu,
        addMenu: addProductMenu,
        updateProductMenu,
        updateMenu: updateProductMenu,
        activateProductMenu,
        activateMenu: activateProductMenu,
        deleteProductMenu,
        deleteMenu: deleteProductMenu,
        formModalState,
        openAddModal,
        openEditModal,
        closeFormModal,
        deleteModalState,
        openDeleteModal,
        closeDeleteModal
      }}
    >
      {children}
    </ProductMenuContext.Provider>
  );
};

export const ProductMenuController = ProductMenuProvider;
