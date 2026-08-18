# EQUAL English

Situs web EQUAL English, kelas bahasa Inggris yang berfokus pada listening,
reading, dan writing, serta program intensif Bootcamp EPT UI.

## Menjalankan secara lokal

Situs ini statis dan tidak punya proses build. Buka `index.html` langsung di
browser, atau jalankan server statis apa pun dari folder ini:

```bash
python -m http.server 4173
```

Lalu buka `http://127.0.0.1:4173`.

## Struktur

| Berkas | Isi |
| --- | --- |
| `index.html` | Seluruh halaman publik, satu file. Disajikan lewat `api/render-home.js`, BUKAN langsung sebagai file statis -- lihat bagian Panel admin. |
| `styles.css` | Seluruh gaya, termasuk lapisan animasi dan breakpoint |
| `script.js` | Navigasi, reveal saat scroll, penghitung angka |
| `shader-background.js` | Latar gradien WebGL di hero |
| `EDITS/` | Logo dan foto yang dipakai halaman |
| `admin.html` / `admin.js` / `admin.css` | Panel admin (`/admin`), login Google, ganti teks/harga/foto tanpa commit/push |
| `api/render-home.js` | Menyisipkan konten yang diedit dari `/admin` ke `index.html` sebelum dikirim ke pengunjung |
| `api/admin-content.js`, `api/admin-upload.js` | Endpoint server panel admin (baca/simpan teks & harga, upload foto) |
| `api/verify-access.js` | Gerbang login siswa ke `kelas.html`, terpisah total dari panel admin |

## Panel admin (`/admin`)

Login Google, lalu bisa ganti teks/harga di section Program Intensif, Pilihan
Paket, dan Mentor, plus upload foto (logo, foto komunitas, foto kelas Zoom,
banner share link) -- tanpa commit/push kode. Perubahan tersimpan di Vercel
Global Config (teks/harga) dan Vercel Blob (foto), lalu tayang di halaman
publik dalam hitungan detik.

**Env var yang wajib diisi di Vercel Project Settings > Environment
Variables** (selain yang sudah ada untuk `kelas.html`):

- `ADMIN_EMAILS` -- email Google yang boleh masuk `/admin`, pisah koma kalau
  lebih dari satu. Tanpa ini, `/admin` menolak SEMUA orang (gagal tertutup,
  bukan gagal terbuka).
- `GLOBAL_CONFIG` -- otomatis terisi begitu Global Config store di-connect ke
  project ini lewat dashboard Vercel (Storage > Create Database > Global
  Config). Tidak perlu diisi manual.
- `BLOB_READ_WRITE_TOKEN` -- otomatis terisi begitu Blob store (harus
  **Public**, bukan Private -- lihat catatan di bawah) di-connect ke project
  ini. Tidak perlu diisi manual.
- `VERCEL_API_TOKEN` -- **satu-satunya yang harus dibuat manual.** Buat di
  vercel.com/account/tokens, lalu tambahkan sebagai Environment Variable.
  Dipakai untuk MENULIS ke Global Config (SDK bacanya otomatis lewat
  `GLOBAL_CONFIG`, tapi menulis harus lewat Vercel REST API yang butuh token
  akun terpisah).
- `VERCEL_TEAM_ID` -- OPSIONAL, cuma diperlukan kalau project ini ada di
  bawah sebuah Team di Vercel (bukan akun personal biasa).

Blob store WAJIB dibuat dengan access **Public** (bukan Private) -- pilihan
ini tidak bisa diubah setelah store dibuat, jadi kalau salah pilih Private,
buat store baru, jangan coba mengubah yang sudah ada.

Kalau salah satu env var di atas belum diisi/salah, `/admin` menampilkan
pesan error yang jelas (bukan diam-diam gagal), dan halaman publik
(`index.html`) tetap tampil normal pakai nilai hardcode -- lihat
`readOverrides()` di `api/_lib/global-config-store.js`.

## Catatan teknis

- **Zero build step, dua dependency runtime.** Tidak ada bundler atau
  framework, dan tidak perlu apa pun diinstall untuk mengedit/melihat
  `index.html`, `kelas.html`, atau `admin.html` secara lokal. `package.json`
  di root cuma dipakai Vercel supaya fungsi di `api/` (panel admin) punya
  `@vercel/blob` dan `@vercel/global-config` saat deploy -- kedua paket ini
  TIDAK dipakai di file manapun yang jalan di browser pengunjung.
- **Latar hero memakai WebGL.** Kalau WebGL tidak tersedia, canvas dibiarkan
  kosong dan `.hero-glow` berbasis CSS menjadi cadangannya.
- **`prefers-reduced-motion` dihormati.** Animasi reveal langsung ditampilkan
  dan waktu pada shader dibekukan, karena media query CSS tidak bisa
  menghentikan `requestAnimationFrame`.
- **Ada jaring pengaman reveal.** Bila `script.js` gagal dimuat, seluruh konten
  tetap muncul setelah 2,5 detik, sehingga halaman tidak pernah kosong.
- **Foto sudah dioptimalkan.** Versi asli dari Unsplash (~9 MB) tidak disertakan;
  yang dipakai adalah versi 1600px (total ~366 KB).

## Sebelum dipublikasikan

- [ ] Isi tiga kartu testimoni. Markup-nya ada di `index.html`, sengaja
      dinonaktifkan dalam komentar sampai kutipan asli dari siswa tersedia.
- [ ] Buka kembali formulir pendaftaran. Tautan pada tombol utama di bagian
      penutup saat ini mengarah ke Google Form yang berstatus tertutup.
- [ ] Pastikan jumlah orang pada paket Group. Website menulis 3 orang,
      sedangkan guidebook menulis "with 3 of your friends" yang berarti 4.

## Kredit

Foto oleh Chris Montgomery dan Damaris Azócar melalui
[Unsplash](https://unsplash.com).
