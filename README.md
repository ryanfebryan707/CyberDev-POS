# CyberDev POS 13 — Next.js / Cloudflare / PostgreSQL

Perbaikan dari arsip v12.1. Server Cloudflare D1 telah diganti dengan Next.js dan PostgreSQL. Katalog toko baru dimulai kosong. Aplikasi tidak menanam password admin di source code.

## Menjalankan lokal

Gunakan Node.js 22 atau 24. Jalankan `npm ci`, kemudian `npm run dev`. Tanpa DATABASE_URL, mode development memakai PostgreSQL PGlite di `.data/cyberdev`. Mode production **wajib** menggunakan PostgreSQL eksternal dan tidak pernah memakai database lokal sebagai fallback.

Untuk admin lokal, atur `ADMIN_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (minimal 12 karakter sangat disarankan), serta `APP_URL=http://localhost:3000` dalam `.env.local`. Identitas login Admin production dikunci di `lib/admin-identity.ts`; password hanya disimpan sebagai hash di database dan perubahan password Super-Admin dari dashboard diblokir pada production. Login Client tetap menerima password lama maksimal 128 karakter agar akun lama dapat masuk lalu meningkatkannya. Bila record Super-Admin sudah dibuat tetapi `last_login_at` masih kosong, `ADMIN_BOOTSTRAP_PASSWORD` dapat memulihkan password tepat satu kali pada login pertama. Setelah login berhasil, jalur pemulihan itu otomatis tidak berlaku lagi.

## Deployment Vercel

1. Import repositori ini di Vercel, root directory repositori, framework Next.js, Node.js 22.x.
2. Isi environment server: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_URL` (origin HTTPS domain final, tanpa path), dan `ADMIN_BOOTSTRAP_PASSWORD` untuk bootstrap/pemulihan login pertama. Runtime juga mengenali format koneksi Vercel/Neon: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `NEON_DATABASE_URL`, atau gabungan `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`. Tidak ada variabel rahasia dengan awalan `NEXT_PUBLIC_`.
3. Untuk migrasi isi `DATABASE_URL_UNPOOLED` dengan koneksi langsung. Jalankan `npm run db:migrate`. Migrasi berada di `db/migrations`, tercatat pada `schema_migrations`, serta dijalankan dalam transaksi. Jangan gunakan skema SQL D1 versi lama pada PostgreSQL.
4. Jalankan `npm run verify`. Deploy preview, periksa `/api/health`, login dan alur kasir, kemudian deploy production. Gunakan database preview terpisah untuk pengujian.
5. Setelah Admin pertama berhasil masuk, verifikasi ketiga identifier menuju akun yang sama. Password Super-Admin production dikelola lewat deployment/database dan tidak dapat diubah dari dashboard; Client tetap dapat mengganti passwordnya sendiri.

## Deployment Cloudflare Workers

Project juga mempunyai target Cloudflare Workers melalui `vinext`, tanpa menghapus target Next.js standar untuk Vercel/Netlify. Source telah lolos `vinext check` dan build Worker dapat diperiksa dengan `npm run verify:cloudflare`.

1. Gunakan Worker bernama `cyberdev-pos`, Node compatibility, Smart Placement, dan Workers Logs sebagaimana didefinisikan di `wrangler.jsonc`.
2. Hubungkan Neon melalui binding Hyperdrive bernama `HYPERDRIVE`. Buat Hyperdrive memakai connection string Neon **direct/unpooled**; aplikasinya sendiri menerima connection string sementara dari binding dan membuka satu client PostgreSQL per request.
3. Bila Hyperdrive belum tersedia, simpan URL Neon pooled sebagai Worker Secret `CYBERDEV_DATABASE_URL`. Jangan menulis URL database di `wrangler.jsonc` atau GitHub.
4. Simpan `CYBERDEV_ADMIN_BOOTSTRAP_PASSWORD` sebagai Worker Secret hanya sampai login Admin pertama berhasil. Atur `APP_URL=https://cyberdev.my.id` dan `GOOGLE_CLIENT_ID` sebagai variable production. Tombol Google utama tidak membutuhkan Client Secret.
5. Deploy awal ke hostname `workers.dev`, periksa `/api/health`, lalu hubungkan custom domain setelah Worker lolos uji.
6. Tambahkan zone `cyberdev.my.id` ke Cloudflare dan ganti nameserver domain di Domainesia sesuai dua nameserver yang diberikan Cloudflare. Setelah zone aktif, tambahkan Custom Domain `cyberdev.my.id` ke Worker dan buat redirect `www` ke domain utama bila diperlukan.
7. Di OAuth client Google **Web client 1**, tambahkan Authorized JavaScript origin persis `https://cyberdev.my.id`. Callback `https://cyberdev.my.id/api/auth/google/callback` hanya perlu untuk alur authorization-code lama.

