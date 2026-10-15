import { database, isDatabaseConfigured } from '../lib/database';
import { DEFAULT_BRANCH_ID, isRowForBranch, formatBranchRowId, stripBranchFromId } from '../models/BranchModel';

const TABLE = 'product_menus';

const applyBranchRowQuery = (query, branchId = DEFAULT_BRANCH_ID) => {
  if (!branchId || branchId === DEFAULT_BRANCH_ID) return query;
  return query.like('id', `${branchId}__%`);
};

const mapRow = (row, branchId = DEFAULT_BRANCH_ID) => ({
  id: row.id,
  rawId: row.id,
  displayId: stripBranchFromId(row.id),
  branchId: branchId,
  name: row.name,
  categoryId: row.category_id,
  categoryName: row.category_name,
  image: row.image || '',
  price: Number(row.price) || 0,
  promoType: row.promo_type || null,
  promoAmount: Number(row.promo_amount) || 0,
  ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
  toppings: Array.isArray(row.toppings) ? row.toppings : [],
  isActive: row.is_active !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const productMenusService = {
  async getProductMenus(branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const query = database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = await applyBranchRowQuery(query, branchId);

    if (error) {
      console.error('productMenusService.getProductMenus error:', error);
      return { data: [], error };
    }

    const filtered = (data || []).filter(row => isRowForBranch(row.id, branchId));

    return {
      data: filtered.map(row => mapRow(row, branchId)),
      error: null
    };
  },

  async createProductMenu(menu, branchId = DEFAULT_BRANCH_ID) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const targetBranchId = menu.branchId || branchId || DEFAULT_BRANCH_ID;
    const finalId = formatBranchRowId(menu.id, targetBranchId);

    const payload = {
      id: finalId,
      name: menu.name,
      category_id: menu.categoryId,
      category_name: menu.categoryName,
      image: menu.image || '',
      price: Number(menu.price) || 0,
      promo_type: menu.promoType || null,
      promo_amount: Number(menu.promoAmount) || 0,
      ingredients: Array.isArray(menu.ingredients) ? menu.ingredients : [],
      toppings: Array.isArray(menu.toppings) ? menu.toppings : [],
      is_active: menu.isActive !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('productMenusService.createProductMenu error:', error);
      return { data: null, error };
    }

    return {
      data: mapRow(data, targetBranchId),
      error: null
    };
  },

  async copyFromBranch(sourceBranchId = DEFAULT_BRANCH_ID, targetBranchId) {
    if (!isDatabaseConfigured()) return { count: 0, error: new Error('MySQL not configured') };
    if (!targetBranchId || targetBranchId === sourceBranchId) return { count: 0, error: null };

    const { data: sourceMenus, error: fetchErr } = await this.getProductMenus(sourceBranchId);
    if (fetchErr || !sourceMenus || sourceMenus.length === 0) {
      return { count: 0, error: fetchErr };
    }

    const payloads = sourceMenus.map(m => {
      const cleanId = stripBranchFromId(m.id);
      return {
        id: formatBranchRowId(cleanId, targetBranchId),
        name: m.name,
        category_id: m.categoryId,
        category_name: m.categoryName,
        image: m.image,
        price: m.price,
        promo_type: m.promoType,
        promo_amount: m.promoAmount,
        ingredients: m.ingredients,
        toppings: m.toppings,
        is_active: m.isActive !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await database
      .from(TABLE)
      .upsert(payloads)
      .select();

    if (error) {
      console.error('productMenusService.copyFromBranch error:', error);
      return { count: 0, error };
    }

    return { count: data?.length || payloads.length, error: null };
  },

  async updateProductMenu(id, menu) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      updated_at: new Date().toISOString()
    };
    if (menu.name !== undefined) payload.name = menu.name;
    if (menu.categoryId !== undefined) payload.category_id = menu.categoryId;
    if (menu.categoryName !== undefined) payload.category_name = menu.categoryName;
    if (menu.image !== undefined) payload.image = menu.image;
    if (menu.price !== undefined) payload.price = Number(menu.price) || 0;
    if (menu.promoType !== undefined) payload.promo_type = menu.promoType;
    if (menu.promoAmount !== undefined) payload.promo_amount = Number(menu.promoAmount) || 0;
    if (menu.ingredients !== undefined) payload.ingredients = menu.ingredients;
    if (menu.toppings !== undefined) payload.toppings = menu.toppings;
    if (menu.isActive !== undefined) payload.is_active = menu.isActive !== false;

    const { data, error } = await database
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('productMenusService.updateProductMenu error:', error);
      return { data: null, error };
    }

    return {
      data: mapRow(data),
      error: null
    };
  },

  async deleteProductMenu(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('productMenusService.deleteProductMenu error:', error);
      return { data: null, error };
    }
    return { data: mapRow(data), error: null };
  },

  async activateProductMenu(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('productMenusService.activateProductMenu error:', error);
      return { data: null, error };
    }
    return { data: mapRow(data), error: null };
  },

  async deleteProductMenusBatch(ids) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .in('id', ids);

    if (error) {
      console.error('productMenusService.deleteProductMenusBatch error:', error);
    }
    return { error };
  }
};
