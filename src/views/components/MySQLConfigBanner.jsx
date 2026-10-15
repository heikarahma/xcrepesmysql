import React, { useState } from 'react';
import { Database, X } from 'lucide-react';
import { isDatabaseConfigured } from '../../lib/database';

export const MySQLConfigBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  if (isDatabaseConfigured() || dismissed) {
    return null;
  }

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.iconBox}>
          <Database size={20} color="#ffffff" />
        </div>
        <div style={styles.textContainer}>
          <strong style={styles.title}>Konfigurasi API MySQL diperlukan</strong>
          <span style={styles.subtitle}>
            Isi credential MySQL server-side, lalu jalankan <code>npm run db:setup</code>. Jangan menaruh password database pada variabel <code>VITE_*</code>.
          </span>
        </div>
      </div>
      <div style={styles.actions}>
        <button 
          onClick={() => setDismissed(true)} 
          style={styles.closeBtn}
          title="Tutup Notifikasi"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

const styles = {
  banner: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 9999,
    position: 'sticky',
    top: 0
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1
  },
  iconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  title: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#f8fafc'
  },
  subtitle: {
    fontSize: '0.813rem',
    color: '#94a3b8',
    lineHeight: 1.3
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
