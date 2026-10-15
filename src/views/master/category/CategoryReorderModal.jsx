import React, { useState, useEffect } from 'react';
import { useCategory } from '../../../controllers/CategoryController';
import { useProductMenu } from '../../../controllers/ProductMenuController';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { 
  GripVertical, 
  ArrowUp, 
  ArrowDown, 
  Save, 
  RotateCcw, 
  Layers, 
  Sparkles,
  Check
} from 'lucide-react';

export const CategoryReorderModal = () => {
  const { 
    isReorderModalOpen, 
    closeReorderModal, 
    categories, 
    updateCategoryOrder 
  } = useCategory();

  const { productMenus = [] } = useProductMenu();

  // Local reorder list state while modal is open
  const [orderedItems, setOrderedItems] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isReorderModalOpen) {
      setOrderedItems([...categories]);
    }
  }, [isReorderModalOpen, categories]);

  if (!isReorderModalOpen) return null;

  // Move item to specific 1-indexed target position
  const handleMoveToPosition = (fromIndex, targetPos1Indexed) => {
    const toIndex = Math.max(0, Math.min(orderedItems.length - 1, targetPos1Indexed - 1));
    if (fromIndex === toIndex) return;

    const updated = [...orderedItems];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setOrderedItems(updated);
  };

  // Move item up (-1) or down (+1)
  const handleMoveDelta = (index, delta) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= orderedItems.length) return;

    const updated = [...orderedItems];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setOrderedItems(updated);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const updated = [...orderedItems];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, moved);
    setOrderedItems(updated);
    setDraggedIndex(null);
  };

  // Save changes to MySQL and Context
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const orderIds = orderedItems.map(c => c.id);
      await updateCategoryOrder(orderIds);
      closeReorderModal();
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to original order when opened
  const handleReset = () => {
    setOrderedItems([...categories]);
  };

  return (
    <Modal
      isOpen={isReorderModalOpen}
      onClose={closeReorderModal}
      title="Atur Urutan Kategori Menu"
      subtitle="Atur posisi dan nomor urut tab kategori yang tampil pada layar kasir POS."
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={handleReset}
            disabled={isSaving}
            title="Kembalikan ke urutan awal"
          >
            Reset
          </Button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              onClick={closeReorderModal}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              icon={isSaving ? undefined : Save}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Urutan'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Live Preview Card */}
        <div style={styles.previewContainer}>
          <div style={styles.previewHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="var(--blue-600)" />
              <span style={styles.previewTitle}>PRATINJAU TAB DI KASIR POS</span>
            </div>
            <span style={styles.previewHint}>Tampilan langsung sesuai urutan di bawah</span>
          </div>

          <div className="kasir-category-scroll" style={styles.previewPillScroll}>
            {/* Pill 'Semua' */}
            <div style={{ ...styles.previewPill, ...styles.previewPillActive }}>
              <Layers size={12} />
              <span>Semua ({productMenus.length})</span>
            </div>

            {/* Dynamic Category Pills */}
            {orderedItems.map((cat, idx) => {
              const count = productMenus.filter(m => m.categoryId === cat.id).length;
              return (
                <div key={cat.id} style={styles.previewPill}>
                  <span>{cat.name}</span>
                  <span style={styles.previewPillBadge}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instructions */}
        <div style={{ fontSize: '0.813rem', color: 'var(--neutral-600)', lineHeight: 1.4 }}>
          Pilih angka urutan langsung pada dropdown, gunakan tombol panah naik/turun, atau geser (drag) kartu kategori untuk memindahkan posisinya:
        </div>

        {/* Reorderable Items List */}
        <div style={styles.listContainer}>
          {orderedItems.map((cat, index) => {
            const count = productMenus.filter(m => m.categoryId === cat.id).length;
            const isDragging = draggedIndex === index;

            return (
              <div
                key={cat.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                style={{
                  ...styles.itemCard,
                  ...(isDragging ? styles.itemCardDragging : {})
                }}
              >
                {/* Left Grip & Position Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={styles.gripHandle} title="Tahan dan geser untuk memindahkan">
                    <GripVertical size={18} color="var(--neutral-400)" />
                  </div>

                  <span style={styles.positionBadge}>
                    #{index + 1}
                  </span>

                  <div>
                    <strong style={styles.itemName}>{cat.name}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={styles.itemCountBadge}>
                        {count} Produk
                      </span>
                      <span style={{ fontSize: '0.688rem', color: 'var(--neutral-400)' }}>
                        {cat.id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Reorder Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Direct Position Dropdown ("mindahin posisi ini urutan keberapa") */}
                  <div style={styles.posSelectWrapper}>
                    <span style={styles.posSelectLabel}>Urutan ke:</span>
                    <select
                      value={index + 1}
                      onChange={(e) => handleMoveToPosition(index, parseInt(e.target.value, 10))}
                      style={styles.posSelect}
                      title="Ubah urutan langsung ke posisi tertentu"
                    >
                      {orderedItems.map((_, pIdx) => (
                        <option key={pIdx + 1} value={pIdx + 1}>
                          {pIdx + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Move Up / Down Buttons */}
                  <div style={{ display: 'inline-flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleMoveDelta(index, -1)}
                      disabled={index === 0}
                      style={{
                        ...styles.arrowBtn,
                        opacity: index === 0 ? 0.35 : 1,
                        cursor: index === 0 ? 'not-allowed' : 'pointer'
                      }}
                      title="Geser Naik"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDelta(index, 1)}
                      disabled={index === orderedItems.length - 1}
                      style={{
                        ...styles.arrowBtn,
                        opacity: index === orderedItems.length - 1 ? 0.35 : 1,
                        cursor: index === orderedItems.length - 1 ? 'not-allowed' : 'pointer'
                      }}
                      title="Geser Turun"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

const styles = {
  previewContainer: {
    backgroundColor: 'var(--neutral-50)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '4px'
  },
  previewTitle: {
    fontSize: '0.688rem',
    fontWeight: 700,
    color: 'var(--blue-700)',
    letterSpacing: '0.5px'
  },
  previewHint: {
    fontSize: '0.688rem',
    color: 'var(--neutral-400)'
  },
  previewPillScroll: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '4px',
    scrollbarWidth: 'thin'
  },
  previewPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '8px',
    fontSize: '0.813rem',
    fontWeight: 600,
    backgroundColor: '#ffffff',
    color: 'var(--neutral-700)',
    border: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
  },
  previewPillActive: {
    backgroundColor: 'var(--blue-600)',
    color: '#ffffff',
    borderColor: 'var(--blue-600)'
  },
  previewPillBadge: {
    fontSize: '0.688rem',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: 'var(--neutral-200)',
    color: 'var(--neutral-600)'
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '360px',
    overflowY: 'auto',
    paddingRight: '4px'
  },
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    transition: 'all 0.15s ease',
    userSelect: 'none'
  },
  itemCardDragging: {
    backgroundColor: 'var(--blue-50)',
    borderColor: 'var(--blue-300)',
    opacity: 0.6
  },
  gripHandle: {
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    padding: '2px'
  },
  positionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    backgroundColor: 'var(--blue-50)',
    color: 'var(--blue-700)',
    fontWeight: 800,
    fontSize: '0.813rem',
    border: '1px solid var(--blue-200)'
  },
  itemName: {
    fontSize: '0.875rem',
    color: 'var(--neutral-900)'
  },
  itemCountBadge: {
    fontSize: '0.688rem',
    fontWeight: 600,
    color: 'var(--neutral-600)',
    backgroundColor: 'var(--neutral-100)',
    padding: '1px 6px',
    borderRadius: '4px'
  },
  posSelectWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'var(--neutral-50)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '2px 6px'
  },
  posSelectLabel: {
    fontSize: '0.688rem',
    color: 'var(--neutral-500)',
    fontWeight: 600
  },
  posSelect: {
    border: 'none',
    backgroundColor: 'transparent',
    fontWeight: 700,
    fontSize: '0.813rem',
    color: 'var(--blue-600)',
    cursor: 'pointer',
    outline: 'none',
    padding: '2px'
  },
  arrowBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: '#ffffff',
    color: 'var(--neutral-600)',
    transition: 'all 0.15s ease'
  }
};
