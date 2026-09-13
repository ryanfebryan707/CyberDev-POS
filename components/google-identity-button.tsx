"use client";

import { useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };
type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        nonce: string;
        login_hint?: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: {
        type: "standard";
        theme: "outline";
        size: "large";
        shape: "rectangular";
        text: "signin_with" | "continue_with";
        logo_alignment: "left";
        locale: string;
        width: number;
      }): void;
      cancel(): void;
    };
  };
};

declare global {
  interface Window { google?: GoogleIdentityApi }
}

let googleScript: Promise<void> | null = null;

function loadGoogleIdentityScript() {
  if (window.google?.accounts.id) return Promise.resolve();
  googleScript ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cyberdev-google="true"]');
    const script = existing || document.createElement("script");
    let timer = 0;
    const failed = (message = "Layanan Google gagal dimuat.") => {
      window.clearTimeout(timer);
      if (!window.google?.accounts.id) script.remove();
      reject(new Error(message));
    };
    const loaded = () => {
      window.clearTimeout(timer);
      if (window.google?.accounts.id) resolve();
      else failed("Layanan Google tidak tersedia.");
    };
    timer = window.setTimeout(() => failed("Layanan Google terlalu lama merespons."), 12000);
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => failed(), { once: true });
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.cyberdevGoogle = "true";
      document.head.appendChild(script);
    } else if (window.google?.accounts.id) loaded();
  }).catch(error => {
    googleScript = null;
    throw error;
  });
  return googleScript;
}

export function GoogleIdentityButton({
  disabled = false,
  context = "signin",
  loginHint,
  onSuccess,
}: {
  disabled?: boolean;
  context?: "signin" | "link";
  loginHint?: string;
  onSuccess?: () => void | Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onSuccessRef = useRef(onSuccess);
  const [message, setMessage] = useState("Menyiapkan login Google...");
  const [ready, setReady] = useState(false);
  const normalizedLoginHint = loginHint?.trim().toLowerCase();
  const safeLoginHint = normalizedLoginHint && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLoginHint)
    ? normalizedLoginHint
    : undefined;
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    const controller = new AbortController();

    async function initialize() {
      try {
        setReady(false);
        setMessage("Menyiapkan login Google...");
        const [response] = await Promise.all([
          fetch("/api/auth/google/identity", { signal: controller.signal, cache: "no-store" }),
          loadGoogleIdentityScript(),
        ]);
        const data = await response.json().catch(() => ({ error: "Respons Google tidak valid." })) as {
          clientId?: string;
          nonce?: string;
          error?: string;
        };
        if (!response.ok || !data.clientId || !data.nonce) throw new Error(data.error || "Login Google belum tersedia.");
        if (!active || !container.current || !window.google?.accounts.id) return;

        const target = container.current;
        window.google.accounts.id.initialize({
          client_id: data.clientId,
          nonce: data.nonce,
          ...(safeLoginHint ? { login_hint: safeLoginHint } : {}),
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: responseData => {
            void (async () => {
              if (!responseData.credential) return setMessage("Google tidak mengirim identitas yang valid.");
              setMessage("Memverifikasi akun Google...");
              setReady(false);
              try {
                const loginResponse = await fetch("/api/auth/google/identity", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ credential: responseData.credential }),
                });
                const result = await loginResponse.json().catch(() => ({ error: "Respons server tidak valid." })) as { error?: string };
                if (!loginResponse.ok) throw new Error(result.error || "Login Google gagal.");
                await onSuccessRef.current?.();
                if (!onSuccessRef.current) window.location.reload();
              } catch (error) {
                if (!active) return;
                setMessage(error instanceof Error ? error.message : "Login Google gagal.");
                setReady(true);
              }
            })();
          },
        });
        target.replaceChildren();
        window.google.accounts.id.renderButton(target, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: context === "link" ? "continue_with" : "signin_with",
          logo_alignment: "left",
          locale: "id",
          width: Math.max(220, Math.min(400, Math.floor(target.getBoundingClientRect().width || 360))),
        });
        setReady(true);
        setMessage("");
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setMessage(error instanceof Error ? error.message : "Login Google belum tersedia.");
        setReady(false);
      }
    }

    void initialize();
    return () => {
      active = false;
      controller.abort();
      window.google?.accounts.id.cancel();
    };
  }, [context, disabled, safeLoginHint]);

  return <div className={`google-identity ${disabled ? "disabled" : ""}`} aria-busy={!ready}>
    <div ref={container} className="google-identity-button" />
    {message && <small className="google-status" role={ready ? undefined : "status"}>{message}</small>}
  </div>;
}
