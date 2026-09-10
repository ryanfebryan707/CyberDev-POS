"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import Image from "next/image";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  CloudOff,
  Copy,
  CreditCard,
  Crown,
  DatabaseZap,
  Download,
  Eye,
  EyeOff,
  FileText,
  Grid2X2,
  Headphones,
  LayoutDashboard,
  Landmark,
  LocateFixed,
  LogOut,
  MapPin,
  Menu,
  Megaphone,
  Minus,
  Moon,
  MoreHorizontal,
  Package,
  PackagePlus,
  Plus,
  Pencil,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  UserRound,
  UserPlus,
  Users,
  WalletCards,
  Wifi,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomersView, StaffView, SettingsView } from "./management";
import { exportRows, readRows, parseProductNumber } from "@/lib/spreadsheet";
import { Progress } from "@/components/ui/progress";
import { cacheProductsOffline, flushOfflineTransactions, loadProductsOffline, saveTransactionOnlineFirst } from "@/lib/offline-pos";
import { connectEscPosPrinter, getAuthorizedPrinterName, openEscPosCashDrawer, printEscPosReceipt } from "@/lib/cash-drawer";
import { businessTypeLabel, businessTypes } from "@/lib/business-types";
import { buildReceiptHtml, buildReceiptText, type ReceiptData } from "@/lib/receipt";

type IconType = ComponentType<{ className?: string }>;
type View = "overview" | "pos" | "products" | "reports" | "customers" | "staff" | "billing" | "settings" | "admin";
type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  color: string;
  barcode: string;
};
type CartItem = Product & { qty: number };
type AppUser = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: "superadmin" | "owner" | "supervisor" | "cashier";
  storeName: string | null;
  businessType: string | null;
  dataRevision: number | null;
  tenantStatus: "demo" | "active" | "suspend" | null;
  planCode: string | null;
  demoExpiresAt: number | null;
  activeUntil: number | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  locationConsentAt: number | null;
  deviceAuthorizedAt: number | null;
  lastIp: string | null;
};

type PlanOption = { code: string; name: string; period: string; price: number; popular?: boolean; best?: boolean };
type PaymentMethod = { id: string; channel: string; name: string; account: string; holder: string };
type CustomerServiceContact = { label: string; phone: string; wa: string };
type NotificationItem = { id:string;title:string;message:string;audience:string;severity:"info"|"success"|"warning";createdAt:number;expiresAt:number|null;isRead:number };

const planOptions: PlanOption[] = [
  { code: "weekly", name: "Mingguan", period: "1 minggu", price: 60000 },
  { code: "monthly", name: "Bulanan", period: "1 bulan", price: 200000, popular: true },
  { code: "quarterly", name: "3 Bulan", period: "3 bulan", price: 550000 },
  { code: "halfyear", name: "6 Bulan", period: "6 bulan", price: 1100000 },
  { code: "yearly", name: "12 Bulan", period: "12 bulan", price: 2100000, best: true },
  { code: "twoyear", name: "24 Bulan", period: "24 bulan", price: 4400000 },
];

const formatPrice = (value: number) => `Rp${new Intl.NumberFormat("id-ID").format(value)}`;
const emptyProductForm = { name: "", category: "Lainnya", price: "", cost: "0", stock: "0", barcode: "", unit: "pcs" };

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup">
      <Image
        className="brand-logo-image"
        src="/cyberdev-logo.svg"
        alt="Logo CyberDev Moch Rizky Febryanto"
        width={48}
        height={48}
        priority
        unoptimized
      />
      {!compact && <div><strong>CyberDev</strong><span>POS</span></div>}
    </div>
  );
}

function LoginLogo() {
  return (
    <Image
      className="login-logo-image"
      src="/cyberdev-brand.jpg"
      alt="CyberDev — Moch Rizky Febryanto"
      width={128}
      height={128}
      priority
      sizes="(max-width: 640px) 76px, 92px"
    />
  );
}

function GoogleIcon() {
  return (
    <svg className="size-5 google-login-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.35 12.2c0-.74-.06-1.28-.2-1.84H12v3.48h5.37a4.58 4.58 0 0 1-1.99 3.01v2.26h3.22c1.89-1.74 2.75-4.3 2.75-6.91Z" />
      <path fill="#34A853" d="M12 21.7c2.7 0 4.96-.89 6.61-2.42l-3.22-2.26c-.89.6-2.03.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.08v2.33A9.99 9.99 0 0 0 12 21.7Z" />
      <path fill="#FBBC05" d="M6.41 13.86A6 6 0 0 1 6.1 12c0-.65.11-1.28.31-1.86V7.81H3.08A10 10 0 0 0 2 12c0 1.62.39 3.15 1.08 4.19l3.33-2.33Z" />
      <path fill="#EA4335" d="M12 6.02c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.66 9.66 0 0 0 12 2.3a9.99 9.99 0 0 0-8.92 5.51l3.33 2.33C7.2 7.78 9.4 6.02 12 6.02Z" />
    </svg>
  );
}

const navGroups: { label: string; items: { id: View; label: string; icon: IconType }[] }[] = [
  { label: "OPERASIONAL", items: [
    { id: "overview", label: "Beranda", icon: LayoutDashboard },
    { id: "pos", label: "Kasir / POS", icon: ShoppingCart },
    { id: "products", label: "Produk & Stok", icon: Package },
    { id: "reports", label: "Laporan", icon: BarChart3 },
  ] },
  { label: "MANAJEMEN", items: [
    { id: "customers", label: "Pelanggan", icon: Users },
    { id: "staff", label: "Karyawan", icon: UserRound },
    { id: "billing", label: "Langganan", icon: CreditCard },
    { id: "settings", label: "Pengaturan", icon: Settings },
  ] },
];

function Sidebar({ view, setView, open, onClose, user, onLogout }: { view: View; setView: (view: View) => void; open: boolean; onClose: () => void; user: AppUser; onLogout: () => void }) {
  const [renderedAt]=useState(()=>Date.now());
  return (
    <>
      {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Tutup menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-head"><Logo /><button className="mobile-close" onClick={onClose}><X /></button></div>
        <div className="store-switcher">
          <div className="store-icon"><Store /></div>
          <div><span>{user.role === "superadmin" ? "Kontrol pusat" : "Toko aktif"}</span><strong>{user.role === "superadmin" ? "CyberDev POS SaaS" : user.storeName}</strong></div>
          <ChevronDown className="size-4" />
        </div>
        <nav className="sidebar-nav">
          {user.role !== "superadmin" && navGroups.map((group) => (
            <div key={group.label}>
              <p>{group.label}</p>
              {group.items.filter(item=>user.role==="owner"|| (user.role==="supervisor" ? !["staff","billing"].includes(item.id) : ["overview","pos","settings"].includes(item.id))).map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); onClose(); }}><Icon /><span>{item.label}</span></button>;
              })}
            </div>
          ))}
          {user.role === "superadmin" && <div>
            <p>PEMILIK PRODUK</p>
            <button className={view === "admin" ? "active" : ""} onClick={() => { setView("admin"); onClose(); }}><ShieldCheck /><span>Super Admin</span><Crown className="nav-crown" /></button>
            <button className={view === "settings" ? "active" : ""} onClick={() => { setView("settings"); onClose(); }}><Settings /><span>Keamanan Akun</span></button>
          </div>}
        </nav>
        {user.role !== "superadmin" && <div className="sidebar-trial">
          <div><Sparkles /><span>Status {user.tenantStatus}</span></div>
          <strong>{user.tenantStatus === "active" ? `Paket ${user.planCode || "aktif"}` : user.tenantStatus === "suspend" ? "Akun tersuspend" : "Demo 14 hari"}</strong>
          <Progress value={Math.min(100,Math.max(0,Math.ceil(((user.activeUntil||user.demoExpiresAt||0)-renderedAt)/86400000)))} className="trial-progress" />
          <button onClick={() => setView("billing")}>Upgrade sekarang <ArrowRight /></button>
        </div>}
        <a className="support-link" href="https://wa.me/6282244837977" target="_blank" rel="noreferrer"><Headphones /><span><small>Customer Service 1 & 2</small><strong>082244837977 / 085234005206</strong></span></a>
        <button className="sidebar-logout" onClick={onLogout}><LogOut /><span>Keluar dari akun</span></button>
      </aside>
    </>
  );
}

function NotificationCenter({ user }: { user: AppUser }) {
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<NotificationItem[]>([]);
  const [unread,setUnread]=useState(0);
  const [loading,setLoading]=useState(true);
  const load=async()=>{
    try{
      const response=await fetch("/api/notifications");
      const data=await response.json() as {notifications?:NotificationItem[];unread?:number};
      if(response.ok){setItems(data.notifications||[]);setUnread(Number(data.unread||0));}
    }finally{setLoading(false);}
  };
  useEffect(()=>{load().catch(()=>undefined);const timer=window.setInterval(()=>load().catch(()=>undefined),60000);return()=>window.clearInterval(timer);},[user.id]);
  const markRead=async(id:string)=>{
    setItems(current=>current.map(item=>item.id===id?{...item,isRead:1}:item));
    setUnread(current=>Math.max(0,current-1));
    await fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"read",announcementId:id})}).catch(()=>undefined);
  };
  const markAll=async()=>{
    setItems(current=>current.map(item=>({...item,isRead:1})));setUnread(0);
    await fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"read_all"})}).catch(()=>undefined);
  };
  return <div className="notification-wrap">
    <button className="notification" aria-label="Buka pemberitahuan" aria-expanded={open} onClick={()=>{const next=!open;setOpen(next);if(next){setLoading(true);load().catch(()=>undefined);}}}><Bell />{unread>0&&<i>{unread>99?"99+":unread}</i>}</button>
    {open&&<div className="notification-panel">
      <div className="notification-head"><span><strong>Pemberitahuan</strong><small>{user.role==="superadmin"?"Broadcast dan informasi sistem":"Informasi resmi CyberDev POS"}</small></span>{unread>0&&<button onClick={markAll}><Check/> Tandai dibaca</button>}</div>
      <div className="notification-list">
        {loading&&!items.length&&<div className="notification-empty"><RefreshCcw/><span>Memuat pemberitahuan...</span></div>}
        {!loading&&!items.length&&<div className="notification-empty"><Bell/><strong>Belum ada pemberitahuan</strong><span>Informasi baru dari admin akan muncul di sini.</span></div>}
        {items.map(item=><button key={item.id} className={`notification-row ${item.severity} ${item.isRead?"read":"unread"}`} onClick={()=>!item.isRead&&markRead(item.id)}><span className="notification-row-icon">{item.severity==="warning"?<CircleAlert/>:item.severity==="success"?<BadgeCheck/>:<Megaphone/>}</span><span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} • {item.audience==="all"?"Semua client":item.audience}</time></span>{!item.isRead&&<i/>}</button>)}
      </div>
    </div>}
  </div>;
}

function Topbar({ title, dark, setDark, onMenu, user, onLogout }: { title: string; dark: boolean; setDark: (v: boolean) => void; onMenu: () => void; user: AppUser; onLogout: () => void }) {
  return <header className="topbar">
    <button className="menu-button" onClick={onMenu} aria-label="Buka menu"><Menu /></button>
    <div><p>{user.role === "superadmin" ? "Admin pusat" : user.storeName}</p><h1>{title}</h1></div>
    <div className="topbar-actions">
      <div className="sync-pill"><DatabaseZap /><span>Data toko</span></div>
      <button onClick={() => setDark(!dark)} aria-label="Ubah tema">{dark ? <Sun /> : <Moon />}</button>
      <NotificationCenter user={user}/>
      <button className="profile-button" onClick={onLogout} title="Klik untuk keluar"><div>{user.name.split(" ").map(x => x[0]).slice(0,2).join("")}</div><span><strong>{user.name}</strong><small>{user.role === "superadmin" ? "Super Admin" : user.role === "owner" ? "Pemilik Toko" : user.role === "supervisor" ? "Supervisor" : "Kasir"}</small></span><LogOut /></button>
    </div>
  </header>;
}

function StatCard({ label, value, change, icon: Icon, tone, down, context = "" }: { label: string; value: string; change: string; icon: IconType; tone: string; down?: boolean; context?: string }) {
  return <article className="stat-card">
    <div className={`stat-icon ${tone}`}><Icon /></div>
    <div className="stat-meta"><span>{label}</span><strong>{value}</strong><small className={down ? "negative" : "positive"}>{down ? <ArrowDownRight /> : <ArrowUpRight />}{change}{context&&<> <em>{context}</em></>}</small></div>
  </article>;
}

function SalesChart({hourly}:{hourly:Array<{hour:number;revenue:number}>}) {
  const max=Math.max(1,...hourly.map(item=>Number(item.revenue)));
  return <div className="actual-sales-chart" aria-label="Penjualan per jam WITA">{hourly.length?hourly.map(item=><div key={item.hour} className="actual-sales-row"><time>{String(item.hour).padStart(2,"0")}:00</time><span style={{width:`${Math.max(2,Number(item.revenue)/max*65)}%`}}/><strong>{formatPrice(Number(item.revenue))}</strong></div>):<p className="empty-activity">Belum ada transaksi hari ini.</p>}</div>;
}

