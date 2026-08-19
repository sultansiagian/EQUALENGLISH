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
 *   5. Copy "Web app URL"
 *   6. Di Vercel > Settings > Environment Variables, isi:
 *        APPS_SCRIPT_URL     = URL dari langkah 5
 *        APPS_SCRIPT_SECRET  = SECRET dari langkah 3
 *   7. Redeploy project-nya
 *
 * KALAU FILE INI DIUBAH: setelah menempel versi barunya, harus
 * Deploy > Manage deployments > edit > Version: New version. Kalau cuma
 * disimpan tanpa deploy ulang, yang jalan tetap versi lama.
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
    if (body.action === 'email') return handleEmail(body.ke, body.subjek, body.isi);
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
function handleEmail(ke, subjek, isi) {
  var alamat = String(ke || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alamat)) {
    return jsonOut({ ok: false, reason: 'alamat_tidak_sah' });
  }
  if (!String(subjek || '').trim() || !String(isi || '').trim()) {
    return jsonOut({ ok: false, reason: 'isi_kosong' });
  }

  try {
    MailApp.sendEmail({
      to: alamat,
      subject: String(subjek),
      body: String(isi),
      name: 'EQUAL English',
    });
    return jsonOut({ ok: true, sisaKuota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return jsonOut({ ok: false, reason: 'gagal_kirim', pesan: String(err) });
  }
}

function handleReject(id) {
  var sh = sheetPending();
  var ketemu = cariBarisById(sh, id);
  if (!ketemu) return jsonOut({ ok: false, reason: 'id_tidak_ketemu' });
  sh.deleteRow(ketemu.nomorBaris);
  return jsonOut({ ok: true });
}
