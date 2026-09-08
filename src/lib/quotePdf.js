import { jsPDF } from 'jspdf';
import { rupee } from './store.js';

// Simple text-based PDF quote for a party/event booking - no table library,
// just positioned text/lines, matching the app's plain-text bill/KOT style.
export function downloadPartyQuote(reservation, restaurantName, restaurantDetails) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(restaurantName || 'Restaurant', pageWidth / 2, y, { align: 'center' });
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const details = [restaurantDetails?.address, restaurantDetails?.phone && `Ph: ${restaurantDetails.phone}`, restaurantDetails?.gstNumber && `GSTIN: ${restaurantDetails.gstNumber}`].filter(Boolean);
  for (const line of details) {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 14;
  }
  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(reservation.packageName ? `${reservation.packageName} — Booking Quote` : 'Party / Event Booking Quote', margin, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const infoLines = [
    `Customer: ${reservation.name}`,
    `Phone: ${reservation.phone}`,
    `Date: ${reservation.date}${reservation.time ? ` at ${reservation.time}` : ''}`,
    `Guests: ${reservation.partySize}`
  ];
  for (const line of infoLines) {
    doc.text(line, margin, y);
    y += 18;
  }
  y += 14;

  if ((reservation.packageItems || []).length) {
    doc.setFont('helvetica', 'bold');
    doc.text('Package Includes:', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    for (const item of reservation.packageItems) {
      doc.text(`• ${item.name}`, margin + 10, y);
      y += 16;
    }
    y += 10;
  }

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFontSize(12);
  const plateCount = reservation.plateCount || 0;
  const perPlate = reservation.pricePerPlate || 0;
  const total = plateCount * perPlate;

  const row = (label, value, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, margin, y);
    doc.text(value, pageWidth - margin, y, { align: 'right' });
    y += 20;
  };
  row('Price per plate', rupee(perPlate));
  if (reservation.advanceAmount > 0) row('Advance / Token', rupee(reservation.advanceAmount));
  if (plateCount > 0) {
    row('Number of plates', String(plateCount));
    y += 4;
    doc.setDrawColor(0);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;
    row('Estimated Total', rupee(total), true);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Final plate count aur total bill ke waqt confirm hoga.', margin, y);
    y += 20;
  }

  y += 20;
  if (reservation.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text(`Note: ${reservation.note}`, margin, y);
    y += 20;
  }

  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This is an estimate - final bill may vary based on actual consumption. Thank you!', margin, y);

  doc.save(`quote-${reservation.name.replace(/\s+/g, '-')}-${reservation.date}.pdf`);
}

export function partyQuoteWhatsappLink(reservation) {
  const digits = (reservation.phone || '').replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  const plateCount = reservation.plateCount || 0;
  const perPlate = reservation.pricePerPlate || 0;
  const total = plateCount * perPlate;
  const items = (reservation.packageItems || []).map((i) => i.name).join(', ');
  const priceLine = plateCount > 0
    ? `${plateCount} plates x ${rupee(perPlate)}/plate = ${rupee(total)}`
    : `${rupee(perPlate)} / plate (final plate count bill ke waqt confirm hoga)`;
  const lines = [
    `Namaste ${reservation.name}, aapki booking (${reservation.date}${reservation.time ? ' ' + reservation.time : ''}) ka quote:`,
    reservation.packageName ? `${reservation.packageName}:` : '',
    priceLine,
    items ? `Includes: ${items}` : '',
    'PDF quote alag se attach kar rahe hain. Dhanyawad!'
  ].filter(Boolean);
  return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}