function Overview({ setView }: { setView: (v: View) => void }) {
  const [dashboard, setDashboard] = useState<{stats?:{transactionCount:number;revenue:number;grossSales:number;productCount:number;lowStock:number};latest?:Array<{id:string;total:number;paymentMethod:string;createdAt:number}>;subscription?:{status:string;hasAccess:boolean};hourly?:Array<{hour:number;revenue:number}>;topProducts?:Array<{id:number;name:string;quantity:number;revenue:number}>;lowProducts?:Array<{id:number;name:string;stock:number;unit:string}>}>({});
  useEffect(() => { fetch("/api/dashboard").then(res=>res.json()).then(setDashboard).catch(()=>undefined); }, []);
  const stats = dashboard.stats || { transactionCount:0,revenue:0,grossSales:0,productCount:0,lowStock:0 };
  return <div className="view-stack">
    <section className="welcome-row">
      <div><p>{new Date().toLocaleDateString("id-ID",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</p><h2>Ringkasan toko hari ini <span>👋</span></h2><p>Angka di bawah berasal dari transaksi akun toko ini.</p></div>
      <Button className="primary-action" onClick={() => setView("pos")}><ShoppingCart /> Mulai transaksi</Button>
    </section>
    {dashboard.subscription && !dashboard.subscription.hasAccess && <section className="access-locked"><ShieldCheck/><span><strong>Akses POS sedang terkunci</strong><small>Data Anda tetap aman. Buka menu Langganan untuk mengajukan aktivasi kembali.</small></span><button onClick={()=>setView("billing")}>Perpanjang sekarang <ArrowRight/></button></section>}
    <section className="stats-grid">
      <StatCard label="Omzet hari ini" value={formatPrice(Number(stats.revenue||0))} change="data aktual" icon={WalletCards} tone="violet" />
      <StatCard label="Total transaksi" value={String(stats.transactionCount||0)} change="hari ini" icon={ReceiptText} tone="blue" />
      <StatCard label="Produk terdaftar" value={String(stats.productCount||0)} change="milik toko" icon={TrendingUp} tone="green" />
      <StatCard label="Stok menipis" value={`${stats.lowStock||0} produk`} change="cek stok" icon={Boxes} tone="orange" down />
    </section>
    <section className="dashboard-grid">
      <article className="panel sales-panel">
        <div className="panel-head"><div><h3>Penjualan hari ini</h3><p>Transaksi tersimpan hari ini • WITA</p></div><button>Hari ini <ChevronDown /></button></div>
        <SalesChart hourly={dashboard.hourly||[]} />
      </article>
      <article className="panel activity-panel">
        <div className="panel-head"><div><h3>Aktivitas terbaru</h3><p>Transaksi dan stok</p></div><button className="icon-more"><MoreHorizontal /></button></div>
        <div className="activity-list">
          {(dashboard.latest||[]).map((a) => <div key={a.id}><div className="activity-icon sale"><ReceiptText /></div><span><strong>{a.id}</strong><small>{a.paymentMethod} • Transaksi tersimpan</small></span><em><b>+{formatPrice(Number(a.total))}</b><small>{new Date(a.createdAt).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</small></em></div>)}
          {!dashboard.latest?.length && <div className="empty-activity">Belum ada transaksi hari ini.</div>}
        </div>
      </article>
    </section>
    <section className="bottom-grid">
      <article className="panel top-products">
        <div className="panel-head"><div><h3>Produk terlaris</h3><p>Berdasarkan kuantitas hari ini</p></div><button onClick={() => setView("products")}>Lihat semua <ArrowRight /></button></div>
        {(dashboard.topProducts||[]).map((p,i)=><div className="rank-row" key={p.id}><b>{i+1}</b><span><strong>{p.name}</strong><small>{p.quantity} terjual</small></span><em>{formatPrice(Number(p.revenue))}</em></div>)}
        {!dashboard.topProducts?.length&&<p className="empty-activity">Belum ada produk terjual hari ini.</p>}
      </article>
      <article className="panel alerts-panel">
        <div className="panel-head"><div><h3>Perlu perhatian</h3><p>Stok dan operasional toko</p></div></div>
        {(dashboard.lowProducts||[]).map(p=><div className="alert-item warning" key={p.id}><Package/><span><strong>{p.name}</strong><small>Tersisa {p.stock} {p.unit}</small></span></div>)}
        {!dashboard.lowProducts?.length&&<div className="empty-activity">Tidak ada peringatan stok.</div>}
      </article>
    </section>
  </div>;
}

function PosView({ user }: { user: AppUser }) {
  const tenantId = user.tenantId || "";
  const dataRevision = Number(user.dataRevision || 1);
  const [category, setCategory] = useState("Semua");
  const [query, setQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCode, setScannerCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payment, setPayment] = useState("QRIS");
  const [customPayment, setCustomPayment] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentQueued, setPaymentQueued] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [customerName, setCustomerName] = useState("Umum");
  const [taxRate, setTaxRate] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [drawerMessage, setDrawerMessage] = useState("");
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [printerMessage, setPrinterMessage] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [autoDrawer, setAutoDrawer] = useState(true);
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptData | null>(null);
  const [online, setOnline] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const scannerBufferRef = useRef("");
  const scannerLastKeyRef = useRef(0);
  useEffect(() => {
    const colors = ["amber","orange","emerald","blue","purple","lime","red","yellow"];
    fetch("/api/products").then(res => res.json()).then((data: { products?: Array<Omit<Product,"color">> }) => {
      const serverProducts=data.products||[];
      setCatalogProducts(serverProducts.map((item, index) => ({ ...item, barcode: item.barcode || "", color: colors[index % colors.length] })));
      cacheProductsOffline(tenantId,serverProducts).catch(()=>undefined);
    }).catch(() => loadProductsOffline(tenantId).then(cached=>setCatalogProducts(cached.map((item,index)=>({...item,color:colors[index%colors.length]})))).catch(()=>undefined));
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) flushOfflineTransactions(tenantId).catch(() => undefined); };
    update();
    getAuthorizedPrinterName().then(setPrinterName).catch(() => setPrinterName(null));
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      scanningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [tenantId]);
  const categories = ["Semua", ...Array.from(new Set(catalogProducts.map(p => p.category)))];
  const shown = catalogProducts.filter((p) => (category === "Semua" || p.category === category) && (p.name.toLowerCase().includes(query.toLowerCase()) || (p.barcode || "").includes(query)));
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = Math.round(subtotal * Math.min(100, Math.max(0, Number(taxRate) || 0)) / 100);
  const discount = Math.min(subtotal + tax, Math.max(0, Number(discountAmount) || 0));
  const total = Math.max(0, subtotal + tax - discount);
  const cashValue = Math.max(0, Number(cashReceived) || 0);
  const changeDue = Math.max(0, cashValue - total);
  const resolvedPayment = payment === "Lainnya" ? customPayment.trim().slice(0, 32) || "Lainnya" : payment;
  const cashSuggestions = Array.from(new Set([
    total,
    Math.ceil(total / 10000) * 10000,
    Math.ceil(total / 50000) * 50000,
    Math.ceil(total / 100000) * 100000,
  ].filter(value => value >= total)));
  const add = (product: Product) => setCart((prev) => prev.some((i) => i.id === product.id)
    ? prev.map((i) => i.id === product.id ? { ...i, qty: Math.min(i.stock, i.qty + 1) } : i)
    : product.stock > 0 ? [...prev, { ...product, qty: 1 }] : prev);
  const setQty = (id: number, quantity: number) => setCart((prev) => prev
    .map((item) => item.id === id ? { ...item, qty: Math.min(item.stock, Math.max(0, Math.round(quantity * 1000) / 1000)) } : item)
    .filter((item) => item.qty > 0));
  const changeQty = (id: number, amount: number) => setCart((prev) => prev
    .map((item) => item.id === id ? { ...item, qty: Math.min(item.stock, Math.max(0, Math.round((item.qty + amount) * 1000) / 1000)) } : item)
    .filter((item) => item.qty > 0));
  const stopCamera = () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };
  const scanBarcode = useCallback((rawCode: string) => {
    const code = rawCode.replace(/\s/g, "");
    if (!code) return;
    const product = catalogProducts.find((item) => item.barcode === code);
    if (!product) {
      setScanMessage(`Barcode ${code} belum terdaftar. Tambahkan melalui Produk & Stok.`);
      return;
    }
    setCart((current) => current.some((item) => item.id === product.id)
      ? current.map((item) => item.id === product.id ? { ...item, qty: Math.min(item.stock, item.qty + 1) } : item)
      : product.stock > 0 ? [...current, { ...product, qty: 1 }] : current);
    setQuery("");
    setScannerCode("");
    setScanMessage(product.stock > 0 ? `${product.name} • ${formatPrice(product.price)} masuk ke keranjang.` : `${product.name} ditemukan, tetapi stok sudah habis.`);
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setScannerOpen(false);
  }, [catalogProducts]);
  const startCamera = async () => {
    setScanMessage("");
    try {
      const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!Detector) throw new Error("Pemindai kamera belum didukung browser ini. Gunakan scanner USB/Bluetooth atau ketik barcode.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Kamera belum siap.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      scanningRef.current = true;
      setCameraActive(true);
      const detect = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found[0]?.rawValue) return scanBarcode(found[0].rawValue);
        } catch { /* frame kamera berikutnya akan dicoba */ }
        requestAnimationFrame(detect);
      };
      detect();
    } catch (reason) {
      stopCamera();
      setScanMessage(reason instanceof Error ? reason.message : "Kamera tidak dapat diaktifkan.");
    }
  };
  useEffect(() => {
    const onScannerKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const now = Date.now();
      if (now - scannerLastKeyRef.current > 120) scannerBufferRef.current = "";
      scannerLastKeyRef.current = now;
      if (event.key === "Enter") {
        const code = scannerBufferRef.current;
        scannerBufferRef.current = "";
        if (code.length >= 4) {
          event.preventDefault();
          scanBarcode(code);
        }
        return;
      }
      if (event.key.length === 1 && /[0-9A-Za-z_-]/.test(event.key)) scannerBufferRef.current += event.key;
    };
    window.addEventListener("keydown", onScannerKey);
    return () => window.removeEventListener("keydown", onScannerKey);
  }, [scanBarcode]);
  const confirmPayment = async () => {
    if (!cart.length || total <= 0) {
      setPaymentError("Keranjang belum memiliki transaksi yang valid.");
      return;
    }
    if (payment === "Tunai" && cashValue < total) {
      setPaymentError("Uang diterima masih kurang " + formatPrice(total - cashValue) + ".");
      return;
    }
    setSavingPayment(true);
    setPaymentError("");
    try {
      const amountReceived = payment === "Tunai" ? cashValue : total;
      const result = await saveTransactionOnlineFirst({
        tenantId,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod: resolvedPayment,
        customerName: customerName.trim() || "Umum",
        amountReceived,
        dataRevision,
        items: cart.map((item) => ({ productId: item.id, qty: item.qty })),
      });
      const receipt: ReceiptData = {
        transactionId: result.transactionId,
        storeName: user.storeName || "Toko",
        address: user.address,
        city: user.city,
        phone: user.phone,
        cashierName: user.name,
        customerName: customerName.trim() || "Umum",
        createdAt: result.createdAt,
        items: cart.map((item) => ({
          name: item.name,
          barcode: item.barcode,
          quantity: item.qty,
          unit: item.unit || "pcs",
          unitPrice: item.price,
          lineTotal: Math.round(item.price * item.qty),
        })),
        subtotal,
        tax,
        discount,
        total,
        paymentMethod: resolvedPayment,
        amountReceived,
        changeAmount: payment === "Tunai" ? changeDue : 0,
      };
      setPaymentQueued(result.queued);
      setCompletedReceipt(receipt);
      setCatalogProducts((current) => current.map((product) => {
        const sold = cart.find((item) => item.id === product.id)?.qty || 0;
        return sold ? { ...product, stock: Math.max(0, product.stock - sold) } : product;
      }));
      setPaid(true);
      if (autoPrint && printerName) {
        try {
          const device = await printEscPosReceipt(buildReceiptText(receipt), { openDrawer: payment === "Tunai" && autoDrawer, requestPermission: false });
          setPrinterMessage(`Struk dikirim ke ${device}${payment === "Tunai" && autoDrawer ? " dan laci kas dibuka" : ""}.`);
        } catch (reason) {
          setPrinterMessage(reason instanceof Error ? reason.message : "Cetak otomatis belum berhasil.");
        }
      } else if (autoPrint && !printerName) {
        setPrinterMessage("Transaksi tersimpan. Hubungkan printer USB untuk memakai cetak otomatis.");
      } else if (payment === "Tunai" && autoDrawer && printerName) {
        await openCashDrawer();
      }
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Pembayaran tidak dapat diproses.");
    } finally {
      setSavingPayment(false);
    }
  };
  const connectPrinter = async () => {
    setPrinterMessage("Meminta izin perangkat USB...");
    try {
      const device = await connectEscPosPrinter();
      setPrinterName(device);
      setPrinterMessage(`${device} terhubung dan siap mencetak.`);
    } catch (reason) {
      setPrinterMessage(reason instanceof Error ? reason.message : "Printer USB belum dapat dihubungkan.");
    }
  };
  const printUsbReceipt = async () => {
    if (!completedReceipt) return;
    setPrinterMessage("Mengirim struk ke printer thermal...");
    try {
      const device = await printEscPosReceipt(buildReceiptText(completedReceipt), { openDrawer: payment === "Tunai" && autoDrawer, requestPermission: true });
      setPrinterName(device);
      setPrinterMessage(`Struk berhasil dikirim ke ${device}.`);
    } catch (reason) {
      setPrinterMessage(reason instanceof Error ? reason.message : "Struk belum dapat dicetak melalui USB.");
    }
  };
  const printBrowserReceipt = () => {
    if (!completedReceipt) return;
    const popup = window.open("", "cyberdev-pos-receipt", "width=420,height=760");
    if (!popup) {
      setPrinterMessage("Pop-up struk diblokir browser. Izinkan pop-up lalu coba lagi.");
      return;
    }
    popup.document.open();
    popup.document.write(buildReceiptHtml(completedReceipt));
    popup.document.close();
  };
  const openCashDrawer = async () => {
    setDrawerMessage("Menghubungkan printer / laci kas...");
    try {
      const device = await openEscPosCashDrawer();
      setDrawerMessage(`Perintah buka laci dikirim ke ${device}.`);
    } catch (reason) {
      setDrawerMessage(reason instanceof Error ? reason.message : "Laci kas belum dapat dibuka.");
    }
  };
  const newTransaction = () => {
    setCart([]);
    setCompletedReceipt(null);
    setCustomerName("Umum");
    setDiscountAmount("0");
    setPaymentOpen(false);
    setPaid(false);
    setPrinterMessage("");
    setDrawerMessage("");
  };
  return <div className="pos-layout">
    <section className="catalog-area">
      <div className="pos-toolbar"><div className="search-box"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scanBarcode(query); }} placeholder="Cari produk atau scan barcode USB, lalu Enter..." autoFocus /><kbd>Enter</kbd></div><button className="scan-button" onClick={() => { setScanMessage(""); setScannerOpen(true); }}><QrCode /> Kamera</button><button className={printerName ? "printer-connect connected" : "printer-connect"} onClick={connectPrinter}><Printer /> {printerName ? "Printer aktif" : "Hubungkan USB"}</button></div>
      {scanMessage && <div className={`scan-feedback ${scanMessage.includes("masuk ke keranjang") ? "success" : ""}`}>{scanMessage}</div>}
      <div className="category-row">{categories.map((c) => <button className={category === c ? "selected" : ""} onClick={() => setCategory(c)} key={c}>{c}</button>)}</div>
      <div className="product-grid">{shown.map((p) => <button className="product-card" disabled={p.stock <= 0} onClick={() => add(p)} key={p.id}><div className={`product-visual ${p.color}`}><span>{p.name.split(" ").map(w => w[0]).slice(0,2).join("")}</span><i>{p.stock <= 0 ? "Stok habis" : p.stock <= 10 ? `Sisa ${p.stock}` : `${p.stock} stok`}</i></div><div><strong>{p.name}</strong><small>{p.category}</small><b>{formatPrice(p.price)}</b></div><Plus className="add-product" /></button>)}</div>
      {!shown.length && <div className="catalog-empty"><Package /><strong>Belum ada produk</strong><span>Tambahkan produk melalui menu Produk & Stok.</span></div>}
    </section>
    <aside className="cart-panel">
      <div className="cart-head"><div><h3>Pesanan baru</h3><p>Nomor struk dibuat otomatis</p></div><button onClick={() => setCart([])} aria-label="Kosongkan keranjang"><Trash2 /></button></div>
      <label className="customer-select"><div><UserRound /></div><span><small>Nama pelanggan</small><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Umum / non-member" maxLength={80}/></span></label>
      <div className="cart-items">
        {cart.length === 0 ? <div className="empty-cart"><ShoppingBag /><strong>Keranjang masih kosong</strong><span>Pilih produk atau scan barcode untuk memulai transaksi</span></div> : cart.map((item) => <div className="cart-item" key={item.id}><div className={`product-mini ${item.color}`}>{item.name.slice(0,2).toUpperCase()}</div><span><strong>{item.name}</strong><small>{formatPrice(item.price)} • stok {item.stock} {item.unit}</small><div><button onClick={() => changeQty(item.id, -1)} aria-label={`Kurangi ${item.name}`}><Minus /></button><input aria-label={`Quantity ${item.name}`} value={item.qty} onChange={(event) => setQty(item.id, Number(event.target.value))} type="number" min="0.001" max={item.stock} step="0.001" inputMode="decimal"/><button onClick={() => changeQty(item.id, 1)} aria-label={`Tambah ${item.name}`}><Plus /></button></div></span><em>{formatPrice(item.price * item.qty)}</em></div>)}
      </div>
      <div className="cart-summary"><div><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div><div className="summary-edit"><label>Pajak<input value={taxRate} onChange={(event)=>setTaxRate(event.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" aria-label="Persentase pajak"/><i>%</i></label><b>{formatPrice(tax)}</b></div><div className="summary-edit"><label><Tag/> Diskon<input value={discountAmount} onChange={(event)=>setDiscountAmount(event.target.value.replace(/\D/g,""))} inputMode="numeric" aria-label="Nominal diskon"/></label><b>-{formatPrice(discount)}</b></div><div className="grand-total"><span>Total bayar</span><strong>{formatPrice(total)}</strong></div></div>
      <Button disabled={!cart.length || total <= 0} className="pay-button" onClick={() => { setPaid(false); setCompletedReceipt(null); setPaymentError(""); setPrinterMessage(""); setDrawerMessage(""); setCashReceived(String(total)); setPaymentOpen(true); }}><WalletCards /> Bayar sekarang <span>F8</span></Button>
      <div className="pos-foot-status"><span className={online ? "" : "offline"}>{online ? <Wifi /> : <CloudOff />}{online ? "Koneksi online" : "Mode offline aktif"}</span><span className={printerName ? "printer-ready" : "printer-offline"}><Printer />{printerName || "Printer belum terhubung"}</span></div>
      {printerMessage && <div className="printer-message">{printerMessage}</div>}
    </aside>
    <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
      <DialogContent className="payment-dialog">
        {!paid ? <>
          <DialogHeader><DialogTitle>Pilih metode pembayaran</DialogTitle><DialogDescription>Metode, uang diterima, dan kembalian akan tercetak pada struk transaksi.</DialogDescription></DialogHeader>
          <div className="payment-total"><span>Total bayar</span><strong>{formatPrice(total)}</strong></div>
          <div className="payment-options">{[["Tunai", CircleDollarSign], ["QRIS", QrCode], ["Kartu / EDC", CreditCard], ["E-Wallet", WalletCards], ["Transfer Bank", Building2], ["Lainnya", MoreHorizontal]].map(([name, I]) => { const Icon = I as IconType; return <button key={name as string} className={payment === name ? "selected" : ""} onClick={() => { setPayment(name as string);setPaymentError("");if(name==="Tunai")setCashReceived(String(total)); }}><Icon /><span>{name as string}</span>{payment === name && <Check />}</button>; })}</div>
          {payment === "Lainnya" && <label className="custom-payment">Nama metode pembayaran<input value={customPayment} onChange={(event)=>setCustomPayment(event.target.value)} maxLength={32} placeholder="Contoh: Voucher, Tempo, atau Marketplace" autoFocus/></label>}
          {payment === "Tunai" && <div className="cash-tender"><label>Uang diterima<div><span>Rp</span><input value={cashReceived} onChange={event=>setCashReceived(event.target.value.replace(/\D/g,""))} inputMode="numeric" autoFocus/></div></label><div className="cash-suggestions">{cashSuggestions.map(value=><button key={value} onClick={()=>setCashReceived(String(value))}>{value===total?"Uang pas":formatPrice(value)}</button>)}</div><div className={cashValue>=total?"cash-change ready":"cash-change"}><span>Kembalian</span><strong>{formatPrice(changeDue)}</strong><small>{cashValue>=total?"Siap selesaikan transaksi":"Uang diterima belum mencukupi"}</small></div></div>}
          {payment === "QRIS" && <div className="qris-preview"><QrCode /><span><strong>QRIS dinamis siap dibuat</strong><small>Pelanggan memindai setelah konfirmasi</small></span></div>}
          {paymentError && <div className="auth-error">{paymentError}</div>}
          <div className="print-preferences"><label><input type="checkbox" checked={autoPrint} onChange={(event)=>setAutoPrint(event.target.checked)}/> Cetak otomatis melalui USB</label><label><input type="checkbox" checked={autoDrawer} onChange={(event)=>setAutoDrawer(event.target.checked)}/> Buka laci otomatis untuk tunai</label></div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Batal</Button><Button className="confirm-payment" disabled={savingPayment||(payment==="Tunai"&&cashValue<total)||(payment==="Lainnya"&&!customPayment.trim())} onClick={confirmPayment}>{savingPayment ? "Menyimpan..." : `Konfirmasi ${resolvedPayment}`}</Button></DialogFooter>
        </> : <div className="payment-success"><div>{paymentQueued ? <CloudOff /> : <Check />}</div><h3>{paymentQueued ? "Transaksi disimpan offline" : "Transaksi tersimpan"}</h3><p>{paymentQueued ? "Transaksi menunggu sinkronisasi. Periksa kembali stok dan koneksi sebelum menutup perangkat." : `Struk ${completedReceipt?.transactionId || ""} tersimpan atas nama ${completedReceipt?.customerName || "Umum"}.`}</p><strong>{formatPrice(total)}</strong>{payment==="Tunai"&&<div className="cash-receipt-summary"><span>Uang diterima <b>{formatPrice(cashValue)}</b></span><span>Kembalian <b>{formatPrice(changeDue)}</b></span></div>}{printerMessage&&<div className="drawer-message">{printerMessage}</div>}{drawerMessage&&<div className="drawer-message">{drawerMessage}</div>}<div className="payment-success-actions"><Button variant="outline" onClick={printBrowserReceipt}><ReceiptText /> Cetak browser</Button><Button variant="outline" onClick={printUsbReceipt}><Printer /> Cetak USB</Button>{payment==="Tunai"&&<Button variant="outline" onClick={openCashDrawer}><WalletCards/> Buka laci kas</Button>}<Button onClick={newTransaction}><Plus /> Transaksi baru</Button></div></div>}
      </DialogContent>
    </Dialog>
    <Dialog open={scannerOpen} onOpenChange={(open) => { setScannerOpen(open); if (!open) stopCamera(); }}>
      <DialogContent className="scanner-dialog"><DialogHeader><DialogTitle>Scan barcode produk</DialogTitle><DialogDescription>Scanner USB/Bluetooth langsung mengetik kode. Scan lalu tekan Enter; harga toko otomatis dimasukkan.</DialogDescription></DialogHeader><div className={`camera-frame ${cameraActive ? "active" : ""}`}><video ref={videoRef} muted playsInline /><div><QrCode/><span>{cameraActive ? "Arahkan barcode ke kamera" : "Kamera belakang opsional"}</span></div></div><label className="scanner-input">Kode barcode<div className="input-action"><input value={scannerCode} onChange={(event) => setScannerCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scanBarcode(scannerCode); }} placeholder="Contoh: 899100100101" autoFocus/><button onClick={() => scanBarcode(scannerCode)}><ArrowRight/></button></div></label>{scanMessage && <div className="auth-error">{scanMessage}</div>}<DialogFooter><Button variant="outline" onClick={cameraActive ? stopCamera : startCamera}><QrCode/> {cameraActive ? "Matikan kamera" : "Aktifkan kamera"}</Button><Button onClick={() => scanBarcode(scannerCode)}>Tambahkan produk</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}

