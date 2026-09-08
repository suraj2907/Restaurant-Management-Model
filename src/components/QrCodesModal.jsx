import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal, { ModalActions, Btn } from './Modal.jsx';

// One QR poster per table, each encoding a link straight to that table's
// customer-ordering page (`/order/<qr_token>`) - generated entirely
// client-side (no external QR API call), so nothing about the restaurant's
// tables ever leaves the browser except to render the image.
export default function QrCodesModal({ open, onClose, tableRows }) {
  const [images, setImages] = useState({}); // tableId -> data URL

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const entries = await Promise.all(
        tableRows.map(async (t) => {
          const url = `${window.location.origin}/order/${t.qrToken}`;
          const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
          return [t.id, dataUrl];
        })
      );
      if (active) setImages(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [open, tableRows]);

  function downloadOne(name, dataUrl) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${name}.png`;
    a.click();
  }

  return (
    <Modal open={open} onClose={onClose} title="Table QR Codes" wide printArea>
      <p className="text-muted text-xs -mt-1 mb-3 no-print">Har table pe ye QR print karke chipka dein — customer scan karke seedha apna order daal sakta hai.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tableRows.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-1.5 border border-border rounded-lg p-2.5">
            {images[t.id] ? <img src={images[t.id]} alt={`QR ${t.name}`} className="w-full max-w-[140px]" /> : <div className="w-full aspect-square max-w-[140px] bg-well animate-pulse rounded" />}
            <p className="font-bold text-sm text-ink">{t.name}</p>
            <button onClick={() => downloadOne(t.name, images[t.id])} disabled={!images[t.id]} className="no-print text-xs font-semibold text-accent-dark disabled:opacity-40">
              Download
            </button>
          </div>
        ))}
      </div>
      <ModalActions>
        <Btn variant="primary" onClick={() => window.print()}>Print All</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </ModalActions>
    </Modal>
  );
}
