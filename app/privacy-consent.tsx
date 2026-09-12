"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, CloudOff, LocateFixed, ShieldCheck } from "lucide-react";
import Image from "next/image";
import {
  ACCESS_CONSENT_STORAGE_KEY,
  createAccessConsent,
  parseAccessConsent,
} from "@/lib/browser-consent";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function storedConsentSnapshot() {
  try { return Boolean(parseAccessConsent(window.localStorage.getItem(ACCESS_CONSENT_STORAGE_KEY))); }
  catch { return false; }
}

const subscribeToHydration = () => () => undefined;

export function PrivacyConsent({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const storedAccepted = useSyncExternalStore(subscribeToStorage, storedConsentSnapshot, () => false);
  const [acceptedNow, setAcceptedNow] = useState(false);
  const [essentialAccepted, setEssentialAccepted] = useState(false);
  const [permissionAccepted, setPermissionAccepted] = useState(false);
  const [storageError, setStorageError] = useState("");

  const accept = () => {
    if (!essentialAccepted || !permissionAccepted) return;
    try {
      window.localStorage.setItem(ACCESS_CONSENT_STORAGE_KEY, JSON.stringify(createAccessConsent()));
      setAcceptedNow(true);
    } catch {
      setStorageError("Penyimpanan situs diblokir browser. Aktifkan cookie dan penyimpanan situs, lalu coba lagi.");
    }
  };

  if (!hydrated) {
    return <div className="consent-loading" role="status"><ShieldCheck/><span>Memeriksa persetujuan keamanan...</span></div>;
  }
  if (storedAccepted || acceptedNow) return children;

  return <main className="consent-shell">
    <section className="consent-card" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
      <div className="consent-brand"><Image src="/cyberdev-brand.jpg" alt="CyberDev" width={56} height={56} priority/><span><strong>CyberDev POS</strong><small>Persetujuan akses aplikasi</small></span></div>
      <span className="consent-eyebrow"><ShieldCheck/> KEAMANAN & PRIVASI</span>
      <h1 id="consent-title">Izinkan akses yang diperlukan untuk menjalankan POS</h1>
      <p id="consent-description">CyberDev POS membutuhkan cookie sesi aman dan penyimpanan lokal agar login, antrean transaksi offline, dan pemasangan aplikasi dapat berfungsi. Izin perangkat tidak pernah diminta sekaligus atau diam-diam.</p>
      <div className="consent-features">
        <article><ShieldCheck/><span><strong>Cookie sesi esensial</strong><small>Cookie HttpOnly menjaga sesi login. Password dan token Google tidak disimpan di browser.</small></span></article>
        <article><CloudOff/><span><strong>Penyimpanan lokal & offline</strong><small>Katalog, sesi Client terbatas, dan antrean transaksi dapat disimpan di perangkat ini untuk mode offline.</small></span></article>
        <article><LocateFixed/><span><strong>Izin browser sesuai kebutuhan</strong><small>Lokasi, kamera barcode, printer/USB hanya diminta setelah Anda menekan fitur terkait dan tetap dikendalikan browser.</small></span></article>
      </div>
      <label className="consent-option"><input type="checkbox" checked={essentialAccepted} onChange={event=>setEssentialAccepted(event.target.checked)}/><span><strong>Saya menyetujui cookie sesi dan penyimpanan lokal esensial.</strong><small>Tanpa penyimpanan esensial, login dan POS offline tidak dapat digunakan.</small></span></label>
      <label className="consent-option"><input type="checkbox" checked={permissionAccepted} onChange={event=>setPermissionAccepted(event.target.checked)}/><span><strong>Saya memahami izin perangkat akan diminta satu per satu.</strong><small>Saya dapat menolak lokasi, kamera, atau USB melalui popup browser; fitur terkait mungkin tidak berfungsi.</small></span></label>
      {storageError&&<p className="consent-error" role="alert">{storageError}</p>}
      <button className="consent-accept" type="button" disabled={!essentialAccepted||!permissionAccepted} onClick={accept}><Check/> Izinkan & lanjutkan ke CyberDev POS</button>
      <p className="consent-footnote">Persetujuan tersimpan hanya di perangkat ini. Hapus data situs di pengaturan browser untuk menariknya. Hubungi CS 082244837977 / 085234005206 bila memerlukan bantuan.</p>
    </section>
  </main>;
}

