import { todayStr } from './store.js';

const RM_KEY_PREFIX = 'rm_';

export function downloadBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(RM_KEY_PREFIX)) {
      try { data[key] = JSON.parse(localStorage.getItem(key)); } catch { /* skip unparsable */ }
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `restaurant-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function restoreBackup(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert('Ye file valid backup nahi hai.');
      return;
    }
    const keys = Object.keys(data).filter((k) => k.startsWith(RM_KEY_PREFIX));
    if (keys.length === 0) {
      alert('Is file mein koi valid data nahi mila.');
      return;
    }
    if (!confirm(`Ye backup load karega (${keys.length} records). Current data overwrite ho jaayega - continue karein?`)) return;
    keys.forEach((k) => localStorage.setItem(k, JSON.stringify(data[k])));
    onDone?.();
  };
  reader.readAsText(file);
}
