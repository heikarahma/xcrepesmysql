import assert from 'node:assert/strict';

// Test calculateOrderDeductions logic
function calculateOrderDeductions(orderData, menus = [], toppings = []) {
  if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    return [];
  }

  const deductionsToApply = [];

  orderData.items.forEach(item => {
    const itemQty = Number(item.quantity) || 1;
    const matchedMenu = (menus || []).find(m => m.id === item.menuId);
    const menuIngredients = (matchedMenu && matchedMenu.ingredients) || (item.ingredients) || [];

    menuIngredients.forEach(ing => {
      const requiredQty = (Number(ing.quantity) || 0) * itemQty;
      if (requiredQty > 0 && ing.rawMaterialId) {
        deductionsToApply.push({
          rawMaterialId: ing.rawMaterialId,
          amount: requiredQty,
          item: { name: item.name, quantity: itemQty },
          isTopping: false,
          toppingName: null
        });
      }
    });

    if (Array.isArray(item.toppings)) {
      item.toppings.forEach(t => {
        const matchedTopping = (toppings || []).find(top => top.id === (t.id || t.toppingId));
        const toppingIngredients = (matchedTopping && matchedTopping.ingredients) || [];
        const toppingQty = Number(t.quantity) || 1;

        toppingIngredients.forEach(ting => {
          const requiredQty = (Number(ting.quantity) || 0) * toppingQty * itemQty;
          if (requiredQty > 0 && ting.rawMaterialId) {
            deductionsToApply.push({
              rawMaterialId: ting.rawMaterialId,
              amount: requiredQty,
              item: { name: item.name, quantity: itemQty },
              isTopping: true,
              toppingName: t.name || matchedTopping?.name || 'Extra Topping'
            });
          }
        });
      });
    }
  });

  return deductionsToApply;
}

// 1. Test empty order
assert.deepEqual(calculateOrderDeductions(null), []);
assert.deepEqual(calculateOrderDeductions({ items: [] }), []);

// 2. Test menu recipe deduction
const mockMenus = [
  {
    id: 'MENU-1',
    name: 'Crepe Choco Banana',
    ingredients: [
      { rawMaterialId: 'MAT-FLOUR', quantity: 0.1 },
      { rawMaterialId: 'MAT-CHOCO', quantity: 0.05 }
    ]
  }
];

const mockToppings = [
  {
    id: 'TOP-CHEESE',
    name: 'Extra Keju',
    ingredients: [
      { rawMaterialId: 'MAT-CHEESE', quantity: 0.03 }
    ]
  }
];

const mockOrder = {
  invoiceNumber: 'INV-001',
  items: [
    {
      menuId: 'MENU-1',
      name: 'Crepe Choco Banana',
      quantity: 2,
      toppings: [
        { id: 'TOP-CHEESE', quantity: 1 }
      ]
    }
  ]
};

const deductions = calculateOrderDeductions(mockOrder, mockMenus, mockToppings);
assert.equal(deductions.length, 3, 'Should have 3 deductions: 2 from recipe, 1 from topping');

const flourDed = deductions.find(d => d.rawMaterialId === 'MAT-FLOUR');
assert.ok(flourDed);
assert.equal(flourDed.amount, 0.2, 'Flour should be 0.1 * 2 = 0.2');

const chocoDed = deductions.find(d => d.rawMaterialId === 'MAT-CHOCO');
assert.ok(chocoDed);
assert.equal(chocoDed.amount, 0.1, 'Choco should be 0.05 * 2 = 0.1');

const cheeseDed = deductions.find(d => d.rawMaterialId === 'MAT-CHEESE');
assert.ok(cheeseDed);
assert.equal(cheeseDed.amount, 0.06, 'Cheese should be 0.03 * 1 * 2 = 0.06');
assert.equal(cheeseDed.isTopping, true);

console.log('All atomic checkout self-checks passed successfully!');
