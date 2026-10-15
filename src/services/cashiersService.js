import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'cashier_accounts';

export const cashiersService = {
  async getCashiers() {
    if (!isDatabaseConfigured()) return { data: [], error: null };
    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('cashiersService.getCashiers error:', error);
      return { data: [], error };
    }

    return {
      data: (data || []).map(row => ({
        id: row.id,
        nama: row.nama,
        username: row.username,
        password: '',
        role: row.role || 'kasir',
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        branchIds: Array.isArray(row.branch_ids) ? row.branch_ids : [],
        isActive: row.is_active !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      error: null
    };
  },

  async createCashier(cashier) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      id: cashier.id,
      nama: cashier.nama,
      username: cashier.username,
      password: cashier.password,
      role: cashier.role || 'kasir',
      permissions: Array.isArray(cashier.permissions) ? cashier.permissions : [],
      branch_ids: Array.isArray(cashier.branchIds) ? cashier.branchIds : [],
      is_active: cashier.isActive !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('cashiersService.createCashier error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        nama: data.nama,
        username: data.username,
        password: '',
        role: data.role,
        permissions: data.permissions || [],
        branchIds: data.branch_ids || [],
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async updateCashier(id, cashier) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      updated_at: new Date().toISOString()
    };
    if (cashier.nama !== undefined) payload.nama = cashier.nama;
    if (cashier.username !== undefined) payload.username = cashier.username;
    if (cashier.password !== undefined) payload.password = cashier.password;
    if (cashier.role !== undefined) payload.role = cashier.role;
    if (cashier.permissions !== undefined) payload.permissions = cashier.permissions;
    if (cashier.branchIds !== undefined) payload.branch_ids = cashier.branchIds;
    if (cashier.isActive !== undefined) payload.is_active = cashier.isActive;

    const { data, error } = await database
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('cashiersService.updateCashier error:', error);
      return { data: null, error };
    }

    return {
      data: {
        id: data.id,
        nama: data.nama,
        username: data.username,
        password: '',
        role: data.role,
        permissions: data.permissions || [],
        branchIds: data.branch_ids || [],
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      error: null
    };
  },

  async deleteCashier(id) {
    if (!isDatabaseConfigured()) return { error: new Error('MySQL not configured') };
    const { error } = await database
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('cashiersService.deleteCashier error:', error);
    }
    return { error };
  }
};
