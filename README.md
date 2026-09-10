# CyberDev POS 13 — Next.js / Vercel / PostgreSQL

Perbaikan dari arsip v12.1. Server Cloudflare D1 telah diganti dengan Next.js dan PostgreSQL. Katalog toko baru dimulai kosong. Aplikasi tidak menggunakan akun atau password admin bawaan.

## Menjalankan lokal

Gunakan Node.js 22 atau 24. Jalankan `npm ci`, kemudian `npm run dev`. Tanpa DATABASE_URL, mode development memakai PostgreSQL PGlite di `.data/cyberdev`. Mode production **wajib** menggunakan PostgreSQL eksternal dan tidak pernah memakai database lokal sebagai fallback.

Untuk admin lokal, atur `ADMIN_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (disarankan minimal 12 karakter), serta `APP_URL=http://localhost:3000` dalam `.env.local`. Identitas login Admin production dikunci di `lib/admin-identity.ts`; password hanya disimpan sebagai hash di database dan dapat diganti dari dashboard. Login tetap menerima password lama maksimal 128 karakter agar akun lama dapat masuk lalu meningkatkan passwordnya.

## Deployment Vercel

1. Import repositori ini di Vercel, root directory repositori, framework Next.js, Node.js 22.x.
2. Isi environment server: `DATABASE_URL`, `APP_URL` (origin HTTPS domain final, tanpa path), dan `ADMIN_BOOTSTRAP_PASSWORD` untuk bootstrap pertama. Runtime juga mengenali `POSTGRES_URL`/`POSTGRES_PRISMA_URL` serta URL sistem Vercel sebagai fallback. Tidak ada variabel rahasia dengan awalan NEXT_PUBLIC.
3. Untuk migrasi isi `DATABASE_URL_UNPOOLED` dengan koneksi langsung. Jalankan `npm run db:migrate`. Migrasi berada di `db/migrations`, tercatat pada `schema_migrations`, serta dijalankan dalam transaksi. Jangan gunakan skema SQL D1 versi lama pada PostgreSQL.
4. Jalankan `npm run verify`. Deploy preview, periksa `/api/health`, login dan alur kasir, kemudian deploy production. Gunakan database preview terpisah untuk pengujian.
5. Setelah admin pertama berhasil masuk, hapus bootstrap password dari environment dan redeploy.

## Login Google

Implementasi menggunakan authorization code, PKCE S256, state sekali pakai yang terikat cookie, nonce, verifikasi tanda tangan JWT, issuer, audience, expiry, dan email terverifikasi. Token akses Google tidak disimpan.

- Di Google Cloud / Google Auth Platform, pilih proyek milik pengelola dan siapkan consent screen.
- Buat OAuth client bertipe Web application. Authorized redirect URI harus **persis** `https://DOMAIN-ANDA/api/auth/google/callback`.
- Untuk deployment resmi saat ini, redirect URI adalah `https://cyber-dev-pos.vercel.app/api/auth/google/callback` dan authorized JavaScript origin adalah `https://cyber-dev-pos.vercel.app`.
- Client Secret berbeda dari Client ID dan tidak boleh ditempel ke source code, commit GitHub, atau percakapan.
- Masukkan `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` sebagai environment server Vercel. Atur APP_URL ke origin yang sama, kemudian redeploy.
- Tanpa konfigurasi lengkap, tombol Google nonaktif. Jangan mengklaim koneksi Google selesai sebelum login nyata berhasil.
- Google hanya tersedia untuk Client. Akun baru Google memperoleh toko demo kosong. Email client yang sudah mempunyai akun password harus login dengan password terlebih dahulu, kemudian memilih Tautkan akun Google di Pengaturan. Super-Admin tidak dapat memakai atau menautkan login Google. Tidak ada penggabungan akun otomatis berdasarkan kesamaan email.
- Akun Google baru memakai login Google. Pemulihan password melalui email dan MFA belum tersedia.

## Fitur yang tersimpan

- Registrasi pemilik, login email/telepon, sesi HttpOnly, logout, perubahan password dan pencabutan semua sesi.
- Dashboard dari transaksi toko, penjualan per jam WITA, produk terlaris, peringatan stok.
- Produk tambah/edit, barcode, harga jual/modal, stok pecahan; impor CSV/XLSX dan ekspor XLSX.
- Kasir dengan perhitungan harga di server, kunci baris stok, transaksi atomik dan idempotensi antrean offline.
- Data pelanggan tambah/edit; akun kasir dan supervisor, perubahan role, aktivasi/nonaktif, pencabutan sesi.
- Profil toko tersimpan; laporan penjualan bersih diskon, HPP, laba kotor, dan ekspor.
- Billing transfer manual, status pending, verifikasi/aktivasi oleh superadmin, suspend, periode demo, audit, broadcast, reset data dengan konfirmasi nama toko.

## Batas implementasi dan operasi

- QRIS, transfer, dan metode lain di kasir adalah **pencatatan pembayaran manual**. Belum ada konfirmasi otomatis dari payment gateway. Tidak ada integrasi WhatsApp Business API, marketplace, biometrik, loyalitas/poin, ataupun absensi yang sudah aktif.
- Lokasi dan IP mencatat persetujuan perangkat toko. Lokasi browser tidak membuktikan identitas perangkat dan tidak menjamin pencegahan GPS palsu.
- Antrean offline dipisahkan menurut tenant. Transaksi yang ditolak server tetap tersimpan untuk rekonsiliasi, tidak dihitung sebagai berhasil tersinkron. Login pertama memerlukan internet. Stok serentak antarperangkat offline memerlukan rekonsiliasi ketika online.
- Printer USB, laci kasir, scanner, kamera, dan GPS memerlukan uji pada perangkat fisik yang dipakai. Dukungan tergantung browser/perangkat.
- Zona waktu laporan WITA. Laporan adalah laba kotor berdasarkan HPP, bukan laporan akuntansi lengkap.
- Perlu uji beban sesuai penggunaan nyata, backup/restore terjadwal, pemantauan, kebijakan retensi, dan pembaruan dependensi. Tidak ada jaminan bebas bug atau layanan berjalan selamanya.

## Pengujian

`npm test`: password, Google JWT negatif, CSRF/JSON, escape struk, parser angka, konversi parameter SQL.

`npm run test:api`: uji integrasi terhadap PostgreSQL PGlite sementara. Menguji registrasi, batas role, isolasi tenant, oversell, idempotensi, laporan diskon, aktivasi manual, staff, impor, broadcast, profil, suspend, pencabutan sesi dan rate limit. Data QA hanya berada di database sementara dan dihapus oleh test runner.

`npm run build`: build Next.js production. Keberhasilan build tidak menggantikan pengujian deployment serta Google OAuth nyata.

Dokumentasi acuan: https://developers.google.com/identity/openid-connect/openid-connect , https://nextjs.org/docs , https://vercel.com/docs , https://neon.com/docs .
