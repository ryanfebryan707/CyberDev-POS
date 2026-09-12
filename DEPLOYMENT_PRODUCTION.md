# Panduan production CyberDev POS

Dokumen ini adalah runbook untuk Cloudflare Workers (utama), Vercel/Netlify (fallback), Neon, domain `cyberdev.my.id`, dan Google Identity Services. Jangan menaruh password, Client Secret, atau connection string lengkap di GitHub, screenshot, tiket, maupun chat.

## 1. Alur akun yang berlaku

| Jenis akun | Cara dibuat | Login password | Login Google |
| --- | --- | --- | --- |
| Super-Admin | Bootstrap satu kali | Email resmi atau salah satu nomor resmi | Tidak diizinkan |
| Pemilik Demo | Formulir **Demo Gratis** di halaman awal | Email/WhatsApp yang didaftarkan | Bisa setelah email manual terdaftar |
| Client dari Admin | **Super Admin → Tambah client** | Email/WhatsApp yang dibuat Admin | Bisa setelah email dibuat Admin |
| Kasir/Supervisor | Pemilik toko → Karyawan | Email yang dibuat pemilik | Bisa dengan Gmail yang sama |
| Gmail belum terdaftar | Belum memiliki akun POS | Tidak bisa | Ditolak; harus daftar Demo atau dibuat Admin dahulu |

Google tidak lagi membuat tenant/toko baru secara otomatis. Login Google pertama melakukan penautan aman hanya jika email Google terverifikasi sama persis dengan akun Client aktif yang telah ada.

## 2. Environment Variables Vercel

Buka **Vercel → cyber-dev-pos → Settings → Environment Variables**. Isi nama persis seperti tabel dan pilih scope **Production**. Preview sebaiknya memakai branch/database terpisah.

| Nama | Production | Rahasia | Isi |
| --- | --- | --- | --- |
| `DATABASE_URL` | Wajib | Ya | URL PostgreSQL Neon pooled untuk runtime |
| `DATABASE_URL_UNPOOLED` | Wajib | Ya | URL PostgreSQL Neon direct untuk `npm run db:migrate` |
| `APP_URL` | Wajib | Tidak | `https://cyber-dev-pos.vercel.app` tanpa garis miring akhir |
| `GOOGLE_CLIENT_ID` | Wajib | Tidak | Client ID OAuth **Web client 1** |
| `GOOGLE_CLIENT_SECRET` | Tidak untuk tombol utama | Ya | Kosongkan/hapus; hanya diperlukan oleh jalur callback OAuth lama |
| `ADMIN_BOOTSTRAP_PASSWORD` | Sementara | Ya | Secret baru untuk bootstrap/pemulihan login pertama; hapus sesudah berhasil |

Catatan penting:

1. Nilai `DATABASE_URL_UNPOOLED` yang masih berisi `******` tidak valid. Salin URL utuh langsung melalui integrasi Neon/Vercel atau dashboard Neon ke kolom Secret Vercel—jangan kirim nilainya kepada orang lain.
2. Jika `GOOGLE_CLIENT_SECRET` berisi nilai yang sama dengan Client ID, hapus. Itu bukan Client Secret yang valid dan tombol Google Identity Services utama memang tidak membutuhkannya.
3. Setelah setiap perubahan environment, lakukan **Redeploy**. Environment baru tidak masuk ke deployment lama.
4. Build production menjalankan `npm run db:migrate` sebelum `next build`, sehingga branch yang dituju harus menerima koneksi dari Vercel.

## 2A. Konfigurasi Cloudflare Workers

Cloudflare memakai `wrangler.jsonc`, `vite.config.ts`, dan entry `worker/index.ts`. Entry tersebut menerima Hyperdrive atau secret database dan memastikan koneksi PostgreSQL bersifat per-request agar tidak bocor antar invocation.

| Nama | Jenis | Wajib | Isi |
| --- | --- | --- | --- |
| `HYPERDRIVE` | Binding | Disarankan | Hyperdrive ke Neon production menggunakan URL direct/unpooled |
| `CYBERDEV_DATABASE_URL` | Secret | Hanya fallback | URL Neon pooled bila Hyperdrive belum dipakai |
| `CYBERDEV_ADMIN_BOOTSTRAP_PASSWORD` | Secret sementara | Ya untuk login pertama | Password bootstrap baru yang belum pernah dibagikan |
| `APP_URL` | Variable | Ya | `https://cyberdev.my.id` setelah custom domain aktif; sebelum itu gunakan origin `workers.dev` yang benar |
| `GOOGLE_CLIENT_ID` | Variable | Ya | Client ID OAuth **Web client 1** |
| `GOOGLE_CLIENT_SECRET` | Secret | Tidak untuk tombol utama | Jangan isi dengan Client ID; hanya untuk callback OAuth lama |

Urutan deployment Cloudflare:

