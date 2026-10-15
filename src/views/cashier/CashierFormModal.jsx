import React, { useState, useEffect } from 'react';
import { useAuth } from '../../controllers/AuthController';
import { useUnit } from '../../controllers/UnitController';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { 
  User, 
  Lock, 
  AtSign, 
  Eye, 
  EyeOff, 
  Save, 
  Plus, 
  ShoppingBag, 
  Package, 
  ShieldCheck, 
  Check, 
  AlertCircle,
  Ruler,
  Layers,
  Sparkles,
  Cookie,
  TrendingUp,
  Sliders,
  CheckCheck,
  XCircle,
  RotateCcw,
  ClipboardCheck,
  Store
} from 'lucide-react';
import { ROLES, hasAdminPrivileges } from '../../models/UserModel';

export const CashierFormModal = () => {
  const { 
    currentUser,
    formModalState, 
    closeFormCashierModal, 
    addCashier, 
    updateCashier, 
    navFeatures,
    activeBranches
  } = useAuth();
  const { showToast } = useUnit();

  const isSuperAdmin = currentUser?.role === ROLES.SUPERADMIN;
  const { isOpen, mode, cashier } = formModalState;

  const [role, setRole] = useState('kasir'); // 'kasir' | 'admin'
  const [nama, setNama] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState(['kasir', 'raw-material', 'stock-opname', 'returns']);
  const [branchIds, setBranchIds] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!isSuperAdmin) {
        setRole('kasir');
      } else if (mode === 'edit' && cashier) {
        setRole(hasAdminPrivileges(cashier.role) ? 'admin' : 'kasir');
      } else {
        setRole('kasir');
      }

      if (mode === 'edit' && cashier) {
        setNama(cashier.nama || '');
        setUsername(cashier.username || '');
        setPassword('');
        setPermissions(Array.isArray(cashier.permissions) ? cashier.permissions : ['kasir', 'raw-material', 'stock-opname', 'returns']);
        setBranchIds(Array.isArray(cashier.branchIds) ? cashier.branchIds : []);
        setIsActive(cashier.isActive !== false);
      } else {
        setNama('');
        setUsername('');
        setPassword('');
        setPermissions(['kasir', 'raw-material', 'stock-opname', 'returns']);
        setBranchIds([]);
        setIsActive(true);
      }
      setShowPassword(false);
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, mode, cashier, isSuperAdmin]);

  if (!isOpen) return null;

  const isEdit = mode === 'edit';

  const handleTogglePermission = (featureKey) => {
    setPermissions(prev => {
      if (prev.includes(featureKey)) {
        return prev.filter(k => k !== featureKey);
      } else {
        return [...prev, featureKey];
      }
    });
    if (errors.permissions) {
      setErrors(prev => ({ ...prev, permissions: '' }));
    }
  };

  const validate = () => {
    const err = {};
    if (!nama.trim()) {
      err.nama = role === 'admin' ? 'Nama lengkap Kepala Toko wajib diisi!' : 'Nama lengkap kasir wajib diisi!';
    }
    if (!username.trim()) {
      err.username = 'Username login wajib diisi!';
    } else if (username.trim().toLowerCase() === 'superadmin') {
      err.username = 'Username "superadmin" khusus untuk Super Admin!';
    }
    if (!isEdit && !password.trim()) {
      err.password = 'Kata sandi wajib diisi!';
    } else if (password.trim() && password.trim().length < 4) {
      err.password = 'Kata sandi minimal 4 karakter!';
    }
    if (role === 'kasir' && permissions.length === 0) {
      err.permissions = 'Pilih minimal 1 fitur yang dapat diakses oleh kasir!';
    }
    if (role === 'kasir' && branchIds.length === 0) {
      err.branchIds = 'Pilih minimal 1 cabang yang bisa diakses akun ini!';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    let res;
    const effectivePermissions = role === 'admin' ? navFeatures.map(f => f.key) : permissions;
    try {
      if (isEdit) {
        res = await updateCashier(cashier.id, {
          nama: nama.trim(),
          username: username.trim().toLowerCase(),
          password: password.trim(),
          role,
          permissions: effectivePermissions,
          branchIds,
          isActive
        });
      } else {
        res = await addCashier({
          nama: nama.trim(),
          username: username.trim().toLowerCase(),
          password: password.trim(),
          role,
          permissions: effectivePermissions,
          branchIds,
          isActive
        });
      }
    } catch (err) {
      res = { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }

    if (res && res.success) {
      const roleText = role === 'admin' ? 'Kepala Toko' : 'Kasir';
      if (isEdit) {
        showToast(`Akun ${roleText} "${nama}" berhasil diperbarui.`, 'success', 'Perubahan Disimpan');
      } else {
        showToast(`Akun ${roleText} "${nama}" berhasil ditambahkan.`, 'success', 'Akun Ditambahkan');
      }
      setNama('');
      setUsername('');
      setPassword('');
      setRole('kasir');
      setPermissions(['kasir', 'raw-material', 'stock-opname', 'returns']);
      setBranchIds([]);
      setIsActive(true);
      setShowPassword(false);
      setErrors({});
      closeFormCashierModal();
    } else {
      setErrors({ form: res?.error || 'Terjadi kesalahan saat menyimpan data.' });
    }
  };

  const handleSelectAll = () => {
    setPermissions(navFeatures.map(f => f.key));
    if (errors.permissions) setErrors(prev => ({ ...prev, permissions: '' }));
  };

  const handleDeselectAll = () => {
    setPermissions([]);
  };

  const handleToggleBranch = (branchId) => {
    setBranchIds(prev => (
      prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId]
    ));
    if (errors.branchIds) {
      setErrors(prev => ({ ...prev, branchIds: '' }));
    }
  };

  // Helper get feature icon
  const getFeatureIcon = (key) => {
    switch (key) {
      case 'kasir': return <ShoppingBag size={18} color="var(--blue-500)" />;
      case 'unit': return <Ruler size={18} color="var(--blue-500)" />;
      case 'category': return <Layers size={18} color="var(--blue-500)" />;
      case 'topping': return <Sparkles size={18} color="var(--blue-500)" />;
      case 'product-menu': return <Cookie size={18} color="var(--blue-500)" />;
      case 'raw-material': return <Package size={18} color="var(--blue-500)" />;
      case 'stock-opname': return <ClipboardCheck size={18} color="var(--blue-500)" />;
      case 'returns': return <RotateCcw size={18} color="var(--blue-500)" />;
      case 'reports-sales': return <TrendingUp size={18} color="var(--blue-500)" />;
      case 'reports-materials': return <Package size={18} color="var(--blue-500)" />;
      case 'settings': return <Sliders size={18} color="var(--blue-500)" />;
      default: return <ShieldCheck size={18} color="var(--blue-500)" />;
    }
  };

  const handleClose = () => {
    setNama('');
    setUsername('');
    setPassword('');
    setPermissions(['kasir', 'raw-material', 'stock-opname', 'returns']);
    setBranchIds([]);
    setIsActive(true);
    setShowPassword(false);
    setErrors({});
    closeFormCashierModal();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        !isSuperAdmin
          ? (isEdit ? 'Ubah Akun Kasir' : 'Tambah Kasir Baru')
          : (isEdit 
              ? (role === 'admin' ? 'Ubah Akun Kepala Toko' : 'Ubah Akun Kasir') 
              : (role === 'admin' ? 'Tambah Kepala Toko' : 'Tambah Akun Pengguna Baru'))
      }
      subtitle={
        !isSuperAdmin
          ? (isEdit ? 'Perbarui informasi profil dan hak akses menu kasir.' : 'Buat akun kasir baru dan atur izin akses menunya.')
          : (isEdit 
              ? 'Perbarui informasi profil, jabatan, dan hak akses akun.' 
              : 'Pilih peran akun (Kasir atau Kepala Toko) dan tentukan hak aksesnya.')
      }
      size="md"
      footer={
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            variant="primary"
            icon={isEdit ? Save : Plus}
            onClick={handleSubmit}
            disabled={isSubmitting || !nama.trim() || !username.trim() || (!isEdit && !password.trim())}
          >
            {isSubmitting 
              ? 'Menyimpan...' 
              : isEdit 
                ? 'Simpan Perubahan' 
                : (!isSuperAdmin || role !== 'admin' ? 'Tambah Kasir' : 'Tambah Kepala Toko')}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Pilihan Peran / Role Akun (Hanya ditampilkan untuk Super Admin saat tambah akun baru) */}
        {isSuperAdmin && !isEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="blue-label" style={{ fontWeight: 700, margin: 0 }}>
              Peran / Jabatan Akun <span style={{ color: 'var(--red-500)' }}>*</span>
            </label>
            <div style={styles.roleCardsGrid}>
              {/* Pilihan 1: Kasir POS */}
              <div
                onClick={() => setRole('kasir')}
                style={{
                  ...styles.roleSelectCard,
                  borderColor: role === 'kasir' ? 'var(--blue-500)' : 'var(--border-color)',
                  backgroundColor: role === 'kasir' ? 'var(--blue-50)' : '#FFFFFF',
                  boxShadow: role === 'kasir' ? '0 0 0 1.5px var(--blue-500)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <div style={{
                    ...styles.roleIconWrapper,
                    backgroundColor: role === 'kasir' ? 'var(--blue-100)' : 'var(--neutral-100)'
                  }}>
                    <ShoppingBag size={18} color={role === 'kasir' ? 'var(--blue-600)' : 'var(--neutral-600)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: role === 'kasir' ? 'var(--blue-900)' : 'var(--neutral-900)' }}>
                      Kasir POS
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '2px' }}>
                      Operasional & izin menu fleksibel
                    </div>
                  </div>
                </div>
              </div>

              {/* Pilihan 2: Kepala Toko */}
              <div
                onClick={() => {
                  setRole('admin');
                  if (errors.permissions) setErrors(prev => ({ ...prev, permissions: '' }));
                }}
                style={{
                  ...styles.roleSelectCard,
                  borderColor: role === 'admin' ? '#7c3aed' : 'var(--border-color)',
                  backgroundColor: role === 'admin' ? '#f5f3ff' : '#FFFFFF',
                  boxShadow: role === 'admin' ? '0 0 0 1.5px #7c3aed' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <div style={{
                    ...styles.roleIconWrapper,
                    backgroundColor: role === 'admin' ? '#ede9fe' : 'var(--neutral-100)'
                  }}>
                    <ShieldCheck size={18} color={role === 'admin' ? '#7c3aed' : 'var(--neutral-600)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: role === 'admin' ? '#5b21b6' : 'var(--neutral-900)' }}>
                      Kepala Toko
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '2px' }}>
                      Akses penuh setara Super Admin
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Form Alert */}
        {errors.form && (
          <div style={styles.errorAlert}>
            <AlertCircle size={18} color="var(--red-600)" style={{ flexShrink: 0 }} />
            <span>{errors.form}</span>
          </div>
        )}

        {/* 1. Input: Nama Lengkap */}
        <Input
          label={role === 'admin' ? 'Nama Lengkap Kepala Toko' : 'Nama Lengkap Kasir'}
          placeholder={role === 'admin' ? 'Contoh: Budi Santoso (Kepala Toko)' : 'Contoh: Siti Rahma'}
          value={nama}
          onChange={(e) => {
            setNama(e.target.value);
            if (errors.nama) setErrors(prev => ({ ...prev, nama: '' }));
          }}
          error={errors.nama}
          required
          autoFocus
          icon={role === 'admin' ? ShieldCheck : User}
          helperText="Nama yang akan ditampilkan pada struk, riwayat audit, dan sistem POS."
        />

        {/* 2. Grid Baris: Username & Password */}
        <div style={styles.grid2}>
          {/* Username */}
          <Input
            label="Username Login"
            placeholder="Contoh: kasir1"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''));
              if (errors.username) setErrors(prev => ({ ...prev, username: '' }));
            }}
            error={errors.username}
            required
            icon={AtSign}
            helperText="Gunakan huruf kecil tanpa spasi."
          />

          {/* Password with Eye Button */}
          <div className="blue-input-group">
            <label className="blue-label">
              Kata Sandi {!isEdit && <span style={{ color: 'var(--red-500)' }}>*</span>}
            </label>
            <div className="blue-input-wrapper" style={{ position: 'relative' }}>
              <div className="blue-input-icon">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                }}
                placeholder={isEdit ? 'Kosongkan jika tidak ingin mengganti' : 'Masukkan kata sandi'}
                className={`blue-input with-icon ${errors.password ? 'has-error' : ''}`}
                style={{ paddingRight: '40px' }}
                required={!isEdit}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                tabIndex={-1}
                aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
              >
                {showPassword ? (
                  <EyeOff size={16} color="var(--neutral-500)" />
                ) : (
                  <Eye size={16} color="var(--neutral-500)" />
                )}
              </button>
            </div>
            {errors.password ? (
              <span className="text-xs text-danger font-medium" style={{ marginTop: '2px' }}>
                {errors.password}
              </span>
            ) : (
              <span className="text-xs text-secondary">Minimal 4 karakter.</span>
            )}
          </div>
        </div>

        {/* 3. Status Akun Kasir (Aktif / Nonaktif) */}
        <div style={styles.statusSection}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={styles.sectionLabel}>Status Akun Kasir</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '2px' }}>
              {isActive ? 'Akun aktif dan dapat masuk ke sistem POS' : 'Akun dinonaktifkan sementara (tidak bisa login)'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            style={{
              ...styles.statusToggleButton,
              backgroundColor: isActive ? 'var(--green-50)' : 'var(--neutral-100)',
              borderColor: isActive ? 'var(--green-200)' : 'var(--border-color)',
              color: isActive ? 'var(--green-700)' : 'var(--neutral-600)'
            }}
          >
            <div className={`form-mini-switch ${isActive ? 'mini-switch-on' : ''}`}>
              <div className="mini-switch-handle" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.813rem' }}>
              {isActive ? 'Akun Aktif' : 'Nonaktif'}
            </span>
          </button>
        </div>

        {/* 4. Section: Akses Cabang */}
        {role === 'kasir' && (
          <div style={styles.permissionSection}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={styles.sectionLabel}>Akses Cabang Toko</span>
                <p style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', margin: '2px 0 0 0' }}>
                  Pilih cabang yang bisa dipilih akun ini saat login ({branchIds.length} cabang aktif)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBranchIds((activeBranches || []).map(branch => branch.id))}
                style={styles.bulkBtn}
              >
                <CheckCheck size={13} />
                <span>Pilih Semua</span>
              </button>
            </div>

            {errors.branchIds && (
              <span className="text-xs text-danger font-medium" style={{ display: 'block', marginBottom: '8px' }}>
                {errors.branchIds}
              </span>
            )}

            <div style={styles.branchGrid}>
              {(activeBranches || []).map((branch) => {
                const isEnabled = branchIds.includes(branch.id);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => handleToggleBranch(branch.id)}
                    style={{
                      ...styles.branchCard,
                      borderColor: isEnabled ? 'var(--blue-400)' : 'var(--border-color)',
                      backgroundColor: isEnabled ? 'var(--blue-50)' : '#ffffff'
                    }}
                  >
                    <Store size={17} color={isEnabled ? 'var(--blue-600)' : 'var(--neutral-500)'} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={styles.branchName}>{branch.name}</span>
                      <span style={styles.branchCode}>{branch.code || branch.id}</span>
                    </span>
                    <span style={{
                      ...styles.branchCheck,
                      backgroundColor: isEnabled ? 'var(--blue-600)' : 'var(--neutral-200)'
                    }}>
                      {isEnabled && <Check size={12} color="#ffffff" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Section: Hak Akses Fitur Menu (Khusus Kasir) */}
        {role === 'kasir' && (
          <div style={styles.permissionSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={styles.sectionLabel}>Hak Akses Fitur Kasir</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', margin: '2px 0 0 0' }}>
                Aktifkan menu yang diizinkan untuk kasir ({permissions.length} dari {navFeatures.length} aktif)
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleSelectAll}
                style={styles.bulkBtn}
              >
                <CheckCheck size={13} />
                <span>Pilih Semua</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                style={styles.bulkBtn}
              >
                <XCircle size={13} />
                <span>Kosongkan</span>
              </button>
            </div>
          </div>

          {errors.permissions && (
            <span className="text-xs text-danger font-medium" style={{ display: 'block', marginBottom: '8px' }}>
              {errors.permissions}
            </span>
          )}

          {/* Cards Saklar Toggle Fitur */}
          <div style={styles.featuresStack}>
            {navFeatures.map((feat) => {
              const isEnabled = permissions.includes(feat.key);
              return (
                <div
                  key={feat.key}
                  onClick={() => handleTogglePermission(feat.key)}
                  style={{
                    ...styles.featureCard,
                    borderColor: isEnabled ? 'var(--blue-400)' : 'var(--border-color)',
                    backgroundColor: isEnabled ? 'var(--blue-50)' : 'var(--bg-surface)'
                  }}
                >
                  <div style={styles.featureIconBox}>
                    {getFeatureIcon(feat.key)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--neutral-900)' }}>
                        {feat.label}
                      </span>
                      <span style={{
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: isEnabled ? 'var(--blue-200)' : 'var(--neutral-150)',
                        color: isEnabled ? 'var(--blue-800)' : 'var(--neutral-600)'
                      }}>
                        {feat.group}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', margin: '3px 0 0 0', lineHeight: 1.3 }}>
                      {feat.description}
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.688rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isEnabled ? 'var(--blue-500)' : 'var(--neutral-200)',
                      color: isEnabled ? '#FFFFFF' : 'var(--neutral-500)'
                    }}>
                      {isEnabled ? 'ON' : 'OFF'}
                    </span>
                    <div className={`form-modal-switch ${isEnabled ? 'switch-checked' : ''}`}>
                      <div className="switch-knob" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </form>

      <style>{`
        .form-modal-switch {
          width: 38px;
          height: 22px;
          border-radius: 999px;
          background-color: var(--neutral-300);
          position: relative;
          transition: background-color var(--transition-fast);
        }
        .switch-knob {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: #FFFFFF;
          position: absolute;
          top: 3px;
          left: 3px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform var(--transition-fast);
        }
        .form-modal-switch.switch-checked {
          background-color: var(--blue-500) !important;
        }
        .form-modal-switch.switch-checked .switch-knob {
          transform: translateX(16px);
        }

        .form-mini-switch {
          width: 32px;
          height: 18px;
          border-radius: 999px;
          background-color: var(--neutral-300);
          position: relative;
          transition: background-color var(--transition-fast);
        }
        .mini-switch-handle {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background-color: #FFFFFF;
          position: absolute;
          top: 2px;
          left: 2px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          transition: transform var(--transition-fast);
        }
        .mini-switch-on {
          background-color: var(--green-500) !important;
        }
        .mini-switch-on .mini-switch-handle {
          transform: translateX(14px);
        }
      `}</style>
    </Modal>
  );
};

const styles = {
  roleCardsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  roleSelectCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border-color)',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all var(--transition-fast)'
  },
  roleIconWrapper: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  adminAccessBox: {
    padding: '16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: '#f5f3ff',
    border: '1.5px solid #ddd6fe'
  },
  infoCallout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    backgroundColor: 'var(--blue-50)',
    border: '1px solid var(--blue-200)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px'
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'var(--red-50)',
    border: '1px solid var(--red-200)',
    color: 'var(--red-600)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.813rem',
    fontWeight: 600
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px'
  },
  eyeBtn: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px'
  },
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--neutral-50)',
    border: '1px solid var(--border-subtle)'
  },
  sectionLabel: {
    fontSize: '0.813rem',
    fontWeight: 700,
    color: 'var(--neutral-800)'
  },
  statusToggleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)'
  },
  permissionSection: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: '4px'
  },
  featuresStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  featureCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all var(--transition-fast)'
  },
  featureIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#FFFFFF',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: 'var(--shadow-xs)'
  },
  branchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '8px'
  },
  branchCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all var(--transition-fast)'
  },
  branchName: {
    display: 'block',
    fontSize: '0.813rem',
    fontWeight: 800,
    color: 'var(--neutral-900)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  branchCode: {
    display: 'block',
    fontSize: '0.688rem',
    fontWeight: 700,
    color: 'var(--neutral-500)'
  },
  branchCheck: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  bulkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '0.688rem',
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: '#FFFFFF',
    color: 'var(--neutral-700)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)'
  }
};
