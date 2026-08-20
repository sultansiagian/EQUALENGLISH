# EQUAL English

Situs web EQUAL English, kelas bahasa Inggris yang berfokus pada listening,
reading, dan writing, serta program intensif Bootcamp EPT UI.

## Menjalankan secara lokal

Tidak ada proses build. Untuk melihat halaman apa adanya (tanpa konten dari
/admin), jalankan server statis apa pun dari folder ini:

```bash
python -m http.server 4173
```

Lalu buka `http://127.0.0.1:4173/home-template.html`.

Perlu dicatat: server statis biasa TIDAK menjalankan `api/render-home.js`,
jadi yang tampil adalah nilai hardcode, bukan yang diedit lewat `/admin`.
Untuk menguji hasil penyisipannya, panggil `renderHtml()` dari
`api/render-home.js` lewat skrip Node kecil, atau cek langsung di deployment.

## Struktur

| Berkas | Isi |
| --- | --- |
| `home-template.html` | Seluruh halaman publik, satu file. **Sengaja TIDAK bernama `index.html`**: Vercel mengecek file statis sebelum aturan `rewrites`, jadi selama ada `index.html` di root, `/` dilayani file itu dan `api/render-home.js` tidak pernah dipanggil (pernah kejadian, lihat catatan di file itu). |
| `styles.css` | Seluruh gaya, termasuk lapisan animasi dan breakpoint |
| `script.js` | Navigasi, reveal saat scroll, penghitung angka |
| `shader-background.js` | Latar gradien WebGL di hero |
| `EDITS/` | Logo dan foto yang dipakai halaman |
| `admin.html` / `admin.js` / `admin.css` | Panel admin (`/admin`), login Google, ganti teks/harga/foto tanpa commit/push |
| `api/render-home.js` | Menyisipkan konten yang diedit dari `/admin` ke `home-template.html` sebelum dikirim ke pengunjung. Melayani `/`. |
| `api/admin-content.js`, `api/admin-upload.js` | Endpoint server panel admin (baca/simpan teks & harga, upload foto) |
| `api/verify-access.js` | Gerbang login siswa ke `kelas.html`, terpisah total dari panel admin |
| `api/_lib/kirim-email.js` | Email otomatis ke pendaftar, lewat Apps Script. Semua kegagalannya sengaja ditelan supaya tidak ikut membatalkan pendaftaran. |
| `api/admin-email-uji.js` | Tombol "kirim email uji" di `/atur-form`. Ada justru karena email di atas gagal diam-diam: ini satu-satunya cara tahu pengirimannya masih hidup. |
| `api/_lib/kerja-latar.js` | Menitipkan pekerjaan yang selesai setelah balasan dikirim (mis. email) ke `waitUntil`, supaya tidak ikut hilang waktu fungsi Vercel dibekukan. |
| `analitik.html` / `analitik.js` | Halaman `/analitik`: jumlah pendaftar, komposisi paket, dan pendapatan per batch. Chart digambar sendiri dengan SVG, tanpa library. |
| `api/admin-statistik.js`, `api/_lib/statistik.js` | Perhitungan angkanya. Membaca sheet yang sama dengan gerbang login siswa, jadi tidak mungkin ada dua angka berbeda untuk hal yang sama. |
| `api/_lib/csv.js` | Parser CSV bersama, plus penebak format tanggal kolom Timestamp (sheet bisa berisi `bulan/tanggal` dan `tanggal/bulan` sekaligus). |
| `api/kelas-testimoni.js`, `api/admin-testimoni.js` | Siswa mengirim testimoni dari `/kelas` untuk membuka sertifikat; admin memilih mana yang tayang di beranda. Isi testimoni disimpan di spreadsheet, bukan di Global Config yang dibatasi 1 MB. |

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
pesan error yang jelas (bukan diam-diam gagal), dan halaman publik tetap
tampil normal pakai nilai hardcode di `home-template.html` -- lihat
`readOverrides()` di `api/_lib/global-config-store.js`.

**Kalau editan dari `/admin` tersimpan tapi tidak muncul di beranda**, cek
dulu apakah `rewrites` di `vercel.json` benar-benar jalan: bandingkan hasil
membuka `/` dengan `/api/render-home` di situs yang sudah live. Kalau isinya
beda, berarti ada file statis yang namanya bertabrakan dengan `/` dan Vercel
melayani file itu duluan (Vercel mengecek file statis SEBELUM `rewrites`).

## Catatan teknis

- **Zero build step, dua dependency runtime.** Tidak ada bundler atau
  framework, dan tidak perlu apa pun diinstall untuk mengedit/melihat
  `home-template.html`, `kelas.html`, atau `admin.html` secara lokal. `package.json`
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

- [x] Testimoni sudah diisi lewat `/admin`. Section-nya tidak tampil di
      beranda selama daftarnya kosong, jadi halaman tetap aman kalau nanti
      dikosongkan lagi.
- [ ] **Pastikan status buka/tutup pendaftaran sebelum menyebar link.**
      Tombol utama sekarang mengarah ke `/daftar` (form bawaan situs, bukan
      Google Form lagi). Status buka/tutupnya diatur di `/atur-form`, dan
      kalau berstatus tutup, pengunjung melihat pesan penutup.
- [x] Jumlah orang paket Group sudah dipastikan: **3 orang**, seperti yang
      tertulis di website. Kalimat "with 3 of your friends" di guidebook yang
      keliru, bukan situsnya.

## Kredit

Foto oleh Chris Montgomery dan Damaris Azócar melalui
[Unsplash](https://unsplash.com).
