/**
 * Nilai default persis sama dengan yang hardcode di index.html hari ini.
 * SATU-SATUNYA tempat nilai ini didaftarkan untuk sisi server -- dipakai
 * oleh:
 *   - api/render-home.js: kunci yang TIDAK ada di Global Config (belum
 *     pernah disimpan admin) jatuh balik ke sini.
 *   - api/admin-content.js: nilai yang dikirim ke form /admin (GET) supaya
 *     form selalu menampilkan nilai yang BENERAN aktif di halaman publik,
 *     bukan kosong.
 *   - api/admin-content.js (POST): daftar kunci di sini JUGA jadi allowlist
 *     -- field yang tidak terdaftar di sini ditolak, tidak bisa dipakai
 *     menulis kunci sembarangan ke Global Config.
 *
 * PENTING kalau index.html diedit manual nanti (bukan lewat /admin): kalau
 * teks/harga/skor default di index.html diubah langsung di file, nilai di
 * sini HARUS ikut diubah supaya tetap sinkron -- kalau tidak, admin yang
 * belum pernah menyimpan apa pun lewat /admin akan melihat nilai LAMA di
 * form (walau halaman publik sudah menampilkan nilai baru yang diedit
 * manual itu). ID di index.html yang jadi target replace-nya ada di
 * TEXT_ID_MAP di api/render-home.js -- jangan hapus/ganti nama id itu
 * tanpa update di sana juga.
 */
module.exports = {
  bootcampTitle: 'Bootcamp EPT UI.',
  bootcampDesc:
    'Untuk kamu yang sedang mengejar nilai di semester pertama. Materinya setara ' +
    'TOEFL: listening, reading, dan writing. Semuanya dijalani secara intensif ' +
    'dalam 10 hari, dan terbuka untuk mahasiswa dari fakultas mana pun di ' +
    'Universitas Indonesia.',
  bootcampPoint1: 'Listening, reading & writing, setara materi TOEFL',
  bootcampPoint2: 'Dipandu mentor IELTS 8 dan EPT UI 673',
  bootcampPoint3: 'Akses rekaman sesi Zoom tanpa batas',
  bootcampPoint4: 'Latihannya lewat fun quiz, sehingga tidak terasa seperti mengerjakan drill soal',

  pkg1Name: 'INDIVIDUAL',
  pkg1Price: 59000,
  pkg1Available: true,
  pkg2Name: 'PAIR',
  pkg2Price: 53000,
  pkg2Available: true,
  pkg3Name: 'GROUP',
  pkg3Price: 47000,
  pkg3Available: true,

  mentorTitle: 'Satu mentor untuk saat ini.',
  mentorDesc:
    'Seluruh kelas dipandu langsung oleh mentor yang sama, sehingga arahan yang ' +
    'kamu terima konsisten dari awal sampai akhir.',
  mentorNote:
    'Kedua skor ini hasil tes asli, bukan perkiraan. EPT UI setara TOEFL, sehingga ' +
    'latihannya tetap relevan untuk tes apa pun yang kamu tuju.',
  mentorIeltsScore: 8,
  mentorIeltsMax: '9',
  mentorEptScore: 673,
  mentorEptMax: '674',

  // URL default = path aset statis yang sudah ada di /EDITS. Kalau admin
  // upload foto baru, nilai ini jadi URL Vercel Blob (https://...
  // .public.blob.vercel-storage.com/...) -- lihat applyImages() di
  // api/render-home.js untuk cara menimpanya di HTML.
  logoUrl: '/EDITS/Vector.png',
  photoKomunitasUrl: '/EDITS/foto-komunitas.jpg',
  photoKelasZoomUrl: '/EDITS/foto-kelas-zoom.jpg',
  ogBannerUrl: 'https://equalenglish.vercel.app/EDITS/og-banner.jpg',

  // ============================================================
  // TESTIMONI. Beda bentuk dari semua field di atas: ini ARRAY dengan
  // panjang bebas, bukan satu nilai tetap, jadi ditangani terpisah di
  // render-home.js (renderTestimonials(), pakai penanda komentar HTML)
  // dan di admin.js (daftar kartu yang bisa ditambah/hapus).
  //
  // SENGAJA DIKIRIM KOSONG dan tidak diisi contoh apa pun. Section
  // testimoni di index.html sebelumnya memang dinonaktifkan dengan
  // alasan yang masih berlaku: satu testimoni karangan yang ketahuan
  // menjatuhkan kredibilitas skor mentor dan data riset di halaman ini,
  // yang semuanya asli dan bisa dicek. Array kosong -> seluruh section
  // tidak dirender sama sekali di beranda (bukan dirender kosong),
  // jadi halaman tetap aman sampai ada kutipan asli yang diisi lewat
  // /admin.
  //
  // Bentuk tiap item (semua string, semua opsional kecuali pesan &
  // nama -- item tanpa keduanya dilewati waktu render):
  //   { nama, fakultas, skorEpt, pesan, fotoUrl }
  testiTitle: 'Kata mereka yang sudah ikut.',
  testiDesc:
    'Pengalaman langsung dari peserta yang sudah menjalani kelasnya sampai selesai.',
  testimonials: [],
};
