import { database, isDatabaseConfigured } from '../lib/database';
import { DEFAULT_BRANCH } from '../models/BranchModel';

const TABLE = 'store_branches';

const mapRow = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code || '',
  address: row.address || '',
  phone: row.phone || '',
  isActive: row.is_active !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const readLocalBranches = () => {
  try {
    const raw = localStorage.getItem('pos_store_branches');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {
    console.error('branchesService local read error:', e);
  }
  return [DEFAULT_BRANCH];
};

const writeLocalBranches = (branches) => {
  try {
    localStorage.setItem('pos_store_branches', JSON.stringify(branches));
  } catch (e) {
    console.error('branchesService local write error:', e);
  }
};

export const branchesService = {
  async getBranches() {
    if (!isDatabaseConfigured()) {
      return { data: readLocalBranches(), error: null };
    }

    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('branchesService.getBranches error:', error);
      return { data: [DEFAULT_BRANCH], error };
    }

    const mapped = (data || []).map(mapRow);
    return { data: mapped.length > 0 ? mapped : [DEFAULT_BRANCH], error: null };
  },

  async createBranch(branch) {
    const payload = {
      id: branch.id,
      name: branch.name,
      code: branch.code || '',
      address: branch.address || '',
      phone: branch.phone || '',
      is_active: branch.isActive !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!isDatabaseConfigured()) {
      const next = [mapRow(payload), ...readLocalBranches()];
      writeLocalBranches(next);
      return { data: mapRow(payload), error: null };
    }

    const { data, error } = await database
      .from(TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('branchesService.createBranch error:', error);
      return { data: null, error };
    }

    return { data: mapRow(data), error: null };
  },

  async updateBranch(id, branch) {
    const payload = { updated_at: new Date().toISOString() };
    if (branch.name !== undefined) payload.name = branch.name;
    if (branch.code !== undefined) payload.code = branch.code;
    if (branch.address !== undefined) payload.address = branch.address;
    if (branch.phone !== undefined) payload.phone = branch.phone;
    if (branch.isActive !== undefined) payload.is_active = branch.isActive;

    if (!isDatabaseConfigured()) {
      const next = readLocalBranches().map((item) => (
        item.id === id
          ? { ...item, ...branch, updatedAt: payload.updated_at }
          : item
      ));
      writeLocalBranches(next);
      return { data: next.find((item) => item.id === id), error: null };
    }

    const { data, error } = await database
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('branchesService.updateBranch error:', error);
      return { data: null, error };
    }

    return { data: mapRow(data), error: null };
  }
};
