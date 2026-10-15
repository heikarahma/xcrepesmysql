import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ordersService } from '../services/ordersService';
import { subscribeToTable } from '../lib/database';
import { 
  DEFAULT_DISCOUNT_PRESETS,
  calculateItemDiscount,
  checkMenuAvailability,
  checkToppingAvailability
} from '../models';
import { useRawMaterial } from './RawMaterialController';
import { useProductMenu } from './ProductMenuController';
import { useTopping } from './ToppingController';
import { useUnit } from './UnitController';
import { useAuth } from './AuthController';
import { useSettings } from './SettingsController';

const OrderContext = createContext();

export const useOrder = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
};

export const useOrderController = useOrder;

export const OrderProvider = ({ children }) => {
  const { 
    rawMaterials = [], 
    deductMaterialsForOrder, 
    restoreMaterialsForOrder, 
    recordOrderReturnLog,
    deductMaterialsForRemake,
    recordOrderRefundLog
  } = useRawMaterial();
  const { productMenus } = useProductMenu();
  const { toppings } = useTopping();
  const { showToast } = useUnit();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const activeBranchId = currentUser?.activeBranchId || 'BR-DEFAULT';

  // 1. Cloud Database State via MySQL (Historical Completed Orders)
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Active Register Local Cart Items State (Maintained on active cashier device)
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(`pos_cart_${activeBranchId}`);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(item => {
        const itemDiscountType = item.itemDiscountType || 'none';
        const itemDiscountValue = Number(item.itemDiscountValue) || 0;
        const itemDiscountAmount = calculateItemDiscount(item.unitPrice, item.quantity, itemDiscountType, itemDiscountValue);
        return {
          ...item,
          toppings: Array.isArray(item.toppings) ? item.toppings.map(t => ({
            ...t,
            quantity: Math.max(1, Number(t.quantity) || 1)
          })) : [],
          itemDiscountType,
          itemDiscountValue,
          itemDiscountAmount
        };
      });
    } catch {
      return [];
    }
  });

  // Customer / Table info for active cart (Order type: 'Dine In' | 'Takeaway')
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('Dine In');

  // Order-level Discount State (Nominal vs Persentase)
  const [orderDiscountType, setOrderDiscountType] = useState('fixed'); // 'fixed' (Rp) | 'percent' (%)
  const [orderDiscountValue, setOrderDiscountValue] = useState(0);
  const [selectedDiscountPreset, setSelectedDiscountPreset] = useState(null);

  // Modals state
  const [toppingModalState, setToppingModalState] = useState({
    isOpen: false,
    menu: null,
    cartItem: null
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Order Return Modal State
  const [orderReturnModalState, setOrderReturnModalState] = useState({
    isOpen: false,
    order: null
  });

  // Order Cancel Modal State (Super Admin)
  const [orderCancelModalState, setOrderCancelModalState] = useState({
    isOpen: false,
    order: null
  });

  // Order Revision Modal State (Edit Pesanan Terdaftar)
  const [orderRevisionModalState, setOrderRevisionModalState] = useState({
    isOpen: false,
    order: null
  });

  // Sync active cart with local device storage
  useEffect(() => {
    try {
      localStorage.setItem(`pos_cart_${activeBranchId}`, JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save pos_cart to localStorage', e);
    }
  }, [cart, activeBranchId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`pos_cart_${activeBranchId}`);
      if (!saved) {
        setCart([]);
        return;
      }
      const parsed = JSON.parse(saved);
      setCart(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCart([]);
    }
  }, [activeBranchId]);

  // Fetch Orders from MySQL
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await ordersService.getOrdersPage({
        branchId: activeBranchId,
        page: 1,
        pageSize: 50
      });
      if (fetchErr) {
        setError(fetchErr.message || 'Gagal memuat transaksi pesanan dari cloud.');
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  const fetchAllOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await ordersService.getOrders(activeBranchId);
      if (fetchErr) {
        setError(fetchErr.message || 'Gagal memuat transaksi pesanan dari cloud.');
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch all orders:', err);
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId]);

  const fetchOrdersPage = useCallback(async ({ page = 1, pageSize = 10, filters = {} } = {}) => {
    return ordersService.getOrdersPage({
      branchId: activeBranchId,
      page,
      pageSize,
      filters
    });
  }, [activeBranchId]);

  const upsertOrderInState = useCallback((order) => {
    if (!order || order.branchId !== activeBranchId) return;

    setOrders(prev => {
      const exists = prev.some(item => item.id === order.id);
      const next = exists
        ? prev.map(item => item.id === order.id ? order : item)
        : [order, ...prev];

      return next.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    });
  }, [activeBranchId]);

  const handleOrderRealtimeChange = useCallback(async (payload) => {
    const eventType = payload?.eventType;
    if (eventType === 'POLL') {
      await fetchOrders();
      return;
    }
    const newRow = payload?.new;
    const oldRow = payload?.old;
    const rowBranchId = newRow?.branch_id || oldRow?.branch_id || activeBranchId;

    if (rowBranchId && rowBranchId !== activeBranchId) return;

    if (eventType === 'DELETE') {
      const deletedId = oldRow?.id;
      if (deletedId) {
        setOrders(prev => prev.filter(order => order.id !== deletedId));
      }
      return;
    }

    const targetId = newRow?.id;
    if (!targetId) return;

    const { data, error: fetchErr } = await ordersService.getOrderById(targetId);
    if (fetchErr) {
      console.error('Failed to sync realtime order:', fetchErr);
      return;
    }

    if (data) {
      upsertOrderInState(data);
    }
  }, [activeBranchId, fetchOrders, upsertOrderInState]);

  const resolveOrderForAction = useCallback(async (orderId) => {
    const localOrder = orders.find(o => o.id === orderId || o.invoiceNumber === orderId);
    if (localOrder) return localOrder;

    const { data, error: fetchErr } = await ordersService.getOrderById(orderId);
    if (fetchErr) {
      console.error('Failed to fetch order for action:', fetchErr);
      return null;
    }

    if (data) {
      upsertOrderInState(data);
    }

    return data || null;
  }, [orders, upsertOrderInState]);

  // Initial fetch and Realtime sync
  useEffect(() => {
    fetchOrders();

    const channel = subscribeToTable('orders', handleOrderRealtimeChange);

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [fetchOrders, handleOrderRealtimeChange]);

  // Helper to generate unique key matching menu + sorted toppings (including topping quantities)
  const getCartItemKey = (menuId, toppings = []) => {
    const toppingDescriptors = (Array.isArray(toppings) ? toppings : [])
      .map(t => `${t.id || t.toppingId}_x${t.quantity || 1}`)
      .filter(Boolean)
      .sort()
      .join('-');
    return `${menuId}__${toppingDescriptors}`;
  };

  // Add Item to Cart
  const addToCart = ({ menu, selectedToppings = [], quantity: customQty = 1, note = '', itemDiscountType: initDiscType = 'none', itemDiscountValue: initDiscVal = 0 } = {}) => {
    const availability = checkMenuAvailability(menu, rawMaterials);
    if (!availability.isAvailable) {
      showToast(`Menu "${menu.name}" tidak dapat dipesan: ${availability.reason}`, 'error', 'Stok Habis');
      return { success: false, reason: availability.reason };
    }

    if (Array.isArray(selectedToppings) && selectedToppings.length > 0) {
      for (const t of selectedToppings) {
        const topAvail = checkToppingAvailability(t, rawMaterials, toppings);
        if (!topAvail.isAvailable) {
          showToast(`Topping "${t.name}" tidak dapat dipilih: ${topAvail.reason}`, 'error', 'Topping Habis');
          return { success: false, reason: topAvail.reason };
        }
      }
    }

    const sanitizedToppings = (Array.isArray(selectedToppings) ? selectedToppings : []).map(t => ({
      ...t,
      quantity: Math.max(1, Number(t.quantity) || 1),
      showOnReceipt: t.showOnReceipt !== false
    }));
    const toppingsCost = sanitizedToppings.reduce((sum, t) => sum + ((Number(t.price) || 0) * (Number(t.quantity) || 1)), 0);
    const unitPrice = Number(menu.price) + toppingsCost;
    const itemKey = getCartItemKey(menu.id, sanitizedToppings);

    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.itemKey === itemKey);

      if (existingIndex > -1) {
        return prev.map((item, index) => {
          if (index === existingIndex) {
            const newQty = item.quantity + customQty;
            const newDiscAmt = calculateItemDiscount(
              item.unitPrice, 
              newQty, 
              item.itemDiscountType || 'none', 
              item.itemDiscountValue || 0
            );
            return {
              ...item,
              quantity: newQty,
              note: note ? note.trim() : item.note,
              itemDiscountAmount: newDiscAmt
            };
          }
          return item;
        });
      }

      const cartItemId = `CART-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const discType = initDiscType || 'none';
      const discVal = Math.max(0, Number(initDiscVal) || 0);
      const initialDiscAmt = calculateItemDiscount(unitPrice, customQty, discType, discVal);
      const newCartItem = {
        cartItemId,
        itemKey,
        menuId: menu.id,
        name: menu.name,
        image: menu.image,
        categoryName: menu.categoryName,
        basePrice: Number(menu.price),
        toppings: sanitizedToppings,
        toppingsCost,
        toppingsTotal: toppingsCost,
        unitPrice,
        quantity: customQty,
        note: note ? note.trim() : '',
        itemDiscountType: discType,
        itemDiscountValue: discVal,
        itemDiscountAmount: initialDiscAmt
      };

      return [newCartItem, ...prev];
    });

    return { success: true };
  };

  // Update Cart Item
  const updateCartItem = ({ cartItemId, menu: updatedMenu, selectedToppings = [], quantity = null, note = '', itemDiscountType: newDiscType, itemDiscountValue: newDiscVal, discountInfo } = {}) => {
    setCart(prev => {
      const targetItem = prev.find(item => item.cartItemId === cartItemId);
      if (!targetItem) return prev;

      const matchedMenu = updatedMenu ||
        (productMenus || []).find(m => m.id === targetItem.menuId) || {
          id: targetItem.menuId,
          name: targetItem.name,
          price: targetItem.basePrice
        };

      const sanitizedToppings = (Array.isArray(selectedToppings) ? selectedToppings : []).map(t => ({
        ...t,
        quantity: Math.max(1, Number(t.quantity) || 1),
        showOnReceipt: t.showOnReceipt !== false
      }));
      const toppingsCost = sanitizedToppings.reduce((sum, t) => sum + ((Number(t.price) || 0) * (Number(t.quantity) || 1)), 0);
      const unitPrice = Number(matchedMenu.price) + toppingsCost;
      const newItemKey = getCartItemKey(targetItem.menuId, sanitizedToppings);
      const qty = quantity !== null ? Math.max(1, quantity) : targetItem.quantity;

      // Support both direct discount params and discountInfo object
      const dType = newDiscType !== undefined ? newDiscType
        : (discountInfo?.type !== undefined ? discountInfo.type : (targetItem.itemDiscountType || 'none'));
      const dVal = newDiscVal !== undefined ? Math.max(0, Number(newDiscVal) || 0)
        : (discountInfo?.value !== undefined ? Math.max(0, Number(discountInfo.value) || 0) : (targetItem.itemDiscountValue || 0));
      const dAmt = calculateItemDiscount(unitPrice, qty, dType, dVal);

      const isCollision = prev.some(item => item.cartItemId !== cartItemId && item.itemKey === newItemKey);

      if (isCollision) {
        return prev
          .map(item => {
            if (item.itemKey === newItemKey && item.cartItemId !== cartItemId) {
              const combinedQty = item.quantity + qty;
              const combinedDiscAmt = calculateItemDiscount(item.unitPrice, combinedQty, item.itemDiscountType || 'none', item.itemDiscountValue || 0);
              return {
                ...item,
                quantity: combinedQty,
                note: note ? note.trim() : item.note,
                itemDiscountAmount: combinedDiscAmt
              };
            }
            return item;
          })
          .filter(item => item.cartItemId !== cartItemId);
      } else {
        return prev.map(item => {
          if (item.cartItemId === cartItemId) {
            return {
              ...item,
              itemKey: newItemKey,
              toppings: sanitizedToppings,
              toppingsCost,
              toppingsTotal: toppingsCost,
              unitPrice,
              quantity: qty,
              note: note ? note.trim() : '',
              itemDiscountType: dType,
              itemDiscountValue: dVal,
              itemDiscountAmount: dAmt
            };
          }
          return item;
        });
      }
    });
  };

  const setItemDiscount = (cartItemId, { type = 'none', value = 0 }) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemId === cartItemId) {
        const discType = type || 'none';
        const discVal = Math.max(0, Number(value) || 0);
        const discAmt = calculateItemDiscount(item.unitPrice, item.quantity, discType, discVal);
        return {
          ...item,
          itemDiscountType: discType,
          itemDiscountValue: discVal,
          itemDiscountAmount: discAmt
        };
      }
      return item;
    }));
  };

  const updateQuantity = (cartItemId, delta) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.cartItemId === cartItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            const newDiscAmt = calculateItemDiscount(
              item.unitPrice, 
              newQty, 
              item.itemDiscountType || 'none', 
              item.itemDiscountValue || 0
            );
            return { 
              ...item, 
              quantity: newQty,
              itemDiscountAmount: newDiscAmt
            };
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const setQuantity = (cartItemId, qty) => {
    const validQty = parseInt(qty, 10);
    if (isNaN(validQty) || validQty <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    const finalQty = Math.min(999, validQty);
    setCart(prev =>
      prev.map(item => {
        if (item.cartItemId === cartItemId) {
          const newDiscAmt = calculateItemDiscount(
            item.unitPrice, 
            finalQty, 
            item.itemDiscountType || 'none', 
            item.itemDiscountValue || 0
          );
          return {
            ...item,
            quantity: finalQty,
            itemDiscountAmount: newDiscAmt
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (cartItemId) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setTableNumber('Dine In');
    setOrderDiscountType('fixed');
    setOrderDiscountValue(0);
    setSelectedDiscountPreset(null);
  };

  const safeCart = Array.isArray(cart) ? cart : [];

  // Financial Calculations
  const grossSubtotal = useMemo(() => {
    return safeCart.reduce((sum, item) => {
      const price = Number(item?.unitPrice) || 0;
      const qty = Number(item?.quantity) || 1;
      return sum + (price * qty);
    }, 0);
  }, [safeCart]);

  const itemsDiscountTotal = useMemo(() => {
    return safeCart.reduce((sum, item) => {
      return sum + (Number(item?.itemDiscountAmount) || 0);
    }, 0);
  }, [safeCart]);

  const subtotalAfterItemDiscount = Math.max(0, grossSubtotal - itemsDiscountTotal);

  const orderDiscountAmount = useMemo(() => {
    const val = Math.max(0, Number(orderDiscountValue) || 0);
    if (val <= 0) return 0;
    if (orderDiscountType === 'percent') {
      const pct = Math.min(100, val);
      return Math.round((subtotalAfterItemDiscount * pct) / 100);
    }
    return Math.min(subtotalAfterItemDiscount, val);
  }, [orderDiscountType, orderDiscountValue, subtotalAfterItemDiscount]);

  const discount = itemsDiscountTotal + orderDiscountAmount;
  const taxableBase = Math.max(0, grossSubtotal - discount);
  const isTaxEnabled = Boolean(settings?.enableTax);
  const taxRate = Number(settings?.taxRate) || 0;
  const taxName = settings?.taxName || 'Pajak';
  const taxAmount = isTaxEnabled && taxRate > 0
    ? Math.round((taxableBase * taxRate) / 100)
    : 0;
  const totalAmount = taxableBase + taxAmount;
  const totalItemsCount = safeCart.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
  const subtotal = grossSubtotal;

  const setDiscount = (val, type = null) => {
    if (type) setOrderDiscountType(type);
    setOrderDiscountValue(Math.max(0, Number(val) || 0));
    setSelectedDiscountPreset(null);
  };

  const clearDiscount = () => {
    setOrderDiscountType('percent');
    setOrderDiscountValue(0);
    setSelectedDiscountPreset(null);
  };

  const applyDiscountPreset = (preset) => {
    if (!preset) {
      clearDiscount();
      return;
    }
    setOrderDiscountType(preset.type);
    setOrderDiscountValue(preset.value);
    setSelectedDiscountPreset(preset);
  };

  // Modal handlers
  const openToppingModal = (menu, cartItem = null) => {
    setToppingModalState({ isOpen: true, menu, cartItem });
  };

  const openEditModal = (cartItem) => {
    if (!cartItem) return;
    const matchedMenu = (productMenus || []).find(m => m.id === cartItem.menuId) || {
      id: cartItem.menuId,
      name: cartItem.name,
      price: cartItem.basePrice,
      image: cartItem.image,
      categoryName: cartItem.categoryName,
      promoType: cartItem.promoType,
      promoAmount: cartItem.promoAmount,
      toppings: []
    };

    setToppingModalState({ isOpen: true, menu: matchedMenu, cartItem });
  };

  const closeToppingModal = () => {
    setToppingModalState({ isOpen: false, menu: null, cartItem: null });
  };

  const openPaymentModal = () => {
    if (cart.length === 0) return;
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
  };

  const openReceiptModal = (receipt) => {
    setCompletedReceipt(receipt);
    setIsReceiptModalOpen(true);
  };

  const closeReceiptModal = () => {
    setIsReceiptModalOpen(false);
    setCompletedReceipt(null);
  };

  // Complete Order (Commit to MySQL cloud)
  const completeOrder = async ({ paymentMethod = 'cash', cashReceived = 0, changeAmount = 0 }) => {
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const cashierDisplayName = currentUser?.nama || currentUser?.name || 'Kasir';

    const orderData = {
      id: `ORD-${Date.now()}`,
      invoiceNumber,
      branchId: activeBranchId,
      date: new Date().toISOString(),
      status: 'completed',
      cashierName: cashierDisplayName,
      customerName: customerName.trim() || 'Pelanggan Umum',
      tableNumber: tableNumber && tableNumber.trim() && tableNumber.trim() !== '-' ? tableNumber.trim() : 'Dine In',
      items: safeCart.map(item => ({
        ...item,
        lineGross: item.unitPrice * item.quantity,
        lineDiscount: item.itemDiscountAmount || 0,
        lineTotal: (item.unitPrice * item.quantity) - (item.itemDiscountAmount || 0)
      })),
      subtotal: grossSubtotal,
      itemsDiscountTotal,
      orderDiscountType,
      orderDiscountValue,
      orderDiscountAmount,
      discount,
      enableTax: isTaxEnabled,
      taxRate: isTaxEnabled ? taxRate : 0,
      taxAmount,
      taxName,
      totalAmount,
      totalItemsCount: totalItemsCount || safeCart.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0),
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? Number(cashReceived) : totalAmount,
      changeAmount: paymentMethod === 'cash' ? Math.max(0, Number(changeAmount)) : 0
    };

    setIsSubmitting(true);
    try {
      const { data: createdOrder, error: orderErr } = await ordersService.createOrder(orderData);
      if (orderErr) {
        showToast(`Gagal menyimpan pesanan: ${orderErr.message}`, 'error', 'Error Database');
        return null;
      }

      setOrders(prev => [createdOrder || orderData, ...prev]);

      // Auto-deduct raw materials based on recipes & toppings in cloud database
      try {
        if (typeof deductMaterialsForOrder === 'function') {
          await deductMaterialsForOrder(orderData, productMenus || [], toppings || []);
        }
      } catch (e) {
        console.error('Failed to deduct raw materials for order', e);
      }

      // Reset current active cart
      clearCart();
      closePaymentModal();
      openReceiptModal(orderData);

      showToast(`Pesanan #${orderData.invoiceNumber} berhasil disimpan ke cloud database.`, 'success', 'Transaksi Selesai');
      return orderData;
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Record Order Return (Retur Pesanan: Remake / Buat Baru atau Refund / Batal)
  const recordOrderReturn = async ({ 
    orderId, 
    returnAction = 'remake', 
    returnedItems = [], 
    reasonCategory, 
    note = '', 
    photo = null, 
    user = 'Kasir' 
  }) => {
    const targetOrder = await resolveOrderForAction(orderId);
    if (!targetOrder) {
      return { success: false, error: 'Pesanan tidak ditemukan.' };
    }

    // Determine items being returned
    let itemsToProcess = returnedItems;
    if (!Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
      // Default fallback: return all remaining unreturned quantities
      itemsToProcess = (targetOrder.items || []).map(it => {
        const remaining = Math.max(0, (Number(it.quantity) || 1) - (Number(it.returnedQty) || 0));
        return {
          ...it,
          quantity: remaining
        };
      }).filter(it => it.quantity > 0);
    }

    if (itemsToProcess.length === 0) {
      return { success: false, error: 'Semua item dalam pesanan ini sudah diretur sebelumnya.' };
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const currentUserName = user || targetOrder.cashierName || 'Kasir';
      const reason = reasonCategory || 'Adonan Gosong / Kesalahan Pembuatan';

      // 1. Process inventory updates based on return action
      let inventoryResult = { success: true };
      if (returnAction === 'remake') {
        if (typeof deductMaterialsForRemake === 'function') {
          inventoryResult = await deductMaterialsForRemake({
            order: targetOrder,
            returnItems: itemsToProcess,
            reason,
            note,
            photo,
            user: currentUserName,
            menus: productMenus,
            toppings
          });
        }
      } else {
        // 'refund' action: log wasted items / portions without remake deduction
        if (typeof recordOrderRefundLog === 'function') {
          inventoryResult = await recordOrderRefundLog({
            order: targetOrder,
            returnItems: itemsToProcess,
            reason,
            note,
            photo,
            user: currentUserName,
            menus: productMenus,
            toppings
          });
        }
      }

      if (!inventoryResult.success && inventoryResult.error) {
        showToast(`Gagal memproses stok bahan: ${inventoryResult.error}`, 'error', 'Peringatan Bahan');
      }

      // 2. Compute updated items with returned quantities and event logs
      const updatedItems = (targetOrder.items || []).map(item => {
        const matchingReturn = itemsToProcess.find(r => 
          (r.id && item.id && r.id === item.id) || 
          (r.menuId && item.menuId && r.menuId === item.menuId) ||
          (r.name === item.name)
        );
        if (matchingReturn) {
          const retQty = Number(matchingReturn.quantity) || 0;
          const prevReturnedQty = Number(item.returnedQty) || 0;
          const newReturnedQty = prevReturnedQty + retQty;

          const newReturnEvents = [
            ...(Array.isArray(item.returnEvents) ? item.returnEvents : []),
            {
              action: returnAction,
              quantity: retQty,
              reason,
              note: note.trim(),
              photo,
              user: currentUserName,
              timestamp: now
            }
          ];

          return {
            ...item,
            returnedQty: newReturnedQty,
            lastReturnAction: returnAction,
            returnEvents: newReturnEvents
          };
        }
        return item;
      });

      // 3. Compute new order status
      // Remake: customer receives replacement food, sales revenue remains intact!
      // Refund: if all quantities across all items are returned => 'returned', else => 'partially_returned'
      let newOrderStatus = targetOrder.status;
      if (returnAction === 'refund') {
        const isAllItemsFullyReturned = updatedItems.every(it => {
          const qty = Number(it.quantity) || 1;
          const ret = Number(it.returnedQty) || 0;
          return ret >= qty;
        });
        newOrderStatus = isAllItemsFullyReturned ? 'returned' : 'partially_returned';
      } else if (returnAction === 'remake') {
        // Ensure status stays active (e.g. 'completed' or existing)
        newOrderStatus = targetOrder.status === 'returned' ? 'completed' : (targetOrder.status || 'completed');
      }

      // 4. Update in MySQL cloud
      const payload = {
        items: updatedItems,
        status: newOrderStatus,
        return_reason: reason,
        return_note: note.trim() || '',
        return_photo: photo || null,
        return_by: currentUserName,
        returned_at: now
      };

      const { error: updateErr } = await ordersService.updateOrder(targetOrder.id, payload);
      if (updateErr) {
        showToast(`Gagal menyimpan perubahan ke cloud: ${updateErr.message}`, 'error', 'Error Database');
        return { success: false, error: updateErr.message };
      }

      // 5. Update local state
      setOrders(prev => prev.map(o => {
        if (o.id === targetOrder.id) {
          return {
            ...o,
            items: updatedItems,
            status: newOrderStatus,
            returnReason: reason,
            returnNote: note.trim() || '',
            returnPhoto: photo || null,
            returnBy: currentUserName,
            returnedAt: now
          };
        }
        return o;
      }));

      const itemsSummary = itemsToProcess.map(it => `${it.quantity}x ${it.name}`).join(', ');
      if (returnAction === 'remake') {
        showToast(
          `Pesanan #${targetOrder.invoiceNumber} (${itemsSummary}) berhasil diproses BUAT BARU. Bahan dapur terpotong otomatis.`,
          'success',
          'Remake Pesanan Berhasil'
        );
      } else {
        showToast(
          `Pesanan #${targetOrder.invoiceNumber} (${itemsSummary}) berhasil di-REFUND.`,
          'info',
          'Refund Selesai'
        );
      }

      return { success: true };
    } catch (err) {
      console.error('recordOrderReturn error:', err);
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOrderReturnModal = (order) => {
    setOrderReturnModalState({ isOpen: true, order });
  };

  const closeOrderReturnModal = () => {
    setOrderReturnModalState({ isOpen: false, order: null });
  };

  // Cancel Order (Super Admin Void Action)
  const openOrderCancelModal = (order) => {
    setOrderCancelModalState({ isOpen: true, order });
  };

  const closeOrderCancelModal = () => {
    setOrderCancelModalState({ isOpen: false, order: null });
  };

  // Revision Order Modal Controls & Execution
  const openOrderRevisionModal = (order) => {
    setOrderRevisionModalState({ isOpen: true, order });
  };

  const closeOrderRevisionModal = () => {
    setOrderRevisionModalState({ isOpen: false, order: null });
  };

  const reviseOrder = async ({ orderId, updatedItems, reason = '', actor = 'Kasir' }) => {
    const originalOrder = await resolveOrderForAction(orderId);
    if (!originalOrder) {
      showToast('Data transaksi tidak ditemukan.', 'error', 'Error');
      return { success: false, error: 'Order not found' };
    }

    if (!Array.isArray(updatedItems) || updatedItems.length === 0) {
      showToast('Pesanan tidak boleh kosong. Gunakan fitur Batalkan jika ingin membatalkan semua menu.', 'error', 'Peringatan');
      return { success: false, error: 'Cannot revise order to 0 items' };
    }

    setIsSubmitting(true);
    try {
      // 1. Calculate new totals
      let subtotal = 0;
      let itemsDiscountTotal = 0;
      let totalItemsCount = 0;

      const sanitizedItems = updatedItems.map((item, idx) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        totalItemsCount += qty;

        const basePrice = Number(item.basePrice ?? item.unitPrice ?? 0);
        const toppings = Array.isArray(item.toppings) ? item.toppings : [];
        const toppingsTotal = toppings.reduce((sum, t) => sum + ((Number(t.price) || 0) * (Number(t.quantity) || 1)), 0);
        const unitPrice = basePrice + toppingsTotal;
        const lineSubtotal = unitPrice * qty;
        subtotal += lineSubtotal;

        const discType = item.itemDiscountType || 'none';
        const discVal = Number(item.itemDiscountValue) || 0;
        const discAmt = calculateItemDiscount(unitPrice, qty, discType, discVal);
        itemsDiscountTotal += discAmt;

        return {
          ...item,
          cartItemId: item.cartItemId || `REV-${Date.now()}-${idx}`,
          quantity: qty,
          basePrice,
          toppings,
          toppingsTotal,
          unitPrice,
          itemDiscountType: discType,
          itemDiscountValue: discVal,
          itemDiscountAmount: discAmt
        };
      });

      // Order discount calculation
      const orderDiscountType = originalOrder.orderDiscountType || 'none';
      const orderDiscountValue = Number(originalOrder.orderDiscountValue) || 0;
      const netSubtotalAfterItems = Math.max(0, subtotal - itemsDiscountTotal);
      let orderDiscountAmount = 0;
      if (orderDiscountType === 'percent') {
        orderDiscountAmount = Math.round((netSubtotalAfterItems * orderDiscountValue) / 100);
      } else if (orderDiscountType === 'fixed') {
        orderDiscountAmount = Math.min(netSubtotalAfterItems, orderDiscountValue);
      }
      const totalDiscount = itemsDiscountTotal + orderDiscountAmount;
      const orderTaxRate = originalOrder.taxRate !== undefined && originalOrder.enableTax !== false
        ? Number(originalOrder.taxRate)
        : (isTaxEnabled ? taxRate : 0);
      const orderTaxName = originalOrder.taxName || taxName;
      const taxableBase = Math.max(0, subtotal - totalDiscount);
      const taxAmount = orderTaxRate > 0 ? Math.round((taxableBase * orderTaxRate) / 100) : 0;
      const totalAmount = taxableBase + taxAmount;

      const revisionNote = reason ? `[REVISI] ${reason} (oleh ${actor})` : `[REVISI] oleh ${actor}`;
      const combinedNotes = originalOrder.returnNote 
        ? `${originalOrder.returnNote} | ${revisionNote}` 
        : revisionNote;

      const payload = {
        items: sanitizedItems,
        subtotal,
        items_discount_total: itemsDiscountTotal,
        order_discount_type: orderDiscountType,
        order_discount_value: orderDiscountValue,
        order_discount_amount: orderDiscountAmount,
        discount: totalDiscount,
        total_amount: totalAmount,
        total_items_count: totalItemsCount,
        return_note: combinedNotes
      };

      // 2. Update in MySQL
      const { error: updateErr } = await ordersService.updateOrder(originalOrder.id, payload);
      if (updateErr) {
        showToast(`Gagal merevisi transaksi di database: ${updateErr.message}`, 'error', 'Error Database');
        return { success: false, error: updateErr.message };
      }

      // 3. Stock reconciliation: Restore old order, deduct new order
      try {
        if (typeof restoreMaterialsForOrder === 'function') {
          await restoreMaterialsForOrder(
            originalOrder,
            productMenus,
            toppings,
            `Restorasi Bahan untuk Revisi Transaksi #${originalOrder.invoiceNumber}`,
            actor
          );
        }
        if (typeof deductMaterialsForOrder === 'function') {
          const tempRevisedOrder = {
            ...originalOrder,
            items: sanitizedItems,
            invoiceNumber: originalOrder.invoiceNumber,
            date: new Date().toISOString(),
            cashierName: actor
          };
          await deductMaterialsForOrder(tempRevisedOrder, productMenus, toppings, actor);
        }
      } catch (stockErr) {
        console.error('Error reconciling stock for revised order:', stockErr);
      }

      // 4. Update local state
      const updatedOrder = {
        ...originalOrder,
        items: sanitizedItems,
        subtotal,
        itemsDiscountTotal,
        orderDiscountType,
        orderDiscountValue,
        orderDiscountAmount,
        discount: totalDiscount,
        enableTax: orderTaxRate > 0,
        taxRate: orderTaxRate,
        taxAmount,
        taxName: orderTaxName,
        totalAmount,
        totalItemsCount,
        returnNote: combinedNotes,
        isRevised: true
      };

      setOrders(prev => prev.map(o => o.id === originalOrder.id ? updatedOrder : o));

      showToast(
        `Transaksi #${originalOrder.invoiceNumber} berhasil direvisi & struk baru siap dicetak.`,
        'success',
        'Revisi Berhasil'
      );

      closeOrderRevisionModal();

      // 5. Open updated receipt for printing immediately!
      openReceiptModal(updatedOrder);

      return { success: true, updatedOrder };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelOrder = async ({ orderId, reason, note = '', restoreStock = true, user }) => {
    const targetOrder = await resolveOrderForAction(orderId);
    if (!targetOrder) {
      showToast('Data transaksi tidak ditemukan.', 'error', 'Error');
      return { success: false, error: 'Order not found' };
    }

    setIsSubmitting(true);
    try {
      const cancelReasonText = reason || 'Pembatalan oleh Admin';
      const actor = user || currentUser?.nama || currentUser?.name || currentUser?.username || 'Super Admin';

      const { error: cancelErr } = await ordersService.cancelOrder(targetOrder.id, {
        reason: cancelReasonText,
        note,
        user: actor
      });

      if (cancelErr) {
        showToast(`Gagal membatalkan transaksi: ${cancelErr.message}`, 'error', 'Error Database');
        return { success: false, error: cancelErr.message };
      }

      const cancelTimestamp = new Date().toISOString();

      setOrders(prev => prev.map(o => {
        if (o.id === targetOrder.id) {
          return {
            ...o,
            status: 'cancelled',
            cancelReason: cancelReasonText,
            cancelNote: note.trim() || '',
            cancelBy: actor,
            cancelledAt: cancelTimestamp
          };
        }
        return o;
      }));

      // If restoreStock is true, restore raw materials back to inventory
      if (restoreStock && typeof restoreMaterialsForOrder === 'function') {
        try {
          await restoreMaterialsForOrder(
            targetOrder,
            productMenus,
            toppings,
            note ? `${cancelReasonText} (${note})` : cancelReasonText,
            actor
          );
        } catch (e) {
          console.error('Failed to restore raw materials for cancelled order:', e);
        }
      }

      showToast(
        `Transaksi #${targetOrder.invoiceNumber} berhasil dibatalkan${restoreStock ? ' & stok bahan baku telah dikembalikan' : ''}.`,
        'info',
        'Transaksi Dibatalkan'
      );
      closeOrderCancelModal();
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error', 'Error');
      return { success: false, error: err.message };
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        isLoading,
        error,
        isSubmitting,
        refetch: fetchOrders,
        refetchAll: fetchAllOrders,
        fetchOrdersPage,
        cart,
        customerName,
        setCustomerName,
        tableNumber,
        setTableNumber,
        subtotal,
        grossSubtotal,
        itemsDiscountTotal,
        subtotalAfterItemDiscount,
        orderDiscountType,
        setOrderDiscountType,
        orderDiscountValue,
        setOrderDiscountValue,
        orderDiscountAmount,
        selectedDiscountPreset,
        discountPresets: DEFAULT_DISCOUNT_PRESETS,
        discount,
        setDiscount,
        applyDiscountPreset,
        clearDiscount,
        setItemDiscount,
        enableTax: isTaxEnabled,
        taxRate,
        taxAmount,
        taxName,
        taxableBase,
        totalAmount,
        totalItemsCount,
        addToCart,
        updateCartItem,
        updateQuantity,
        setQuantity,
        removeFromCart,
        clearCart,
        toppingModalState,
        openToppingModal,
        openEditModal,
        closeToppingModal,
        isPaymentModalOpen,
        openPaymentModal,
        closePaymentModal,
        completedReceipt,
        isReceiptModalOpen,
        openReceiptModal,
        closeReceiptModal,
        orderReturnModalState,
        openOrderReturnModal,
        closeOrderReturnModal,
        orderCancelModalState,
        openOrderCancelModal,
        closeOrderCancelModal,
        orderRevisionModalState,
        openOrderRevisionModal,
        closeOrderRevisionModal,
        reviseOrder,
        cancelOrder,
        completeOrder,
        recordOrderReturn
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export const OrderController = OrderProvider;
