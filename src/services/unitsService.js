import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'units';

export const unitsService = {
  async getUnits() {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('unitsService.getUnits error:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(row => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      error: null
    };
  },

  async createUnit({ id, name }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      id,
      name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('unitsService.createUnit error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async updateUnit(id, { name }) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const { data, error } = await database
      .from(TABLE)
      .update({
        name,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('unitsService.updateUnit error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async deleteUnit(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('unitsService.deleteUnit error:', error);
    }
    return { error };
  },

  async deleteUnitsBatch(ids) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .in('id', ids);

    if (error) {
      console.error('unitsService.deleteUnitsBatch error:', error);
    }
    return { error };
  }
};