1. Jalankan `npm ci`, `npm run verify`, lalu `npm run verify:cloudflare`.
2. Buat Hyperdrive dengan koneksi direct Neon dan pasang ID-nya sebagai binding `HYPERDRIVE` pada Worker. Alternatif sementara: simpan `CYBERDEV_DATABASE_URL` sebagai Worker Secret.
3. Simpan bootstrap Admin sebagai secret, bukan variable biasa dan bukan file source.
4. Deploy ke hostname `workers.dev`; pastikan `/api/health` HTTP 200 dengan `database: "connected"`.
5. Uji Admin, Client buatan Admin, registrasi Demo, Google Client, dan transaksi POS menggunakan data QA.
6. Tambahkan zone `cyberdev.my.id` ke Cloudflare. Di Domainesia, ganti nameserver dengan nameserver yang diberikan Cloudflare; jangan menebak nilainya.
7. Setelah zone berstatus Active, tambahkan `cyberdev.my.id` sebagai Custom Domain Worker. Cloudflare membuat record DNS dan sertifikat TLS. Atur redirect `www.cyberdev.my.id` ke domain utama bila `www` akan dipakai.
8. Ubah `APP_URL` menjadi `https://cyberdev.my.id`, redeploy, dan ulangi seluruh smoke test pada domain final.
9. Setelah Admin berhasil login dan mengganti password, hapus secret bootstrap lalu deploy lagi.

## 3. Pemulihan login Admin pertama

1. Buat password baru yang belum pernah dibagikan, minimal 12 karakter dengan huruf dan angka.
2. Simpan hanya sebagai Secret `ADMIN_BOOTSTRAP_PASSWORD` untuk scope Production.
3. Redeploy production.
4. Masuk melalui tab **Login Admin** memakai email atau salah satu nomor resmi dan secret tersebut.
5. Jika record Admin lama sudah ada tetapi belum pernah berhasil login, sistem mengganti hash lama tepat satu kali, mengakhiri sesi lama, dan menulis audit `ADMIN_FIRST_LOGIN_RECOVERED`.
6. Buka **Keamanan Akun → Ganti password**, gunakan password kuat baru, lalu hapus secret bootstrap dari hosting dan redeploy.

Pemulihan otomatis sengaja tidak berlaku jika Admin pernah berhasil login (`last_login_at` sudah terisi). Ini mencegah environment bootstrap menjadi master password permanen.

## 4. Konfigurasi Google Cloud

Pada Google Auth Platform, OAuth client **Web client 1** harus bertipe **Web application**.

- Authorized JavaScript origins domain final: `https://cyberdev.my.id`
- Selama verifikasi, tambahkan juga origin `workers.dev`, Netlify, atau Vercel yang benar-benar sedang dipakai; hapus origin yang tidak lagi diperlukan setelah migrasi stabil.
- Authorized redirect URI opsional untuk jalur lama: `https://cyberdev.my.id/api/auth/google/callback`
- Consent screen harus aktif. Jika status aplikasi masih Testing, tambahkan semua akun Gmail penguji sebagai Test users; untuk pengguna umum, selesaikan persyaratan publikasi Google.
- Tombol di aplikasi dirender langsung oleh Google Identity Services. Server memverifikasi signature, issuer, audience, masa berlaku, email terverifikasi, dan nonce sekali pakai.

Jika popup tidak muncul, izinkan popup/FedCM untuk domain aplikasi, matikan pemblokir konten sementara, dan pastikan origin Google sama persis—tanpa path dan tanpa slash tambahan.

## 5. Persetujuan browser dan perangkat

Saat perangkat pertama kali membuka aplikasi, popup CyberDev meminta dua persetujuan wajib:

1. cookie sesi HttpOnly dan penyimpanan lokal/offline;
2. pemahaman bahwa izin perangkat diminta satu per satu.

Browser tidak mempunyai API yang sah untuk memberikan semua izin sekaligus. Karena itu:

- lokasi diminta saat pengguna menekan **Gunakan lokasi perangkat** atau mengotorisasi perangkat toko;
- kamera diminta saat scanner kamera dibuka;
- printer/USB diminta saat pengguna menekan sambungkan printer;
- popup Google muncul saat tombol resmi Google ditekan.

Jangan meminta kamera, lokasi, atau USB otomatis ketika halaman dibuka. Pengguna dapat mengubah semua izin dari pengaturan situs di browser.

## 6. Pemeriksaan sebelum dinyatakan production

Jalankan lokal/CI:

```bash
npm ci
npm run verify
```

Setelah deploy, lakukan pemeriksaan berikut dengan akun QA, bukan data pelanggan asli:

1. `/api/health` mengembalikan HTTP 200 dan `database: "connected"`.
2. Login Admin berhasil dan membuka dashboard Super-Admin.
3. Admin membuat Client Demo, kemudian Client login via email dan WhatsApp.
4. Client tersebut logout lalu login dengan Gmail yang sama; Gmail asing harus ditolak.
5. Form Demo manual membuat toko kosong dan langsung membuka dashboard.
6. Tambah produk, lakukan transaksi tunai dan QRIS manual, pastikan stok turun satu kali, struk tampil, dashboard/laporan sesuai.
7. Uji reload, logout, perangkat mobile, pemasangan PWA, mode offline setelah sinkronisasi awal, serta sinkronisasi ulang ketika online.
8. Uji izin lokasi, kamera barcode, printer USB, dan laci kasir pada perangkat fisik yang benar-benar akan dipakai.
9. Aktifkan Workers Logs, periksa error runtime, dan simpan prosedur pemulihan Neon sebelum membuka akses pelanggan.

Tidak ada sistem yang dapat dijamin bebas bug atau berjalan selamanya tanpa operasi berkelanjutan. Pertahankan perpanjangan domain, aktifkan backup/restore Neon, pantau Workers Logs atau log hosting, rotasi secret, perbarui dependency, dan ulangi regression test setiap rilis.
