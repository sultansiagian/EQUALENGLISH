/**
 * ============================================================
 * JEMBATAN ANTARA SITUS DAN SPREADSHEET PENDAFTARAN
 * ============================================================
 *
 * File ini BUKAN bagian dari situs. Isinya ditempel ke Google Sheet
 * pendaftaran ("FORM PENDAFTARAN PERSIAPAN EPT UI by EQUAL ENGLISH
 * (Responses)") lewat Extensions > Apps Script. Disimpan di repo supaya
 * tidak hilang dan bisa dilacak perubahannya.
 *
 * ------------------------------------------------------------
 * CARA PASANG (sekali saja)
 * ------------------------------------------------------------
 *   1. Buka spreadsheet-nya, menu Extensions > Apps Script
 *   2. Hapus isi yang ada, tempel SELURUH isi file ini
 *   3. Ganti nilai SECRET di bawah dengan kata sandi acak buatan sendiri
 *   4. Deploy > New deployment > tipe "Web app"
 *        Execute as: Me
 *        Who has access: Anyone
 *      ("Anyone" wajib supaya server situs bisa memanggilnya. Yang
 *      menjaga keamanannya adalah SECRET, bukan pengaturan ini.)
 *   5. Copy "Web app URL". HARUS yang berakhiran "/exec".
 *      Editor Apps Script juga menampilkan URL berakhiran "/dev" dan
 *      letaknya lebih menonjol. URL itu SALAH untuk keperluan ini: dia
 *      cuma bisa dibuka pemilik skrip yang sedang login di peramban, dan
 *      kalau dipanggil server situs, Google membalas halaman masuk akun
 *      berstatus 200 -- bukan error, jadi gejalanya membingungkan.
 *   6. Di Vercel > Settings > Environment Variables, isi:
 *        APPS_SCRIPT_URL     = URL dari langkah 5
 *        APPS_SCRIPT_SECRET  = SECRET dari langkah 3
 *   7. Redeploy project-nya
 *   8. Tab "Testimoni" dibuat otomatis waktu ada siswa mengirim
 *      testimoni pertama kali, tidak perlu disiapkan manual.
 *   9. Buka /atur-form di situs, tekan "Uji tanda terima" di bagian Email
 *      ke Pendaftar. Kalau emailnya sampai, pemasangannya sudah benar.
 *
 * KALAU FILE INI DIUBAH: setelah menempel versi barunya, harus
 * Deploy > Manage deployments > edit > Version: New version. Kalau cuma
 * disimpan tanpa deploy ulang, yang jalan tetap versi lama. Ini kekeliruan
 * yang paling sering terjadi dan paling sulit disadari, karena situsnya
 * tetap jalan normal -- yang berhenti cuma fungsi yang baru ditambahkan.
 * Tombol "Uji tanda terima" di /atur-form dibuat untuk menangkap ini.
 *
 * ------------------------------------------------------------
 * KENAPA SKRIP INI SENGAJA "BODOH"
 * ------------------------------------------------------------
 * Skrip ini TIDAK tahu apa-apa soal isi formulir: tidak tahu ada
 * pertanyaan apa saja, kolom mana untuk apa, atau mana yang wajib.
 * Semua itu dihitung di situs (api/_lib/form-schema.js), dan skrip ini
 * cuma menerima satu baris jadi lalu menempelkannya.
 *
 * Alasannya: pemilik situs bisa menambah, menghapus, dan memindah
 * pertanyaan kapan saja dari /admin. Kalau skrip ini ikut tahu susunan
 * pertanyaan, tiap perubahan kecil menuntut file ini ditempel ulang dan
 * di-deploy ulang manual. Dengan begini, file ini idealnya tidak pernah
 * perlu disentuh lagi.
 *
 * ------------------------------------------------------------
 * ALUR PENDAFTARAN
 * ------------------------------------------------------------
 * Pendaftar isi form di situs
 *   -> berkas disimpan ke Drive (privat, cuma pemilik akun ini yang bisa
 *      buka -- isinya bukti transfer, ada nama dan nominal)
 *   -> baris masuk ke tab "Pendaftar Web", BELUM dapat akses kelas
 *      karena tab ini tidak terdaftar di ROSTER_CSV_URLS
 *   -> admin cek bukti bayar di /pendaftar, klik Setujui
 *   -> baris DIPINDAH ke tab "Form_Responses"
 *   -> api/verify-access.js membacanya seperti biasa, akses terbuka
 */

