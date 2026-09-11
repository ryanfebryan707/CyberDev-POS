"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function runningStandalone() {
  const safariNavigator=navigator as Navigator & {standalone?: boolean};
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(safariNavigator.standalone);
}

export function PwaRegister() {
  const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  const [installHelp,setInstallHelp]=useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (runningStandalone()) return;
    const beforeInstall=(event:Event)=>{
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled=()=>{setInstallPrompt(null);setInstallHelp("");setInstalled(true);};
    window.addEventListener("beforeinstallprompt",beforeInstall);
    window.addEventListener("appinstalled",handleInstalled);
    return ()=>{
      window.removeEventListener("beforeinstallprompt",beforeInstall);
      window.removeEventListener("appinstalled",handleInstalled);
    };
  }, []);

  const install=async()=>{
    if (!installPrompt) {
      const isApple=/iphone|ipad|ipod/i.test(navigator.userAgent);
      setInstallHelp(isApple
        ? "Di Safari pilih Bagikan, lalu Tambahkan ke Layar Utama."
        : "Buka menu browser lalu pilih Instal aplikasi atau Tambahkan ke layar utama.");
      return;
    }
    await installPrompt.prompt();
    const choice=await installPrompt.userChoice;
    setInstallPrompt(null);
    if(choice.outcome==="accepted")setInstalled(true);
  };

  if(installed)return null;
  return <aside className="pwa-install" aria-label="Instal CyberDev POS">
    <button type="button" onClick={install}><Download/> Pasang aplikasi</button>
    {installHelp&&<div role="status"><span>{installHelp}</span><button type="button" onClick={()=>setInstallHelp("")} aria-label="Tutup petunjuk instalasi"><X/></button></div>}
  </aside>;
}
