"use client";

export type OfflineTransaction = {
  tenantId: string;
  offlineId: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  amountReceived: number;
  dataRevision: number;
  items: Array<{ productId: number; qty: number }>;
  queuedAt: number;
};

const DB_NAME = "cyberdev-pos-offline";
const TRANSACTION_STORE = "transactions";
const PRODUCT_STORE = "products";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRANSACTION_STORE)) db.createObjectStore(TRANSACTION_STORE, { keyPath: "offlineId" });
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) db.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineTransaction(transaction: OfflineTransaction) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRANSACTION_STORE, "readwrite");
    tx.objectStore(TRANSACTION_STORE).put(transaction);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readQueue() {
  const db = await openDatabase();
  const items = await new Promise<OfflineTransaction[]>((resolve, reject) => {
    const request = db.transaction(TRANSACTION_STORE, "readonly").objectStore(TRANSACTION_STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineTransaction[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items;
}

async function removeQueued(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRANSACTION_STORE, "readwrite");
    tx.objectStore(TRANSACTION_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export type OfflineProduct = { id:number;name:string;category:string;barcode:string;price:number;cost:number;stock:number;unit:string };

export async function cacheProductsOffline(tenantId: string, products: OfflineProduct[]) {
  const db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(PRODUCT_STORE,"readwrite");
    const store=tx.objectStore(PRODUCT_STORE);
    store.clear();
    products.forEach(product=>store.put({...product,tenantId}));
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

export async function loadProductsOffline(tenantId: string) {
  const db=await openDatabase();
  const products=await new Promise<OfflineProduct[]>((resolve,reject)=>{
    const request=db.transaction(PRODUCT_STORE,"readonly").objectStore(PRODUCT_STORE).getAll();
    request.onsuccess=()=>resolve(request.result as OfflineProduct[]);request.onerror=()=>reject(request.error);
  });
  db.close();
  return products.filter(product=>(product as OfflineProduct & {tenantId?:string}).tenantId===tenantId);
}

export async function flushOfflineTransactions(tenantId: string) {
  if (!tenantId) return 0;
  if (!navigator.onLine) return 0;
  const queue = await readQueue();
  let synced = 0;
  for (const item of queue.filter(item => item.tenantId === tenantId)) {
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      // Keep rejected/stale transactions for reconciliation; never silently discard a sale.
      if (response.ok) {
        await removeQueued(item.offlineId);
        synced += 1;
      }
    } catch {
      break;
    }
  }
  return synced;
}

export async function saveTransactionOnlineFirst(payload: Omit<OfflineTransaction, "offlineId" | "queuedAt">) {
  const transaction: OfflineTransaction = {
    ...payload,
    offlineId: `OFF-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    queuedAt: Date.now(),
  };
  try {
    if (!navigator.onLine) throw new Error("offline");
    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transaction),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string; id?: string; createdAt?: number };
    if (!response.ok) {
      if (response.status === 409 && data.code === "STALE_OFFLINE_DATA") {
        throw new Error(data.error || "Data toko telah direset. Muat ulang katalog sebelum bertransaksi.");
      }
      if (response.status === 401 || response.status === 403) throw new Error(data.error || "Akses transaksi ditolak.");
      if (response.status >= 500) throw new Error("sync-failed");
      throw new Error(data.error || "Transaksi ditolak karena data tidak valid.");
    }
    return { synced: true, queued: false, transactionId: data.id || transaction.offlineId, createdAt: Number(data.createdAt || Date.now()) };
  } catch (error) {
    if (error instanceof Error && error.message !== "offline" && error.message !== "sync-failed" && !error.message.includes("fetch")) throw error;
    await queueOfflineTransaction(transaction);
    return { synced: false, queued: true, transactionId: transaction.offlineId, createdAt: transaction.queuedAt };
  }
}
