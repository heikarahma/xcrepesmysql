export const INITIAL_TOPPINGS = [];
export const TOPPING_STORAGE_KEY = 'master_toppings';


/**
 * Memeriksa ketersediaan stok bahan baku untuk suatu extra topping.
 * Jika salah satu bahan baku yang digunakan memiliki stok <= 0 atau kurang dari takaran resep topping,
 * maka topping dianggap Habis / Out of Stock (tidak dapat dipilih/dipesan).
 *
 * @param {Object} topping - Objek data topping
 * @param {Array} rawMaterials - Daftar data master bahan baku saat ini
 * @param {Array} masterToppings - Daftar master topping lengkap untuk resolusi resep
 * @returns {Object} { isAvailable, maxPortions, emptyIngredients, reason }
 */
export const checkToppingAvailability = (topping, rawMaterials = [], masterToppings = []) => {
  if (!topping) {
    return { isAvailable: false, maxPortions: 0, emptyIngredients: [], reason: 'Data topping tidak valid' };
  }

  // Ambil data topping lengkap dari masterToppings jika topping merupakan reference
  const fullTopping = (masterToppings && masterToppings.length > 0)
    ? (masterToppings.find(mt => mt.id === (topping.id || topping.toppingId)) || topping)
    : topping;

  const ingredients = fullTopping.ingredients || [];
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    // Topping tanpa resep bahan baku khusus dianggap selalu tersedia
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
      ? `Stok bahan baku topping habis / tidak mencukupi: ${emptyIngredients.map(e => `${e.rawMaterialName} (Sisa: ${e.currentStock} ${e.unitName})`).join(', ')}`
      : ''
  };
};