function ProductsView({ tenantId }: { tenantId: string }) {
  const [query, setQuery] = useState("");
  const [categoryFilter,setCategoryFilter]=useState("Semua");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number|null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [items, setItems] = useState<Product[]>([]);
  const [tenantStatus, setTenantStatus] = useState<"demo" | "active" | "suspend">("demo");
  const [form, setForm] = useState({...emptyProductForm});
  const [error, setError] = useState("");
  const [success,setSuccess]=useState("");
  const [importMessage, setImportMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const loadProducts = async () => {
    const response=await fetch("/api/products");
    const data = await response.json() as { products?: Array<Omit<Product,"color">>; tenantStatus?: "demo" | "active" | "suspend";error?:string };
    if(!response.ok)throw new Error(data.error||"Produk toko belum dapat dimuat.");
    const colors = ["amber","orange","emerald","blue","purple","lime","red","yellow"];
    cacheProductsOffline(tenantId,data.products||[]).catch(()=>undefined);
    setItems((data.products || []).map((item, index) => ({ ...item, barcode: item.barcode || "", color: colors[index % colors.length] })));
    setTenantStatus(data.tenantStatus || "demo");
  };
  useEffect(() => {
    let active = true;
    const colors = ["amber","orange","emerald","blue","purple","lime","red","yellow"];
    fetch("/api/products").then(res => res.json()).then((data: { products?: Array<Omit<Product,"color">>; tenantStatus?: "demo" | "active" | "suspend" }) => {
      if (!active) return;
      setItems((data.products || []).map((item, index) => ({ ...item, barcode: item.barcode || "", color: colors[index % colors.length] })));
      setTenantStatus(data.tenantStatus || "demo");
      cacheProductsOffline(tenantId,data.products||[]).catch(()=>undefined);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [tenantId]);
  const categories=["Semua",...Array.from(new Set(items.map(item=>item.category))).sort()];
  const filtered = items.filter(p => (categoryFilter==="Semua"||p.category===categoryFilter)&&(p.name.toLowerCase().includes(query.toLowerCase()) || p.barcode.includes(query)));
  const saveProduct = async () => {
    if(!form.name.trim())return setError("Nama produk wajib diisi.");
    if(!form.category.trim())return setError("Kategori produk wajib diisi.");
    if(!form.price||Number(form.price)<=0)return setError("Harga jual harus lebih dari Rp0.");
    if(Number(form.cost)<0||Number(form.stock)<0)return setError("Harga modal dan stok tidak boleh negatif.");
    if(!form.unit.trim())return setError("Satuan produk wajib diisi, misalnya pcs, kg, atau porsi.");
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Produk gagal disimpan.");
      await loadProducts();
      setForm({...emptyProductForm});
      setAddOpen(false);
      setSuccess(`Produk ${form.name.trim()} berhasil ditambahkan dan siap dipakai di kasir.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Produk gagal disimpan."); }
    finally { setSaving(false); }
  };
  const openProductEdit = (product:Product) => {
    setEditingId(product.id);
    setForm({name:product.name,category:product.category,price:String(product.price),cost:String(product.cost||0),stock:String(product.stock),barcode:product.barcode||"",unit:product.unit||"pcs"});
    setError("");setEditOpen(true);
  };
  const updateProduct = async () => {
    if (!editingId) return;
    setSaving(true);setError("");
    try {
      const response = await fetch("/api/products",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...form,id:editingId,price:Number(form.price),cost:Number(form.cost),stock:Number(form.stock)})});
      const data = await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Produk gagal diperbarui.");
      await loadProducts();setEditOpen(false);setEditingId(null);
    } catch(reason){setError(reason instanceof Error?reason.message:"Produk gagal diperbarui.");}
    finally{setSaving(false);}
  };
  const downloadTemplate = () => {
    const content = "Nama Produk,Barcode,Harga Jual,Harga Modal,Stok,Kategori,Satuan\nKopi Susu,899100100101,18000,9000,25,Minuman,pcs\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    link.download = "Template-Import-Produk-CyberDev.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const exportProducts = async () => {
    await exportRows(`Produk-CyberDev-${new Date().toISOString().slice(0,10)}.xlsx`,[{name:"Produk",rows:items.map(item=>({"Nama Produk":item.name,Barcode:item.barcode,"Harga Jual":item.price,"Harga Modal":item.cost,Stok:item.stock,Kategori:item.category,Satuan:item.unit}))}]);
  };
  const importExcel = async (file: File) => {
    setSaving(true);
    setImportMessage("");
    try {
      const rows=await readRows(file);
      const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const pick = (row: Record<string, unknown>, aliases: string[]) => {
        const found = Object.keys(row).find((name) => aliases.includes(key(name)));
        return found ? row[found] : "";
      };
      const number = parseProductNumber;
      const productsToImport = rows.map((row) => ({
        name: String(pick(row, ["namaproduk", "nama", "produk", "productname"])),
        barcode: String(pick(row, ["barcode", "kodebarcode", "kode", "sku"])).replace(/\.0$/, ""),
        price: number(pick(row, ["hargajual", "harga", "price", "sellingprice"])),
        cost: number(pick(row, ["hargamodal", "modal", "cost", "costprice"])),
        stock: number(pick(row, ["stok", "stock", "qty", "quantity"])),
        category: String(pick(row, ["kategori", "category"])) || "Lainnya",
        unit: String(pick(row, ["satuan", "unit"])) || "pcs",
      }));
      const response = await fetch("/api/products/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: productsToImport }) });
      const result = await response.json() as { error?: string; created?: number; updated?: number; skipped?: number };
      if (!response.ok) throw new Error(result.error || "Import gagal diproses.");
      setImportMessage(`Selesai: ${result.created || 0} produk baru, ${result.updated || 0} diperbarui, ${result.skipped || 0} dilewati.`);
      await loadProducts();
    } catch (reason) {
      setImportMessage(reason instanceof Error ? reason.message : "File tidak dapat dibaca.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return <div className="view-stack">
    <section className="section-title"><div><h2>Produk & stok</h2><p>Kelola katalog, harga modal, harga jual, barcode, satuan, dan stok toko.</p></div><div className="section-actions"><Button variant="outline" onClick={() => { setImportMessage(""); setImportOpen(true); }}><FileText /> Import Excel {tenantStatus !== "active" && <ShieldCheck/>}</Button><Button onClick={() => {setForm({...emptyProductForm});setError("");setSuccess("");setAddOpen(true);}}><Plus /> Tambah produk</Button></div></section>
    {success&&<div className="admin-notice"><BadgeCheck/>{success}<button onClick={()=>setSuccess("")} aria-label="Tutup pesan"><X/></button></div>}
    <section className="stats-grid compact"><StatCard label="Total produk" value={String(items.length)} change="data toko" icon={Package} tone="violet" /><StatCard label="Nilai inventori" value={formatPrice(items.reduce((sum,p)=>sum+p.price*p.stock,0))} change="real-time" icon={Boxes} tone="blue" /><StatCard label="Stok menipis" value={`${items.filter(p=>p.stock<=10).length} produk`} change="perlu restock" icon={Activity} tone="orange" down /><StatCard label="Barcode aktif" value={String(items.filter(p=>p.barcode).length)} change="siap scan" icon={QrCode} tone="green" /></section>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="search-box"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau barcode..." /></div><label className="category-filter"><Grid2X2/><select value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value)}>{categories.map(category=><option key={category}>{category}</option>)}</select><ChevronDown/></label><button onClick={exportProducts}><Download /> Export Excel</button></div>
      <div className="data-table product-table"><div className="table-row table-head-row"><span>Produk</span><span>Barcode</span><span>Harga modal</span><span>Harga jual</span><span>Untung/unit</span><span>Stok</span><span>Status</span><span></span></div>{filtered.map(p => <div className="table-row" key={p.id}><span className="product-cell"><div className={`product-mini ${p.color}`}>{p.name.slice(0,2).toUpperCase()}</div><b>{p.name}<small>{p.category}</small></b></span><span className="mono">{p.barcode||"—"}</span><span>{formatPrice(p.cost||0)}</span><span><b>{formatPrice(p.price)}</b></span><span><b className={p.price-(p.cost||0)>=0?"profit-text":"loss-text"}>{formatPrice(p.price-(p.cost||0))}</b></span><span><b>{p.stock}</b> {p.unit||"pcs"}</span><span><i className={`status ${p.stock <= 10 ? "low" : "active"}`}>{p.stock <= 10 ? "Menipis" : "Aman"}</i></span><span><button className="icon-more" onClick={()=>openProductEdit(p)} aria-label={"Edit "+p.name}><Pencil /></button></span></div>)}{!filtered.length&&<div className="admin-empty"><Package/><strong>{items.length?"Produk tidak ditemukan":"Belum ada produk"}</strong><span>{items.length?"Coba ubah kata kunci atau kategori.":"Klik Tambah produk untuk membuat katalog pertama."}</span></div>}</div>
    </section>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Tambah produk baru</DialogTitle><DialogDescription>Masukkan data wajib. Harga modal dipakai untuk menghitung laba, sedangkan harga jual tampil otomatis saat barcode dipindai.</DialogDescription></DialogHeader><div className="form-grid"><label>Nama produk *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Contoh: Kopi Americano" autoFocus /></label><label>Kategori *<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="Contoh: Minuman atau Sembako" /></label><label>Harga modal<input value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} type="number" min="0" inputMode="numeric" placeholder="9000" /></label><label>Harga jual *<input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} type="number" min="1" inputMode="numeric" placeholder="18000" /></label><label>Stok awal<input value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} type="number" min="0" inputMode="decimal" placeholder="0" /></label><label>Satuan *<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="pcs, kg, porsi, paket" /></label><label className="wide">Barcode<div className="input-action"><input ref={barcodeRef} value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value.replace(/\s/g,"")})} onKeyDown={event=>event.key==="Enter"&&saveProduct()} placeholder="Scan USB/Bluetooth atau ketik barcode" /><button type="button" onClick={()=>barcodeRef.current?.focus()} aria-label="Fokus input barcode"><QrCode /></button></div></label>{error && <div className="auth-error wide">{error}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button disabled={saving} onClick={saveProduct}>{saving ? "Menyimpan..." : "Simpan produk"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent><DialogHeader><DialogTitle>Edit harga & stok produk</DialogTitle><DialogDescription>Perubahan harga modal dipakai untuk analitik transaksi berikutnya; histori lama tetap memakai modal saat transaksi.</DialogDescription></DialogHeader><div className="form-grid"><label>Nama produk<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Kategori<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Harga modal<input type="number" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/></label><label>Harga jual<input type="number" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Stok<input type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label><label>Satuan<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label><label className="wide">Barcode<input value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/></label>{error&&<div className="auth-error wide">{error}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>setEditOpen(false)}>Batal</Button><Button disabled={saving} onClick={updateProduct}>{saving?"Menyimpan...":"Simpan perubahan"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="import-dialog"><DialogHeader><DialogTitle>Import produk dari Excel</DialogTitle><DialogDescription>Kolom yang dikenali: Nama Produk, Barcode, Harga Jual, Harga Modal, Stok, Kategori, dan Satuan. Barcode yang sama akan memperbarui produk lama.</DialogDescription></DialogHeader>{tenantStatus !== "active" ? <div className="premium-inline"><ShieldCheck/><span><strong>Fitur penuh terkunci saat Demo</strong><small>Aktifkan paket Mingguan, Bulanan, atau Tahunan agar import Excel tersedia.</small></span></div> : <button className="excel-dropzone" disabled={saving} onClick={() => fileRef.current?.click()}><FileText/><strong>{saving ? "Mengimpor produk..." : "Pilih file Excel / CSV"}</strong><span>.xlsx, .xls, atau .csv • maksimal 1.000 baris</span></button>}<input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) importExcel(file); }}/>{importMessage && <div className={importMessage.startsWith("Selesai") ? "import-success" : "auth-error"}>{importMessage}</div>}<div className="excel-note"><b>Tip:</b> formatkan kolom barcode sebagai Text di Excel agar angka panjang tidak berubah.</div><DialogFooter><Button variant="outline" onClick={downloadTemplate}><Download/> Unduh template</Button><Button onClick={() => setImportOpen(false)}>Selesai</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function SubscriptionGate({ status, feature, setView }: { status: "demo" | "active" | "suspend" | null; feature: string; setView: (view: View) => void }) {
  return <section className="premium-gate"><div className="premium-gate-icon"><ShieldCheck/></div><span className="login-eyebrow"><Crown/> AKSES BERLANGGANAN</span><h2>{status === "suspend" ? "Masa aktif akun telah berakhir" : `${feature} tersedia di paket penuh`}</h2><p>{status === "suspend" ? "Seluruh produk, transaksi, dan laporan tetap tersimpan aman. Perpanjang langganan untuk membukanya kembali." : "Demo tetap dapat mencoba transaksi dasar dan menambah hingga 20 produk. Aktivasi Mingguan, Bulanan, atau Tahunan membuka semua fitur profesional."}</p><Button onClick={() => setView("billing")}><CreditCard/> Lihat paket & aktifkan <ArrowRight/></Button></section>;
}

function ReportsView() {
  type ReportData = {
    periodDays:number;
    summary:{transactionCount:number;revenue:number;costOfGoods:number;grossProfit:number;margin:number;averageOrder:number};
    daily:Array<{day:string;revenue:number;costOfGoods:number}>;
    topProducts:Array<{name:string;quantity:number;revenue:number;profit:number}>;
    paymentMix:Array<{method:string;count:number;total:number}>;
    error?:string;
  };
  const [days,setDays]=useState(30);
  const [data,setData]=useState<ReportData|null>(null);
  useEffect(()=>{fetch("/api/reports?days="+String(days)).then(res=>res.json()).then(setData).catch(()=>setData({error:"Koneksi laporan gagal."} as ReportData));},[days]);
  if(!data)return <div className="report-loading"><RefreshCcw/><strong>Menghitung untung-rugi aktual...</strong></div>;
  if(!data||data.error)return <div className="premium-gate"><ShieldCheck/><h2>Laporan belum tersedia</h2><p>{data?.error||"Aktifkan paket dan otorisasi lokasi toko terlebih dahulu."}</p></div>;
  const summary=data.summary;
  const maxRevenue=Math.max(1,...data.daily.map(item=>Number(item.revenue)));
  const exportReport=async()=>{
    await exportRows(`Laporan-CyberDev-${days}-hari.xlsx`,[{name:"Ringkasan",rows:[{Periode:`${days} hari`,Omzet:summary.revenue,HPP:summary.costOfGoods,"Laba Kotor":summary.grossProfit,Margin:summary.margin,Transaksi:summary.transactionCount}]},{name:"Profit Produk",rows:data.topProducts.map(item=>({Produk:item.name,Terjual:item.quantity,Omzet:Number(item.revenue),"Laba Kotor":Number(item.profit)}))}]);
  };
  return <div className="view-stack">
    <section className="section-title"><div><h2>Laporan untung-rugi aktual</h2><p>Harga modal disimpan pada setiap item transaksi agar laba historis tidak berubah saat harga produk diedit.</p></div><div className="button-pair"><select value={days} onChange={event=>{setData(null);setDays(Number(event.target.value));}}><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select><Button onClick={exportReport}><Download/> Export laporan</Button></div></section>
    <section className="stats-grid compact"><StatCard label="Omzet" value={formatPrice(summary.revenue)} change={String(summary.transactionCount)+" transaksi"} icon={WalletCards} tone="violet"/><StatCard label="Harga pokok (HPP)" value={formatPrice(summary.costOfGoods)} change="modal barang terjual" icon={Package} tone="orange" down/><StatCard label={summary.grossProfit>=0?"Laba kotor":"Kerugian kotor"} value={formatPrice(summary.grossProfit)} change={String(summary.margin)+"% margin"} icon={summary.grossProfit>=0?TrendingUp:ArrowDownRight} tone={summary.grossProfit>=0?"green":"orange"} down={summary.grossProfit<0}/><StatCard label="Rata-rata transaksi" value={formatPrice(summary.averageOrder)} change= "per struk" icon={ReceiptText} tone="blue"/></section>
    <section className="dashboard-grid"><article className="panel real-profit-chart"><div className="panel-head"><div><h3>Omzet vs HPP harian</h3><p>{days} hari terakhir • data transaksi tersimpan</p></div><span className="legend"><i/> Omzet <i/> HPP</span></div><div className="profit-bars">{data.daily.length?data.daily.map(item=>{const revenue=Number(item.revenue);const cost=Number(item.costOfGoods);return <div key={item.day} title={item.day+" • Omzet "+formatPrice(revenue)+" • HPP "+formatPrice(cost)}><span className="revenue-bar" style={{height:String(Math.max(4,(revenue/maxRevenue)*100))+"%"}}/><span className="cost-bar" style={{height:String(Math.max(3,(cost/maxRevenue)*100))+"%"}}/><small>{new Date(item.day+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short"})}</small></div>}):<div className="empty-report">Belum ada transaksi pada periode ini.</div>}</div></article><article className="panel payment-mix-panel"><div className="panel-head"><div><h3>Metode pembayaran</h3><p>Komposisi transaksi aktual</p></div></div><div className="payment-mix-list">{data.paymentMix.map((item,index)=><div key={item.method}><i className={"mix-"+String(index%4)}/><span><strong>{item.method}</strong><small>{item.count} transaksi</small></span><b>{formatPrice(Number(item.total))}</b></div>)}{!data.paymentMix.length&&<div className="empty-report">Belum ada pembayaran.</div>}</div></article></section>
    <section className="panel table-panel"><div className="panel-head"><div><h3>Profit per produk</h3><p>Produk terlaris dan laba kotor periode berjalan</p></div></div><div className="data-table profit-table"><div className="table-row table-head-row"><span>Produk</span><span>Terjual</span><span>Omzet</span><span>Laba kotor</span><span>Margin</span></div>{data.topProducts.map(item=>{const revenue=Number(item.revenue);const profit=Number(item.profit);const margin=revenue>0?Math.round((profit/revenue)*10000)/100:0;return <div className="table-row" key={item.name}><span><b>{item.name}</b></span><span>{item.quantity}</span><span>{formatPrice(revenue)}</span><span><b className={profit>=0?"profit-text":"loss-text"}>{formatPrice(profit)}</b></span><span>{margin}%</span></div>})}{!data.topProducts.length&&<div className="empty-report">Belum ada data produk terjual.</div>}</div></section>
  </div>;
}
function BillingView() {
  const [selected, setSelected] = useState("yearly");
  const [selectedMethod, setSelectedMethod] = useState("bri");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [copied, setCopied] = useState("");
  const [data, setData] = useState<{
    tenant?: { name:string|null;status:string;planCode:string;demoExpiresAt:number|null;activeUntil:number|null };
    history?: Array<{id:string;planCode:string;amount:number;method:string;reference:string|null;status:string;submittedAt:number}>;
    paymentMethods?: PaymentMethod[];
    customerServiceContacts?: CustomerServiceContact[];
  }>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const load = () => fetch("/api/billing").then(res=>res.json()).then(setData);
  useEffect(() => { load().catch(()=>undefined); }, []);
  const selectedPlan = planOptions.find((item) => item.code === selected) || planOptions[0];
  const selectedPayment = data.paymentMethods?.find((item) => item.id === selectedMethod);
  const requestActivation = async () => {
    setSending(true); setMessage("");
    const response = await fetch("/api/billing", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({planCode:selected,method:selectedMethod,reference:paymentReference||"Konfirmasi melalui WhatsApp"}) });
    const result = await response.json() as {error?:string;paymentId?:string};
    setMessage(response.ok ? "Pembayaran dicatat sebagai pending. Kirim konfirmasi WhatsApp agar Super-Admin memverifikasi dan membuka akses penuh." : result.error || "Permintaan gagal.");
    if (response.ok) { setPaymentId(result.paymentId || ""); await load(); }
    setSending(false);
  };
  const copyAccount = async (method: PaymentMethod) => {
    await navigator.clipboard.writeText(method.account);
    setCopied(method.id);
    setTimeout(() => setCopied(""), 1200);
  };
  const whatsappUrl = (contact: CustomerServiceContact) => {
    const text = [
      "Halo Admin CyberDev POS, saya sudah melakukan pembayaran.",
      `Toko: ${data.tenant?.name || "Client CyberDev POS"}`,
      `Paket: ${selectedPlan.name} (${formatPrice(selectedPlan.price)})`,
      `Metode: ${selectedPayment?.name || selectedMethod}`,
      `Referensi: ${paymentReference || paymentId || "Konfirmasi manual"}`,
      "Mohon verifikasi dan aktifkan akses penuh akun saya.",
    ].join("\n");
    return `https://wa.me/${contact.wa}?text=${encodeURIComponent(text)}`;
  };
  const status = data.tenant?.status || "demo";
  const expiry = data.tenant?.activeUntil || data.tenant?.demoExpiresAt;
  const days = expiry ? Math.max(0,Math.ceil((expiry-renderedAt)/86400000)) : 0;
  return <div className="view-stack">
    <section className="section-title"><div><h2>Langganan & billing</h2><p>Pilih paket, transfer ke rekening resmi, lalu konfirmasi ke Customer Service.</p></div></section>
    <section className="subscription-card"><div className="subscription-main"><div><span className={`active-badge ${status}`}><BadgeCheck /> {status.toUpperCase()}</span><h3>{status === "active" ? `Paket ${data.tenant?.planCode}` : status === "suspend" ? "Akses POS disuspend" : "Demo 14 Hari"}</h3><p>{status === "suspend" ? "Data tetap aman. Ajukan perpanjangan agar semua fitur terbuka kembali." : "Produk dan transaksi tersimpan khusus untuk akun toko Anda."}</p></div><div className="days-left"><span>Sisa masa akses</span><strong>{days} hari</strong><small>{expiry ? new Date(expiry).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"}) : "Belum ditentukan"}</small></div></div><div className="subscription-progress"><Progress value={Math.min(100,Math.max(5,days))} /><div><span>Status {status}</span><span>Data tidak dihapus saat suspend</span></div></div><div className="subscription-foot"><span><ShieldCheck /> Akses penuh terbuka setelah verifikasi admin</span><span>CS 082244837977 / 085234005206</span></div></section>
    <section className="pricing-section"><div className="panel-head"><div><h3>1. Pilih durasi langganan</h3><p>Admin dapat memperpanjang paket dari tanggal aktif terakhir.</p></div></div><div className="plans-grid">{planOptions.map(plan => <button key={plan.code} onClick={() => { setSelected(plan.code); setPaymentId(""); }} className={`plan-card ${selected === plan.code ? "selected" : ""}`}>{plan.popular && <i className="plan-ribbon">POPULAR</i>}{plan.best && <i className="plan-ribbon best">HEMAT</i>}<div className="plan-check">{selected === plan.code && <Check />}</div><span>{plan.name}</span><strong>{formatPrice(plan.price)}</strong><small>per {plan.period}</small>{plan.code === "yearly" && <em>Hemat Rp300.000</em>}</button>)}</div></section>
    <section className="panel payment-account-panel"><div className="panel-head"><div><h3>2. Pilih rekening pembayaran</h3><p>Pastikan nama penerima Moch Rizky Febryanto sebelum transfer.</p></div><strong>{formatPrice(selectedPlan.price)}</strong></div><div className="payment-account-grid">{(data.paymentMethods||[]).map(method=><button key={method.id} className={selectedMethod===method.id?"selected":""} onClick={()=>{setSelectedMethod(method.id);setPaymentId("");}}><div className="payment-channel-icon">{method.channel==="Bank"?<Landmark/>:<WalletCards/>}</div><span><small>{method.channel}</small><strong>{method.name}</strong><b>{method.account}</b><em>a.n. {method.holder}</em></span><i onClick={(event)=>{event.stopPropagation();copyAccount(method);}}>{copied===method.id?<Check/>:<Copy/>}</i></button>)}</div><div className="payment-reference-row"><label>Nomor referensi / nama pengirim (opsional)<input value={paymentReference} onChange={event=>setPaymentReference(event.target.value)} maxLength={100} placeholder="Contoh: BRI • Moch Rizky • 28/08/2026"/></label><Button disabled={sending||!selectedPayment} onClick={requestActivation}><CreditCard/>{sending?"Mencatat...":"Saya sudah membayar"}<ArrowRight/></Button></div>{message&&<div className="billing-message">{message}</div>}{paymentId&&<div className="whatsapp-confirm"><Headphones/><span><strong>3. Kirim konfirmasi pembayaran</strong><small>Pilih salah satu nomor Customer Service. Akses penuh diberikan setelah pembayaran diverifikasi.</small></span><div>{(data.customerServiceContacts||[]).map(contact=><a key={contact.wa} href={whatsappUrl(contact)} target="_blank" rel="noreferrer">{contact.label}<b>{contact.phone}</b></a>)}</div></div>}</section>
    <section className="panel table-panel"><div className="panel-head"><div><h3>Riwayat pembayaran</h3><p>Semua pengajuan dan verifikasi tersimpan</p></div></div><div className="data-table invoice-table"><div className="table-row table-head-row"><span>Referensi</span><span>Tanggal</span><span>Paket</span><span>Jumlah</span><span>Status</span><span></span></div>{(data.history||[]).map(item=><div className="table-row" key={item.id}><span><b>{item.id.slice(0,12)}</b><small>{item.method}</small></span><span>{new Date(item.submittedAt).toLocaleDateString("id-ID")}</span><span>{item.planCode}</span><span><b>{formatPrice(item.amount)}</b></span><span><i className={`status ${item.status==="verified"?"active":item.status==="pending"?"demo":"suspend"}`}>{item.status}</i></span><span><Download /></span></div>)}{!data.history?.length&&<div className="empty-billing">Belum ada riwayat pembayaran.</div>}</div></section>
  </div>;
}

function AdminView({ onLogout }: { onLogout: () => void }) {
  type Client = { id:string;name:string;businessType:string|null;ownerName:string|null;ownerEmail:string;phone:string|null;address:string|null;city:string|null;latitude:number|null;longitude:number|null;lastLocationAt:number|null;locationAccuracy:number|null;locationConsentAt:number|null;deviceAuthorizedAt:number|null;lastIp:string|null;status:string;planCode:string;demoExpiresAt:number|null;activeUntil:number|null;createdAt:number;transactionCount:number;productCount:number;salesTotal:number;paymentStatus:string|null;paymentAmount:number|null;paymentMethod:string|null;paymentReference:string|null };
  type ClientForm = { tenantId:string;ownerName:string;storeName:string;businessType:string;email:string;phone:string;password:string;planCode:string;address:string;city:string;latitude:number|null;longitude:number|null };
  type AdminData = {clients:Client[];stats:{total:number;active:number;demo:number;suspended:number;revenue:number;capacity:number;authorizedDevices:number;expiringSoon:number;pendingPayments:number};businessMix:Array<{businessType:string;total:number}>;recentActivity:Array<{id:string;action:string;details:string|null;createdAt:number;storeName:string|null}>;pagination:{page:number;limit:number;total:number;pages:number}};
  const emptyClient: ClientForm = { tenantId:"",ownerName:"",storeName:"",businessType:"general",email:"",phone:"",password:"",planCode:"demo",address:"",city:"",latitude:null,longitude:null };
  const [data, setData] = useState<AdminData>({clients:[],stats:{total:0,active:0,demo:0,suspended:0,revenue:0,capacity:2000,authorizedDevices:0,expiringSoon:0,pendingPayments:0},businessMix:[],recentActivity:[],pagination:{page:1,limit:25,total:0,pages:1}});
  const [statusFilter, setStatusFilter] = useState("semua");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [clientMode, setClientMode] = useState<"create"|"edit">("create");
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient);
  const [clientError, setClientError] = useState("");
  const [clientPlans, setClientPlans] = useState<Record<string,string>>({});
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [broadcastOpen,setBroadcastOpen]=useState(false);
  const [broadcastForm,setBroadcastForm]=useState({title:"",message:"",audience:"all",severity:"info",expiresInDays:"14"});
  const [broadcastMessage,setBroadcastMessage]=useState("");
  const [resetTarget,setResetTarget]=useState<Client|null>(null);
  const [resetConfirmation,setResetConfirmation]=useState("");
  const [productTarget,setProductTarget]=useState<Client|null>(null);
  const [adminProduct,setAdminProduct]=useState({...emptyProductForm});
  const [adminProductError,setAdminProductError]=useState("");
  const load = () => fetch(`/api/admin/clients?q=${encodeURIComponent(query)}&status=${statusFilter}&page=${page}&limit=25`).then(res=>res.json()).then(setData);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/clients?q=${encodeURIComponent(query)}&status=${statusFilter}&page=${page}&limit=25`).then(res=>res.json()).then(setData).catch(()=>undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query,statusFilter,page]);
  const act = async (tenantId:string, action:string, planCode?:string) => {
    setBusy(`${tenantId}-${action}-${planCode||""}`);
    setAdminMessage("");
    const response = await fetch("/api/admin/clients",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId,action,planCode})});
    const result = await response.json() as {error?:string};
    setAdminMessage(response.ok ? "Perubahan client berhasil disimpan." : result.error || "Perubahan gagal.");
    if (response.ok) await load();
    setBusy("");
  };
  const captureAdminLocation = (setter: (point:{latitude:number;longitude:number})=>void) => {
    setClientError("");
    if (!navigator.geolocation) return setClientError("Perangkat tidak mendukung lokasi.");
    navigator.geolocation.getCurrentPosition(
      position=>setter({latitude:position.coords.latitude,longitude:position.coords.longitude}),
      ()=>setClientError("Izin lokasi ditolak. Alamat tetap dapat diisi manual."),
      {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
    );
  };
  const openCreate = () => { setClientMode("create");setClientForm(emptyClient);setClientError("");setClientOpen(true); };
  const openEdit = (client:Client) => {
    setClientMode("edit");
    setClientForm({tenantId:client.id,ownerName:client.ownerName||"Pemilik Toko",storeName:client.name,businessType:client.businessType||"general",email:client.ownerEmail,phone:client.phone||"",password:"",planCode:client.planCode||"demo",address:client.address||"",city:client.city||"",latitude:client.latitude,longitude:client.longitude});
    setClientError("");setClientOpen(true);
  };
  const saveClient = async () => {
    setBusy("save-client");setClientError("");
    const response = await fetch("/api/admin/clients",{method:clientMode==="create"?"POST":"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(clientMode==="create"?clientForm:{...clientForm,action:"update_client"})});
    const result = await response.json() as {error?:string};
    if (!response.ok) { setBusy("");return setClientError(result.error||"Data client gagal disimpan."); }
    setClientOpen(false);setAdminMessage(clientMode==="create"?"Client baru berhasil ditambahkan.":"Profil client berhasil diperbarui.");
    await load();setBusy("");
  };
  const changePassword = async () => {
    setPasswordMessage("");
    const response = await fetch("/api/auth/change-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});
    const result = await response.json() as {error?:string};
    if (!response.ok) return setPasswordMessage(result.error||"Password gagal diubah.");
    setPasswordMessage("Password berhasil diubah. Silakan login kembali.");
    setTimeout(onLogout,900);
  };
  const sendBroadcast=async()=>{
    setBusy("broadcast");setBroadcastMessage("");
    const response=await fetch("/api/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...broadcastForm,expiresInDays:Number(broadcastForm.expiresInDays)})});
    const result=await response.json() as {error?:string};
    if(!response.ok){setBroadcastMessage(result.error||"Pemberitahuan gagal dikirim.");setBusy("");return;}
    setBroadcastOpen(false);setBroadcastForm({title:"",message:"",audience:"all",severity:"info",expiresInDays:"14"});
    setAdminMessage("Pemberitahuan berhasil dikirim dan langsung tampil pada dashboard client yang dituju.");setBusy("");
  };
  const resetClientData=async()=>{
    if(!resetTarget)return;
    setBusy(`reset-${resetTarget.id}`);
    const response=await fetch("/api/admin/clients",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId:resetTarget.id,action:"reset_data",confirmation:resetConfirmation})});
    const result=await response.json() as {error?:string};
    if(!response.ok){setAdminMessage(result.error||"Data client gagal direset.");setBusy("");return;}
    setResetTarget(null);setResetConfirmation("");setAdminMessage(`Data operasional ${resetTarget.name} berhasil direset. Akun, paket, pembayaran, dan profil tetap aman.`);await load();setBusy("");
  };
  const openAdminProduct=(client:Client)=>{
    setProductTarget(client);setAdminProduct({...emptyProductForm});setAdminProductError("");
  };
  const saveAdminProduct=async()=>{
    if(!productTarget)return;
    setBusy(`product-${productTarget.id}`);setAdminProductError("");
    const response=await fetch("/api/admin/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...adminProduct,tenantId:productTarget.id,price:Number(adminProduct.price),cost:Number(adminProduct.cost),stock:Number(adminProduct.stock)})});
    const result=await response.json() as {error?:string};
    if(!response.ok){setAdminProductError(result.error||"Produk client gagal ditambahkan.");setBusy("");return;}
    setProductTarget(null);setAdminMessage(`Produk ${adminProduct.name.trim()} berhasil ditambahkan ke ${productTarget.name}.`);await load();setBusy("");
  };
  const capacityUse = Math.min(100, Math.round((Number(data.stats.total || 0) / Number(data.stats.capacity || 2000)) * 100));
  const authorizedRate = data.stats.active ? Math.round((Number(data.stats.authorizedDevices || 0) / Number(data.stats.active)) * 100) : 0;
  return <div className="view-stack">
    <section className="admin-hero"><div><span><Crown /> SUPER-ADMIN PUSAT • DATA LANGSUNG</span><h2>Kontrol SaaS CyberDev POS</h2><p>Kelola hingga 2.000 client, pembayaran, lokasi, paket, transaksi, pemberitahuan, dan akses setiap toko secara terisolasi.</p></div><div className="admin-hero-actions"><Button onClick={openCreate}><UserPlus/> Tambah client</Button><button onClick={()=>{setBroadcastMessage("");setBroadcastOpen(true);}}><Megaphone/> Kirim pemberitahuan</button><button onClick={()=>setPasswordOpen(true)}><ShieldCheck /> Ganti password</button></div></section>
    {adminMessage&&<div className="admin-notice"><BadgeCheck/>{adminMessage}</div>}
    <section className="stats-grid compact"><StatCard label="Seluruh client" value={String(data.stats.total||0)} change={"dari "+String(data.stats.capacity||2000)+" kapasitas"} context="" icon={Building2} tone="violet" /><StatCard label="Client aktif" value={String(data.stats.active||0)} change="berlangganan" context="" icon={BadgeCheck} tone="green" /><StatCard label="Sedang demo" value={String(data.stats.demo||0)} change="uji coba 14 hari" context="" icon={Clock3} tone="blue" /><StatCard label="Revenue terverifikasi" value={formatPrice(Number(data.stats.revenue||0))} change="pembayaran" context="" icon={CircleDollarSign} tone="orange" /></section>
    <section className="admin-operations-grid">
      <article className="panel admin-health-card">
        <div className="panel-head"><div><h3>Kesehatan operasional SaaS</h3><p>Ringkasan keamanan, billing, dan kapasitas secara langsung.</p></div><span className="admin-live-pill"><i/> LIVE</span></div>
        <div className="admin-health-list">
          <div><Activity/><span><strong>Kapasitas tenant</strong><small>{data.stats.total} dari {data.stats.capacity} client</small></span><em>{capacityUse}%</em></div>
          <div><ShieldCheck/><span><strong>Perangkat terverifikasi</strong><small>{data.stats.authorizedDevices||0} client aktif sudah mengizinkan lokasi/IP</small></span><em>{authorizedRate}%</em></div>
          <div><CreditCard/><span><strong>Menunggu pembayaran</strong><small>Perlu dicocokkan sebelum aktivasi paket</small></span><em>{data.stats.pendingPayments||0}</em></div>
          <div><Clock3/><span><strong>Berakhir dalam 7 hari</strong><small>Prioritaskan reminder perpanjangan</small></span><em>{data.stats.expiringSoon||0}</em></div>
        </div>
      </article>
      <article className="panel admin-segments-card">
        <div className="panel-head"><div><h3>Segmentasi jenis usaha</h3><p>CyberDev POS dapat dipakai lintas industri.</p></div><Store/></div>
        <div className="business-mix-list">
          {data.businessMix.map((item,index)=><div key={item.businessType}><span><i style={{width:`${Math.max(12,Math.round((Number(item.total)/Math.max(1,data.stats.total))*100))}%`}}/><b>{businessTypeLabel(item.businessType)}</b></span><strong>{item.total} client</strong><small>#{index+1}</small></div>)}
          {!data.businessMix.length&&<div className="business-mix-empty">Belum ada segmentasi client.</div>}
        </div>
      </article>
      <article className="panel admin-activity-card">
        <div className="panel-head"><div><h3>Aktivitas pusat terbaru</h3><p>Jejak audit penting seluruh tenant.</p></div><ShieldCheck/></div>
        <div className="admin-audit-list">
          {data.recentActivity.map(item=><div key={item.id}><span><i/><strong>{item.storeName||"Sistem pusat"}</strong><small>{item.details||item.action}</small></span><time>{new Date(item.createdAt).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>)}
          {!data.recentActivity.length&&<div className="business-mix-empty">Belum ada aktivitas audit.</div>}
        </div>
      </article>
    </section>
    <section className="panel table-panel tenant-panel">
      <div className="admin-client-toolbar"><div><h3>Daftar pengguna POS</h3><p>{data.pagination.total||0} client ditemukan • aktivasi setelah pembayaran diverifikasi.</p></div><div className="search-box"><Search/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Cari toko, email, WA, atau kota..."/></div><div className="filter-pills">{["semua","active","demo","suspend"].map(s=><button className={statusFilter===s?"selected":""} onClick={()=>{setStatusFilter(s);setPage(1);}} key={s}>{s==="semua"?"Semua":s==="active"?"Aktif":s==="demo"?"Demo":"Suspend"}</button>)}</div></div>
      <div className="admin-client-list">{data.clients.map((c,i)=>{
        const expiry=c.activeUntil||c.demoExpiresAt;
        const mapHref=c.latitude!==null&&c.longitude!==null?"https://www.google.com/maps?q="+c.latitude+","+c.longitude:c.address?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([c.address,c.city].filter(Boolean).join(", ")):null;
        const chosenPlan=clientPlans[c.id]||"monthly";
        return <article className="client-card detailed" key={c.id}>
          <div className={"avatar-small avatar-"+String(i%4)}>{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
          <div className="client-identity"><div className="client-name-line"><strong>{c.name}</strong><i>{businessTypeLabel(c.businessType)}</i></div><span>{c.ownerName||"Pemilik"} • {c.ownerEmail}{c.phone?" • "+c.phone:""}</span><small>Daftar {new Date(c.createdAt).toLocaleDateString("id-ID")} • {Number(c.productCount||0)} produk • {Number(c.transactionCount||0)} transaksi • Omzet {formatPrice(Number(c.salesTotal||0))}</small><div className="client-location"><MapPin/>{c.city||c.address||"Lokasi belum disimpan"}{mapHref&&<a href={mapHref} target="_blank" rel="noreferrer">Buka Maps</a>}</div><div className={c.deviceAuthorizedAt?"client-device-meta verified":"client-device-meta"}><ShieldCheck/><span><strong>{c.deviceAuthorizedAt?"Perangkat & lokasi diizinkan":"Menunggu izin lokasi/IP"}</strong><small>{c.deviceAuthorizedAt?`IP ${c.lastIp||"tidak terdeteksi"} • akurasi ±${Math.round(c.locationAccuracy||0)} m • ${new Date(c.deviceAuthorizedAt).toLocaleString("id-ID")}`:"Client aktif harus memberi persetujuan dari perangkat toko."}</small></span></div></div>
          <div className="client-subscription"><i className={"status "+c.status}>{c.status}</i><strong>{c.planCode}</strong><small>{expiry?"Sampai "+new Date(expiry).toLocaleDateString("id-ID"):"Belum aktif"}</small>{c.paymentStatus&&<em className={c.paymentStatus}>Pembayaran {c.paymentStatus} {c.paymentAmount?formatPrice(Number(c.paymentAmount)):""}{c.paymentMethod?" • "+c.paymentMethod:""}</em>}</div>
          <div className="client-actions professional"><div className="plan-activate"><select value={chosenPlan} onChange={e=>setClientPlans(prev=>({...prev,[c.id]:e.target.value}))}>{planOptions.map(plan=><option key={plan.code} value={plan.code}>{plan.name} • {formatPrice(plan.price)}</option>)}</select><button className="activate-action" disabled={!!busy} onClick={()=>act(c.id,"activate",chosenPlan)}><BadgeCheck/> Aktifkan / perpanjang</button></div><button disabled={!!busy} onClick={()=>openAdminProduct(c)}><PackagePlus/> Tambah produk</button><button disabled={!!busy} onClick={()=>openEdit(c)}><Pencil/> Edit</button><button className="danger-action" disabled={!!busy} onClick={()=>act(c.id,"suspend")}>Suspend</button><button disabled={!!busy} onClick={()=>act(c.id,"demo")}>Reset Demo</button><button className="reset-data-action" disabled={!!busy} onClick={()=>{setResetConfirmation("");setResetTarget(c);}}><DatabaseZap/> Reset data</button></div>
        </article>;
      })}{!data.clients.length&&<div className="admin-empty"><Users/><strong>Belum ada client pada filter ini</strong><span>Pendaftaran baru akan muncul otomatis di sini.</span></div>}</div>
      <div className="admin-pagination"><span>Halaman {data.pagination.page} dari {data.pagination.pages} • {data.pagination.total} client</span><div><button disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Sebelumnya</button><button disabled={page>=data.pagination.pages} onClick={()=>setPage(value=>value+1)}>Berikutnya</button></div></div>
    </section>
    <Dialog open={clientOpen} onOpenChange={setClientOpen}><DialogContent className="client-editor-dialog"><DialogHeader><DialogTitle>{clientMode==="create"?"Tambah client baru":"Edit profil client"}</DialogTitle><DialogDescription>{clientMode==="create"?"Buat akun client, pilih jenis usaha, Demo atau paket aktif, dan simpan lokasi tokonya.":"Perbarui identitas, jenis usaha, kontak, lokasi, atau reset password client."}</DialogDescription></DialogHeader><div className="form-grid client-form"><label>Nama pemilik<input value={clientForm.ownerName} onChange={e=>setClientForm({...clientForm,ownerName:e.target.value})} placeholder="Nama lengkap"/></label><label>Nama toko<input value={clientForm.storeName} onChange={e=>setClientForm({...clientForm,storeName:e.target.value})} placeholder="Nama usaha"/></label><label>Jenis usaha<select value={clientForm.businessType} onChange={e=>setClientForm({...clientForm,businessType:e.target.value})}>{businessTypes.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>Email login<input type="email" value={clientForm.email} onChange={e=>setClientForm({...clientForm,email:e.target.value})} placeholder="client@toko.com"/></label><label>Nomor WhatsApp<input value={clientForm.phone} onChange={e=>setClientForm({...clientForm,phone:e.target.value})} placeholder="08xxxxxxxxxx"/></label><label>Kota / Kabupaten<input value={clientForm.city} onChange={e=>setClientForm({...clientForm,city:e.target.value})} placeholder="Contoh: Tanjung Selor"/></label>{clientMode==="create"&&<label>Paket awal<select value={clientForm.planCode} onChange={e=>setClientForm({...clientForm,planCode:e.target.value})}><option value="demo">Demo 14 hari</option>{planOptions.map(plan=><option key={plan.code} value={plan.code}>{plan.name} • {formatPrice(plan.price)}</option>)}</select></label>}<label className="wide">Alamat toko<input value={clientForm.address} onChange={e=>setClientForm({...clientForm,address:e.target.value})} placeholder="Alamat lengkap toko"/></label><label className="wide">{clientMode==="create"?"Password awal":"Password baru (kosongkan jika tidak diganti)"}<input type="password" value={clientForm.password} onChange={e=>setClientForm({...clientForm,password:e.target.value})} placeholder="Minimal 12 karakter, huruf + angka"/></label><div className="location-capture wide"><span><MapPin/><b>Koordinat lokasi</b><small>{clientForm.latitude!==null&&clientForm.longitude!==null?clientForm.latitude.toFixed(6)+", "+clientForm.longitude.toFixed(6):"Belum mengambil lokasi perangkat"}</small></span><Button type="button" variant="outline" onClick={()=>captureAdminLocation(point=>setClientForm(current=>({...current,...point})))}><LocateFixed/> Ambil lokasi</Button></div>{clientError&&<div className="auth-error wide">{clientError}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>setClientOpen(false)}>Batal</Button><Button disabled={!!busy} onClick={saveClient}>{busy==="save-client"?"Menyimpan...":clientMode==="create"?"Tambah client":"Simpan perubahan"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!productTarget} onOpenChange={open=>{if(!open)setProductTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Tambah produk untuk {productTarget?.name}</DialogTitle><DialogDescription>Super-Admin dapat menambahkan katalog atas nama client. Produk langsung tersedia pada akun toko dan scanner barcode.</DialogDescription></DialogHeader><div className="form-grid"><label>Nama produk *<input value={adminProduct.name} onChange={event=>setAdminProduct({...adminProduct,name:event.target.value})} placeholder="Nama produk" autoFocus/></label><label>Kategori *<input value={adminProduct.category} onChange={event=>setAdminProduct({...adminProduct,category:event.target.value})} placeholder="Sembako, Laundry, atau Jasa"/></label><label>Harga modal<input type="number" min="0" value={adminProduct.cost} onChange={event=>setAdminProduct({...adminProduct,cost:event.target.value})}/></label><label>Harga jual *<input type="number" min="1" value={adminProduct.price} onChange={event=>setAdminProduct({...adminProduct,price:event.target.value})}/></label><label>Stok<input type="number" min="0" step="0.001" value={adminProduct.stock} onChange={event=>setAdminProduct({...adminProduct,stock:event.target.value})}/></label><label>Satuan<input value={adminProduct.unit} onChange={event=>setAdminProduct({...adminProduct,unit:event.target.value})} placeholder="pcs, kg, paket"/></label><label className="wide">Barcode<input value={adminProduct.barcode} onChange={event=>setAdminProduct({...adminProduct,barcode:event.target.value.replace(/\s/g,"")})} placeholder="Scan USB atau ketik barcode"/></label>{adminProductError&&<div className="auth-error wide">{adminProductError}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>setProductTarget(null)}>Batal</Button><Button disabled={!productTarget||busy.startsWith("product-")} onClick={saveAdminProduct}><PackagePlus/>{busy.startsWith("product-")?"Menyimpan...":"Tambahkan ke client"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}><DialogContent className="broadcast-dialog"><DialogHeader><DialogTitle>Kirim pemberitahuan ke client</DialogTitle><DialogDescription>Pesan tersimpan dan muncul pada ikon lonceng dashboard client sesuai status target.</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">Judul pemberitahuan<input value={broadcastForm.title} onChange={event=>setBroadcastForm({...broadcastForm,title:event.target.value})} maxLength={100} placeholder="Contoh: Pemeliharaan sistem malam ini"/></label><label>Target client<select value={broadcastForm.audience} onChange={event=>setBroadcastForm({...broadcastForm,audience:event.target.value})}><option value="all">Semua client</option><option value="active">Client Aktif</option><option value="demo">Client Demo</option><option value="suspend">Client Suspend</option></select></label><label>Jenis pesan<select value={broadcastForm.severity} onChange={event=>setBroadcastForm({...broadcastForm,severity:event.target.value})}><option value="info">Informasi</option><option value="success">Kabar baik</option><option value="warning">Penting / peringatan</option></select></label><label>Masa tampil<select value={broadcastForm.expiresInDays} onChange={event=>setBroadcastForm({...broadcastForm,expiresInDays:event.target.value})}><option value="7">7 hari</option><option value="14">14 hari</option><option value="30">30 hari</option><option value="90">90 hari</option></select></label><label className="wide">Isi pemberitahuan<textarea value={broadcastForm.message} onChange={event=>setBroadcastForm({...broadcastForm,message:event.target.value})} maxLength={600} rows={5} placeholder="Tuliskan informasi yang jelas dan singkat untuk client."/></label>{broadcastMessage&&<div className="auth-error wide">{broadcastMessage}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>setBroadcastOpen(false)}>Batal</Button><Button disabled={busy==="broadcast"} onClick={sendBroadcast}><Megaphone/>{busy==="broadcast"?"Mengirim...":"Kirim sekarang"}</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!resetTarget} onOpenChange={open=>{if(!open){setResetTarget(null);setResetConfirmation("");}}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset data operasional {resetTarget?.name}?</AlertDialogTitle><AlertDialogDescription>Produk, stok, transaksi, omzet, dan laporan toko ini akan dihapus permanen. Akun login, status paket, profil, pembayaran, lokasi, dan histori audit tetap disimpan. Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription></AlertDialogHeader><label className="reset-confirm-label">Ketik nama toko <strong>{resetTarget?.name}</strong><input value={resetConfirmation} onChange={event=>setResetConfirmation(event.target.value)} placeholder={resetTarget?.name||"Nama toko"}/></label><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction disabled={!resetTarget||resetConfirmation!==resetTarget.name||busy.startsWith("reset-")} onClick={resetClientData}>{busy.startsWith("reset-")?"Mereset...":"Reset dari nol"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}><DialogContent><DialogHeader><DialogTitle>Ganti password Super-Admin</DialogTitle><DialogDescription>Password disimpan sebagai hash satu arah dan semua sesi lama akan dikeluarkan.</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">Password saat ini<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label className="wide">Password baru<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Minimal 12 karakter, huruf + angka"/></label>{passwordMessage&&<div className="auth-error wide">{passwordMessage}</div>}</div><DialogFooter><Button variant="outline" onClick={()=>setPasswordOpen(false)}>Batal</Button><Button onClick={changePassword}>Simpan password baru</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function DeviceAuthorizationView({ user, onAuthorized, setView }: { user: AppUser; onAuthorized: (user: AppUser) => void; setView: (view: View) => void }) {
  const [address,setAddress]=useState(user.address||"");
  const [city,setCity]=useState(user.city||"");
  const [consent,setConsent]=useState(false);
  const [position,setPosition]=useState<{latitude:number;longitude:number;accuracy:number}|null>(null);
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const capture=()=>{
    setMessage("Meminta lokasi presisi perangkat...");
    if(!navigator.geolocation)return setMessage("Browser ini tidak mendukung geolokasi. Gunakan Chrome/Edge dan izinkan lokasi.");
    navigator.geolocation.getCurrentPosition(
      result=>{setPosition({latitude:result.coords.latitude,longitude:result.coords.longitude,accuracy:result.coords.accuracy});setMessage(`Lokasi ditemukan dengan akurasi sekitar ${Math.round(result.coords.accuracy)} meter.`);},
      error=>setMessage(error.code===1?"Izin lokasi ditolak. Buka izin situs di browser lalu coba lagi.":"Lokasi belum ditemukan. Aktifkan GPS dan coba kembali."),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
  };
  const authorize=async()=>{
    if(!consent)return setMessage("Centang persetujuan lokasi dan IP terlebih dahulu.");
    if(!position)return setMessage("Ambil lokasi presisi perangkat terlebih dahulu.");
    setSaving(true);setMessage("");
    try{
      const response=await fetch("/api/device/authorize",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...position,address,city,consent:true})});
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error||"Otorisasi perangkat gagal.");
      const me=await fetch("/api/auth/me").then(res=>res.json()) as {user:AppUser|null};
      if(!me.user)throw new Error("Sesi tidak ditemukan.");
      onAuthorized(me.user);
    }catch(reason){setMessage(reason instanceof Error?reason.message:"Otorisasi perangkat gagal.");}
    finally{setSaving(false);}
  };
  return <section className="device-authorization"><div className="device-auth-logo"><Logo/><span><BadgeCheck/> Paket {user.planCode||"aktif"} terverifikasi</span></div><div className="device-auth-grid"><article><span className="login-eyebrow"><LocateFixed/> VERIFIKASI TOKO & PERANGKAT</span><h2>Izinkan lokasi presisi untuk membuka POS penuh</h2><p>Pembayaran Anda sudah aktif. Satu langkah keamanan tersisa: izinkan lokasi toko dan pencatatan alamat IP perangkat. Data ini hanya terlihat oleh pemilik CyberDev POS untuk verifikasi toko, keamanan akses, dan dukungan teknis.</p><div className="device-benefits"><div><ShieldCheck/><span><strong>Persetujuan eksplisit</strong><small>Lokasi dan IP baru disimpan setelah Anda mencentang izin.</small></span></div><div><MapPin/><span><strong>Lokasi toko presisi</strong><small>Koordinat dan akurasi tercatat di dashboard Super-Admin.</small></span></div><div><CloudOff/><span><strong>POS tetap bisa offline</strong><small>Setelah aktif, transaksi tunai dan barcode tetap bekerja saat internet putus.</small></span></div></div></article><article className="device-auth-card"><h3>Daftarkan perangkat toko</h3><label>Alamat toko<input value={address} onChange={event=>setAddress(event.target.value)} placeholder="Alamat lengkap toko"/></label><label>Kota / Kabupaten<input value={city} onChange={event=>setCity(event.target.value)} placeholder="Kota atau kabupaten"/></label><button className={position?"capture-device captured":"capture-device"} onClick={capture}><LocateFixed/><span><strong>{position?"Perbarui lokasi presisi":"Ambil lokasi presisi"}</strong><small>{position?`${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)} • ±${Math.round(position.accuracy)} m`:"Aktifkan GPS dan izinkan lokasi pada browser"}</small></span></button><label className="consent-check"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>Saya mengizinkan CyberDev POS menyimpan koordinat lokasi toko, tingkat akurasi, waktu persetujuan, dan alamat IP perangkat untuk keamanan serta administrasi layanan.</span></label>{message&&<div className={position&&consent?"device-message success":"device-message"}>{message}</div>}<Button disabled={saving||!consent||!position} onClick={authorize}><BadgeCheck/>{saving?"Menyimpan otorisasi...":"Izinkan & buka fitur penuh"}</Button><button className="billing-link" onClick={()=>setView("billing")}>Lihat langganan & billing</button></article></div></section>;
}

function LoginView({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [mode, setMode] = useState<"client" | "admin" | "register">("client");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [businessType, setBusinessType] = useState("general");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState<number|null>(null);
  const [longitude, setLongitude] = useState<number|null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled,setGoogleEnabled]=useState(false);
  useEffect(()=>{
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    fetch("/api/auth/providers",{signal:controller.signal})
      .then(async response=>response.ok ? response.json() : {google:false})
      .then(data=>setGoogleEnabled(Boolean(data.google)))
      .catch(()=>setGoogleEnabled(false))
      .finally(()=>window.clearTimeout(timer));
    const message = new URLSearchParams(window.location.search).get("auth_error");
    if(message) {
      Promise.resolve().then(()=>setError(message));
      window.history.replaceState({},"",window.location.pathname);
    }
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[]);
  const captureLocation = () => {
    setLocationMessage("Mengambil lokasi perangkat...");
    if (!navigator.geolocation) return setLocationMessage("Lokasi tidak didukung. Isi alamat secara manual.");
    navigator.geolocation.getCurrentPosition(position=>{
      setLatitude(position.coords.latitude);setLongitude(position.coords.longitude);setLocationMessage("Lokasi berhasil disimpan untuk dashboard admin.");
    },()=>setLocationMessage("Izin lokasi ditolak. Anda tetap dapat mendaftar dengan alamat manual."),{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  };
  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithTimeout(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, storeName, businessType, phone, email, identifier, password, address, city, latitude, longitude }),
      }, 20000);
      const result = await response.json().catch(()=>({error:"Respons server tidak valid."})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Permintaan tidak dapat diproses.");
      const meResponse = await fetchWithTimeout("/api/auth/me");
      const me = await meResponse.json().catch(()=>({user:null})) as { user: AppUser | null };
      if (!me.user) throw new Error("Sesi login tidak berhasil dibuat.");
      if (mode === "admin" && me.user.role !== "superadmin") {
        await fetch("/api/auth/logout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
        throw new Error("Akun client harus masuk melalui Login Client.");
      }
      if (mode === "client" && me.user.role === "superadmin") {
        await fetch("/api/auth/logout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
        throw new Error("Akun Super-Admin harus masuk melalui Login Admin.");
      }
      onAuthenticated(me.user);
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === "AbortError" ? "Server terlalu lama merespons. Periksa koneksi lalu coba kembali." : reason instanceof Error ? reason.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="login-shell">
    <section className="login-panel">
      <div className="login-brand"><LoginLogo /><span>Kasir pintar. Bisnis lebih untung.</span></div>
      <div className="login-form-wrap">
        <span className="login-eyebrow">{mode==="admin"?<><Crown/> PORTAL KHUSUS PEMILIK PRODUK</>:<><Sparkles /> PENDAFTARAN ONLINE • DEMO 14 HARI</>}</span>
        <h1>{mode === "register" ? <>Buat toko POS<br/><em>secara otomatis</em></> : mode==="admin" ? <>Login khusus<br/><em>Super-Admin</em></> : <>Login Client<br/><em>CyberDev POS</em></>}</h1>
        <p>{mode === "register" ? "Daftar tanpa approval. Toko, akun owner, produk awal, dan status Demo langsung dibuat." : mode==="admin" ? "Portal terpisah untuk pemilik CyberDev POS memantau client, pembayaran, lokasi, IP, dan masa langganan." : "Masuk ke toko yang sudah terdaftar untuk melanjutkan Demo atau menggunakan paket aktif."}</p>
        <div className="auth-tabs"><button className={mode === "client" ? "active" : ""} onClick={() => { setMode("client"); setError(""); }}><Store/> <span>Login Client<small>Toko & kasir</small></span></button><button className={mode === "admin" ? "active" : ""} onClick={() => { setMode("admin"); setError(""); }}><Crown/> <span>Login Admin<small>Kontrol SaaS</small></span></button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}><Sparkles/> <span>Demo Gratis<small>14 hari</small></span></button></div>
        <div className={`login-mode-card ${mode}`}>
          <div>{mode==="admin"?<Crown/>:mode==="register"?<Sparkles/>:<ShieldCheck/>}</div>
          <span><strong>{mode==="admin"?"Portal pusat dengan akses eksklusif":mode==="register"?"Toko demo siap otomatis":"Akses aman untuk setiap tenant"}</strong><small>{mode==="admin"?"Pantau client, pembayaran, paket, lokasi, IP, dan audit aktivitas.":mode==="register"?"Pilih jenis usaha dan dapatkan katalog awal yang relevan tanpa approval.":"Data produk, transaksi, laporan, dan staff hanya dapat dibuka oleh toko Anda."}</small></span>
          <i>{mode==="admin"?"ADMIN":mode==="register"?"DEMO":"CLIENT"}</i>
        </div>
        {mode === "register" && <div className="register-fields"><div className="business-type-picker wide-auth"><span><strong>Pilih jenis usaha</strong><small>Mulai dengan katalog kosong dan isi data produk Anda.</small></span><div>{businessTypes.map(item=><button type="button" key={item.code} className={businessType===item.code?"selected":""} onClick={()=>setBusinessType(item.code)}><Store/><b>{item.label}</b><small>{item.description}</small></button>)}</div></div><label className="login-label">Nama pemilik<input value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" /></label><label className="login-label">Nama toko<input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Contoh: Toko Berkah" /></label><label className="login-label">Nomor WhatsApp<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" /></label><label className="login-label">Kota / Kabupaten<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Contoh: Tanjung Selor"/></label><label className="login-label wide-auth">Alamat toko<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Alamat lengkap (opsional)"/></label><button type="button" className="register-location wide-auth" onClick={captureLocation}><LocateFixed/><span><strong>Gunakan lokasi perangkat</strong><small>{locationMessage||"Admin dapat melihat lokasi toko untuk pelayanan client."}</small></span></button></div>}
        {mode !== "register" ? <label className="login-label">{mode==="admin"?"Email atau nomor admin":"Email atau nomor WhatsApp client"}<input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={mode==="admin"?"Identitas Super-Admin":"nama@bisnis.com atau 08xxxxxxxxxx"} autoComplete="username" inputMode="email" /></label> : <label className="login-label">Email bisnis<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@bisnis.com" autoComplete="email" /></label>}
        <label className="login-label">Password<span className="password-input"><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Minimal 12 karakter, huruf + angka" autoComplete={mode !== "register" ? "current-password" : "new-password"} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff/> : <Eye/>}</button></span></label>
        {error && <div className="auth-error">{error}</div>}
        <Button className={`login-submit ${mode==="admin"?"admin-auth-mode":""}`} disabled={loading} onClick={submit}>{loading ? "Memproses akun..." : mode === "register" ? "Daftar & mulai demo" : mode==="admin" ? "Masuk dashboard admin" : "Masuk dashboard client"} <ArrowRight /></Button>
        <Button type="button" variant="outline" className="google-login" disabled={!googleEnabled||loading} onClick={()=>{const url=new URL("/api/auth/google",window.location.origin);url.searchParams.set("intent",mode==="admin"?"admin":"client");window.location.assign(url.href);}}><GoogleIcon/><span>{mode==="admin"?"Masuk Admin dengan Google":"Masuk dengan Google"}</span></Button>
        {!googleEnabled&&<small className="google-status">Login Google menunggu Client ID dan Client Secret OAuth yang valid.</small>}
        {mode==="admin"&&googleEnabled&&<small className="google-status">Google Admin hanya dapat digunakan setelah akun Google ditautkan dari Pengaturan keamanan.</small>}
        {mode === "admin" && <div className="admin-login-hint"><div><Crown/><span><strong>Hanya dua nomor resmi & satu email admin</strong><small>Password tidak ditampilkan dan dapat diganti dari dashboard.</small></span></div><button onClick={() => setIdentifier("riskyfebryanto12@gmail.com")}>Email admin</button><button onClick={() => setIdentifier("082244837977")}>WA 0822…</button><button onClick={() => setIdentifier("085234005206")}>WA 0852…</button></div>}
        {mode === "register" && <p className="signup-copy">Sudah punya akun? <button onClick={() => setMode("client")}>Login Client</button></p>}
        <div className="login-assurance"><span><ShieldCheck /> Data terenkripsi</span><span><CloudOff /> Siap offline</span><span><Headphones /> CS 082244837977 / 085234005206</span></div>
      </div>
      <small className="login-legal">CyberDev POS • Hubungi pengelola untuk informasi layanan dan penggunaan data.</small>
    </section>
    <section className="login-showcase">
      <div className="showcase-copy"><span>POS SaaS GENERASI BARU</span><h2>Satu platform.<br/>Semua bisnis.</h2><p>Dibuat untuk toko kelontong, minimarket, laundry, F&B, jasa, apotek, bengkel, dan usaha lainnya.</p><div className="showcase-industries">{["Kelontong","Minimarket","Laundry","F&B","Jasa","Apotek","Bengkel"].map(item=><i key={item}><Check/>{item}</i>)}</div></div>
      <div className="showcase-dashboard">
        <div className="showcase-top"><Logo compact /><span><i /> Contoh tampilan</span><MoreHorizontal /></div>
        <div className="showcase-welcome"><span><small>Ilustrasi penjualan</small><strong>Rp4.860.000</strong><em><ArrowUpRight /> 12,5%</em></span><div className="mini-ring"><b>86%</b></div></div>
        <div className="showcase-chart">{[35,48,43,67,54,72,62,88,76,94].map((h,i)=><i key={i} className={i===9?"peak":""} style={{height:`${h}%`}} />)}</div>
        <div className="showcase-cards"><div><ReceiptText /><span><small>Transaksi</small><strong>128</strong></span></div><div><TrendingUp /><span><small>Laba kotor</small><strong>Rp1,74 jt</strong></span></div></div>
        <div className="floating-order"><div><Check /></div><span><small>Transaksi berhasil</small><strong>+ Rp76.000</strong></span><em>Baru saja</em></div>
      </div>
      <div className="login-plans"><span>Mulai dari <strong>Rp60.000</strong> / minggu</span><span>•</span><span>Demo gratis otomatis</span></div>
    </section>
  </main>;
}

const titles: Record<View, string> = { overview: "Beranda", pos: "Kasir / POS", products: "Produk & Stok", reports: "Laporan", customers: "Pelanggan", staff: "Karyawan", billing: "Langganan", settings: "Pengaturan", admin: "Super Admin" };

export function CyberDevPos() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(()=>controller.abort(),12000);
    fetch("/api/auth/me",{signal:controller.signal}).then(async response=>{
      if(!response.ok) throw new Error("Session service unavailable");
      return response.json() as Promise<{user:AppUser|null}>;
    }).then((data:{user:AppUser|null}) => {
      setUser(data.user);
      if (data.user?.role === "superadmin") setView("admin");
      if (data.user?.tenantId) flushOfflineTransactions(data.user.tenantId).catch(()=>undefined);
    }).catch(()=>setUser(null)).finally(()=>{window.clearTimeout(timer);setCheckingSession(false);});
    return ()=>{window.clearTimeout(timer);controller.abort();};
  }, []);
  const authenticated = (nextUser: AppUser) => {
    setUser(nextUser);
    setView(nextUser.role === "superadmin" ? "admin" : "overview");
    if (nextUser.tenantId) flushOfflineTransactions(nextUser.tenantId).catch(()=>undefined);
  };
  const logout = async () => {
    await fetch("/api/auth/logout",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).catch(()=>undefined);
    setUser(null);
    setView("overview");
  };
  const page = useMemo(() => {
    if (user?.role === "superadmin") return view === "settings" ? <SettingsView /> : <AdminView onLogout={logout} />;
    if (user?.tenantStatus === "active" && !user.deviceAuthorizedAt && view !== "billing") return <DeviceAuthorizationView user={user} onAuthorized={authenticated} setView={setView}/>;
    if (user?.tenantStatus === "suspend" && view !== "overview" && view !== "billing") return <SubscriptionGate status={user.tenantStatus} feature={titles[view]} setView={setView}/>;
    if (user?.tenantStatus === "demo" && (["reports"] as View[]).includes(view)) return <SubscriptionGate status={user.tenantStatus} feature={titles[view]} setView={setView}/>;
    if (view === "overview") return <Overview setView={setView} />;
    if (view === "pos" && user) return <PosView user={user} />;
    if (view === "products") return <ProductsView tenantId={user?.tenantId||""} />;
    if (view === "reports") return <ReportsView />;
    if (view === "customers") return <CustomersView />;
    if (view === "staff") return <StaffView />;
    if (view === "billing") return <BillingView />;
    if (view === "settings") return <SettingsView />;
    return <AdminView onLogout={logout} />;
  }, [view,user]);
  if (checkingSession) return <div className="auth-loading"><Logo/><span>Memeriksa sesi aman...</span></div>;
  if (!user) return <LoginView onAuthenticated={authenticated} />;
  return <div className={`app-shell ${dark ? "theme-dark" : ""}`}><Sidebar view={view} setView={setView} open={menuOpen} onClose={() => setMenuOpen(false)} user={user} onLogout={logout} /><main className="main-shell"><Topbar title={user.role==="superadmin"?"Super Admin":titles[view]} dark={dark} setDark={setDark} onMenu={() => setMenuOpen(true)} user={user} onLogout={logout} /><div className={`page-content ${view === "pos" ? "pos-content" : ""}`}>{page}</div></main>{user.role!=="superadmin"&&<nav className="mobile-nav">{[["overview","Beranda",LayoutDashboard],["pos","Kasir",ShoppingCart],["products","Produk",Package],["reports","Laporan",BarChart3]].map(([id,label,I])=>{const Icon=I as IconType; return <button key={id as string} onClick={()=>setView(id as View)} className={view===id?"active":""}><Icon /><span>{label as string}</span></button>})}<button onClick={()=>setMenuOpen(true)}><Menu /><span>Lainnya</span></button></nav>}</div>;
}
