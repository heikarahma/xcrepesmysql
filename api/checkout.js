import { getPool, assertDatabaseConfigured } from './_lib/database.js';
import { isAdmin, requireUser, sendError } from './_lib/auth.js';
import { assertJsonBodyLimit, enforceBurstLimit } from './_lib/request-guard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    assertDatabaseConfigured();
    assertJsonBodyLimit(req, 2 * 1024 * 1024);
    const user = requireUser(req);

    const isAuthorized = isAdmin(user) || (Array.isArray(user.permissions) && user.permissions.includes('kasir'));
    if (!isAuthorized) {
      throw Object.assign(new Error('Hak akses akun tidak mencakup transaksi kasir.'), { statusCode: 403 });
    }

    enforceBurstLimit(req, res, {
      namespace: 'checkout',
      identity: user?.sub || '',
      limit: 60,
      windowMs: 60_000
    });

    const { order, deductions = [] } = req.body || {};
    if (!order || !order.invoiceNumber || !Array.isArray(order.items) || order.items.length === 0) {
      throw Object.assign(new Error('Data pesanan tidak lengkap atau item belanja kosong.'), { statusCode: 400 });
    }

    const branchId = order.branchId || 'BR-DEFAULT';
    if (!isAdmin(user) && Array.isArray(user.branchIds) && user.branchIds.length > 0 && !user.branchIds.includes(branchId)) {
      throw Object.assign(new Error('Akun Anda tidak memiliki akses ke cabang ini.'), { statusCode: 403 });
    }

    const pool = getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 1. Check duplicate invoice number
      const [existing] = await conn.execute(
        'SELECT id FROM orders WHERE invoice_number = ? LIMIT 1',
        [order.invoiceNumber]
      );
      if (existing.length > 0) {
        throw Object.assign(new Error(`Invoice #${order.invoiceNumber} sudah pernah diproses.`), { statusCode: 409 });
      }

      // 2. Process stock deductions atomically
      const updatedStocks = [];
      const stockLogs = [];
      const nowIso = new Date().toISOString();

      if (Array.isArray(deductions) && deductions.length > 0) {
        const aggregatedDeductions = new Map();
        for (const ded of deductions) {
          const matId = ded.rawMaterialId;
          if (!matId) continue;
          const amt = Math.round((Number(ded.amount) || 0) * 1000) / 1000;
          if (amt <= 0) continue;

          if (!aggregatedDeductions.has(matId)) {
            aggregatedDeductions.set(matId, {
              rawMaterialId: matId,
              totalAmount: 0,
              entries: []
            });
          }
          const group = aggregatedDeductions.get(matId);
          group.totalAmount = Math.round((group.totalAmount + amt) * 1000) / 1000;
          group.entries.push(ded);
        }

        for (const [matId, group] of aggregatedDeductions.entries()) {
          const [branchRows] = await conn.execute(
            'SELECT stock FROM store_branch_stocks WHERE branch_id = ? AND raw_material_id = ? FOR UPDATE',
            [branchId, matId]
          );

          const [matRows] = await conn.execute(
            'SELECT id, name, unit_name, stock FROM raw_materials WHERE id = ? FOR UPDATE',
            [matId]
          );

          const matData = matRows[0] || null;
          const matName = matData?.name || 'Bahan Baku';
          const unitName = matData?.unit_name || 'Unit';

          const prevStock = branchRows.length > 0
            ? Number(branchRows[0].stock || 0)
            : Number(matData?.stock || 0);

          const deductionAmt = group.totalAmount;
          const newStock = Math.max(0, Math.round((prevStock - deductionAmt) * 1000) / 1000);

          await conn.execute(
            `INSERT INTO store_branch_stocks (branch_id, raw_material_id, stock, updated_at)
             VALUES (?, ?, ?, NOW(3))
             ON DUPLICATE KEY UPDATE stock = VALUES(stock), updated_at = NOW(3)`,
            [branchId, matId, newStock]
          );

          await conn.execute(
            `UPDATE raw_materials SET stock = (
               SELECT IFNULL(SUM(stock), 0) FROM store_branch_stocks WHERE raw_material_id = ?
             ), updated_at = NOW(3) WHERE id = ?`,
            [matId, matId]
          );

          updatedStocks.push({ id: matId, stock: newStock });

          let runningPrev = prevStock;
          for (const entry of group.entries) {
            const entryAmt = Math.round((Number(entry.amount) || 0) * 1000) / 1000;
            const entryCurr = Math.max(0, Math.round((runningPrev - entryAmt) * 1000) / 1000);
            const logId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            const note = entry.isTopping
              ? `Pemakaian extra topping "${entry.toppingName}" pada "${entry.item?.name || 'Menu'}" (Pesanan #${order.invoiceNumber})`
              : `Pemakaian resep menu "${entry.item?.name || 'Menu'}" (${entry.item?.quantity || 1}x) - Pesanan #${order.invoiceNumber}`;

            await conn.execute(
              `INSERT INTO inventory_stock_logs (
                 id, branch_id, raw_material_id, raw_material_name, unit_name, type, amount,
                 previous_stock, current_stock, note, reference_invoice, order_id, customer_name,
                 source_menu, source_type, topping_name, user_name, created_at
               ) VALUES (?, ?, ?, ?, ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
              [
                logId,
                branchId,
                matId,
                matName,
                unitName,
                entryAmt,
                runningPrev,
                entryCurr,
                note,
                order.invoiceNumber,
                order.id,
                order.customerName || 'Pelanggan Umum',
                entry.item?.name || null,
                entry.isTopping ? 'TOPPING' : 'MENU',
                entry.isTopping ? entry.toppingName : null,
                order.cashierName || user.nama || 'Kasir'
              ]
            );

            stockLogs.push({
              id: logId,
              branchId,
              rawMaterialId: matId,
              rawMaterialName: matName,
              unitName,
              type: 'OUT',
              amount: entryAmt,
              previousStock: runningPrev,
              currentStock: entryCurr,
              note,
              referenceInvoice: order.invoiceNumber,
              orderId: order.id,
              customerName: order.customerName || 'Pelanggan Umum',
              sourceMenu: entry.item?.name || null,
              sourceType: entry.isTopping ? 'TOPPING' : 'MENU',
              toppingName: entry.isTopping ? entry.toppingName : null,
              user: order.cashierName || user.nama || 'Kasir',
              createdAt: nowIso
            });

            runningPrev = entryCurr;
          }
        }
      }

      // 3. Clean items array
      const cleanItems = (order.items || []).map((it) => {
        const { image, imageUrl, photo, thumbnail, ...cleanItem } = it || {};
        return {
          ...cleanItem,
          toppings: Array.isArray(cleanItem.toppings)
            ? cleanItem.toppings.map((t) => {
                const { image: ti, imageUrl: tiu, photo: tp, ...ct } = t || {};
                return ct;
              })
            : []
        };
      });

      // 4. Insert order
      await conn.execute(
        `INSERT INTO orders (
           id, invoice_number, branch_id, date, status, cashier_name, customer_name,
           table_number, items, subtotal, items_discount_total, order_discount_type,
           order_discount_value, order_discount_amount, discount, enable_tax, tax_rate,
           tax_amount, tax_name, total_amount, total_items_count, payment_method,
           cash_received, change_amount, return_reason, return_note, return_by,
           returned_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          order.id,
          order.invoiceNumber,
          branchId,
          order.date || new Date(),
          order.status || 'completed',
          order.cashierName || user.nama || 'Kasir',
          order.customerName || 'Pelanggan Umum',
          order.tableNumber || '',
          JSON.stringify(cleanItems),
          Number(order.subtotal) || 0,
          Number(order.itemsDiscountTotal) || 0,
          order.orderDiscountType || 'none',
          Number(order.orderDiscountValue) || 0,
          Number(order.orderDiscountAmount) || 0,
          Number(order.discount) || 0,
          order.enableTax ? 1 : 0,
          Number(order.taxRate) || 0,
          Number(order.taxAmount) || 0,
          order.taxName || 'Pajak',
          Number(order.totalAmount) || 0,
          Number(order.totalItemsCount) || 0,
          order.paymentMethod || 'cash',
          Number(order.cashReceived) || 0,
          Number(order.changeAmount) || 0,
          order.returnReason || null,
          order.returnNote || null,
          order.returnBy || null,
          order.returnedAt || null
        ]
      );

      await conn.commit();

      res.status(200).json({
        data: {
          order: {
            ...order,
            items: cleanItems
          },
          updatedStocks,
          stockLogs
        },
        error: null
      });
    } catch (txError) {
      await conn.rollback();
      throw txError;
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      error.statusCode = 409;
      error.message = 'Invoice pesanan tersebut sudah pernah dicatat.';
    }
    sendError(res, error);
  }
}
