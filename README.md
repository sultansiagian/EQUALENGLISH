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
| `index.html` | Seluruh halaman, satu file |
| `styles.css` | Seluruh gaya, termasuk lapisan animasi dan breakpoint |
| `script.js` | Navigasi, reveal saat scroll, penghitung angka |
| `shader-background.js` | Latar gradien WebGL di hero |
| `EDITS/` | Logo dan foto yang dipakai halaman |

## Catatan teknis

- **Tanpa dependency.** Tidak ada npm, bundler, atau framework. Font dimuat
  dari Google Fonts, sisanya berjalan sendiri.
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
