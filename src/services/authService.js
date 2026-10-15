import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'superadmin_profile';
const SUPERADMIN_ID = 'usr_superadmin';

const DEFAULT_SUPERADMIN = {
  id: 'usr_superadmin',
  nama: 'Super Admin',
  username: 'superadmin',
  password: '',
  role: 'superadmin'
};

export const authService = {
  async getSuperAdminProfile() {
    if (!isDatabaseConfigured()) return { data: DEFAULT_SUPERADMIN, error: null };
    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .eq('id', SUPERADMIN_ID)
      .maybeSingle();

    if (error) {
      console.error('authService.getSuperAdminProfile error:', error);
      return { data: DEFAULT_SUPERADMIN, error };
    }

    if (!data) {
      return { data: DEFAULT_SUPERADMIN, error: null };
    }

    return {
      data: {
        id: data.id,
        nama: data.nama || DEFAULT_SUPERADMIN.nama,
        username: data.username || DEFAULT_SUPERADMIN.username,
        password: '',
        role: 'superadmin'
      },
      error: null
    };
  },

  async saveSuperAdminProfile(profile) {
    if (!isDatabaseConfigured()) return { data: null, error: new Error('MySQL not configured') };
    const payload = {
      id: SUPERADMIN_ID,
      nama: profile.nama,
      username: profile.username,
      password: profile.password,
      role: 'superadmin',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await database
      .from(TABLE)
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error('authService.saveSuperAdminProfile error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  }
};
