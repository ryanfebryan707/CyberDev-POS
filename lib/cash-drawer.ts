"use client";

type UsbEndpointLike = { direction: "in" | "out"; endpointNumber: number };
type UsbInterfaceLike = { interfaceNumber: number; alternate: { endpoints: UsbEndpointLike[] } };
type UsbConfigurationLike = { interfaces: UsbInterfaceLike[] };
type UsbDeviceLike = {
  productName?: string;
  opened: boolean;
  configuration?: UsbConfigurationLike | null;
  open(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(value: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<unknown>;
};
type UsbManagerLike = {
  requestDevice(options: { filters: unknown[] }): Promise<UsbDeviceLike>;
  getDevices(): Promise<UsbDeviceLike[]>;
};

let activeDevice: UsbDeviceLike | null = null;

function usbManager() {
  const usb = (navigator as unknown as { usb?: UsbManagerLike }).usb;
  if (!usb) throw new Error("WebUSB tidak didukung. Gunakan Chrome/Edge pada desktop atau Android dan printer ESC/POS yang kompatibel.");
  return usb;
}

async function prepareDevice(device: UsbDeviceLike) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const target = device.configuration?.interfaces
    .map((item) => ({ item, endpoint: item.alternate.endpoints.find((endpoint) => endpoint.direction === "out") }))
    .find((entry) => entry.endpoint);
  if (!target?.endpoint) throw new Error("Endpoint printer ESC/POS tidak ditemukan pada perangkat USB.");
  try {
    await device.claimInterface(target.item.interfaceNumber);
  } catch {
    // Interface yang sudah diklaim pada sesi ini tetap dapat dipakai.
  }
  activeDevice = device;
  return { device, endpointNumber: target.endpoint.endpointNumber };
}

async function getPrinter(requestPermission: boolean) {
  const usb = usbManager();
  if (activeDevice) return prepareDevice(activeDevice);
  const authorized = await usb.getDevices();
  const existing = authorized[0];
  if (existing) return prepareDevice(existing);
  if (!requestPermission) throw new Error("Printer belum dihubungkan. Tekan Hubungkan printer USB sekali sebelum memakai cetak otomatis.");
  return prepareDevice(await usb.requestDevice({ filters: [] }));
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function printerSafeText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E\n]/g, "");
}

export async function connectEscPosPrinter() {
  const target = await getPrinter(true);
  return target.device.productName || "Printer ESC/POS";
}

export async function getAuthorizedPrinterName() {
  try {
    const target = await getPrinter(false);
    return target.device.productName || "Printer ESC/POS";
  } catch {
    return null;
  }
}

export async function printEscPosReceipt(receiptText: string, options?: { openDrawer?: boolean; requestPermission?: boolean }) {
  const target = await getPrinter(options?.requestPermission !== false);
  const encoder = new TextEncoder();
  const initialize = new Uint8Array([0x1b, 0x40]);
  const alignLeft = new Uint8Array([0x1b, 0x61, 0x00]);
  const drawer = options?.openDrawer ? new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]) : new Uint8Array();
  const cut = new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
  const payload = concatBytes([initialize, alignLeft, encoder.encode(printerSafeText(receiptText)), drawer, cut]);
  await target.device.transferOut(target.endpointNumber, payload);
  return target.device.productName || "Printer ESC/POS";
}

export async function openEscPosCashDrawer() {
  const target = await getPrinter(true);
  await target.device.transferOut(target.endpointNumber, new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  return target.device.productName || "Printer ESC/POS";
}
