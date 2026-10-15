import { database, isDatabaseConfigured } from '../lib/database';

const TABLE = 'store_settings';
const DEFAULT_SETTINGS_ID = 'store_default';

const DEFAULT_SETTINGS = {
  appName: 'XCrepes POS',
  storeName: 'XCrepes',
  storeTagline: 'Good Food Good Mood',
  logo: '',
  phone: '',
  address: '',
  email: '',
  receiptTitle: 'XCrepes',
  receiptSubtitle: '',
  receiptPhone: '',
  receiptFooter1: 'Terima Kasih Atas Kunjungan Anda',
  receiptFooter2: '',
  paperSize: '58mm',
  showLogoOnReceipt: false,
  showCashierName: true,
  showCustomerName: true,
  showTableNumber: true,
  showNotes: true,
  showToppings: true,
  enableTax: false,
  taxRate: 10,
  taxName: 'Pajak'
};

const getLocalTaxSettings = () => {
  try {
    const raw = localStorage.getItem('store_tax_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          enableTax: Boolean(parsed.enableTax),
          taxRate: Number(parsed.taxRate) || 0,
          taxName: parsed.taxName || 'Pajak'
        };
      }
    }
  } catch (e) {
    console.error('Failed to read store_tax_settings from localStorage', e);
  }
  return {
    enableTax: DEFAULT_SETTINGS.enableTax,
    taxRate: DEFAULT_SETTINGS.taxRate,
    taxName: DEFAULT_SETTINGS.taxName
  };
};

const saveLocalTaxSettings = (taxSettings) => {
  try {
    localStorage.setItem('store_tax_settings', JSON.stringify({
      enableTax: Boolean(taxSettings.enableTax),
      taxRate: Number(taxSettings.taxRate) || 0,
      taxName: taxSettings.taxName || 'Pajak'
    }));
  } catch (e) {
    console.error('Failed to write store_tax_settings to localStorage', e);
  }
};

export const settingsService = {
  async getSettings() {
    const localTax = getLocalTaxSettings();
    if (!isDatabaseConfigured()) {
      return { 
        data: {
          ...DEFAULT_SETTINGS,
          ...localTax
        }, 
        error: null 
      };
    }

    const { data, error } = await database
      .from(TABLE)
      .select('*')
      .eq('id', DEFAULT_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      console.error('settingsService.getSettings error:', error);
      return { 
        data: {
          ...DEFAULT_SETTINGS,
          ...localTax
        }, 
        error 
      };
    }

    if (!data) {
      return { 
        data: {
          ...DEFAULT_SETTINGS,
          ...localTax
        }, 
        error: null 
      };
    }

    return {
      data: {
        appName: data.app_name || DEFAULT_SETTINGS.appName,
        storeName: data.store_name || DEFAULT_SETTINGS.storeName,
        storeTagline: data.store_tagline || DEFAULT_SETTINGS.storeTagline,
        logo: data.logo || '',
        phone: data.phone || '',
        address: data.address || '',
        email: data.email || '',
        receiptTitle: data.receipt_title || DEFAULT_SETTINGS.receiptTitle,
        receiptSubtitle: data.receipt_subtitle || '',
        receiptPhone: data.receipt_phone || '',
        receiptFooter1: data.receipt_footer1 || DEFAULT_SETTINGS.receiptFooter1,
        receiptFooter2: data.receipt_footer2 || '',
        paperSize: '58mm',
        showLogoOnReceipt: Boolean(data.show_logo_on_receipt),
        showCashierName: data.show_cashier_name !== false,
        showCustomerName: data.show_customer_name !== false,
        showTableNumber: data.show_table_number !== false,
        showNotes: data.show_notes !== false,
        showToppings: data.show_toppings !== undefined ? data.show_toppings !== false : true,
        enableTax: data.enable_tax !== undefined ? Boolean(data.enable_tax) : localTax.enableTax,
        taxRate: data.tax_rate !== undefined ? Number(data.tax_rate) : localTax.taxRate,
        taxName: data.tax_name !== undefined && data.tax_name ? data.tax_name : localTax.taxName
      },
      error: null
    };
  },

  async saveSettings(settings) {
    // 1. Always persist tax settings to local storage as high-reliability cache
    saveLocalTaxSettings({
      enableTax: settings.enableTax,
      taxRate: settings.taxRate,
      taxName: settings.taxName
    });

    if (!isDatabaseConfigured()) {
      return { data: settings, error: null };
    }

    const basePayload = {
      id: DEFAULT_SETTINGS_ID,
      app_name: settings.appName,
      store_name: settings.storeName,
      store_tagline: settings.storeTagline,
      logo: settings.logo || '',
      phone: settings.phone || '',
      address: settings.address || '',
      email: settings.email || '',
      receipt_title: settings.receiptTitle,
      receipt_subtitle: settings.receiptSubtitle || '',
      receipt_phone: settings.receiptPhone || '',
      receipt_footer1: settings.receiptFooter1 || '',
      receipt_footer2: settings.receiptFooter2 || '',
      paper_size: '58mm',
      show_logo_on_receipt: Boolean(settings.showLogoOnReceipt),
      show_cashier_name: settings.showCashierName !== false,
      show_customer_name: settings.showCustomerName !== false,
      show_table_number: settings.showTableNumber !== false,
      show_notes: settings.showNotes !== false,
      updated_at: new Date().toISOString()
    };

    const fullPayload = {
      ...basePayload,
      show_toppings: settings.showToppings !== false,
      enable_tax: Boolean(settings.enableTax),
      tax_rate: Number(settings.taxRate) || 0,
      tax_name: settings.taxName || 'Pajak'
    };

    // Attempt to upsert with full payload
    let { data, error } = await database
      .from(TABLE)
      .upsert(fullPayload)
      .select()
      .single();

    // Fallback if tax columns don't exist yet in MySQL schema cache
    if (error && (error.code === 'PGRST204' || String(error.message).includes('column'))) {
      console.warn('Tax columns not in remote store_settings table schema yet. Falling back to base payload:', error.message);
      const retry = await database
        .from(TABLE)
        .upsert(basePayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('settingsService.saveSettings error:', error);
      return { data: null, error };
    }

    return { 
      data: {
        ...settings,
        ...data,
        paperSize: '58mm'
      }, 
      error: null 
    };
  }
};