Cloudflare dan Neon tetap bergantung pada akun, kuota, pembaruan software, dan perpanjangan domain. Tidak ada hosting yang dapat menjamin layanan hidup selamanya tanpa pemeliharaan dan backup.

### Checklist environment production

- Buka **Vercel → cyber-dev-pos → Settings → Environment Variables**. `DATABASE_URL` dan `DATABASE_URL_UNPOOLED` harus dipasang untuk **Production**, bukan hanya tersimpan pada proyek Neon, integrasi Development, atau project Vercel lain.
- `DATABASE_URL` sebaiknya memakai endpoint pooler Neon untuk runtime Vercel; `DATABASE_URL_UNPOOLED` memakai endpoint langsung untuk migrasi. Keduanya harus menuju branch production yang sama, berupa connection string lengkap, dan disimpan sebagai Secret. Jangan memakai awalan `NEXT_PUBLIC_`.
- Atur `APP_URL=https://cyber-dev-pos.vercel.app` dan `GOOGLE_CLIENT_ID` ke Client ID dari OAuth client **Web client 1** bertipe **Web application**. Tombol Google utama tidak membutuhkan `GOOGLE_CLIENT_SECRET`.
- Atur `ADMIN_BOOTSTRAP_PASSWORD` hanya selama bootstrap/pemulihan login pertama. Jangan commit, jangan kirim melalui chat, dan jangan gunakan password yang pernah terekspos. Identitas Admin production tidak perlu diulang di environment karena telah dikunci di source.
- Setiap perubahan environment wajib diikuti deployment baru: buka **Deployments**, pilih deployment terbaru, lalu **Redeploy**. Deployment lama tidak memperoleh environment yang baru ditambahkan.
- Verifikasi hasil deployment melalui `https://cyber-dev-pos.vercel.app/api/health`. Production siap diuji login hanya bila responsnya HTTP 200 dengan `database: "connected"`.

## Login Google

Login Client utama memakai tombol resmi Google Identity Services. ID token diverifikasi di server (tanda tangan, issuer, audience, expiry, email terverifikasi, serta nonce sekali pakai yang terikat cookie). Token akses Google tidak diminta atau disimpan. Jalur OAuth authorization-code lama tetap tersedia sebagai kompatibilitas opsional, tetapi tidak dipakai oleh tombol login utama.

- Di Google Cloud / Google Auth Platform, pilih proyek milik pengelola dan siapkan consent screen.
- Buat OAuth client bertipe Web application. Untuk tombol Google Identity Services, tambahkan authorized JavaScript origin **persis** untuk setiap domain production yang aktif, terutama `https://cyberdev.my.id`.
- Redirect URI `https://cyberdev.my.id/api/auth/google/callback` hanya diperlukan bila jalur authorization-code lama juga akan digunakan.
- Client Secret berbeda dari Client ID dan tidak boleh ditempel ke source code, commit GitHub, atau percakapan.
- Client ID CyberDev mempunyai fallback publik di kode; `GOOGLE_CLIENT_ID` tetap dapat digunakan untuk override. Tombol utama tidak memerlukan Client Secret. Jika jalur OAuth lama digunakan, `GOOGLE_CLIENT_SECRET` harus berupa secret asli yang berbeda dari Client ID dan hanya disimpan sebagai Secret server Vercel.
- Setelah mengubah origin atau environment, lakukan deployment baru. Jangan mengklaim koneksi Google selesai sebelum login nyata berhasil.
- Google hanya tersedia untuk Client. Email harus sudah terdaftar melalui formulir Demo manual atau sudah ditambahkan oleh Super-Admin. Gmail yang belum terdaftar ditolak dan tidak membuat toko otomatis.
- Pada login Google pertama, email terverifikasi dari Google harus sama persis dengan email akun Client. Sistem lalu menautkan `sub` Google ke akun tersebut dan login berikutnya memakai tautan itu. Super-Admin tidak dapat memakai atau menautkan Google.
- Bila Super-Admin mengganti email pemilik Client, tautan Google lama dan sesi pemilik dicabut. Client dapat masuk lagi dengan identitas baru lalu menautkan Gmail yang sesuai.
- Pemulihan password melalui email dan MFA belum tersedia.

## Fitur yang tersimpan

