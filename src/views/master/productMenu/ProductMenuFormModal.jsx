import React, { useState, useEffect, useRef } from 'react';
import { useProductMenu } from '../../../controllers/ProductMenuController';
import { useCategory } from '../../../controllers/CategoryController';
import { useRawMaterial } from '../../../controllers/RawMaterialController';
import { useTopping } from '../../../controllers/ToppingController';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { 
  Plus, X, UploadCloud, RefreshCw, Trash2, 
  Tag, ChevronDown, Package, Box, Coffee, Utensils,
  Image as ImageIcon, AlertCircle, Sparkles
} from 'lucide-react';
import { SearchSelect } from '../../components/SearchSelect';
import { InitialsAvatar } from '../../components/InitialsAvatar';
import { compressImageToWebP } from '../../../utils/imageCompression';

export const ProductMenuFormModal = () => {
  const { 
    formModalState, closeFormModal, addMenu, updateMenu
  } = useProductMenu();

  const { categories } = useCategory();
  const { rawMaterials } = useRawMaterial();
  const { toppings: availableToppings } = useTopping();

  const { isOpen, mode, item } = formModalState;

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [image, setImage] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [toppings, setToppings] = useState([]);
  const [price, setPrice] = useState('');
  const [promoType, setPromoType] = useState('none');
  const [promoAmount, setPromoAmount] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  // Draft states for new additions
  const [draftIngredientId, setDraftIngredientId] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('');
  
  const [draftToppingId, setDraftToppingId] = useState('');

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && item) {
        setName(item.name || '');
        setCategoryId(item.categoryId || '');
        setImage(item.image || '');
        setPrice(item.price || '');
        setPromoType(item.promoType || 'none');
        setPromoAmount(item.promoAmount || '');
        setIsActive(item.isActive !== false);
        setIngredients(item.ingredients && item.ingredients.length > 0 ? item.ingredients.map(ing => ({ ...ing })) : []);
        setToppings(item.toppings && item.toppings.length > 0 ? item.toppings.map(t => {
          const master = availableToppings.find(mt => mt.id === (t.toppingId || t.id));
          return {
            ...t,
            id: t.toppingId || t.id,
            toppingId: t.toppingId || t.id,
            name: t.toppingName || t.name || master?.name || '',
            toppingName: t.toppingName || t.name || master?.name || '',
            price: master ? master.price : (Number(t.price) || 0)
          };
        }) : []);
      } else {
        setName('');
        setCategoryId('');
        setImage('');
        setPrice('');
        setPromoType('none');
        setPromoAmount('');
        setIsActive(true);
        setIngredients([]);
        setToppings([]);
      }
      setDraftIngredientId('');
      setDraftQuantity('');
      setDraftToppingId('');
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, mode, item]);

  const calculateTotalCost = () => {
    return ingredients.reduce((total, ing) => {
      const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
      const pricePerUnit = mat ? mat.pricePerUnit : 0;
      const qty = Number(ing.quantity) || 0;
      return total + (pricePerUnit * qty);
    }, 0);
  };

  useEffect(() => {
    if (isOpen && ingredients.length > 0) {
      const rawCost = calculateTotalCost();
      const realCost = Math.round(rawCost * 1.25);
      if (price === '' || Number(price) < realCost) {
        setPrice(realCost > 0 ? realCost : '');
      }
    }
  }, [ingredients, isOpen, rawMaterials]);

  if (!isOpen) return null;

  const formatIDR = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(val || 0);
  };

  // ----------------------------------------------------
  // HANDLERS
  // ----------------------------------------------------
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, image: 'Format foto harus JPG, PNG, atau WEBP' }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, image: 'Ukuran foto sumber maksimal 8MB' }));
      return;
    }

    try {
      const compressed = await compressImageToWebP(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        maxBytes: 300 * 1024
      });
      setImage(compressed);
      setErrors(prev => ({ ...prev, image: null }));
    } catch (error) {
      setErrors(prev => ({ ...prev, image: error.message || 'Gagal mengompresi foto.' }));
    }
  };

  const handleRemoveImage = () => {
    setImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddIngredient = () => {
    if (!draftIngredientId) return;
    if (!draftQuantity || Number(draftQuantity) <= 0) return;
    
    // Prevent duplicate raw material
    if (ingredients.some(ing => ing.rawMaterialId === draftIngredientId)) {
      setDraftIngredientId('');
      return;
    }
    
    const selectedMat = rawMaterials.find(m => m.id === draftIngredientId);
    if (selectedMat) {
      setIngredients(prev => [...prev, {
        rawMaterialId: selectedMat.id,
        rawMaterialName: selectedMat.name,
        unitName: selectedMat.unitName,
        quantity: draftQuantity
      }]);
      setDraftIngredientId('');
      setDraftQuantity('');
      if (errors.ingredients) setErrors(prev => ({ ...prev, ingredients: '' }));
    }
  };

  const handleUpdateIngredientQuantity = (index, newQuantity) => {
    if (newQuantity && newQuantity.length > 3) return;
    setIngredients(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: newQuantity
      };
      return updated;
    });
  };

  const handleRemoveIngredient = (index) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTopping = () => {
    if (!draftToppingId) return;
    const selectedTop = availableToppings.find(t => t.id === draftToppingId);
    if (selectedTop) {
      // Prevent duplicates
      if (toppings.some(t => t.toppingId === selectedTop.id)) {
        setDraftToppingId('');
        return; 
      }
      setToppings(prev => [...prev, {
        id: selectedTop.id,
        toppingId: selectedTop.id,
        name: selectedTop.name,
        toppingName: selectedTop.name,
        price: Number(selectedTop.price) || 0
      }]);
      setDraftToppingId('');
    }
  };

  const handleRemoveTopping = (index) => {
    setToppings(prev => prev.filter((_, i) => i !== index));
  };

  const getCategoryIcon = (catName) => {
    const lower = catName.toLowerCase();
    if (lower.includes('minum')) return <Coffee size={14} />;
    if (lower.includes('makan')) return <Utensils size={14} />;
    if (lower.includes('snack') || lower.includes('camil')) return <Package size={14} />;
    return <Box size={14} />;
  };

  const validate = () => {
    const err = {};
    if (!name.trim()) err.name = 'Nama menu wajib diisi.';
    if (!categoryId) err.categoryId = 'Kategori wajib dipilih.';
    
    const rawCost = calculateTotalCost();
    const realCost = Math.round(rawCost * 1.25);
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      err.price = 'Harga jual tidak valid.';
    } else if (Number(price) < realCost) {
      err.price = `Harga jual tidak boleh di bawah total HPP real (${formatIDR(realCost)}).`;
    }

    if (!ingredients || ingredients.length === 0) {
      err.ingredients = 'Tambahkan minimal 1 bahan baku.';
    } 

    if (promoType !== 'none' && (!promoAmount || Number(promoAmount) <= 0)) {
      err.promoAmount = 'Nominal promo wajib diisi.';
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    
    const categoryName = categories.find(c => c.id === categoryId)?.name || '';

    const payload = {
      name,
      categoryId,
      categoryName,
      image,
      ingredients,
      toppings,
      price: Number(price),
      promoType,
      promoAmount: Number(promoAmount) || 0,
      isActive
    };

    let result;
    try {
      if (mode === 'edit' && item) {
        result = await updateMenu(item.id, payload);
      } else {
        result = await addMenu(payload);
      }
    } catch (err) {
      result = { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }

    if (result && result.success) {
      setName('');
      setCategoryId('');
      setImage('');
      setPrice('');
      setPromoType('none');
      setPromoAmount('');
      setIsActive(true);
      setIngredients([]);
      setToppings([]);
      setDraftIngredientId('');
      setDraftQuantity('');
      setDraftToppingId('');
      setErrors({});
      if (fileInputRef.current) fileInputRef.current.value = '';
      closeFormModal();
    } else {
      setErrors(prev => ({ ...prev, form: result?.error || 'Gagal menyimpan menu produk.' }));
    }
  };

  const handleClose = () => {
    setName('');
    setCategoryId('');
    setImage('');
    setPrice('');
    setPromoType('none');
    setPromoAmount('');
    setIsActive(true);
    setIngredients([]);
    setToppings([]);
    setDraftIngredientId('');
    setDraftQuantity('');
    setDraftToppingId('');
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    closeFormModal();
  };

  const isEdit = mode === 'edit';
  const totalCost = calculateTotalCost();
  const overcost = Math.round(totalCost * 0.25);
  const totalHppReal = totalCost + overcost;
  const availableRawMaterials = rawMaterials.filter(
    m => !ingredients.some(ing => ing.rawMaterialId === m.id)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Menu' : 'Tambah Menu Baru'}
      size="lg"
    >
      <form onSubmit={handleSubmit} style={styles.formContainer}>

        {errors.form && <div style={styles.errorAlert}>{errors.form}</div>}

        {/* NAMA MENU */}
        <div style={styles.section}>
          <label style={styles.label}>NAMA MENU</label>
          <input
            type="text"
            className={`blue-input ${errors.name ? 'has-error' : ''}`}
            placeholder="Ayam Crispy Sambal Bawang"
            value={name}
            onChange={(e) => { setName(e.target.value); if(errors.name) setErrors(prev => ({ ...prev, name: '' })); }}
            autoFocus
            style={styles.fullInput}
          />
        </div>

        {/* KATEGORI MENU */}
        <div style={{ ...styles.section, position: 'relative', zIndex: 40 }}>
          <label style={styles.label}>
            <Tag size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> KATEGORI MENU <span style={{ color: 'var(--red-500)' }}>*</span>
          </label>
          <SearchSelect
            options={categories.map(c => ({
              value: c.id,
              label: c.name,
              icon: getCategoryIcon(c.name)
            }))}
            value={categoryId}
            onChange={(val) => {
              setCategoryId(val);
              if (errors.categoryId) setErrors(prev => ({ ...prev, categoryId: '' }));
            }}
            placeholder="Pilih atau cari kategori menu..."
            searchPlaceholder="Ketik nama kategori..."
            icon={Tag}
            error={Boolean(errors.categoryId)}
          />
          {errors.categoryId && <span style={styles.errorText}>{errors.categoryId}</span>}
        </div>

        {isEdit && (
          <label style={styles.statusToggle}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              style={styles.statusInput}
            />
            <span style={{
              ...styles.statusSwitch,
              backgroundColor: isActive ? 'var(--blue-600)' : 'var(--neutral-300)'
            }}>
              <span style={{
                ...styles.statusSwitchKnob,
                transform: isActive ? 'translateX(20px)' : 'translateX(0)'
              }} />
            </span>
            <span style={styles.statusCopy}>
              <strong>{isActive ? 'Aktif di Kasir' : 'Nonaktif'}</strong>
              <span style={styles.statusHelp}>
                {isActive ? 'Menu tampil dan bisa dipilih saat transaksi.' : 'Menu disembunyikan dari kasir, tapi data tetap aman untuk laporan.'}
              </span>
            </span>
          </label>
        )}

        {/* FOTO MENU */}
        <div style={{ ...styles.section, position: 'relative', zIndex: 35 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...styles.label, marginBottom: 0 }}>
              <ImageIcon size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> FOTO MENU
            </label>
            {image && (
              <span style={{ fontSize: '0.75rem', color: 'var(--emerald-600)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                ✓ Foto Terpasang
              </span>
            )}
          </div>
          <div style={styles.photoContainer}>
            {image ? (
              <div style={styles.photoContent}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img src={image} alt="Preview" style={styles.photoThumbnail} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--neutral-900)' }}>Foto Siap Digunakan</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>Telah dioptimasi untuk performa cepat & responsif.</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button type="button" variant="outline" size="sm" icon={RefreshCw} onClick={() => fileInputRef.current?.click()}>
                      Ganti Foto
                    </Button>
                    <Button type="button" variant="outline" size="sm" icon={Trash2} onClick={handleRemoveImage} style={{ color: 'var(--red-600)', borderColor: 'var(--red-200)' }}>
                      Hapus
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                style={styles.photoEmptyUpload}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={styles.uploadIconCircle}>
                    <UploadCloud size={24} color="var(--blue-600)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                      Upload Foto Menu
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', marginTop: '2px' }}>
                      Format JPG, JPEG, PNG (Maksimal 2MB)
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={styles.uploadTriggerBtn}
                  >
                    <UploadCloud size={16} />
                    <span>Pilih File</span>
                  </button>
                </div>
              </div>
            )}
            <input type="file" accept=".jpg,.jpeg,.png" ref={fileInputRef} onChange={handleImageChange} style={{ display: 'none' }} />
          </div>
          {errors.image && <span style={styles.errorText}>{errors.image}</span>}
        </div>

        {/* KOMPOSISI RESEP BAHAN BAKU */}
        <div style={{ ...styles.section, position: 'relative', zIndex: 30 }}>
          <label style={{ ...styles.label, marginBottom: '8px' }}>
            <Package size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> KOMPOSISI RESEP BAHAN BAKU <span style={{ color: 'var(--red-500)' }}>*</span>
          </label>
          <div style={styles.tableBox}>
            {/* Add Bar */}
            <div style={{
              ...styles.addBar,
              borderTopLeftRadius: '11px',
              borderTopRightRadius: '11px',
              borderBottomLeftRadius: ingredients.length === 0 ? '11px' : 0,
              borderBottomRightRadius: ingredients.length === 0 ? '11px' : 0,
              borderBottom: ingredients.length === 0 ? 'none' : '1px solid var(--border-color)'
            }}>
              <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                <SearchSelect
                  options={availableRawMaterials.map(m => ({
                    value: m.id,
                    label: m.name,
                    sublabel: `${formatIDR(m.pricePerUnit)} / ${m.unitName}`,
                    badge: 'Bahan Baku'
                  }))}
                  value={draftIngredientId}
                  onChange={(val) => setDraftIngredientId(val)}
                  placeholder={availableRawMaterials.length === 0 ? "Semua bahan baku sudah ditambahkan" : "Pilih atau cari bahan baku..."}
                  searchPlaceholder="Ketik nama bahan baku..."
                  icon={Package}
                  disabled={availableRawMaterials.length === 0}
                  emptyText="Semua bahan baku sudah dimasukkan"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '68px', flexShrink: 0 }}>
                  <input
                    type="number"
                    className="blue-input"
                    value={draftQuantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.length <= 3) {
                        setDraftQuantity(val);
                      }
                    }}
                    placeholder="Jml"
                    min="1"
                    max="999"
                    disabled={availableRawMaterials.length === 0}
                    style={{ width: '100%', height: '42px', fontSize: '0.875rem', textAlign: 'center', padding: '0 4px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddIngredient();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddIngredient}
                  disabled={!draftIngredientId || !draftQuantity || Number(draftQuantity) <= 0}
                  title="Tambah Bahan Baku"
                  aria-label="Tambah Bahan Baku"
                  style={{
                    ...styles.iconAddBtn,
                    opacity: (draftIngredientId && draftQuantity && Number(draftQuantity) > 0) ? 1 : 0.5,
                    cursor: (draftIngredientId && draftQuantity && Number(draftQuantity) > 0) ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            {/* Error missing ingredients */}
            {errors.ingredients && (
              <div style={styles.inlineError}><AlertCircle size={14} />{errors.ingredients}</div>
            )}

            {/* List Table */}
            {ingredients.length > 0 && (
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <div style={{ flex: 2 }}>BAHAN BAKU</div>
                  <div style={{ flex: 1 }}>TAKARAN</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>ESTIMASI MODAL</div>
                  <div style={{ width: '32px' }}></div>
                </div>
                {ingredients.map((ing, index) => {
                  const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
                  const subTotal = (mat ? mat.pricePerUnit : 0) * (Number(ing.quantity) || 0);
                  return (
                    <div key={index} style={styles.tableRow}>
                      <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.875rem' }}>
                          {ing.rawMaterialName}
                        </span>
                        {mat && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
                            {formatIDR(mat.pricePerUnit)} / {ing.unitName}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          className="blue-input"
                          value={ing.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.length <= 3) {
                              handleUpdateIngredientQuantity(index, val);
                            }
                          }}
                          min="1"
                          max="999"
                          style={{
                            width: '60px',
                            height: '34px',
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            padding: '0 4px',
                            borderRadius: '6px'
                          }}
                        />
                        <span style={{ color: 'var(--neutral-600)', fontSize: '0.813rem', fontWeight: 500 }}>
                          {ing.unitName}
                        </span>
                      </div>
                      <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.875rem' }}>
                        {formatIDR(subTotal)}
                      </div>
                      <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => handleRemoveIngredient(index)} style={styles.removeIconCircle} title="Hapus bahan">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                
                {/* HPP Summary */}
                <div style={styles.hppSummary}>
                  <div style={styles.hppRow}>
                    <span style={styles.hppLabel}>Estimasi Modal Bahan (HPP Murni):</span>
                    <span style={styles.hppValueBlack}>{formatIDR(totalCost)}</span>
                  </div>
                  <div style={styles.hppRow}>
                    <span style={{...styles.hppLabel, display: 'flex', alignItems: 'center', gap: '8px'}}>Biaya Overcost / Operasional: <span style={styles.overcostBadge}>25%</span></span>
                    <span style={styles.hppValueOrange}>+{formatIDR(overcost)}</span>
                  </div>
                  <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
                  <div style={{...styles.hppRow, marginTop: '4px'}}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--neutral-900)' }}>Total HPP Real (Bahan + Overcost):</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--red-600)' }}>{formatIDR(totalHppReal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PILIHAN TOPPING MENU */}
        <div style={{ ...styles.section, position: 'relative', zIndex: 20 }}>
          <label style={{...styles.label, marginBottom: '8px'}}><Sparkles size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> PILIHAN TOPPING (OPSIONAL)</label>
          <div style={styles.tableBox}>
            <div style={{
              ...styles.addBar,
              borderTopLeftRadius: '11px',
              borderTopRightRadius: '11px',
              borderBottomLeftRadius: toppings.length === 0 ? '11px' : 0,
              borderBottomRightRadius: toppings.length === 0 ? '11px' : 0,
              borderBottom: toppings.length === 0 ? 'none' : '1px solid var(--border-color)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SearchSelect
                  options={availableToppings
                    .filter(t => !toppings.some(existing => existing.toppingId === t.id))
                    .map(t => ({
                      value: t.id,
                      label: t.name,
                      sublabel: `+${formatIDR(t.price)}`,
                      badge: 'Topping'
                    }))}
                  value={draftToppingId}
                  onChange={(val) => setDraftToppingId(val)}
                  placeholder="Pilih atau cari topping..."
                  searchPlaceholder="Ketik nama topping..."
                  icon={Sparkles}
                />
              </div>
              <button 
                type="button" 
                onClick={handleAddTopping}
                disabled={!draftToppingId}
                title="Tambah Topping"
                aria-label="Tambah Topping"
                style={{
                  ...styles.iconAddBtn,
                  opacity: draftToppingId ? 1 : 0.5,
                  cursor: draftToppingId ? 'pointer' : 'not-allowed'
                }}
              >
                <Plus size={20} />
              </button>
            </div>

            {toppings.length > 0 && (
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <div style={{ flex: 2 }}>NAMA TOPPING</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>HARGA TOPPING</div>
                  <div style={{ width: '32px' }}></div>
                </div>
                {toppings.map((top, index) => (
                  <div 
                    key={index} 
                    style={{
                      ...styles.tableRow,
                      borderBottomLeftRadius: index === toppings.length - 1 ? '11px' : 0,
                      borderBottomRightRadius: index === toppings.length - 1 ? '11px' : 0,
                      borderBottom: index === toppings.length - 1 ? 'none' : '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ flex: 2, fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.875rem' }}>
                      {top.toppingName}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: 'var(--blue-600)', fontSize: '0.875rem' }}>
                      +{formatIDR(top.price || availableToppings.find(at => at.id === (top.toppingId || top.id))?.price || 0)}
                    </div>
                    <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => handleRemoveTopping(index)} style={styles.removeIconCircle} title="Hapus topping">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* HARGA JUAL DASAR */}
        <div style={{ ...styles.section, position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{...styles.label, marginBottom: 0}}>HARGA JUAL DASAR <span style={{ color: 'var(--red-500)' }}>*</span></label>
            <span style={styles.marginBadge}>SARAN MARGIN 50%: {formatIDR(Math.round(totalHppReal * 1.5))}</span>
          </div>
          <div style={{ position: 'relative', display: 'flex' }}>
            <span style={styles.prefixLg}>Rp</span>
            <input
              type="number" className={`blue-input ${errors.price ? 'has-error' : ''}`}
              value={price}
              onChange={(e) => { setPrice(e.target.value); if(errors.price) setErrors(prev => ({...prev, price: ''})); }}
              style={styles.fullInputLg}
              min={totalHppReal} placeholder="32000"
            />
          </div>
          {errors.price && <span style={styles.errorText}>{errors.price}</span>}
        </div>

        {/* TIPE PROMO & DISKON */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', position: 'relative', zIndex: 20 }}>
          <div style={styles.section}>
            <label style={styles.label}>TIPE PROMO</label>
            <SearchSelect
              options={[
                { value: 'none', label: 'Tanpa Promo' },
                { value: 'discount', label: 'Diskon Nominal' },
                { value: 'buy2_discount', label: 'Beli 2 Potongan' }
              ]}
              value={promoType}
              onChange={(val) => {
                setPromoType(val);
                if (val === 'none') setPromoAmount('');
              }}
              placeholder="Pilih tipe promo..."
              searchPlaceholder="Cari tipe promo..."
              clearable={false}
            />
          </div>
          
          <div style={styles.section}>
            <label style={styles.label}>POTONGAN DISKON</label>
            <div style={{ position: 'relative', display: 'flex' }}>
              <span style={{...styles.prefix, height: '44px', opacity: promoType === 'none' ? 0.5 : 1}}>Rp</span>
              <input
                type="number" className="blue-input"
                value={promoAmount}
                onChange={(e) => setPromoAmount(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px', height: '44px' }}
                min="0" placeholder="0"
                disabled={promoType === 'none'}
              />
            </div>
            {errors.promoAmount && <span style={styles.errorText}>{errors.promoAmount}</span>}
          </div>
        </div>

        {/* FOOTER BUTTONS */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <Button 
            variant="primary" 
            onClick={handleSubmit} 
            disabled={isSubmitting || !name.trim()}
            style={{ flex: 1, minWidth: '140px', padding: '12px 0', fontSize: '0.938rem', borderRadius: '8px' }}
          >
            {isSubmitting ? 'Menyimpan...' : (isEdit ? 'Simpan Perubahan' : 'Tambah Menu')}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleClose} 
            disabled={isSubmitting}
            style={{ flex: 1, minWidth: '100px', padding: '12px 0', fontSize: '0.938rem', borderRadius: '8px', color: 'var(--blue-600)', borderColor: 'var(--blue-600)' }}
          >
            Batal
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const styles = {
  formContainer: { display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 0 16px 0', boxSizing: 'border-box' },
  header: { borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '8px' },
  section: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-500)', marginBottom: '8px', letterSpacing: '0.5px' },
  fullInput: { width: '100%', height: '44px', fontSize: '1rem' },
  fullInputLg: { width: '100%', height: '52px', fontSize: '1.25rem', fontWeight: 700, paddingLeft: '56px' },
  errorText: { fontSize: '0.75rem', color: 'var(--red-500)', marginTop: '4px' },
  errorAlert: { padding: '10px 14px', backgroundColor: 'var(--red-50)', color: 'var(--red-600)', borderRadius: '6px', fontSize: '0.813rem', fontWeight: 500 },
  inlineError: { padding: '8px 12px', backgroundColor: 'var(--red-50)', color: 'var(--red-600)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 16px 16px 16px', borderRadius: '4px' },
  statusToggle: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--neutral-50)', fontSize: '0.813rem', color: 'var(--neutral-700)', cursor: 'pointer' },
  statusInput: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
  statusSwitch: { width: '46px', height: '26px', borderRadius: '999px', padding: '2px', boxSizing: 'border-box', transition: 'background-color 0.18s ease', flexShrink: 0 },
  statusSwitchKnob: { display: 'block', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.25)', transition: 'transform 0.18s ease' },
  statusCopy: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  statusHelp: { color: 'var(--neutral-500)', fontWeight: 500 },
  
  // Category Pills
  categoryPills: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  pill: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', border: '1px solid' },
  pillActive: { backgroundColor: 'var(--blue-50)', borderColor: 'var(--blue-500)', color: 'var(--blue-700)' },
  pillInactive: { backgroundColor: '#fff', borderColor: 'var(--border-color)', color: 'var(--neutral-600)' },

  // Photo
  photoContainer: { border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' },
  photoContent: { padding: '16px' },
  photoThumbnail: { width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' },
  photoEmptyUpload: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--neutral-50)',
    cursor: 'pointer',
    flexWrap: 'wrap',
    gap: '16px',
    transition: 'background-color 0.2s',
    boxSizing: 'border-box'
  },
  uploadIconCircle: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    backgroundColor: 'var(--blue-50)',
    border: '1px solid var(--blue-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  uploadTriggerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '0.813rem',
    fontWeight: 600,
    color: 'var(--blue-600)',
    backgroundColor: '#ffffff',
    border: '1px solid var(--blue-200)',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.15s'
  },

  // Table Box & Add Bar
  tableBox: { 
    border: '1px solid var(--border-color)', 
    borderRadius: '12px', 
    backgroundColor: 'var(--neutral-50)', 
    position: 'relative',
    overflow: 'visible',
    boxSizing: 'border-box'
  },
  addBar: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: '10px', 
    flexWrap: 'wrap',
    padding: '14px 16px', 
    backgroundColor: '#fff', 
    borderBottom: '1px solid var(--border-color)',
    position: 'relative',
    boxSizing: 'border-box'
  },
  iconAddBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '8px',
    backgroundColor: 'var(--blue-600)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    transition: 'all 0.15s ease',
    flexShrink: 0
  },
  
  table: { display: 'flex', flexDirection: 'column', overflowX: 'auto', boxSizing: 'border-box' },
  tableHeader: { display: 'flex', minWidth: '320px', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-500)', borderBottom: '1px solid var(--border-color)' },
  tableRow: { display: 'flex', minWidth: '320px', padding: '12px 16px', alignItems: 'center', borderBottom: '1px solid var(--border-color)', backgroundColor: '#fff' },
  removeIconCircle: { width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--red-200)', color: 'var(--red-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s ease' },
  
  // HPP Summary
  hppSummary: { padding: '16px', backgroundColor: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '6px', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' },
  hppRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hppLabel: { fontSize: '0.75rem', color: 'var(--neutral-600)', fontWeight: 500 },
  hppValueBlack: { fontSize: '0.875rem', color: 'var(--neutral-900)', fontWeight: 700 },
  hppValueOrange: { fontSize: '0.875rem', color: 'var(--amber-600)', fontWeight: 700 },
  overcostBadge: { padding: '2px 6px', backgroundColor: 'var(--amber-50)', color: 'var(--amber-700)', borderRadius: '4px', fontSize: '0.688rem', fontWeight: 700 },

  // Select & Inputs
  nativeSelect: { width: '100%', height: '44px', appearance: 'none', paddingRight: '32px', cursor: 'pointer', backgroundColor: '#fff' },
  selectChevron: { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  suffix: { position: 'absolute', right: '1px', top: '1px', bottom: '1px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--neutral-50)', borderLeft: '1px solid var(--border-color)', borderTopRightRadius: '5px', borderBottomRightRadius: '5px', fontSize: '0.875rem', color: 'var(--neutral-600)', fontWeight: 600 },
  prefix: { position: 'absolute', left: '1px', top: '1px', bottom: '1px', width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--neutral-50)', borderRight: '1px solid var(--border-color)', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px', fontSize: '0.875rem', color: 'var(--neutral-600)', fontWeight: 700 },
  prefixLg: { position: 'absolute', left: '1px', top: '1px', bottom: '1px', width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--neutral-50)', borderRight: '1px solid var(--border-color)', borderTopLeftRadius: '5px', borderBottomLeftRadius: '5px', fontSize: '1rem', color: 'var(--neutral-600)', fontWeight: 700 },
  
  marginBadge: { padding: '4px 8px', backgroundColor: 'var(--emerald-50)', color: 'var(--emerald-700)', borderRadius: '4px', fontSize: '0.688rem', fontWeight: 800 }
};