// GANTI INI dengan kata sandi acak buatan sendiri sebelum deploy.
var SECRET = 'GANTI_DENGAN_KATA_SANDI_ACAK_PANJANG';

var TAB_PENDING = 'Pendaftar Web';
var TAB_ROSTER = 'Form_Responses';
var TAB_TESTIMONI = 'Testimoni';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return jsonOut({ ok: false, reason: 'secret_salah' });
    }

    if (body.action === 'upload') return handleUpload(body.berkas, body.folder);
    if (body.action === 'submit') return handleSubmit(body.baris);
    if (body.action === 'list') return handleList();
    if (body.action === 'approve') return handleApprove(body.id, body.isiTambahan);
    if (body.action === 'reject') return handleReject(body.id);
    if (body.action === 'email') return handleEmail(body.ke, body.subjek, body.isi, body.html);
    if (body.action === 'testimoni') return handleTestimoni(body.isi);
    if (body.action === 'listTestimoni') return handleListTestimoni();
    if (body.action === 'tayangkanTestimoni') return handleTayangkanTestimoni(body.id, body.tayang);
    if (body.action === 'riwayat') return handleRiwayat(body.perubahan, body.oleh);
    if (body.action === 'ping') return jsonOut({ ok: true, pesan: 'terhubung' });

    return jsonOut({ ok: false, reason: 'action_tidak_dikenal' });
  } catch (err) {
    return jsonOut({ ok: false, reason: 'error', pesan: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function sheetPending() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_PENDING);
  if (!sh) {
    // Dibuat otomatis pada pemakaian pertama supaya tidak ada langkah
    // manual tambahan waktu pasang. Kolom A dipakai untuk id internal,
    // sisanya persis mengikuti susunan Form_Responses.
    sh = ss.insertSheet(TAB_PENDING);
    sh.appendRow(['ID (jangan diubah)']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Simpan berkas ke Drive, kembalikan link per field.
 *
 * Berkas yang gagal disimpan dilewati DIAM-DIAM (link kosong), bukan
 * menggagalkan seluruh pendaftaran. Kehilangan satu lampiran jauh lebih
 * ringan daripada kehilangan seluruh data pendaftar yang sudah repot
 * mengisi form; kolom yang kosong gampang terlihat admin dan bisa
 * disusulkan lewat WhatsApp.
 */
function handleUpload(berkas, namaFolder) {
  var link = {};
  if (!berkas || !berkas.length) return jsonOut({ ok: true, link: link });

  var folder = folderTujuan(namaFolder);
  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss');

  for (var i = 0; i < berkas.length; i++) {
    try {
      var b = berkas[i];
      var cocok = /^data:([^;]+);base64,(.+)$/.exec(b.dataUrl || '');
      if (!cocok) continue;

      var tipe = cocok[1];
      var bytes = Utilities.base64Decode(cocok[2]);

      // Ekstensi diambil dari tipe filenya (image/webp -> .webp). Tanpa
      // ini nama filenya polos tanpa ekstensi: Drive masih bisa
      // menampilkannya karena tahu tipenya, tapi begitu diunduh, file itu
      // tidak dikenali sebagai gambar oleh komputer/HP.
      var ekstensi = (tipe.split('/')[1] || 'jpg').split('+')[0];
      var namaFile = stempel + '-' + b.id + '.' + ekstensi;

      var blob = Utilities.newBlob(bytes, tipe, namaFile);
      link[b.id] = folder.createFile(blob).getUrl();
    } catch (err) {
      console.error('Gagal menyimpan berkas: ' + err);
    }
  }

  return jsonOut({ ok: true, link: link });
}

function folderTujuan(nama) {
  var namaFolder = String(nama || '').trim() || 'Pendaftaran EQUAL (dari situs)';
  var folders = DriveApp.getFoldersByName(namaFolder);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(namaFolder);
}

/**
 * Terima satu baris jadi (array, indeks = kolom) dan tempelkan ke tab
 * Pendaftar Web, dengan id internal di kolom A.
 */
function handleSubmit(baris) {
  if (!baris || !baris.length) return jsonOut({ ok: false, reason: 'baris_kosong' });

  var sh = sheetPending();
  var id = 'REG' + new Date().getTime() + Math.floor(Math.random() * 1000);
  sh.appendRow([id].concat(baris));
  return jsonOut({ ok: true, id: id });
}

/**
 * Kirim seluruh isi tab Pendaftar Web apa adanya, plus baris judul dari
 * Form_Responses. Situs yang menerjemahkan kolom mana artinya apa,
 * memakai susunan field yang sedang berlaku.
 */
function handleList() {
  var sh = sheetPending();
  var nilai = sh.getDataRange().getValues();
  var hasil = [];

  for (var i = 1; i < nilai.length; i++) {
    if (!nilai[i][0]) continue; // baris tanpa id dilewati
    hasil.push({
      id: String(nilai[i][0]),
      baris: nilai[i].slice(1).map(function (v) {
        return v === undefined || v === null ? '' : String(v);
      }),
    });
  }

  // Terbaru di atas, supaya yang baru masuk langsung kelihatan di /pendaftar.
  hasil.reverse();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shRoster = ss.getSheetByName(TAB_ROSTER);
  var judul = [];
  if (shRoster && shRoster.getLastColumn() > 0) {
    judul = shRoster.getRange(1, 1, 1, shRoster.getLastColumn()).getValues()[0].map(String);
  }

  return jsonOut({ ok: true, pendaftar: hasil, judulKolom: judul });
}

function cariBarisById(sh, id) {
  var nilai = sh.getDataRange().getValues();
  for (var i = 1; i < nilai.length; i++) {
    if (String(nilai[i][0]) === String(id)) {
      return { nomorBaris: i + 1, nilai: nilai[i] };
    }
  }
  return null;
}

/**
 * Setujui: salin baris ke Form_Responses, lalu hapus dari Pendaftar Web.
 *
 * Urutannya SENGAJA salin dulu baru hapus. Kalau dibalik dan penyalinan
 * gagal, datanya hilang selamanya. Dengan urutan ini, kegagalan paling
 * buruk cuma menyisakan baris ganda yang bisa dihapus manual.
 */
function handleApprove(id, isiTambahan) {
  var shPending = sheetPending();
  var ketemu = cariBarisById(shPending, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shRoster = ss.getSheetByName(TAB_ROSTER);
  if (!shRoster) return jsonOut({ ok: false, reason: 'tab_roster_tidak_ketemu' });

  var baris = ketemu.nilai.slice(1); // buang kolom id

  // Nilai yang baru ditentukan SAAT menyetujui, bukan saat mendaftar --
  // sekarang dipakai untuk tanggal berakhirnya akses ruang kelas. Bentuknya
  // { "22": "2027-03-31" }, indeksnya kolom (0 = A). Sengaja generik supaya
  // kebutuhan serupa nanti tidak menuntut file ini ditempel ulang lagi.
  if (isiTambahan) {
    Object.keys(isiTambahan).forEach(function (k) {
      var idx = Number(k);
      if (!Number.isFinite(idx) || idx < 0) return;
      while (baris.length <= idx) baris.push('');
      baris[idx] = String(isiTambahan[k]);
    });
  }

  shRoster.appendRow(baris);
  SpreadsheetApp.flush(); // pastikan tertulis sebelum menghapus sumbernya
  shPending.deleteRow(ketemu.nomorBaris);

  return jsonOut({ ok: true });
}

/**
 * Kirim satu email dari akun Google pemilik sheet ini.
 *
 * Isi dan subjeknya DIKARANG DI SITUS, bukan di sini. Sama alasannya
 * dengan baris spreadsheet: pemilik situs bisa mengubah kalimatnya kapan
 * saja lewat /atur-form, dan kalau teksnya ikut ditulis di file ini,
 * tiap perubahan kata menuntut file ini ditempel dan di-deploy ulang.
 *
 * Kuota akun Gmail biasa 100 penerima per hari. Kalau habis,
 * MailApp.sendEmail melempar error, dan pemanggil di situs sengaja
 * memperlakukan kegagalan kirim sebagai hal yang TIDAK menggagalkan
 * pendaftaran maupun persetujuan.
 */
function handleEmail(ke, subjek, isi, html) {
  var alamat = String(ke || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alamat)) {
    return jsonOut({ ok: false, reason: 'alamat_tidak_sah' });
  }
  if (!String(subjek || '').trim() || !String(isi || '').trim()) {
    return jsonOut({ ok: false, reason: 'isi_kosong' });
  }

  try {
    var pesan = {
      to: alamat,
      subject: String(subjek),
      body: String(isi),
      name: 'EQUAL English',
    };

    // htmlBody dipasang hanya kalau situs mengirimkannya. Kalau tidak,
    // yang terkirim tetap versi teksnya seperti dulu -- jadi versi lama
    // skrip ini dan versi barunya sama-sama jalan, dan situs tidak pernah
    // berhenti mengirim email cuma karena skrip di spreadsheet belum
    // sempat di-deploy ulang.
    //
    // body TETAP diisi walau ada htmlBody. Itu bukan sisa: Gmail
    // mengirim keduanya sebagai satu email multipart, dan aplikasi yang
    // tidak menggambar HTML menampilkan versi teksnya.
    if (String(html || '').trim()) pesan.htmlBody = String(html);

    MailApp.sendEmail(pesan);
    return jsonOut({ ok: true, sisaKuota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return jsonOut({ ok: false, reason: 'gagal_kirim', pesan: String(err) });
  }
}

/**
 * ============================================================
 * TESTIMONI DARI SISWA
 * ============================================================
 * Kiriman testimoni ditulis ke tab tersendiri, BUKAN langsung ke
 * konten situs. Alasannya dua:
 *
 *   1. Penyimpanan konten situs (Vercel Global Config) dibatasi 1 MB
 *      untuk SELURUH isi situs. Kiriman siswa yang tidak dibatasi bisa
 *      menghabiskannya dan membuat semua penyimpanan berikutnya gagal.
 *   2. Testimoni yang belum dibaca pemilik situs tidak boleh langsung
 *      tayang di beranda.
 *
 * Jadi tab ini menampung semuanya tanpa batas, lalu pemilik situs
 * memilih mana yang layak tayang dari /admin.
 */
function sheetTestimoni() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_TESTIMONI);
  if (!sh) {
    sh = ss.insertSheet(TAB_TESTIMONI);
    sh.appendRow([
      'ID (jangan diubah)', 'Waktu', 'Email', 'Nama', 'Fakultas', 'Skor EPT',
      'Pesan', 'Izin tayang', 'Tayang',
    ]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleTestimoni(isi) {
  if (!isi || !String(isi.pesan || '').trim()) {
    return jsonOut({ ok: false, reason: 'pesan_kosong' });
  }

  var sh = sheetTestimoni();
  var id = 'TES' + new Date().getTime() + Math.floor(Math.random() * 1000);
  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

  sh.appendRow([
    id,
    stempel,
    String(isi.email || ''),
    String(isi.nama || ''),
    String(isi.fakultas || ''),
    String(isi.skorEpt || ''),
    String(isi.pesan || ''),
    // Kolom H: izin dari siswanya sendiri untuk menampilkan ceritanya di
    // halaman publik. Kolom I: sudah benar-benar ditayangkan admin atau
    // belum. Keduanya beda: yang pertama keputusan siswa, yang kedua
    // keputusan admin, dan yang kedua tidak boleh 'ya' kalau yang pertama
    // tidak.
    isi.izinTayang ? 'ya' : '',
    '',
  ]);

  return jsonOut({ ok: true, id: id });
}

function handleListTestimoni() {
  var sh = sheetTestimoni();
  var nilai = sh.getDataRange().getValues();
  var hasil = [];

  for (var i = 1; i < nilai.length; i++) {
    if (!nilai[i][0]) continue;
    hasil.push({
      id: String(nilai[i][0]),
      waktu: String(nilai[i][1]),
      email: String(nilai[i][2]),
      nama: String(nilai[i][3]),
      fakultas: String(nilai[i][4]),
      skorEpt: String(nilai[i][5]),
      pesan: String(nilai[i][6]),
      izinTayang: String(nilai[i][7]).toLowerCase() === 'ya',
      tayang: String(nilai[i][8]).toLowerCase() === 'ya',
    });
  }

  hasil.reverse(); // terbaru di atas
  return jsonOut({ ok: true, testimoni: hasil });
}

/**
 * Tandai satu testimoni sudah/belum tayang. Kolom I dipakai sebagai
 * penanda supaya pemilik situs bisa melihat statusnya langsung dari
 * spreadsheet juga, bukan cuma dari halaman admin.
 */
function handleTayangkanTestimoni(id, tayang) {
  var sh = sheetTestimoni();
  var ketemu = cariBarisById(sh, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });
  sh.getRange(ketemu.nomorBaris, 9).setValue(tayang ? 'ya' : '');
  return jsonOut({ ok: true });
}

function handleReject(id) {
  var sh = sheetPending();
  var ketemu = cariBarisById(sh, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });
  sh.deleteRow(ketemu.nomorBaris);
  return jsonOut({ ok: true });
}

/**
 * ============================================================
 * SALINAN HARIAN SPREADSHEET
 * ============================================================
 *
 * Spreadsheet ini satu-satunya tempat data pendaftaran berada. Tidak ada
 * salinannya di mana pun: tidak di situs, tidak di Vercel, tidak di
 * basis data lain. Satu blok sel yang tertimpa tanpa sadar, atau satu
 * akun yang bermasalah, dan roster plus riwayat pembayaran seluruh batch
 * ikut hilang.
 *
 * ------------------------------------------------------------
 * TRIGGER-NYA HARUS DIPASANG MANUAL, SEKALI SAJA
 * ------------------------------------------------------------
 * Kode ini tidak berjalan sendiri hanya karena ditempel. Di editor Apps
 * Script:
 *
 *   1. Ikon jam (Triggers) di bilah kiri
 *   2. Add Trigger
 *        Choose which function to run          : backupHarian
 *        Select event source                   : Time-driven
 *        Select type of time based trigger     : Day timer
 *        Select time of day                    : 1am to 2am
 *   3. Save, lalu izinkan aksesnya waktu Google bertanya
 *
 * Untuk memastikan sekarang tanpa menunggu besok: pilih fungsi
 * backupHarian di editor lalu tekan Run, dan cek folder Backup di Drive.
 */

var FOLDER_BACKUP = 'Backup EQUAL';

// Salinan yang lebih tua dari ini dibuang. 30 hari cukup untuk menyadari
// data hilang dan mengembalikannya; menyimpan lebih lama cuma memenuhi
// Drive dengan salinan yang tidak akan pernah dibuka.
var SIMPAN_BACKUP_HARI = 30;

function backupHarian() {
  var asal = SpreadsheetApp.getActiveSpreadsheet();
  var folder = folderBackup();

  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  var nama = 'BACKUP ' + stempel + ' - ' + asal.getName();

  // Kalau hari ini sudah pernah disalin (mis. trigger jalan dua kali,
  // atau dijalankan manual untuk mengecek), tidak perlu menyalin lagi.
  var sudahAda = folder.getFilesByName(nama);
  if (sudahAda.hasNext()) return;

  DriveApp.getFileById(asal.getId()).makeCopy(nama, folder);
  buangBackupLama(folder);
}

function folderBackup() {
  var ada = DriveApp.getFoldersByName(FOLDER_BACKUP);
  return ada.hasNext() ? ada.next() : DriveApp.createFolder(FOLDER_BACKUP);
}

function buangBackupLama(folder) {
  var batas = new Date().getTime() - SIMPAN_BACKUP_HARI * 24 * 60 * 60 * 1000;
  var berkas = folder.getFiles();
  while (berkas.hasNext()) {
    var f = berkas.next();
    // setTrashed, BUKAN penghapusan permanen. Kalau ada yang salah
    // dengan perhitungan tanggal di atas, berkasnya masih bisa
    // dikembalikan dari Trash selama 30 hari berikutnya.
    if (f.getDateCreated().getTime() < batas) f.setTrashed(true);
  }
}

/**
 * ============================================================
 * CATATAN PERUBAHAN DARI PANEL ADMIN
 * ============================================================
 *
 * Tiap kali ada yang disimpan lewat /admin, satu baris ditulis ke tab
 * "Riwayat Ubah": waktu, siapa, kunci apa, nilai lama, nilai baru.
 *
 * Gunanya BUKAN curiga. Gunanya bisa menelusuri kesalahan sendiri:
 * kalau harga tiba-tiba salah atau teks paket berubah, tanpa catatan ini
 * tidak ada cara tahu itu kapan dan dari mana. Nilai lamanya juga yang
 * membuat tombol "Kembalikan" di /admin bisa ada.
 *
 * Tabnya dibuat otomatis pada penulisan pertama, tidak perlu disiapkan
 * manual.
 */

var TAB_RIWAYAT = 'Riwayat Ubah';

// Riwayat yang tumbuh tanpa batas akan memperlambat spreadsheet-nya
// sendiri. Yang lebih tua dari ini dibuang tiap kali ada penulisan baru.
var SIMPAN_RIWAYAT = 500;

function sheetRiwayat() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB_RIWAYAT);
  if (!sh) {
    sh = ss.insertSheet(TAB_RIWAYAT);
    sh.appendRow(['Waktu', 'Oleh', 'Kunci', 'Nilai lama', 'Nilai baru']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleRiwayat(perubahan, oleh) {
  if (!perubahan || !perubahan.length) return jsonOut({ ok: true, dicatat: 0 });

  var sh = sheetRiwayat();
  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  var baris = [];

  for (var i = 0; i < perubahan.length; i++) {
    var p = perubahan[i];
    baris.push([
      stempel,
      String(oleh || 'tidak diketahui'),
      String(p.kunci || ''),
      // Dipotong: nilai seperti susunan formulir atau daftar testimoni
      // bisa sangat panjang, dan satu sel raksasa membuat seluruh
      // spreadsheet berat dibuka.
      String(p.lama === undefined || p.lama === null ? '' : p.lama).slice(0, 2000),
      String(p.baru === undefined || p.baru === null ? '' : p.baru).slice(0, 2000),
    ]);
  }

  // Ditulis sekaligus, bukan satu per satu. appendRow per baris memanggil
  // layanan Spreadsheet berkali-kali dan itu bagian paling lambat di
  // Apps Script.
  sh.getRange(sh.getLastRow() + 1, 1, baris.length, 5).setValues(baris);

  var lebih = sh.getLastRow() - 1 - SIMPAN_RIWAYAT;
  if (lebih > 0) sh.deleteRows(2, lebih); // baris 1 header, yang tertua di atas

  return jsonOut({ ok: true, dicatat: baris.length });
}
