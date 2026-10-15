import { database, isDatabaseConfigured } from '../lib/database';
import { DEFAULT_BRANCH_ID, isRowForBranch, formatBranchRowId, stripBranchFromId } from '../models/BranchModel';

const TABLE = 'toppings';

const applyBranchRowQuery = (query, branchId = DEFAULT_BRANCH_ID) => {
  if (!branchId || branchId === DEFAULT_BRANCH_ID) return query;
  return query.like('id', `${branchId}__%`);
};

const getLocalToppingReceiptSettings = () => {
  try {
    const raw = localStorage.getItem('toppings_receipt_settings');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read toppings_receipt_settings from localStorage', e);
  }
  return {};
};

const saveLocalToppingReceiptSetting = (toppingId, showOnReceipt) => {
  try {
    const settings = getLocalToppingReceiptSettings();
    settings[toppingId] = Boolean(showOnReceipt !== false);
    localStorage.setItem('toppings_receipt_settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to write toppings_receipt_settings to localStorage', e);
  }
};

export const toppingsService = {
  async getToppings(branchId = DEFAULT_BRANCH_ID) {
    const localReceiptMap = getLocalToppingReceiptSettings();
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const query = database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = await applyBranchRowQuery(query, branchId);

    if (error) {
      console.error('toppingsService.getToppings error:', error);
      return { data: [], error };
    }

    const filtered = (data || []).filter(row => isRowForBranch(row.id, branchId));

    return {
      data: filtered.map(row => ({
        id: row.id,
        rawId: row.id,
        displayId: stripBranchFromId(row.id),
        branchId: branchId,
        name: row.name,
        price: Number(row.price) || 0,
        description: row.description || '',
        ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
        showOnReceipt: row.show_on_receipt !== undefined 
          ? Boolean(row.show_on_receipt) 
          : (localReceiptMap[row.id] !== undefined ? localReceiptMap[row.id] : true),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      error: null
    };
  },

  async createTopping({ id, name, price = 0, description = '', ingredients = [], showOnReceipt = true, branchId = DEFAULT_BRANCH_ID }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    
    const finalId = formatBranchRowId(id, branchId);
    saveLocalToppingReceiptSetting(finalId, showOnReceipt);

    const basePayload = {
      id: finalId,
      name,
      price: Number(price) || 0,
      description,
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const fullPayload = {
      ...basePayload,
      show_on_receipt: Boolean(showOnReceipt !== false)
    };

    let { data, error } = await database
      .from(TABLE)
      .insert([fullPayload])
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || String(error.message).includes('column'))) {
      const retry = await database
        .from(TABLE)
        .insert([basePayload])
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('toppingsService.createTopping error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        rawId: data.id,
        displayId: stripBranchFromId(data.id),
        branchId,
        name: data.name,
        price: Number(data.price) || 0,
        description: data.description || '',
        ingredients: data.ingredients || [],
        showOnReceipt: showOnReceipt !== false,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async copyFromBranch(sourceBranchId = DEFAULT_BRANCH_ID, targetBranchId) {
    if (!isDatabaseConfigured()) return { count: 0, error: new Error('MySQL not configured') };
    if (!targetBranchId || targetBranchId === sourceBranchId) return { count: 0, error: null };

    const { data: sourceToppings, error: fetchErr } = await this.getToppings(sourceBranchId);
    if (fetchErr || !sourceToppings || sourceToppings.length === 0) {
      return { count: 0, error: fetchErr };
    }

    const payloads = sourceToppings.map(t => {
      const cleanId = stripBranchFromId(t.id);
      return {
        id: formatBranchRowId(cleanId, targetBranchId),
        name: t.name,
        price: t.price,
        description: t.description,
        ingredients: t.ingredients,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await database
      .from(TABLE)
      .upsert(payloads)
      .select();

    if (error) {
      console.error('toppingsService.copyFromBranch error:', error);
      return { count: 0, error };
    }

    return { count: data?.length || payloads.length, error: null };
  },

  async updateTopping(id, { name, price, description, ingredients, showOnReceipt }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    
    if (showOnReceipt !== undefined) {
      saveLocalToppingReceiptSetting(id, showOnReceipt);
    }

    const payload = {
      updated_at: new Date().toISOString()
    };
    if (name !== undefined) payload.name = name;
    if (price !== undefined) payload.price = Number(price) || 0;
    if (description !== undefined) payload.description = description;
    if (ingredients !== undefined) payload.ingredients = ingredients;

    const fullPayload = {
      ...payload,
      ...(showOnReceipt !== undefined ? { show_on_receipt: Boolean(showOnReceipt) } : {})
    };

    let { data, error } = await database
      .from(TABLE)
      .update(fullPayload)
      .eq('id', id)
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || String(error.message).includes('column'))) {
      const retry = await database
        .from(TABLE)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('toppingsService.updateTopping error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        name: data.name,
        price: Number(data.price) || 0,
        description: data.description || '',
        ingredients: data.ingredients || [],
        showOnReceipt: showOnReceipt !== undefined ? Boolean(showOnReceipt) : true,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async deleteTopping(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('toppingsService.deleteTopping error:', error);
    }
    return { error };
  },

  async deleteToppingsBatch(ids) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .in('id', ids);

    if (error) {
      console.error('toppingsService.deleteToppingsBatch error:', error);
    }
    return { error };
  }
};
