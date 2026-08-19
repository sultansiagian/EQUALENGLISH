/**
 * ============================================================
 * JEMBATAN ANTARA FORM DI SITUS DAN SPREADSHEET PENDAFTARAN
 * ============================================================
 *
 * File ini BUKAN bagian dari situs. Isinya ditempel ke Google Sheet
 * pendaftaran ("FORM PENDAFTARAN PERSIAPAN EPT UI by EQUAL ENGLISH
 * (Responses)"), lewat Extensions > Apps Script. Disimpan di repo ini
 * supaya tidak hilang dan bisa dilacak perubahannya.
 *
 * CARA PASANG (sekali saja):
 *   1. Buka spreadsheet-nya, menu Extensions > Apps Script
 *   2. Hapus isi Code.gs yang ada, tempel SELURUH isi file ini
 *   3. Ganti nilai SECRET di bawah dengan kata sandi acak buatan sendiri
 *      (bebas, panjang, jangan dipakai di tempat lain)
 *   4. Klik Deploy > New deployment > pilih tipe "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      ("Anyone" wajib supaya server situs bisa memanggilnya. Yang
 *      menjaga keamanannya adalah SECRET di bawah, bukan pengaturan ini.)
 *   5. Copy "Web app URL" yang muncul
 *   6. Di Vercel > Settings > Environment Variables, tambahkan:
 *        APPS_SCRIPT_URL     = URL dari langkah 5
 *        APPS_SCRIPT_SECRET  = SECRET dari langkah 3
 *   7. Redeploy project-nya
 *
 * KALAU NANTI FILE INI DIUBAH: setelah menempel versi barunya, harus
 * Deploy > Manage deployments > edit > Version: New version. Kalau cuma
 * disimpan tanpa deploy ulang, yang jalan tetap versi lama.
 *
 * ============================================================
 * ALUR YANG DIJALANKAN SKRIP INI
 * ============================================================
 *
 * Pendaftar isi form di situs
 *   -> baris masuk ke tab "Pendaftar Web" (BELUM dapat akses kelas,
 *      karena tab ini tidak terdaftar di ROSTER_CSV_URLS)
 *   -> admin melihatnya di /admin, mengecek bukti bayar
 *   -> admin klik Setujui
 *   -> baris DIPINDAH ke tab "Form_Responses" kolom A sampai V
 *   -> api/verify-access.js membacanya seperti biasa, akses terbuka
 *
 * Sengaja TIDAK memakai trik menulis "done" di kolom paling kanan:
 * cara itu bergantung pada posisi kolom terakhir, dan salah satu kolom
 * saja bisa berakibat orang yang belum bayar dapat akses, atau orang
 * yang sudah bayar malah terkunci. Memisahkan tab menghilangkan seluruh
 * kelas kesalahan itu.
 */

// GANTI INI dengan kata sandi acak buatan sendiri sebelum deploy.
var SECRET = 'GANTI_DENGAN_KATA_SANDI_ACAK_PANJANG';

var TAB_PENDING = 'Pendaftar Web';
var TAB_ROSTER = 'Form_Responses';

// Susunan kolom tab Form_Responses, A sampai V. Urutannya HARUS sama
// persis dengan sheet aslinya -- baris yang disetujui ditulis mengikuti
// urutan ini. Kolom setelah V sengaja tidak diisi (dikonfirmasi tidak
// dipakai), dan dibiarkan kosong supaya tidak menimpa apa pun.
var KOLOM_ROSTER = [
  'timestamp',        // A
  'buktiPembayaran',  // B (kolom manual, diisi link bukti bayar juga)
  'nama',             // C
  'fakultas',         // D
  'telepon',          // E
  'idLine',           // F
  'paket',            // G
  'namaDiri',         // H
  'teleponDiri',      // I
  'emailDiri',        // J
  'p1Nama',           // K
  'p1Telepon',        // L
  'p1Email',          // M
  'p2Nama',           // N
  'p2Telepon',        // O
  'p2Email',          // P
  'p3Nama',           // Q
  'p3Telepon',        // R
  'p3Email',          // S
  'buktiBayar',       // T
  'buktiBroadcast',   // U
  'buktiInstagram',   // V
];

// Tab "Pendaftar Web" pakai susunan yang sama, plus satu kolom id di
// depan supaya tiap baris bisa dirujuk dari /admin tanpa bergantung
// pada nomor baris (nomor baris bergeser tiap ada yang dihapus).
var KOLOM_PENDING = ['id'].concat(KOLOM_ROSTER);

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return jsonOut({ ok: false, reason: 'secret_salah' });
    }

    if (body.action === 'submit') return handleSubmit(body.data);
    if (body.action === 'list') return handleList();
    if (body.action === 'approve') return handleApprove(body.id);
    if (body.action === 'reject') return handleReject(body.id);
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
    // Dibuat otomatis pada pemakaian pertama, lengkap dengan baris judul,
    // supaya tidak ada langkah manual tambahan waktu pasang.
    sh = ss.insertSheet(TAB_PENDING);
    sh.appendRow(KOLOM_PENDING);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Simpan satu file (dikirim sebagai data URL base64) ke Drive, di dalam
 * folder khusus supaya tidak berantakan di Drive utama.
 *
 * File-nya PRIVAT (tidak diubah sharing-nya), jadi cuma pemilik akun ini
 * yang bisa membukanya. Ini disengaja: isinya bukti transfer, ada nama
 * dan nominal di situ.
 */
