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

  // Angka "sudah dibantu N siswa" di hero beranda.
  //
  // Ini angka DASAR, bukan angka jadi: yang tampil di beranda adalah
  // nilai ini DITAMBAH jumlah siswa yang terbaca dari roster. Dipisah
  // begitu karena alumni dari sebelum situs ini ada tidak semuanya
  // tercatat di spreadsheet, dan angka promosi tidak boleh mendadak
  // turun cuma karena mereka tidak terhitung.
  //
  // Kalau ternyata roster sudah memuat semua alumni, isi 0. Halaman
  // /analitik menampilkan penjumlahannya terang-terangan supaya dobel
  // hitung seperti itu langsung kelihatan.
  heroSiswaDasar: 130,
  // Jumlah siswa hasil hitungan dari roster, DISIMPAN di sini oleh
  // api/admin-statistik.js tiap kali halaman /analitik dibuka dan
  // angkanya berubah. Bukan diisi tangan.
  //
  // Kenapa disimpan, bukan dihitung ulang waktu beranda dirender:
  // beranda dirender ulang untuk SETIAP pengunjung, dan menambahkan
  // pengambilan CSV ke Google di jalur itu berarti setiap pengunjung
  // ikut menunggu, plus beranda jadi ikut mati kalau Google sedang
  // bermasalah. Angka promosi tidak sepadan dengan risiko itu.
  heroSiswaOtomatis: 0,

  pkg1Name: 'INDIVIDUAL',
  pkg1Price: 59000,
  pkg1Available: true,
  pkg2Name: 'PAIR',
  pkg2Price: 53000,
  pkg2Available: true,
  pkg3Name: 'GROUP',
  pkg3Price: 47000,
  pkg3Available: true,

  // Dipakai HANYA di sertifikat kelulusan, tidak pernah tampil di
  // halaman publik mana pun. Situs ini sengaja tidak menyebut nama
  // mentor di mana-mana, jadi mengisinya berarti namanya ikut tersebar
  // lewat sertifikat yang diposting siswa. Kosong = sertifikat cuma
  // memakai logo.
  sertifikatMentorNama: '',
  // URL gambar tanda tangan di Vercel Blob, diunggah dari /admin.
  sertifikatTandaTanganUrl: '',

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

  // ============================================================
  // FORM PENDAFTARAN (/daftar), bisa disusun ulang dari /admin.
  //
  // Isi formFields adalah ARRAY definisi pertanyaan. Bentuk dan seluruh
  // aturan penjagaannya ada di api/_lib/form-schema.js -- baca komentar
  // di file itu sebelum mengubah apa pun di sini, terutama soal kenapa
  // `urutan` dan `kolom` sengaja dipisah.
  //
  // Nilai bawaannya SENGAJA array kosong, bukan salinan FIELD_BAWAAN.
  // Alasannya: normalisasiFields() mengembalikan susunan bawaan lengkap
  // untuk masukan kosong, jadi menyimpan salinannya di sini cuma bikin
  // dua sumber kebenaran yang bisa berbeda kalau salah satu diubah.
  formFields: [],

  // Judul dan pengantar di halaman /daftar.
  daftarTitle: 'Daftar Bootcamp EPT UI.',
  daftarDesc:
    'Isi data di bawah, lalu unggah bukti pembayaran. Kami cek dulu, dan setelah ' +
    'dikonfirmasi kamu akan dapat akses ke ruang kelas memakai akun Google yang ' +
    'emailnya kamu isi di sini.',

  // Nama folder di Google Drive tempat semua file unggahan pendaftar
  // disimpan. Dibuat otomatis oleh Apps Script kalau belum ada. Diubah
  // dari /admin; mengubahnya TIDAK memindahkan file lama, cuma menentukan
  // ke mana unggahan berikutnya masuk.
  driveFolder: 'Pendaftaran EQUAL (dari situs)',

  // ============================================================
  // BUKA/TUTUP FORMULIR. Aturannya di api/_lib/form-status.js.
  //
  // formMode: 'buka' (selalu terima), 'tutup' (selalu tolak), atau
  // 'jadwal' (terima di antara dua tanggal di bawah).
  //
  // Tanggalnya berbentuk "2026-09-01T23:59" dan SELALU dibaca sebagai
  // WIB, bukan UTC -- lihat catatan zona waktu di form-status.js.
  formMode: 'buka',
  formBukaPada: '',
  formTutupPada: '',
  formPesanTutup: '',

  // ============================================================
  // BOM WAKTU AKSES RUANG KELAS untuk pendaftar dari form situs.
  //
  // Format "YYYY-MM-DD". Waktu admin menekan Setujui di /pendaftar,
  // tanggal ini DISALIN ke kolom W barisnya di spreadsheet, lalu
  // api/verify-access.js menolak baris yang tanggalnya sudah lewat.
  //
  // Sengaja disalin per baris, bukan dibaca langsung sebagai satu setelan
  // global, karena: (1) baris lama dari Google Form dan sheet manual tidak
  // punya isi di kolom itu sehingga tidak pernah kedaluwarsa, persis
  // seperti yang diminta; (2) tanggalnya kelihatan dan bisa diubah manual
  // per orang langsung di sheet.
  //
  // Kosong = pendaftar baru tidak diberi batas waktu sama sekali.
  aksesBerakhirPada: '',

  // ============================================================
  // EMAIL OTOMATIS KE PENDAFTAR
  //
  // Dikirim dari akun Google pemilik spreadsheet lewat Apps Script, jadi
  // tidak butuh layanan email berbayar. Kuota akun Gmail biasa 100
  // penerima per hari, jauh di atas kebutuhan satu batch.
  //
  // Kegagalan kirim TIDAK PERNAH menggagalkan pendaftaran atau
  // persetujuan. Orang yang sudah bayar tidak boleh gagal terdaftar cuma
  // karena kuota email habis: emailnya bisa disusulkan manual, datanya
  // tidak bisa dikembalikan.
  //
  // Penanda di dalam teks, diganti nilai sebenarnya waktu dikirim:
  //   {nama}  nama pendaftar
  //   {link}  alamat ruang kelas
  emailTerimaAktif: true,
  emailTerimaSubjek: 'Pendaftaran kamu sudah kami terima',
  emailTerimaIsi:
    'Halo {nama},\n\n' +
    'Terima kasih sudah mendaftar Bootcamp EPT UI. Pendaftaran kamu sudah masuk ' +
    'dan sedang kami cek bukti pembayarannya.\n\n' +
    'Kalau sudah dikonfirmasi, kamu akan dapat email lagi berisi cara masuk ke ' +
    'ruang kelas. Biasanya tidak sampai sehari.\n\n' +
    'Ada yang mau ditanyakan? Balas email ini, atau hubungi kami di WhatsApp ' +
    '0858-8834-5058.\n\n' +
    'EQUAL English',

  emailSetujuAktif: true,
  emailSetujuSubjek: 'Akses ruang kelas kamu sudah dibuka',
  emailSetujuIsi:
    'Halo {nama},\n\n' +
    'Pembayaran kamu sudah kami konfirmasi. Ruang kelas sudah bisa dibuka ' +
    'sekarang:\n\n' +
    '{link}\n\n' +
    'Masuk pakai akun Google dengan email yang sama seperti yang kamu isi waktu ' +
    'mendaftar. Kalau pakai email lain, sistem tidak akan mengenali kamu.\n\n' +
    'Di dalamnya ada link Zoom, folder materi, grup WhatsApp, dan latihan soal.\n\n' +
    'Sampai ketemu di kelas.\n\n' +
    'EQUAL English',

  // Alamat yang disisipkan lewat penanda {link} di email persetujuan.
  linkRuangKelas: 'https://equalenglish.vercel.app/kelas',
};
