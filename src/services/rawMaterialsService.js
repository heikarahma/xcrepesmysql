import { database, isDatabaseConfigured } from '../lib/database';
import { DEFAULT_BRANCH_ID, isRowForBranch, formatBranchRowId, stripBranchFromId } from '../models/BranchModel';

const TABLE = 'raw_materials';
const STOCK_TABLE = 'store_branch_stocks';

const applyBranchRowQuery = (query, branchId = DEFAULT_BRANCH_ID) => {
  if (!branchId || branchId === DEFAULT_BRANCH_ID) return query;
  return query.like('id', `${branchId}__%`);
};

const mapMaterialRow = (row, stockOverride = null, branchId = DEFAULT_BRANCH_ID) => {
  const stockValue = stockOverride !== null && stockOverride !== undefined
    ? Number(stockOverride)
    : Number(row.stock);

  return {
    id: row.id,
    rawId: row.id,
    displayId: stripBranchFromId(row.id),
    branchId: branchId,
    name: row.name,
    unitName: row.unit_name,
    stock: stockValue || 0,
    currentStock: stockValue || 0,
    pricePerUnit: Number(row.price_per_unit) || 0,
    minStock: Number(row.min_stock) || 10,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const rawMaterialsService = {
  async getRawMaterials(branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const query = database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    const { data: materials, error } = await applyBranchRowQuery(query, branchId);

    if (error) {
      console.error('rawMaterialsService.getRawMaterials error:', error);
      return { data: [], error };
    }

    const filteredMaterials = (materials || []).filter(row => isRowForBranch(row.id, branchId));

    let stockMap = new Map();
    if (branchId) {
      const { data: stockRows, error: stockErr } = await database
        .from(STOCK_TABLE)
        .select('raw_material_id, stock')
        .eq('branch_id', branchId);

      if (!stockErr) {
        stockMap = new Map((stockRows || []).map(row => [row.raw_material_id, Number(row.stock) || 0]));
      } else if (stockErr.code !== 'PGRST204' && !String(stockErr.message || '').includes('store_branch_stocks')) {
        console.warn('rawMaterialsService.getRawMaterials branch stock error:', stockErr);
      }
    }

    return {
      data: filteredMaterials.map(row => {
        const stockVal = stockMap.has(row.id)
          ? stockMap.get(row.id)
          : Number(row.stock || 0);
        return mapMaterialRow(row, stockVal, branchId);
      }),
      error: null
    };
  },

  async createRawMaterial({ id, name, unitName, stock = 0, pricePerUnit = 0, minStock = 10, note = '', branchId = DEFAULT_BRANCH_ID }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const finalId = formatBranchRowId(id, branchId);

    const payload = {
      id: finalId,
      name,
      unit_name: unitName,
      stock: Number(stock) || 0,
      price_per_unit: Number(pricePerUnit) || 0,
      min_stock: Number(minStock) || 10,
      note,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('rawMaterialsService.createRawMaterial error:', error);
      return { data: null, error };
    }

    if (branchId) {
      await this.updateStock(finalId, Number(stock) || 0, branchId);
    }

    return {
      data: mapMaterialRow(data, stock, branchId),
      error: null
    };
  },

  async copyFromBranch(sourceBranchId = DEFAULT_BRANCH_ID, targetBranchId) {
    if (!isDatabaseConfigured()) return { count: 0, error: new Error('MySQL not configured') };
    if (!targetBranchId || targetBranchId === sourceBranchId) return { count: 0, error: null };

    const { data: sourceMaterials, error: fetchErr } = await this.getRawMaterials(sourceBranchId);
    if (fetchErr || !sourceMaterials || sourceMaterials.length === 0) {
      return { count: 0, error: fetchErr };
    }

    const payloads = sourceMaterials.map(m => {
      const cleanId = stripBranchFromId(m.id);
      return {
        id: formatBranchRowId(cleanId, targetBranchId),
        name: m.name,
        unit_name: m.unitName,
        stock: 0, // Salin master bahan dengan saldo awal 0 untuk opname/restok baru
        price_per_unit: m.pricePerUnit,
        min_stock: m.minStock,
        note: m.note,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await database
      .from(TABLE)
      .upsert(payloads)
      .select();

    if (error) {
      console.error('rawMaterialsService.copyFromBranch error:', error);
      return { count: 0, error };
    }

    return { count: data?.length || payloads.length, error: null };
  },

  async updateRawMaterial(id, { name, unitName, stock, pricePerUnit, minStock, note, branchId = DEFAULT_BRANCH_ID }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const updatePayload = {
      updated_at: new Date().toISOString()
    };
    if (name !== undefined) updatePayload.name = name;
    if (unitName !== undefined) updatePayload.unit_name = unitName;
    if (stock !== undefined) updatePayload.stock = Math.max(0, Number(stock) || 0);
    if (pricePerUnit !== undefined) updatePayload.price_per_unit = Number(pricePerUnit) || 0;
    if (minStock !== undefined) updatePayload.min_stock = Number(minStock) || 10;
    if (note !== undefined) updatePayload.note = note;

    const { data, error } = await database
      .from(TABLE)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('rawMaterialsService.updateRawMaterial error:', error);
      return { data: null, error };
    }

    if (stock !== undefined && branchId) {
      await this.updateStock(id, stock, branchId);
    }

    return {
      data: mapMaterialRow(data, stock !== undefined ? stock : data.stock),
      error: null
    };
  },

  async updateStock(id, newStock, branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };

    if (branchId) {
      const stockPayload = {
        branch_id: branchId,
        raw_material_id: id,
        stock: Number(newStock) || 0,
        updated_at: new Date().toISOString()
      };

      const { error: stockErr } = await database
        .from(STOCK_TABLE)
        .upsert(stockPayload, { onConflict: 'branch_id,raw_material_id' });

      if (!stockErr) {
        return { data: { id, stock: Number(newStock) || 0, currentStock: Number(newStock) || 0 }, error: null };
      }

      if (stockErr.code !== 'PGRST204' && !String(stockErr.message || '').includes('store_branch_stocks')) {
        console.error('rawMaterialsService.updateBranchStock error:', stockErr);
        return { data: null, error: stockErr };
      }
    }

    const { data, error } = await database
      .from(TABLE)
      .update({
        stock: Number(newStock) || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('rawMaterialsService.updateStock error:', error);
      return { data: null, error };
    }

    return {
      data: mapMaterialRow(data),
      error: null
    };
  },

  async updateStocksBatch(updates, branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    if (branchId) {
      const payloads = updates.map(u => ({
        branch_id: branchId,
        raw_material_id: u.id,
        stock: Number(u.stock) || 0,
        updated_at: new Date().toISOString()
      }));

      const { error } = await database
        .from(STOCK_TABLE)
        .upsert(payloads, { onConflict: 'branch_id,raw_material_id' });

      if (!error) return { error: null };
      if (error.code !== 'PGRST204' && !String(error.message || '').includes('store_branch_stocks')) {
        return { error };
      }
    }

    const promises = updates.map(u => 
      database
        .from(TABLE)
        .update({
          stock: Number(u.stock) || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', u.id)
    );

    const results = await Promise.all(promises);
    const hasError = results.find(r => r.error);
    return { error: hasError ? hasError.error : null };
  },

  async deleteRawMaterial(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('rawMaterialsService.deleteRawMaterial error:', error);
    }
    return { error };
  },

  async deleteRawMaterialsBatch(ids) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .in('id', ids);

    if (error) {
      console.error('rawMaterialsService.deleteRawMaterialsBatch error:', error);
    }
    return { error };
  }
};
