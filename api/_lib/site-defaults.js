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
  // Daftar email siswa yang SUDAH mengisi form testimoni. Dipakai
  // api/verify-access.js untuk menentukan Final Test-nya boleh dibuka
  // atau belum, dan ditulis api/kelas-testimoni.js.
  //
  // Yang disimpan di sini CUMA emailnya, bukan isi testimoninya. Isinya
  // masuk ke tab Testimoni di spreadsheet, yang tidak punya batas
  // ukuran. Penyimpanan ini dibatasi 1 MB untuk SELURUH konten situs,
  // jadi tidak boleh dipakai menampung kiriman yang jumlahnya bebas.
  testimoniSudahIsi: [],

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

  // ============================================================
  // RIWAYAT HARGA
  // ============================================================
  // Tiap item: { berlakuSejak, pkg1Price, pkg2Price, pkg3Price }.
  // berlakuSejak null berarti berlaku sejak awal.
  //
  // Ditulis OTOMATIS oleh api/admin-content.js tiap kali harga paket
  // diubah, bukan diisi tangan. Gunanya supaya pendapatan batch lama
  // tetap dihitung dengan harga yang benar-benar berlaku waktu itu.
  //
  // Tanpa ini, menaikkan harga untuk batch berikutnya akan diam-diam
  // menaikkan juga pendapatan batch-batch sebelumnya, dan catatan yang
  // tadinya benar jadi salah tanpa ada yang menyentuhnya.
  hargaRiwayat: [],

  // ============================================================
  // CATATAN BATCH, dipakai halaman /analitik
  // ============================================================
  // Tiap item: { nama, mulai, selesai }.
  //   mulai/selesai : waktu ISO, atau null
  //   mulai null    : batch ini menghitung sejak awal, dipakai batch
  //                   pertama supaya pendaftar lama tidak jadi yatim
  //   selesai null  : batch ini MASIH BERJALAN
  //
  // Cuma boleh ada satu batch yang selesai-nya null, dan itu selalu
  // yang terakhir. Menutup batch berarti mengisi selesai-nya dengan
  // waktu sekarang lalu menambahkan satu batch baru sesudahnya.
  //
  // Angkanya TIDAK disimpan di sini, cuma batas waktunya. Jumlah dan
  // pendapatan dihitung ulang dari roster tiap kali halaman dibuka,
  // jadi kalau ada baris yang dibetulkan belakangan, angka batch lama
  // ikut betul. Menyimpan angkanya akan membekukan kesalahan.
  batchDaftar: [],

  // ============================================================
  // ISI RUANG KELAS (/kelas), diatur dari /atur-kelas
  // ============================================================
  // Sebelumnya semua ini cuma bisa diubah lewat spreadsheet
  // (MATERIALS_CSV_URL dan SCHEDULE_CSV_URL). Sekarang bisa diisi dari
  // panel admin, dan yang diisi di sini MENANG atas isi spreadsheet.
  //
  // Spreadsheet tetap dibaca untuk yang dibiarkan kosong, supaya
  // pemasangan lama tidak mendadak berhenti jalan. Begitu semuanya
  // diisi di sini, dua pengambilan ke Google itu dilewati sama sekali
  // dan login justru jadi lebih cepat.
  kelasZoomUrl: '',
  kelasDriveUrl: '',
  kelasCommunityUrl: '',
  kelasPracticeReadingUrl: '',
  kelasPracticeListeningUrl: '',
  kelasPracticeWritingUrl: '',
  kelasPengumuman: '',

  // ---- FINAL TEST ----
  //
  // Kartu terakhir di ruang kelas. Terkunci sampai DUA syarat terpenuhi:
  //   1. waktunya sudah lewat (kelasFinalTestBukaPada)
  //   2. siswanya sudah mengisi testimoni
  //
  // Link-nya TIDAK pernah dikirim ke browser sebelum keduanya terpenuhi,
  // sama seperti link Zoom. Menyembunyikan tombol saja tidak menjaga apa
  // pun: isi balasan server bisa dibaca siapa saja yang mau melihatnya.
  kelasFinalTestUrl: '',
  // Waktu WIB, bentuk "2026-09-09T19:00". Kosong berarti belum dijadwalkan
  // dan kartunya sengaja TIDAK PERNAH terbuka. Lebih baik begitu daripada
  // terbuka lebih awal tanpa disengaja.
  kelasFinalTestBukaPada: '',

  // Tanggal kuis latihan mulai bisa dibuka, format "2026-09-01".
  // Kosong berarti kuisnya tidak dikunci sama sekali.
  kelasKuisReadingBuka: '',
  kelasKuisListeningBuka: '',
  kelasKuisWritingBuka: '',

  // Jadwal sesi kelas. Bentuk tiap item: { tanggal, jam, topik }.
  // tanggal "2026-09-01", jam "20:00" (WIB), topik boleh kosong.
  //
  // Selama daftar ini KOSONG, jadwal dibaca dari SCHEDULE_CSV_URL
  // seperti sebelumnya. Begitu ada isinya, daftar ini yang dipakai dan
  // sheet jadwal tidak diambil lagi.
  kelasJadwal: [],
  // Jam bawaan waktu menambah sesi baru di /atur-kelas. Tidak dipakai
  // menghitung apa pun; tiap sesi menyimpan jamnya sendiri.
  kelasJamBawaan: '20:00',

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
  // FAQ
  // ============================================================
  // KOSONG SECARA SENGAJA, dan section-nya TIDAK tampil di beranda
  // selama masih kosong. Pola yang sama dipakai testimoni di atas, dan
  // alasannya sama: pertanyaan seperti "uangnya bisa balik atau tidak"
  // cuma boleh dijawab oleh pemiliknya sendiri. Jawaban yang dikarang
  // di sini akan dibaca sebagai janji, dan janji yang salah lebih mahal
  // daripada halaman yang belum ada.
  //
  // Diisi lewat /admin. Begitu ada satu pasang tanya-jawab yang lengkap,
  // section-nya muncul sendiri berikut structured data FAQPage-nya.
  faq: [],
  faqTitle: 'Pertanyaan yang sering masuk',
  faqDesc: 'Kalau yang kamu cari tidak ada di sini, tanya langsung lewat WhatsApp.',

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

  // Logo KHUSUS EMAIL, sengaja terpisah dari logoUrl di atas.
  //
  // logoUrl dipakai di header situs yang berlatar gelap, jadi isinya
  // versi terang. Email duduk di atas kartu putih, dan logo terang di
  // atas putih praktis hilang. Menyatukan keduanya berarti salah satu
  // tempat pasti salah.
  //
  // Harus berupa berkas yang IKUT TER-DEPLOY (terlacak git). Berkas asli
  // bernama spasi seperti "Logo EQUAL BLACK.png" tidak terlacak dan akan
  // 404 di email orang.
  emailLogoUrl: '/EDITS/logo-equal-black.png',

  // Nomor untuk tombol WhatsApp di email tanda terima. Email itu tidak
  // punya tautan lain: pendaftarnya belum bisa masuk ruang kelas, jadi
  // satu-satunya tindakan yang masuk akal di tahap itu adalah bertanya.
  //
  // Boleh ditulis dengan format apa pun ("0858-8834-5058", "+62 858 ..."),
  // linkWhatsApp() di _lib/email-html.js yang merapikannya. Dikosongkan
  // berarti email tanda terima tampil tanpa tombol sama sekali.
  waNomor: '0858-8834-5058',
};
