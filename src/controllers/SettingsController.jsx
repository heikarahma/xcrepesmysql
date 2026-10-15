import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsService } from '../services/settingsService';
import { subscribeToTable } from '../lib/database';
import { useUnit } from './UnitController';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const useSettingsController = useSettings;

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

export const SettingsProvider = ({ children }) => {
  const { showToast } = useUnit();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch settings from MySQL
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await settingsService.getSettings();
      if (!error && data) {
        setSettings({ ...data, paperSize: '58mm' });
      }
    } catch (e) {
      console.error('Failed to fetch settings from MySQL:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    const channel = subscribeToTable('store_settings', () => {
      fetchSettings();
    });

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [fetchSettings]);

  useEffect(() => {
    const storeTitle = String(settings.storeName || settings.appName || 'PosQue').trim();
    document.title = storeTitle || 'PosQue';
  }, [settings.storeName, settings.appName]);

  // Update Settings in MySQL
  const updateSettings = async (newValues) => {
    const updated = { ...settings, ...newValues, paperSize: '58mm' };
    setSettings(updated);
    setIsSaving(true);
    try {
      const { error } = await settingsService.saveSettings(updated);
      if (error) {
        showToast(`Gagal menyimpan pengaturan: ${error.message}`, 'error', 'Error Database');
        return { success: false, error: error.message };
      }
      showToast('Pengaturan toko berhasil disimpan ke cloud database.', 'success', 'Pengaturan Disimpan');
      return { success: true };
    } catch (e) {
      showToast(e.message, 'error', 'Error');
      return { success: false, error: e.message };
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default
  const resetSettings = async () => {
    return updateSettings(DEFAULT_SETTINGS);
  };

  // Update specific Logo
  const updateLogo = (logoDataUrl) => {
    return updateSettings({ logo: logoDataUrl });
  };

  // Remove Logo
  const removeLogo = () => {
    return updateSettings({ logo: '' });
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        isSaving,
        refetch: fetchSettings,
        updateSettings,
        resetSettings,
        updateLogo,
        removeLogo
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
