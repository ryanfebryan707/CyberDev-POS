"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleIdentityButton } from "@/components/google-identity-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { businessTypes } from "@/lib/business-types";

async function api(path:string,method="GET",body?:unknown) {
  const response=await fetch(path,{method,headers:body===undefined?undefined:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Permintaan gagal.");
  return data;
}
const messageOf=(error:unknown)=>error instanceof Error?error.message:"Koneksi gagal. Coba lagi.";
type Customer={id:string;name:string;phone:string;email:string};
export function CustomersView() {
  const [items,setItems]=useState<Customer[]>([]),[error,setError]=useState(""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({id:"",name:"",phone:"",email:""});
  const load=useCallback(()=>api("/api/customers").then(data=>setItems(data.customers)).catch(error=>setError(messageOf(error))),[]);
  useEffect(()=>{void load();},[load]);
  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");
    try {await api("/api/customers",form.id?"PATCH":"POST",form);await load();setOpen(false);}catch(error){setError(messageOf(error));}finally{setBusy(false);}
  };
  return <div className="view-stack"><section className="section-title"><div><h2>Pelanggan</h2><p>Data pelanggan tersimpan khusus untuk toko Anda.</p></div><Button onClick={()=>{setForm({id:"",name:"",phone:"",email:""});setOpen(true);}}><Plus/> Tambah pelanggan</Button></section>{error&&<p role="alert" className="auth-error">{error}</p>}<section className="panel table-panel"><div className="panel-head"><h3>{items.length} pelanggan</h3></div><div className="management-table"><table><thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Aksi</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.phone||"—"}</td><td>{item.email||"—"}</td><td><Button variant="outline" onClick={()=>{setForm(item);setOpen(true);}}>Edit</Button></td></tr>)}</tbody></table>{!items.length&&<p className="empty-activity">Belum ada pelanggan. Tambahkan data pertama Anda.</p>}</div></section><Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{form.id?"Edit pelanggan":"Tambah pelanggan"}</DialogTitle></DialogHeader><form onSubmit={save} className="form-grid"><label className="wide">Nama pelanggan<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Telepon pelanggan<input maxLength={20} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email pelanggan<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>{error&&<p role="alert" className="auth-error wide">{error}</p>}<Button type="submit" disabled={busy}>{busy?"Menyimpan...":"Simpan pelanggan"}</Button></form></DialogContent></Dialog></div>;
}

type Staff={id:string;name:string;email:string;role:"cashier"|"supervisor";isActive:number;lastLoginAt:number|null};
export function StaffView() {
  const [items,setItems]=useState<Staff[]>([]),[error,setError]=useState(""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({name:"",email:"",password:"",role:"cashier"});
  const load=useCallback(()=>api("/api/staff").then(data=>setItems(data.staff)).catch(error=>setError(messageOf(error))),[]);
  useEffect(()=>{void load();},[load]);
  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");
    try{await api("/api/staff","POST",form);setForm({name:"",email:"",password:"",role:"cashier"});await load();setOpen(false);}catch(error){setError(messageOf(error));}finally{setBusy(false);}
  };
  const update=async(item:Staff,isActive:boolean,role:Staff["role"])=>{
    setBusy(true);setError("");
    try{await api("/api/staff","PATCH",{id:item.id,isActive,role});await load();}catch(error){setError(messageOf(error));}finally{setBusy(false);}
  };
  return <div className="view-stack"><section className="section-title"><div><h2>Karyawan & akses</h2><p>Pemilik mengatur akun kasir dan supervisor. Perubahan akses mengakhiri sesi karyawan tersebut.</p></div><Button onClick={()=>setOpen(true)}><Plus/> Tambah karyawan</Button></section>{error&&<p role="alert" className="auth-error">{error}</p>}<section className="panel table-panel"><div className="management-table"><table><thead><tr><th>Karyawan</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th>Aksi</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.name}</strong><small>{item.email}</small><small>ID {item.id.slice(0,8)}</small></td><td><select aria-label={`Peran ${item.name}`} disabled={busy} value={item.role} onChange={e=>update(item,Boolean(item.isActive),e.target.value as Staff["role"])}><option value="cashier">Kasir</option><option value="supervisor">Supervisor</option></select></td><td>{item.isActive?"Aktif":"Nonaktif"}</td><td>{item.lastLoginAt?new Date(Number(item.lastLoginAt)).toLocaleString("id-ID"):"Belum login"}</td><td><Button disabled={busy} variant="outline" onClick={()=>update(item,!item.isActive,item.role)}>{item.isActive?"Nonaktifkan":"Aktifkan"}</Button></td></tr>)}</tbody></table>{!items.length&&<p className="empty-activity">Belum ada akun karyawan.</p>}</div></section><Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Tambah karyawan</DialogTitle></DialogHeader><form className="form-grid" onSubmit={save}><label className="wide">Nama karyawan<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Email karyawan<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Peran<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="cashier">Kasir</option><option value="supervisor">Supervisor</option></select></label><label className="wide">Password awal<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><small>Minimal 12 karakter, huruf dan angka.</small></label>{error&&<p className="auth-error wide">{error}</p>}<Button disabled={busy} type="submit">{busy?"Menyimpan...":"Simpan karyawan"}</Button></form></DialogContent></Dialog></div>;
}