- Persetujuan wajib dan versioned untuk cookie sesi, penyimpanan lokal/offline, serta penjelasan izin perangkat sebelum aplikasi digunakan.
- Registrasi pemilik, login email/telepon, login Google khusus Client terdaftar, sesi HttpOnly, logout, perubahan password dan pencabutan semua sesi.
- Dashboard dari transaksi toko, penjualan per jam WITA, produk terlaris, peringatan stok.
- Produk tambah/edit, barcode, harga jual/modal, stok pecahan; impor CSV/XLSX dan ekspor XLSX.
- Kasir dengan perhitungan harga di server, kunci baris stok, transaksi atomik dan idempotensi antrean offline.
- Data pelanggan tambah/edit; akun kasir dan supervisor, perubahan role, aktivasi/nonaktif, pencabutan sesi.
- Profil toko dan QRIS merchant tersimpan; payload QRIS resmi dirender sebagai QR per-tenant tanpa menyimpan PIN/kredensial bank. Laporan mencakup penjualan bersih diskon, HPP, laba kotor, dan ekspor.
- Billing transfer manual, status pending, verifikasi/aktivasi oleh superadmin, suspend, periode demo, audit, broadcast, reset data dengan konfirmasi nama toko.

## Batas implementasi dan operasi

- Client dapat menempel payload QRIS merchant resmi agar QR dapat dipindai dari kasir. Konfirmasi pembayaran QRIS, transfer, dan metode lain tetap dilakukan kasir; rekonsiliasi otomatis memerlukan akun/credential payment gateway merchant yang belum disediakan. Tidak ada integrasi WhatsApp Business API, marketplace, biometrik, loyalitas/poin, ataupun absensi yang sudah aktif.
- Lokasi dan IP mencatat persetujuan perangkat toko. Lokasi browser tidak membuktikan identitas perangkat dan tidak menjamin pencegahan GPS palsu.
- Antrean offline dipisahkan menurut tenant. Transaksi yang ditolak server tetap tersimpan untuk rekonsiliasi, tidak dihitung sebagai berhasil tersinkron. Login pertama memerlukan internet. Stok serentak antarperangkat offline memerlukan rekonsiliasi ketika online.
- Setelah login online dan katalog berhasil tersinkron, Client dapat membuka kembali PWA saat offline selama snapshot sesi perangkat masih valid (maksimal 7 hari dan tidak melewati masa Demo/langganan). Super-Admin tidak disimpan untuk akses offline; koordinat, IP, token sesi, dan password juga tidak pernah dimasukkan ke cache offline.
- Browser tidak menyediakan satu tombol untuk memberi "akses penuh" ke semua perangkat. Printer USB, laci kasir, scanner, kamera, dan GPS meminta izin terpisah saat fiturnya ditekan, memerlukan uji pada perangkat fisik, dan dukungannya tergantung browser/perangkat.
- Zona waktu laporan WITA. Laporan adalah laba kotor berdasarkan HPP, bukan laporan akuntansi lengkap.
- Perlu uji beban sesuai penggunaan nyata, backup/restore terjadwal, pemantauan, kebijakan retensi, dan pembaruan dependensi. Tidak ada jaminan bebas bug atau layanan berjalan selamanya.

## Pengujian

`npm test`: password, Google JWT negatif, CSRF/JSON, escape struk, parser angka, konversi parameter SQL.

`npm run test:api`: uji integrasi terhadap PostgreSQL PGlite sementara. Menguji registrasi, batas role, isolasi tenant, oversell, idempotensi, laporan diskon, aktivasi manual, staff, impor, broadcast, profil, suspend, pencabutan sesi dan rate limit. Data QA hanya berada di database sementara dan dihapus oleh test runner.

`npm run build`: build Next.js production. Keberhasilan build tidak menggantikan pengujian deployment serta Google OAuth nyata.

Dokumentasi acuan: https://developers.google.com/identity/openid-connect/openid-connect , https://nextjs.org/docs , https://vercel.com/docs , https://neon.com/docs .


## Deployment alternatif Netlify

Project ini mendukung Netlify melalui `netlify.toml`. Next.js App Router dan API Routes dijalankan menggunakan Netlify Next.js runtime, sedangkan data tetap berada di Neon PostgreSQL. Atur `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_URL`, `GOOGLE_CLIENT_ID`, dan `ADMIN_BOOTSTRAP_PASSWORD` sebagai environment production Netlify. Jalankan `npm run db:migrate` secara terpisah sebelum deployment jika ada migrasi baru; build Netlify hanya menjalankan `next build` agar kredensial migrasi tidak diperlukan pada tahap build. Jangan menyimpan connection string atau password di GitHub.

Untuk Google Identity Services pada domain Netlify, tambahkan origin HTTPS domain Netlify ke **Authorized JavaScript origins** pada OAuth client **Web client 1**. Redirect URI callback hanya diperlukan untuk jalur authorization-code lama.
