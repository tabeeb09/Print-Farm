import { readPrinterConfig, savePrinterConfig } from "./s3Files.js";

function publicPrinter(printer) {
  return {
    ...printer,
    accessCode: undefined,
    hasAccessCode: Boolean(printer?.accessCode),
  };
}

function normalizePrinter(input, existing = null) {
  const accessCode = String(input.accessCode || "").trim() || existing?.accessCode || "";
  return {
    id: input.id || existing?.id || crypto.randomUUID(),
    label: String(input.label || existing?.label || "").trim(),
    host: String(input.host || existing?.host || "").trim(),
    serial: String(input.serial || existing?.serial || "").trim(),
    accessCode,
    lanPort: Number(input.lanPort || existing?.lanPort || 6000),
    ftpPort: Number(input.ftpPort || existing?.ftpPort || 990),
    amsSlot: input.amsSlot === "" || input.amsSlot === null || input.amsSlot === undefined ? null : Number(input.amsSlot),
    sslFtp: Boolean(input.sslFtp ?? existing?.sslFtp),
    sslMqtt: Boolean(input.sslMqtt ?? existing?.sslMqtt),
    updatedAt: new Date().toISOString(),
  };
}

export async function listPrintersForAdmin() {
  const config = (await readPrinterConfig()) || { printers: [] };
  return {
    activePrinterId: config.activePrinterId || null,
    printers: (config.printers || []).map(publicPrinter),
  };
}

export async function savePrinterForAdmin(input) {
  const config = (await readPrinterConfig()) || { printers: [] };
  const existing = (config.printers || []).find((printer) => printer.id === input.id);
  const printer = normalizePrinter(input, existing);
  if (!printer.label || !printer.host || !printer.serial || !printer.accessCode) {
    throw new Error("Printer label, host, serial, and LAN access code are required.");
  }
  const printers = (config.printers || []).filter((item) => item.id !== printer.id);
  printers.unshift(printer);
  await savePrinterConfig({
    ...config,
    activePrinterId: input.active ? printer.id : config.activePrinterId || printer.id,
    printers,
  });
  return listPrintersForAdmin();
}

export async function deletePrinterForAdmin(id) {
  const config = (await readPrinterConfig()) || { printers: [] };
  const printers = (config.printers || []).filter((printer) => printer.id !== id);
  await savePrinterConfig({
    ...config,
    activePrinterId: config.activePrinterId === id ? printers[0]?.id || null : config.activePrinterId || null,
    printers,
  });
  return listPrintersForAdmin();
}
