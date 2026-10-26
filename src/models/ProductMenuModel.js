export const INITIAL_PRODUCT_MENUS = [];
export const PRODUCT_MENU_STORAGE_KEY = 'master_product_menus';


/**
 * Memeriksa ketersediaan stok bahan baku untuk suatu menu.
 * Jika salah satu bahan baku yang digunakan memiliki stok <= 0 atau kurang dari takaran 1 porsi,
 * maka menu dianggap Habis / Out of Stock (tidak dapat dipesan).
 *
 * @param {Object} menu - Objek data menu produk
 * @param {Array} rawMaterials - Daftar data master bahan baku saat ini
 * @returns {Object} { isAvailable, maxPortions, emptyIngredients, reason }
 */
export const checkMenuAvailability = (menu, rawMaterials = []) => {
  if (!menu) {
    return { isAvailable: false, maxPortions: 0, emptyIngredients: [], reason: 'Data menu tidak valid' };
  }

  const ingredients = menu.ingredients || [];
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    // Menu tanpa resep bahan baku khusus dianggap selalu tersedia
    return { isAvailable: true, maxPortions: 9999, emptyIngredients: [], reason: '' };
  }

  const emptyIngredients = [];
  let minPortions = Infinity;

  for (const ing of ingredients) {
    const rawMat = rawMaterials.find(
      rm => rm.id === ing.rawMaterialId || 
            (rm.name && rm.name.trim().toLowerCase() === (ing.rawMaterialName || '').trim().toLowerCase())
    );

    const requiredQty = Number(ing.quantity) || 0;
    const currentStock = rawMat ? (Number(rawMat.stock || rawMat.currentStock) || 0) : 0;
    const matName = ing.rawMaterialName || rawMat?.name || 'Bahan Baku';
    const unitName = ing.unitName || rawMat?.unitName || 'Unit';

    if (!rawMat || currentStock <= 0 || (requiredQty > 0 && currentStock < requiredQty)) {
      emptyIngredients.push({
        rawMaterialId: ing.rawMaterialId,
        rawMaterialName: matName,
        requiredQuantity: requiredQty,
        currentStock: Math.max(0, currentStock),
        unitName
      });
      minPortions = 0;
    } else if (requiredQty > 0) {
      const possiblePortions = Math.floor(currentStock / requiredQty);
      if (possiblePortions < minPortions) {
        minPortions = possiblePortions;
      }
    }
  }

  const maxPortions = minPortions === Infinity ? 9999 : minPortions;
  const isAvailable = emptyIngredients.length === 0 && maxPortions > 0;

  return {
    isAvailable,
    maxPortions,
    emptyIngredients,
    reason: emptyIngredients.length > 0
      ? `Stok bahan baku tidak mencukupi / kosong: ${emptyIngredients.map(e => `${e.rawMaterialName} (Sisa: ${e.currentStock} ${e.unitName})`).join(', ')}`
      : ''
  };
};
