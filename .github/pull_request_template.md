## Apa yang berubah

<!-- Satu paragraf. Kenapa, bukan cuma apa. -->

## Sebelum merge

- [ ] `npm test` lolos
- [ ] Kalau menyentuh `api/`: dicoba di URL preview, bukan cuma lokal
- [ ] Kalau menyentuh gerbang login (`verify-access.js`, `admin-guard.js`,
      `google-verify.js`): satu login siswa asli dicoba di preview
- [ ] Kalau menyentuh `/daftar`: satu pendaftaran asli dikirim sampai tuntas
- [ ] `ls api/*.js | wc -l` masih di bawah 12
- [ ] Tidak ada nilai secret di diff (`git diff main...HEAD | grep -i secret`)

## Yang belum diuji

<!-- Tulis terus terang. Yang tidak ditulis di sini dianggap sudah diuji. -->
