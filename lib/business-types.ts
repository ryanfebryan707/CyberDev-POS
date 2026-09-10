export const businessTypes = [
  { code: "general", label: "Usaha Umum", description: "Produk, jasa, dan transaksi fleksibel" },
  { code: "grocery", label: "Toko Kelontong", description: "Sembako, eceran, dan stok harian" },
  { code: "minimarket", label: "Minimarket", description: "Barcode cepat dan inventori retail" },
  { code: "fnb", label: "F&B / Restoran", description: "Menu makanan, minuman, dan meja" },
  { code: "laundry", label: "Laundry", description: "Layanan kiloan, satuan, dan paket" },
  { code: "services", label: "Bisnis Jasa", description: "Jasa profesional dan layanan pelanggan" },
  { code: "pharmacy", label: "Apotek", description: "Produk kesehatan dan stok batch" },
  { code: "workshop", label: "Bengkel", description: "Sparepart, jasa servis, dan pelanggan" },
] as const;

export type BusinessTypeCode = (typeof businessTypes)[number]["code"];

export type StarterProduct = {
  name: string;
  category: string;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  lowStock: number;
};

export function isBusinessType(value: unknown): value is BusinessTypeCode {
  return typeof value === "string" && businessTypes.some((item) => item.code === value);
}

export function businessTypeLabel(value: string | null | undefined) {
  return businessTypes.find((item) => item.code === value)?.label || "Usaha Umum";
}

const grocery: StarterProduct[] = [
  { name: "Beras Premium 5 kg", category: "Sembako", barcode: "899700100101", price: 78000, cost: 69000, stock: 24, unit: "pcs", lowStock: 5 },
  { name: "Minyak Goreng 1 L", category: "Sembako", barcode: "899700100102", price: 19000, cost: 16500, stock: 48, unit: "pcs", lowStock: 8 },
  { name: "Gula Pasir 1 kg", category: "Sembako", barcode: "899700100103", price: 17500, cost: 15000, stock: 36, unit: "pcs", lowStock: 8 },
];

const minimarket: StarterProduct[] = [
  { name: "Air Mineral 600 ml", category: "Minuman", barcode: "899800100101", price: 6000, cost: 3500, stock: 96, unit: "pcs", lowStock: 12 },
  { name: "Mi Instan Goreng", category: "Makanan", barcode: "899800100102", price: 4000, cost: 3100, stock: 120, unit: "pcs", lowStock: 20 },
  { name: "Tisu Wajah", category: "Kebutuhan Rumah", barcode: "899800100103", price: 13500, cost: 10000, stock: 42, unit: "pcs", lowStock: 8 },
];

const fnb: StarterProduct[] = [
  { name: "Kopi Susu Aren", category: "Minuman", barcode: "899100100101", price: 18000, cost: 9000, stock: 42, unit: "porsi", lowStock: 5 },
  { name: "Nasi Goreng Spesial", category: "Makanan", barcode: "899100100102", price: 28000, cost: 15000, stock: 18, unit: "porsi", lowStock: 5 },
  { name: "Air Mineral 600 ml", category: "Minuman", barcode: "899100100106", price: 6000, cost: 3000, stock: 96, unit: "pcs", lowStock: 12 },
];

const laundry: StarterProduct[] = [
  { name: "Cuci Kering Kiloan", category: "Laundry Kiloan", barcode: null, price: 7000, cost: 2600, stock: 999, unit: "kg", lowStock: 0 },
  { name: "Cuci Setrika Kiloan", category: "Laundry Kiloan", barcode: null, price: 10000, cost: 4200, stock: 999, unit: "kg", lowStock: 0 },
  { name: "Cuci Bed Cover", category: "Laundry Satuan", barcode: "LDRY000001", price: 30000, cost: 12000, stock: 999, unit: "pcs", lowStock: 0 },
];

const services: StarterProduct[] = [
  { name: "Konsultasi Dasar", category: "Jasa", barcode: null, price: 100000, cost: 25000, stock: 999, unit: "jam", lowStock: 0 },
  { name: "Paket Layanan Reguler", category: "Paket Jasa", barcode: "SRVC000001", price: 250000, cost: 80000, stock: 999, unit: "paket", lowStock: 0 },
  { name: "Biaya Kunjungan", category: "Jasa", barcode: null, price: 50000, cost: 15000, stock: 999, unit: "kunjungan", lowStock: 0 },
];

const pharmacy: StarterProduct[] = [
  { name: "Vitamin C", category: "Vitamin", barcode: "899600100101", price: 18000, cost: 12500, stock: 48, unit: "strip", lowStock: 10 },
  { name: "Masker Medis", category: "Alat Kesehatan", barcode: "899600100102", price: 2500, cost: 1400, stock: 120, unit: "pcs", lowStock: 20 },
  { name: "Minyak Kayu Putih 60 ml", category: "Obat Luar", barcode: "899600100103", price: 26000, cost: 20500, stock: 32, unit: "botol", lowStock: 6 },
];

const workshop: StarterProduct[] = [
  { name: "Ganti Oli Mesin", category: "Jasa Servis", barcode: "SRVC100001", price: 85000, cost: 35000, stock: 999, unit: "layanan", lowStock: 0 },
  { name: "Oli Mesin 1 L", category: "Pelumas", barcode: "899500100102", price: 65000, cost: 50000, stock: 28, unit: "botol", lowStock: 5 },
  { name: "Busi Motor", category: "Sparepart", barcode: "899500100103", price: 28000, cost: 19000, stock: 36, unit: "pcs", lowStock: 6 },
];

export const starterProductsByBusiness: Record<BusinessTypeCode, StarterProduct[]> = {
  general: fnb,
  grocery,
  minimarket,
  fnb,
  laundry,
  services,
  pharmacy,
  workshop,
};
