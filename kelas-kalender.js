/**
 * ============================================================
 * SIMPAN JADWAL SESI KE KALENDER (.ics)
 * ============================================================
 *
 * Kartu jadwal dan hitung mundur di /kelas sudah bekerja, tapi keduanya
 * menuntut siswa MEMBUKA halaman ini untuk ingat. Sepuluh hari berturut-
 * turut, di tengah jadwal kuliah, sebagian pasti lupa lalu menyalahkan
 * diri sendiri.
 *
 * Berkasnya disusun DI BROWSER, bukan di server. Datanya sudah ada di
 * sini, dan membuat Serverless Function baru untuk merangkai teks biasa
 * berarti menghabiskan satu dari dua slot tersisa untuk sesuatu yang
 * tidak butuh server sama sekali.
 *
 * Berkas terpisah dari kelas.js karena isinya berdiri sendiri: tidak
 * menyentuh state gerbang login maupun DOM materi, cuma menerima daftar
 * sesi dan menghasilkan teks.
 */

/**
 * RFC 5545 membatasi 75 oktet per baris. Baris yang lebih panjang harus
 * dipatahkan dengan satu spasi di awal sambungannya.
 *
 * Bukan kerewelan format: aplikasi kalender yang ketat menolak SELURUH
 * berkas kalau ini dilanggar, dan penolakannya tidak pernah menyebut
 * baris mana yang bermasalah. Judul sesi diketik admin di /atur-kelas,
 * jadi panjangnya tidak bisa diasumsikan.
 */
function lipatBarisIcs(baris) {
  if (baris.length <= 74) return baris;
  var potongan = [baris.slice(0, 74)];
  var sisa = baris.slice(74);
  while (sisa.length > 73) {
    potongan.push(' ' + sisa.slice(0, 73));
    sisa = sisa.slice(73);
  }
  if (sisa) potongan.push(' ' + sisa);
  return potongan.join('\r\n');
}

/**
 * Titik koma, koma, dan garis miring terbalik punya arti khusus di format
 * ini, dan judul sesi datang dari isian bebas di /atur-kelas.
 */
function loloskanIcs(teks) {
  return String(teks == null ? '' : teks)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function stempelIcs(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buatIcs(sessions, zoomUrl) {
  var sekarang = stempelIcs(new Date());
  var baris = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EQUAL English//Jadwal Kelas//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Bootcamp EPT UI - EQUAL English',
  ];

  sessions.forEach(function (sesi, i) {
    var mulai = new Date(sesi.isoDatetime);
    if (!Number.isFinite(mulai.getTime())) return;
    var selesai = new Date(mulai.getTime() + 60 * 60 * 1000);
    var judul = sesi.topic ? 'EQUAL: ' + sesi.topic : 'Sesi Bootcamp EPT UI';

    baris.push('BEGIN:VEVENT');
    // UID harus TETAP SAMA kalau berkasnya diunduh dua kali, supaya
    // aplikasi kalender memperbarui acara yang sudah ada dan bukan
    // membuat duplikatnya. Karena itu dibentuk dari waktu sesinya, bukan
    // dari angka acak atau waktu unduh.
    baris.push('UID:equal-' + stempelIcs(mulai) + '-' + i + '@equalenglish');
    baris.push('DTSTAMP:' + sekarang);
    // Waktu ditulis dalam UTC (berakhiran Z). Aplikasi kalender yang
    // menampilkannya akan menerjemahkan sendiri ke zona waktu perangkat
    // siswa, jadi tidak perlu blok VTIMEZONE.
    baris.push('DTSTART:' + stempelIcs(mulai));
    baris.push('DTEND:' + stempelIcs(selesai));
    baris.push(lipatBarisIcs('SUMMARY:' + loloskanIcs(judul)));

    var keterangan = 'Sesi Bootcamp EPT UI dari EQUAL English.';
    if (zoomUrl) keterangan += '\n\nLink Zoom: ' + zoomUrl;
    baris.push(lipatBarisIcs('DESCRIPTION:' + loloskanIcs(keterangan)));
    if (zoomUrl) baris.push(lipatBarisIcs('LOCATION:' + loloskanIcs(zoomUrl)));

    // Pengingat 15 menit sebelumnya. Ini alasan utama fitur ini ada: yang
    // dibutuhkan siswa bukan catatan, melainkan sesuatu yang berbunyi.
    baris.push('BEGIN:VALARM');
    baris.push('TRIGGER:-PT15M');
    baris.push('ACTION:DISPLAY');
    baris.push('DESCRIPTION:Sesi EQUAL mulai 15 menit lagi');
    baris.push('END:VALARM');
    baris.push('END:VEVENT');
  });

  baris.push('END:VCALENDAR');
  // CRLF, bukan LF saja. Sebagian aplikasi kalender menolak berkas ber-LF.
  return baris.join('\r\n') + '\r\n';
}

function pasangUnduhKalender(sessions, materials) {
  var tombol = document.getElementById('kelas-kalender');
  if (!tombol) return;

  var sah = (sessions || []).filter(function (s) {
    return s && Number.isFinite(new Date(s.isoDatetime).getTime());
  });

  // Tanpa sesi yang belum lewat, tombolnya tidak punya arti apa-apa.
  if (sah.length === 0) {
    tombol.hidden = true;
    return;
  }

  tombol.hidden = false;
  tombol.textContent =
    sah.length === 1 ? 'Simpan sesi ini ke kalender' : 'Simpan ' + sah.length + ' sesi ke kalender';

  tombol.onclick = function () {
    var isi = buatIcs(sah, (materials && materials.zoomJoinUrl) || '');
    var blob = new Blob([isi], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'jadwal-equal.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Dilepas setelah jeda, bukan pada detik yang sama: sebagian browser
    // membatalkan unduhannya sendiri kalau URL-nya sudah dicabut.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  };
}

// Node (untuk tes) maupun browser. Di browser, fungsinya menempel di
// window seperti skrip lain di halaman ini.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buatIcs, lipatBarisIcs, loloskanIcs, stempelIcs, pasangUnduhKalender };
}
