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
const SESSION_STORE = "session";
const OFFLINE_SESSION_KEY = "current-client-v1";
const OFFLINE_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export type OfflineUserSnapshot = {
  id:string;
  tenantId:string;
  name:string;
  role:"owner"|"supervisor"|"cashier";
  storeName:string|null;
  phone:string|null;
  address:string|null;
  city:string|null;
  businessType:string|null;
  dataRevision:number|null;
  tenantStatus:"demo"|"active"|"suspend";
  planCode:string|null;
  demoExpiresAt:number|null;
  activeUntil:number|null;
  deviceAuthorizedAt:number|null;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRANSACTION_STORE)) db.createObjectStore(TRANSACTION_STORE, { keyPath: "offlineId" });
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) db.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheOfflineUser(user:OfflineUserSnapshot) {
  const db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(SESSION_STORE,"readwrite");
    tx.objectStore(SESSION_STORE).put({key:OFFLINE_SESSION_KEY,cachedAt:Date.now(),user:{
      id:user.id,tenantId:user.tenantId,name:user.name,role:user.role,storeName:user.storeName,
      phone:user.phone,address:user.address,city:user.city,
      businessType:user.businessType,dataRevision:user.dataRevision,tenantStatus:user.tenantStatus,
      planCode:user.planCode,demoExpiresAt:user.demoExpiresAt,activeUntil:user.activeUntil,
      deviceAuthorizedAt:user.deviceAuthorizedAt,
    }});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

export async function loadOfflineUser() {
  const db=await openDatabase();
  const record=await new Promise<{cachedAt?:number;user?:OfflineUserSnapshot}|undefined>((resolve,reject)=>{
    const request=db.transaction(SESSION_STORE,"readonly").objectStore(SESSION_STORE).get(OFFLINE_SESSION_KEY);
    request.onsuccess=()=>resolve(request.result as {cachedAt?:number;user?:OfflineUserSnapshot}|undefined);
    request.onerror=()=>reject(request.error);
  });
  db.close();
  const user=record?.user;
  if(!user || !record?.cachedAt || Date.now()-record.cachedAt>OFFLINE_SESSION_MAX_AGE)return null;
  if(!user.id || !user.tenantId || !user.name || !["owner","supervisor","cashier"].includes(user.role))return null;
  if(!["demo","active","suspend"].includes(user.tenantStatus))return null;
  return user;
}

export async function clearOfflineUser() {
  const db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(SESSION_STORE,"readwrite");
    tx.objectStore(SESSION_STORE).delete(OFFLINE_SESSION_KEY);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
  db.close();
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
