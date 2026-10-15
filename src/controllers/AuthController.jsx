import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { cashiersService } from '../services/cashiersService';
import { authService } from '../services/authService';
import { branchesService } from '../services/branchesService';
import { clearSessionToken, hasFreshSessionToken, loginToDatabase, setSessionToken, subscribeToTable } from '../lib/database';
import { 
  AUTH_USER_STORAGE_KEY, 
  DEFAULT_SUPERADMIN, 
  NAV_FEATURES,
  ROLES,
  hasAdminPrivileges,
  isStoreAdminRole
} from '../models/UserModel';
import { DEFAULT_BRANCH, normalizeBranchIds } from '../models/BranchModel';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthController = useAuth;

export const AuthProvider = ({ children }) => {
  // 1. Current Authenticated User Session (Session state in localStorage)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      if (!hasFreshSessionToken()) return null;
      const saved = localStorage.getItem(AUTH_USER_STORAGE_KEY);
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (e) {
      console.error('Gagal membaca sesi user dari localStorage', e);
      return null;
    }
  });

  // 2. Super Admin Profile (Cloud Database via MySQL)
  const [superAdminProfile, setSuperAdminProfile] = useState(DEFAULT_SUPERADMIN);

  // 3. Cashiers List (Cloud Database via MySQL)
  const [cashiers, setCashiers] = useState([]);
  const [branches, setBranches] = useState([DEFAULT_BRANCH]);
  const [pendingLoginUser, setPendingLoginUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 4. Search Term for Cashier Management Table
  const [searchTerm, setSearchTerm] = useState('');

  // 5. Modals State for Cashier CRUD
  const [formModalState, setFormModalState] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    cashier: null
  });

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    cashier: null
  });

  // 6. Modal State for Super Admin Profile Configuration
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => setIsProfileModalOpen(false);

  // Fetch profiles and cashier accounts from MySQL
  const fetchAuthData = useCallback(async () => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const canManageAccounts = hasAdminPrivileges(currentUser.role);
      const [adminRes, cashiersRes, branchesRes] = await Promise.all([
        canManageAccounts ? authService.getSuperAdminProfile() : Promise.resolve({ data: null, error: null }),
        canManageAccounts ? cashiersService.getCashiers() : Promise.resolve({ data: [], error: null }),
        branchesService.getBranches()
      ]);

      if (adminRes.data) {
        setSuperAdminProfile(adminRes.data);
      }

      if (cashiersRes.data) {
        setCashiers(cashiersRes.data);
      }

      if (branchesRes.data) {
        setBranches(branchesRes.data);
      }
    } catch (e) {
      console.error('Failed to fetch auth data from MySQL:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return undefined;
    }

    fetchAuthData();

    const channel = subscribeToTable('auth', () => {
      fetchAuthData();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [currentUser, fetchAuthData]);

  // Save auth user to localStorage when session changes
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Gagal menyimpan sesi login', e);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleExpiredSession = () => {
      setCurrentUser(null);
      setPendingLoginUser(null);
    };
    window.addEventListener('xcrepes:session-expired', handleExpiredSession);
    return () => window.removeEventListener('xcrepes:session-expired', handleExpiredSession);
  }, []);

  // -------------------------------------------------------------
  // AUTHENTICATION LOGIC
  // -------------------------------------------------------------
  const getAccessibleBranchesForUser = useCallback((user) => {
    const activeBranches = (branches.length > 0 ? branches : [DEFAULT_BRANCH])
      .filter(branch => branch.isActive !== false);

    if (!user) return [];
    if (hasAdminPrivileges(user.role)) return activeBranches;

    const branchIds = normalizeBranchIds(user.branchIds);
    if (branchIds.length === 0) return activeBranches;
    return activeBranches.filter(branch => branchIds.includes(branch.id));
  }, [branches]);

  const completeLoginWithBranch = useCallback((user, branch) => {
    const selectedBranch = branch || getAccessibleBranchesForUser(user)[0] || DEFAULT_BRANCH;
    const userWithBranch = {
      ...user,
      activeBranchId: selectedBranch.id,
      activeBranchName: selectedBranch.name,
      activeBranchCode: selectedBranch.code || ''
    };

    setCurrentUser(userWithBranch);
    setPendingLoginUser(null);
    return { success: true, user: userWithBranch };
  }, [getAccessibleBranchesForUser]);

  useEffect(() => {
    if (!currentUser || currentUser.activeBranchId) return;
    const defaultBranch = getAccessibleBranchesForUser(currentUser)[0];
    if (defaultBranch) {
      setCurrentUser(prev => ({
        ...prev,
        activeBranchId: defaultBranch.id,
        activeBranchName: defaultBranch.name,
        activeBranchCode: defaultBranch.code || ''
      }));
    }
  }, [currentUser, getAccessibleBranchesForUser]);

  const login = async (usernameInput, passwordInput) => {
    const trimmedUser = (usernameInput || '').trim();
    const trimmedPass = (passwordInput || '').trim();

    if (!trimmedUser || !trimmedPass) {
      return { success: false, error: 'Username dan kata sandi wajib diisi.' };
    }

    const { data, error } = await loginToDatabase(trimmedUser, trimmedPass);
    if (error || !data?.token || !data?.user) {
      return { success: false, error: error?.message || 'Login gagal. Periksa koneksi server.' };
    }

    setSessionToken(data.token);
    const loginBranches = Array.isArray(data.branches) && data.branches.length > 0 ? data.branches : [DEFAULT_BRANCH];
    setBranches(loginBranches);
    const isMatchedAdmin = hasAdminPrivileges(data.user.role);
    const loginUser = {
      ...data.user,
      permissions: isMatchedAdmin
        ? NAV_FEATURES.map(f => f.key)
        : Array.from(new Set([...(data.user.permissions || []), 'stock-opname'])),
      branchIds: normalizeBranchIds(data.user.branchIds)
    };
    const options = isMatchedAdmin || loginUser.branchIds.length === 0
      ? loginBranches.filter(branch => branch.isActive !== false)
      : loginBranches.filter(branch => branch.isActive !== false && loginUser.branchIds.includes(branch.id));
    if (options.length === 0) {
      clearSessionToken();
      return { success: false, error: 'Akun ini belum memiliki akses ke cabang aktif. Silakan hubungi Admin.' };
    }
    if (options.length > 1) {
      setPendingLoginUser(loginUser);
      return { success: true, requiresBranchSelection: true, user: loginUser, branches: options };
    }
    return completeLoginWithBranch(loginUser, options[0]);
  };

  const selectBranchForPendingLogin = (branchId) => {
    if (!pendingLoginUser) {
      return { success: false, error: 'Sesi login tidak ditemukan. Silakan login ulang.' };
    }
    const branch = getAccessibleBranchesForUser(pendingLoginUser).find(item => item.id === branchId);
    if (!branch) {
      return { success: false, error: 'Cabang tidak tersedia untuk akun ini.' };
    }
    return completeLoginWithBranch(pendingLoginUser, branch);
  };

  const cancelBranchSelection = () => {
    setPendingLoginUser(null);
    clearSessionToken();
  };

  const switchActiveBranch = (branchId) => {
    if (!currentUser) return { success: false, error: 'User belum login.' };
    const branch = getAccessibleBranchesForUser(currentUser).find(item => item.id === branchId);
    if (!branch) return { success: false, error: 'Cabang tidak tersedia untuk akun ini.' };
    setCurrentUser(prev => ({
      ...prev,
      activeBranchId: branch.id,
      activeBranchName: branch.name,
      activeBranchCode: branch.code || ''
    }));
    return { success: true, branch };
  };

  const logout = () => {
    setCurrentUser(null);
    setPendingLoginUser(null);
    clearSessionToken();
    try {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  };

  const hasPermission = (featureKey) => {
    if (!currentUser) return false;
    if (hasAdminPrivileges(currentUser.role)) return true;
    if (featureKey === 'cashier-management') return false;

    if (featureKey === 'reports') {
      const perms = currentUser.permissions || [];
      return perms.includes('reports-sales') || perms.includes('reports-materials');
    }

    if (featureKey === 'reports-sales-summary' || featureKey === 'reports-sales-transactions') {
      const perms = currentUser.permissions || [];
      return perms.includes('reports-sales') || perms.includes(featureKey);
    }

    // Fitur Stock Opname dapat diakses oleh Kasir
    if (featureKey === 'stock-opname') {
      return true;
    }

    const perms = currentUser.permissions || [];
    return perms.includes(featureKey);
  };

  // -------------------------------------------------------------
  // CASHIER & ADMIN ACCOUNT CRUD LOGIC
  // -------------------------------------------------------------
  const addCashier = async ({ nama, username, password, role = 'kasir', permissions = [], branchIds = [], isActive = true }) => {
    const trimmedNama = (nama || '').trim();
    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();

    if (!trimmedNama) return { success: false, error: 'Nama akun wajib diisi.' };
    if (!trimmedUser) return { success: false, error: 'Username login wajib diisi.' };
    if (!trimmedPass) return { success: false, error: 'Kata sandi wajib diisi.' };

    if (trimmedUser === superAdminProfile.username.toLowerCase()) {
      return { success: false, error: 'Username tersebut merupakan akun khusus Super Admin.' };
    }

    // Hanya Super Admin yang berhak menambahkan akun dengan peran Kepala Toko
    if (hasAdminPrivileges(role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return { 
        success: false, 
        error: 'Hanya Super Admin yang berhak menambahkan akun Kepala Toko. Kepala Toko hanya dapat menambahkan akun kasir.' 
      };
    }

    const isDuplicate = cashiers.some(c => c.username.toLowerCase() === trimmedUser);
    if (isDuplicate) {
      return { success: false, error: `Username "${trimmedUser}" sudah digunakan akun lain.` };
    }

    const existingNumbers = cashiers.map(c => {
      const match = c.id && c.id.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    });
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers, 0) + 1 : 1;
    const prefix = hasAdminPrivileges(role) ? 'ADM' : 'KASIR';
    const formattedId = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

    const isAdmin = hasAdminPrivileges(role);
    const assignedPermissions = isAdmin 
      ? NAV_FEATURES.map(f => f.key) 
      : (Array.isArray(permissions) ? permissions : []);
    const assignedBranches = isAdmin ? [] : normalizeBranchIds(branchIds);

    const newCashier = {
      id: formattedId,
      nama: trimmedNama,
      username: trimmedUser,
      password: trimmedPass,
      role: role || 'kasir',
      permissions: assignedPermissions,
      branchIds: assignedBranches,
      isActive: Boolean(isActive),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const { data, error } = await cashiersService.createCashier(newCashier);
      if (error) {
        return { success: false, error: error.message };
      }
      setCashiers(prev => [data, ...prev]);
      return { success: true, cashier: data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const updateCashier = async (id, { nama, username, password, role, permissions, branchIds, isActive }) => {
    const trimmedNama = (nama || '').trim();
    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();

    const existingAccount = cashiers.find(c => c.id === id);

    if (!trimmedNama) return { success: false, error: 'Nama akun wajib diisi.' };
    if (!trimmedUser) return { success: false, error: 'Username login wajib diisi.' };

    if (trimmedUser === superAdminProfile.username.toLowerCase()) {
      return { success: false, error: 'Username tersebut khusus Super Admin.' };
    }

    // Cek apakah akun yang ingin diubah adalah akun Kepala Toko
    if (existingAccount && hasAdminPrivileges(existingAccount.role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return { 
        success: false, 
        error: 'Hanya Super Admin yang berhak mengubah data akun Kepala Toko.' 
      };
    }

    // Jika non-superadmin mencoba mengubah role menjadi admin
    if (hasAdminPrivileges(role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return { 
        success: false, 
        error: 'Hanya Super Admin yang berhak menetapkan peran Kepala Toko.' 
      };
    }

    const isDuplicate = cashiers.some(c => c.id !== id && c.username.toLowerCase() === trimmedUser);
    if (isDuplicate) {
      return { success: false, error: `Username "${trimmedUser}" sudah digunakan.` };
    }

    const isAdmin = hasAdminPrivileges(role);
    const assignedPermissions = isAdmin 
      ? NAV_FEATURES.map(f => f.key) 
      : (permissions !== undefined ? permissions : undefined);
    const assignedBranches = branchIds !== undefined
      ? (isAdmin ? [] : normalizeBranchIds(branchIds))
      : undefined;

    try {
      const { data: updatedRecord, error } = await cashiersService.updateCashier(id, {
        nama: trimmedNama,
        username: trimmedUser,
        ...(trimmedPass ? { password: trimmedPass } : {}),
        role,
        permissions: assignedPermissions,
        branchIds: assignedBranches,
        isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setCashiers(prev => prev.map(c => c.id === id ? updatedRecord : c));

      if (currentUser && currentUser.id === id && updatedRecord) {
        setCurrentUser(prev => ({
          ...prev,
          nama: updatedRecord.nama,
          username: updatedRecord.username,
          role: updatedRecord.role,
          permissions: hasAdminPrivileges(updatedRecord.role)
            ? NAV_FEATURES.map(f => f.key)
            : updatedRecord.permissions,
          branchIds: updatedRecord.branchIds || []
        }));
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const deleteCashier = async (id) => {
    // Validasi otorisasi penghapusan akun Kepala Toko
    const target = cashiers.find(c => c.id === id);
    if (target && hasAdminPrivileges(target.role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return { 
        success: false, 
        error: 'Hanya Super Admin yang berhak menghapus akun Kepala Toko.' 
      };
    }

    try {
      const { error } = await cashiersService.deleteCashier(id);
      if (error) {
        return { success: false, error: error.message };
      }
      setCashiers(prev => prev.filter(c => c.id !== id));
      if (currentUser && currentUser.id === id) {
        logout();
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const toggleCashierStatus = async (id) => {
    const target = cashiers.find(c => c.id === id);
    if (!target) return;

    // Cegah Kepala Toko menonaktifkan akun sesama Kepala Toko
    if (hasAdminPrivileges(target.role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return;
    }

    const nextActive = !target.isActive;

    try {
      const { error } = await cashiersService.updateCashier(id, {
        isActive: nextActive
      });
      if (!error) {
        setCashiers(prev => prev.map(c => c.id === id ? { ...c, isActive: nextActive } : c));
        if (!nextActive && currentUser && currentUser.id === id) {
          setTimeout(() => logout(), 100);
        }
      }
    } catch (e) {
      console.error('Failed to toggle cashier status:', e);
    }
  };

  const addBranch = async ({ name, code = '', isActive = true }) => {
    const trimmedName = (name || '').trim();
    const trimmedCode = (code || '').trim().toUpperCase();
    if (!trimmedName) return { success: false, error: 'Nama cabang wajib diisi.' };

    const duplicate = branches.some(branch => 
      branch.name.toLowerCase() === trimmedName.toLowerCase() ||
      (trimmedCode && branch.code?.toLowerCase() === trimmedCode.toLowerCase())
    );
    if (duplicate) return { success: false, error: 'Nama atau kode cabang sudah digunakan.' };

    const numericIds = branches.map(b => {
      const match = String(b.id || '').match(/^BR-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const maxNum = Math.max(0, ...numericIds);
    let id = `BR-${String(maxNum + 1).padStart(3, '0')}`;
    if (branches.some(b => b.id === id)) {
      id = `BR-${Date.now().toString(36).toUpperCase()}`;
    }
    const generatedCode = trimmedCode || trimmedName.split(/\s+/).map(word => word[0]).join('').slice(0, 8).toUpperCase() || id;

    const payload = {
      id,
      name: trimmedName,
      code: generatedCode,
      address: '',
      phone: '',
      isActive
    };

    const { data, error } = await branchesService.createBranch(payload);
    if (error) return { success: false, error: error.message };
    setBranches(prev => [data, ...prev]);
    return { success: true, branch: data };
  };

  const updateBranch = async (id, values) => {
    const payload = {
      name: values.name?.trim(),
      code: values.code?.trim().toUpperCase(),
      isActive: values.isActive
    };

    if (!payload.name) return { success: false, error: 'Nama cabang wajib diisi.' };

    const duplicate = branches.some(branch =>
      branch.id !== id &&
      (branch.name.toLowerCase() === payload.name.toLowerCase() ||
        (payload.code && branch.code?.toLowerCase() === payload.code.toLowerCase()))
    );
    if (duplicate) return { success: false, error: 'Nama atau kode cabang sudah digunakan.' };

    const { data, error } = await branchesService.updateBranch(id, payload);
    if (error) return { success: false, error: error.message };
    setBranches(prev => prev.map(branch => branch.id === id ? data : branch));
    if (currentUser?.activeBranchId === id) {
      setCurrentUser(prev => ({
        ...prev,
        activeBranchName: data.name,
        activeBranchCode: data.code || ''
      }));
    }
    return { success: true, branch: data };
  };

  const updateSuperAdminProfile = async ({ nama, username, password }) => {
    const trimmedNama = (nama || '').trim();
    const trimmedUser = (username || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();

    if (!trimmedNama) return { success: false, error: 'Nama Super Admin wajib diisi.' };
    if (!trimmedUser) return { success: false, error: 'Username wajib diisi.' };
    if (/\s/.test(trimmedUser)) return { success: false, error: 'Username tidak boleh mengandung spasi.' };
    if (trimmedUser.length < 3) return { success: false, error: 'Username minimal 3 karakter.' };

    const cashierWithSameUser = cashiers.find(c => c.username.toLowerCase() === trimmedUser);
    if (cashierWithSameUser) {
      return { 
        success: false, 
        error: `Username "${trimmedUser}" sudah digunakan oleh kasir "${cashierWithSameUser.nama}".` 
      };
    }

    if (!trimmedPass) return { success: false, error: 'Kata sandi wajib diisi.' };
    if (trimmedPass.length < 6) return { success: false, error: 'Kata sandi minimal 6 karakter.' };

    const updated = {
      ...superAdminProfile,
      nama: trimmedNama,
      username: trimmedUser,
      password: trimmedPass,
      updatedAt: new Date().toISOString()
    };

    try {
      const { error } = await authService.saveSuperAdminProfile(updated);
      if (error) {
        return { success: false, error: error.message };
      }

      setSuperAdminProfile(updated);

      if (currentUser?.role === 'superadmin') {
        setCurrentUser(prev => ({
          ...prev,
          nama: trimmedNama,
          username: trimmedUser
        }));
      }

      return { success: true, profile: updated };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // Modal helpers
  const openAddCashierModal = () => {
    setFormModalState({ isOpen: true, mode: 'add', cashier: null });
  };

  const openEditCashierModal = (cashier) => {
    if (hasAdminPrivileges(cashier?.role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return;
    }
    setFormModalState({ isOpen: true, mode: 'edit', cashier });
  };

  const closeFormCashierModal = () => {
    setFormModalState({ isOpen: false, mode: 'add', cashier: null });
  };

  const openDeleteCashierModal = (cashier) => {
    if (hasAdminPrivileges(cashier?.role) && currentUser?.role !== ROLES.SUPERADMIN) {
      return;
    }
    setDeleteModalState({ isOpen: true, cashier });
  };

  const closeDeleteCashierModal = () => {
    setDeleteModalState({ isOpen: false, cashier: null });
  };

  const filteredCashiers = useMemo(() => {
    if (!searchTerm.trim()) return cashiers;
    const q = searchTerm.toLowerCase().trim();
    return cashiers.filter(c => 
      (c.nama && c.nama.toLowerCase().includes(q)) ||
      (c.username && c.username.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  }, [cashiers, searchTerm]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        pendingLoginUser,
        isLoading,
        login,
        selectBranchForPendingLogin,
        cancelBranchSelection,
        logout,
        branches,
        activeBranches: branches.filter(branch => branch.isActive !== false),
        pendingAccessibleBranches: getAccessibleBranchesForUser(pendingLoginUser),
        accessibleBranches: getAccessibleBranchesForUser(currentUser),
        switchActiveBranch,
        addBranch,
        updateBranch,
        hasPermission,
        navFeatures: NAV_FEATURES,
        superAdminProfile,
        updateSuperAdminProfile,
        isProfileModalOpen,
        openProfileModal,
        closeProfileModal,
        cashiers,
        filteredCashiers,
        searchTerm,
        setSearchTerm,
        addCashier,
        updateCashier,
        deleteCashier,
        toggleCashierStatus,
        formModalState,
        openAddCashierModal,
        openEditCashierModal,
        closeFormCashierModal,
        deleteModalState,
        openDeleteCashierModal,
        closeDeleteCashierModal
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
