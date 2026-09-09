import net from 'node:net';
import { print } from '@maxxuxx/node-printer';
import { config } from './config.js';

// Retsol RTP-80 - kitchen, Ethernet/LAN, raw ESC/POS over a plain TCP
// socket. Never assume an IP; this throws until Printer Settings has one
// configured (see supabase-schema.sql `printers` table).
export async function printKitchenRaw(buffer) {
  if (!config.kitchenPrinterIp) {
    throw new Error('Kitchen printer IP not configured');
  }

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Kitchen printer connection timeout'));
    }, 7000);

    socket.connect(config.kitchenPrinterPort, config.kitchenPrinterIp, () => {
      socket.write(buffer, () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Retsol DCR3 - bristo KOTs + bills, USB, installed as a normal Windows
// printer on the admin desktop (never a WinUSB/Zadig replacement driver -
// this goes through the Windows print spooler exactly like any other
// Windows app printing to it). @maxxuxx/node-printer's `winspool` target
// sends raw bytes through the spooler; it does not need or want an IP.
export async function printDcr3Raw(buffer) {
  if (!config.dcr3WindowsPrinterName) {
    throw new Error('DCR3 Windows printer name not configured.');
  }

  await print({ type: 'winspool', printerName: config.dcr3WindowsPrinterName }, buffer);
}