export function SettingsView() {
  const [form,setForm]=useState({storeName:"",businessType:"general",address:"",city:""}),[role,setRole]=useState("");
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[linked,setLinked]=useState(false);
  const [password,setPassword]=useState({currentPassword:"",newPassword:""});
  useEffect(()=>{
    api("/api/settings").then(data=>{const user=data.user;setRole(user.role);setLinked(data.googleLinked);setForm({storeName:user.storeName||"",businessType:user.businessType||"general",address:user.address||"",city:user.city||""});}).catch(error=>setMessage(messageOf(error)));
  },[]);
  const save=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setMessage("");try{await api("/api/settings","PATCH",form);window.location.reload();}catch(error){setMessage(messageOf(error));}finally{setBusy(false);}};
  const changePassword=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setMessage("");try{await api("/api/auth/change-password","POST",password);window.location.reload();}catch(error){setMessage(messageOf(error));}finally{setBusy(false);}};
  return <div className="view-stack"><section className="section-title"><div><h2>Pengaturan akun{role==="owner"?" & toko":""}</h2><p>Kelola profil dan keamanan akun Anda.</p></div></section>{message&&<p role="alert" className="auth-error">{message}</p>}<div className="settings-grid">{role==="owner"&&<section className="panel settings-panel"><h3>Profil toko</h3><form className="form-grid" onSubmit={save}><label>Nama toko<input required maxLength={100} value={form.storeName} onChange={e=>setForm({...form,storeName:e.target.value})}/></label><label>Jenis usaha<select value={form.businessType} onChange={e=>setForm({...form,businessType:e.target.value})}>{businessTypes.map(item=><option value={item.code} key={item.code}>{item.label}</option>)}</select></label><label className="wide">Alamat toko<input maxLength={240} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label>Kota<input maxLength={80} value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><Button type="submit" disabled={busy}><Save/> Simpan profil</Button></form></section>}<section className="panel settings-panel"><h3><ShieldCheck/> Keamanan login</h3>{role&&role!=="superadmin"&&<><p>{linked?"Akun Google sudah ditautkan.":"Tautkan Google menggunakan email yang sama dengan akun ini."}</p>{linked?<Button variant="outline" disabled>Google terhubung</Button>:<GoogleIdentityButton context="link" onSuccess={()=>window.location.reload()}/>}</>} {role==="superadmin"&&<p>Super-Admin hanya masuk menggunakan email/nomor resmi dan password.</p>}<form className="form-grid security-form" onSubmit={changePassword}><label className="wide">Password saat ini<input required type="password" maxLength={128} autoComplete="current-password" value={password.currentPassword} onChange={e=>setPassword({...password,currentPassword:e.target.value})}/></label><label className="wide">Password baru<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password.newPassword} onChange={e=>setPassword({...password,newPassword:e.target.value})}/><small>Minimal 12 karakter dengan huruf dan angka. Semua sesi akan diakhiri.</small></label><Button type="submit" disabled={busy}>Ganti password</Button></form></section></div><section className="panel settings-panel"><h3>Pembayaran & waktu laporan</h3><p>Pembayaran langganan diverifikasi manual oleh admin. Pencatatan QRIS dan transfer di kasir memerlukan konfirmasi pembayaran oleh kasir. Laporan menggunakan zona waktu WITA (UTC+8).</p></section></div>;
}
