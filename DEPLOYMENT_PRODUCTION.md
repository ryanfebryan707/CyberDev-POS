# Panduan production CyberDev POS

Dokumen ini adalah runbook untuk Vercel + Neon + Google Identity Services. Jangan menaruh password, Client Secret, atau connection string lengkap di GitHub, screenshot, tiket, maupun chat.

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

## 3. Pemulihan login Admin pertama

1. Buat password baru yang belum pernah dibagikan, minimal 12 karakter dengan huruf dan angka.
2. Simpan hanya sebagai Secret `ADMIN_BOOTSTRAP_PASSWORD` untuk scope Production.
3. Redeploy production.
4. Masuk melalui tab **Login Admin** memakai email atau salah satu nomor resmi dan secret tersebut.
5. Jika record Admin lama sudah ada tetapi belum pernah berhasil login, sistem mengganti hash lama tepat satu kali, mengakhiri sesi lama, dan menulis audit `ADMIN_FIRST_LOGIN_RECOVERED`.
6. Buka **Keamanan Akun → Ganti password**, gunakan password kuat baru, lalu hapus `ADMIN_BOOTSTRAP_PASSWORD` dari Vercel dan redeploy.

Pemulihan otomatis sengaja tidak berlaku jika Admin pernah berhasil login (`last_login_at` sudah terisi). Ini mencegah environment bootstrap menjadi master password permanen.

## 4. Konfigurasi Google Cloud

Pada Google Auth Platform, OAuth client **Web client 1** harus bertipe **Web application**.

- Authorized JavaScript origins: `https://cyber-dev-pos.vercel.app`
- Authorized redirect URI opsional untuk jalur lama: `https://cyber-dev-pos.vercel.app/api/auth/google/callback`
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

Tidak ada sistem yang dapat dijamin bebas bug atau berjalan selamanya tanpa operasi berkelanjutan. Aktifkan backup/restore Neon, pantau error Vercel, rotasi secret, perbarui dependency, dan ulangi regression test setiap rilis.
