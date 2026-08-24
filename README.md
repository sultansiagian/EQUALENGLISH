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
| `api/admin-data.js` | SATU rute untuk beberapa endpoint admin (statistik, moderasi testimoni, kirim email uji). Digabung karena Vercel Hobby membatasi 12 Serverless Function per deployment, dan melampauinya membuat SELURUH build gagal tanpa gejala di situs. Handler-nya ada di `api/_lib/handler-*.js`. |
| `api/_lib/kerja-latar.js` | Menitipkan pekerjaan yang selesai setelah balasan dikirim (mis. email) ke `waitUntil`, supaya tidak ikut hilang waktu fungsi Vercel dibekukan. |
| `status.html` / `status.js` | Halaman `/status`, tempat pendaftar mengecek sendiri apakah datanya sudah masuk dan sudah disetujui. Login Google, TIDAK menerima email yang diketik. Endpointnya menumpang `/api/verify-access` dengan `mode:'status'` supaya tidak menghabiskan slot Serverless Function terakhir (lihat catatan batas 12 di bawah). |
| `api/_lib/status-pendaftar.js` | Pencarian satu orang di antrean "Pendaftar Web". Bentuk balasannya sengaja dikunci ke status plus nama paket saja, tidak pernah nama/HP/email siapa pun, karena mencari satu baris menuntut seluruh antrean ditarik dulu. |
| `api/_lib/rem-laju.js` | Rem laju untuk `/api/daftar`, satu-satunya endpoint publik. Tiga lapisan: per IP (longgar, karena wifi kampus membuat banyak orang terlihat sebagai satu IP), per alamat email tujuan, dan jatah total tanda terima per jam. Yang dilindungi terutama kuota Gmail, bukan baris sheet -- lihat penjelasan di dalam filenya. |
| `analitik.html` / `analitik.js` | Halaman `/analitik`: jumlah pendaftar, komposisi paket, dan pendapatan per batch. Chart digambar sendiri dengan SVG, tanpa library. |
| `api/_lib/statistik.js` | Perhitungan angka analitik. Membaca sheet yang sama dengan gerbang login siswa, jadi tidak mungkin ada dua angka berbeda untuk hal yang sama. |
| `api/_lib/csv.js` | Parser CSV bersama, plus penebak format tanggal kolom Timestamp (sheet bisa berisi `bulan/tanggal` dan `tanggal/bulan` sekaligus). |
| `api/kelas-testimoni.js` | Siswa mengirim testimoni dari `/kelas` untuk membuka sertifikat. Cuma tayang di beranda kalau siswanya mencentang izin DAN admin menayangkannya. Isinya disimpan di spreadsheet, bukan di Global Config yang dibatasi 1 MB. |

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
- **Isian `/daftar` tersimpan otomatis.** Jawaban teks disimpan ke
  `localStorage` sambil diketik, lalu ditawarkan kembali kalau halamannya
  dibuka lagi dalam 24 jam. **Foto sengaja tidak ikut** (satu bukti transfer
  masih ratusan KB, sementara jatah `localStorage` cuma sekitar 5 MB untuk
  seluruh domain, dan kalau penuh justru jawaban teksnya yang ikut gagal
  tersimpan). Drafnya dihapus hanya setelah server mengonfirmasi barisnya
  masuk, tidak lebih awal. Lihat catatan `hapusDraf()` di `daftar.js` soal
  kenapa simpanan tertunda harus ikut dibatalkan di situ.

## Batas 12 Serverless Function

Vercel Hobby membatasi **12 Serverless Function per deployment**, dan
melampauinya membuat SELURUH build gagal tanpa gejala apa pun di situs.
Sekarang ada **11** berkas di `api/` (berkas di `api/_lib/` tidak dihitung
karena namanya berawalan garis bawah).

Karena itu `/status` tidak berdiri sebagai `api/status.js` sendiri,
melainkan menumpang `api/verify-access.js` lewat `mode:'status'` di badan
permintaan. Selain menghemat slot, di sanalah verifikasi token Google dan
pembacaan roster sudah ada, jadi tidak perlu disalin ulang.

**Kalau nanti butuh endpoint baru**, gabungkan dulu yang sudah ada
daripada menambah berkas. Kandidat paling wajar: `atur-form.js` dan
`daftar-schema.js` masuk ke `admin-data.js`.

## Security header

Diatur di blok `headers` pada `vercel.json`, bukan di kode. Lima di antaranya
sudah berlaku penuh (`X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`), plus
`X-Robots-Tag: noindex` khusus halaman pengelola supaya `/admin`, `/analitik`,
dan `/pendaftar` tidak ikut terindeks (`robots.txt` mengizinkan semuanya).

**CSP-nya masih `Content-Security-Policy-Report-Only`, dan itu disengaja.**
Mode ini melaporkan pelanggaran tanpa memblokir apa pun, jadi tidak ada risiko
halaman rusak diam-diam. Cara menaikkannya jadi penjagaan sungguhan:

1. Buka situs yang sudah live, lalu telusuri **semua** halaman sambil membuka
   Console di DevTools: beranda, `/daftar` (sampai unggah foto), `/kelas`
   (sampai login Google), dan `/admin`.
2. Catat setiap baris `Report Only` yang muncul di Console. Yang paling mungkin
   muncul: `docs.google.com` (dipakai `content-sheet.js` langsung dari browser)
   dan domain Vercel Blob untuk foto yang diunggah lewat `/admin`.
3. Tambahkan sumber yang memang sah ke direktif yang sesuai.
4. Setelah beberapa hari tanpa laporan baru, ganti nama header-nya jadi
   `Content-Security-Policy` (buang `-Report-Only`).

Jangan dibalik urutannya. Menyalakan CSP penuh sebelum langkah 1 sampai 3
selesai bisa mematikan login Google atau unggahan foto tanpa pesan error yang
jelas bagi pemakainya.

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
