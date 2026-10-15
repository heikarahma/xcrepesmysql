import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'categories';

export const categoriesService = {
  async getCategories() {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('categoriesService.getCategories error:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(row => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      error: null
    };
  },

  async createCategory({ id, name, description = '' }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      id,
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('categoriesService.createCategory error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async updateCategory(id, { name, description = '' }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        name,
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('categoriesService.updateCategory error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async deleteCategory(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('categoriesService.deleteCategory error:', error);
    }
    return { error };
  },

  async deleteCategoriesBatch(ids) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .in('id', ids);

    if (error) {
      console.error('categoriesService.deleteCategoriesBatch error:', error);
    }
    return { error };
  },

  /**
   * Fetch category custom display order from MySQL.
   */
  async getCategoryOrder() {
    if (!isDatabaseConfigured()) return { data: null, error: null };
    try {
      const { data, error } = await database
        .from('inventory_stock_logs')
        .select('*')
        .eq('id', 'CONFIG-CATEGORY-ORDER')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('categoriesService.getCategoryOrder error:', error);
        return { data: null, error };
      }

      if (data && data.note) {
        try {
          const parsed = JSON.parse(data.note);
          if (Array.isArray(parsed)) {
            return { data: parsed, error: null };
          }
        } catch (e) {}
      }
      return { data: null, error: null };
    } catch (err) {
      console.error('Unexpected error in getCategoryOrder:', err);
      return { data: null, error: err };
    }
  },

  /**
   * Save category custom display order to MySQL.
   */
  async saveCategoryOrder(orderIds) {
    if (!isDatabaseConfigured() || !Array.isArray(orderIds)) return { data: null, error: null };
    try {
      const payload = {
        id: 'CONFIG-CATEGORY-ORDER',
        type: 'CONFIG_CATEGORY_ORDER',
        amount: 0,
        previous_stock: 0,
        current_stock: 0,
        reference_invoice: 'CONFIG',
        note: JSON.stringify(orderIds),
        user_name: 'superadmin',
        created_at: new Date().toISOString()
      };

      const { data, error } = await database
        .from('inventory_stock_logs')
        .upsert([payload])
        .select()
        .single();

      if (error) {
        console.error('categoriesService.saveCategoryOrder error:', error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (err) {
      console.error('Unexpected error in saveCategoryOrder:', err);
      return { data: null, error: err };
    }
  }
};