function simpanKeDrive(dataUrl, namaFile) {
  if (!dataUrl) return '';

  var cocok = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!cocok) return '';

  var tipe = cocok[1];
  var bytes = Utilities.base64Decode(cocok[2]);
  var blob = Utilities.newBlob(bytes, tipe, namaFile);

  var namaFolder = 'Pendaftaran EQUAL (dari situs)';
  var folders = DriveApp.getFoldersByName(namaFolder);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(namaFolder);

  return folder.createFile(blob).getUrl();
}

function handleSubmit(d) {
  var sh = sheetPending();
  var id = 'REG' + new Date().getTime() + Math.floor(Math.random() * 1000);
  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'M/d/yyyy H:mm:ss');
  var aman = function (v) {
    return String(v === undefined || v === null ? '' : v).slice(0, 300);
  };

  // Upload disimpan lebih dulu; kalau salah satu gagal, pendaftarannya
  // TETAP dicatat dengan kolom itu kosong, daripada seluruh pendaftaran
  // hilang gara-gara satu file bermasalah. Admin bisa menyusulkan lewat
  // WhatsApp kalau ada yang kosong.
  var linkBayar = simpanKeDrive(d.buktiBayar, id + '-bayar');
  var linkBroadcast = simpanKeDrive(d.buktiBroadcast, id + '-broadcast');
  var linkInstagram = simpanKeDrive(d.buktiInstagram, id + '-instagram');

  var isi = {
    id: id,
    timestamp: stempel,
    buktiPembayaran: linkBayar,
    nama: aman(d.nama),
    fakultas: aman(d.fakultas),
    telepon: aman(d.telepon),
    idLine: aman(d.idLine),
    paket: aman(d.paket),
    namaDiri: aman(d.namaDiri),
    teleponDiri: aman(d.teleponDiri),
    emailDiri: aman(d.emailDiri),
    p1Nama: aman(d.p1Nama),
    p1Telepon: aman(d.p1Telepon),
    p1Email: aman(d.p1Email),
    p2Nama: aman(d.p2Nama),
    p2Telepon: aman(d.p2Telepon),
    p2Email: aman(d.p2Email),
    p3Nama: aman(d.p3Nama),
    p3Telepon: aman(d.p3Telepon),
    p3Email: aman(d.p3Email),
    buktiBayar: linkBayar,
    buktiBroadcast: linkBroadcast,
    buktiInstagram: linkInstagram,
  };

  sh.appendRow(
    KOLOM_PENDING.map(function (k) {
      return isi[k] || '';
    })
  );

  return jsonOut({ ok: true, id: id });
}

function handleList() {
  var sh = sheetPending();
  var nilai = sh.getDataRange().getValues();
  var hasil = [];

  for (var i = 1; i < nilai.length; i++) {
    var baris = nilai[i];
    if (!baris[0]) continue; // baris kosong
    var obj = {};
    KOLOM_PENDING.forEach(function (k, idx) {
      obj[k] = String(baris[idx] === undefined || baris[idx] === null ? '' : baris[idx]);
    });
    hasil.push(obj);
  }

  // Terbaru di atas, supaya yang baru masuk langsung kelihatan di /admin.
  hasil.reverse();
  return jsonOut({ ok: true, pendaftar: hasil });
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
 * Setujui: salin baris ke Form_Responses (kolom A sampai V, urutan sama
 * persis), lalu hapus dari tab Pendaftar Web.
 *
 * Urutannya SENGAJA salin dulu baru hapus. Kalau dibalik dan penyalinan
 * gagal, datanya hilang selamanya. Dengan urutan ini, kegagalan paling
 * buruk cuma menyisakan baris ganda yang bisa dihapus manual.
 */
function handleApprove(id) {
  var shPending = sheetPending();
  var ketemu = cariBarisById(shPending, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shRoster = ss.getSheetByName(TAB_ROSTER);
  if (!shRoster) return jsonOut({ ok: false, reason: 'tab_roster_tidak_ketemu' });

  // Lewati kolom id (indeks 0), sisanya sudah urut sesuai KOLOM_ROSTER.
  var barisRoster = ketemu.nilai.slice(1, KOLOM_ROSTER.length + 1);

  shRoster.appendRow(barisRoster);
  SpreadsheetApp.flush(); // pastikan tertulis sebelum menghapus sumbernya
  shPending.deleteRow(ketemu.nomorBaris);

  return jsonOut({ ok: true });
}

function handleReject(id) {
  var sh = sheetPending();
  var ketemu = cariBarisById(sh, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });
  sh.deleteRow(ketemu.nomorBaris);
  return jsonOut({ ok: true });
}
