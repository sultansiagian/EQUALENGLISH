/**
 * Buka/tutup formulir pendaftaran.
 *
 * Dipakai bersama oleh:
 *   - api/daftar-schema.js : memberi tahu browser form sedang buka/tutup
 *   - api/daftar.js        : MENOLAK kiriman waktu tutup
 *
 * Pemeriksaan di api/daftar.js itu yang menentukan. Yang di
 * daftar-schema cuma supaya pengunjung melihat pesan yang benar; orang
 * bisa saja mengirim langsung ke endpoint tanpa membuka halamannya.
 *
 * ============================================================
 * SOAL ZONA WAKTU
 * ============================================================
 * Admin mengisi tanggal lewat <input type="datetime-local">, yang
 * menghasilkan teks seperti "2026-09-01T23:59" TANPA keterangan zona
 * waktu. Server Vercel berjalan di UTC. Kalau teks itu dibaca apa adanya
 * dengan new Date(), hasilnya dianggap UTC dan formulir akan tutup 7 jam
 * lebih cepat dari yang dimaksud admin.
 *
 * Karena itu teksnya SELALU dibaca sebagai WIB (UTC+7). WIB tidak punya
 * daylight saving, jadi selisihnya tetap 7 jam sepanjang tahun dan cukup
 * dikurangi langsung waktu membangun tanggalnya.
 */

const MODE_SAH = ['buka', 'tutup', 'jadwal'];

/**
 * "2026-09-01T23:59" (WIB) -> epoch milidetik.
 * Balik null kalau kosong atau bentuknya tidak dikenali.
 */
function waktuWibKeEpoch(teks) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(teks || '').trim());
  if (!cocok) return null;

  const [, thn, bln, tgl, jam, menit] = cocok.map(Number);
  const ms = Date.UTC(thn, bln - 1, tgl, jam - 7, menit);
  return Number.isFinite(ms) ? ms : null;
}

function formatWib(epochMs) {
  if (epochMs === null) return '';
  const d = new Date(epochMs + 7 * 60 * 60 * 1000); // geser ke WIB
  const p = (n) => String(n).padStart(2, '0');
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return (
    d.getUTCDate() + ' ' + bulan[d.getUTCMonth()] + ' ' + d.getUTCFullYear() +
    ' pukul ' + p(d.getUTCHours()) + '.' + p(d.getUTCMinutes()) + ' WIB'
  );
}

/**
 * Tentukan formulir sedang buka atau tutup.
 *
 * Mode:
 *   'buka'    -> selalu terbuka
 *   'tutup'   -> selalu tertutup
 *   'jadwal'  -> terbuka di antara formBukaPada dan formTutupPada.
 *                Salah satu boleh dikosongkan: tanpa tanggal buka berarti
 *                "sudah buka sejak dulu", tanpa tanggal tutup berarti
 *                "belum ada rencana ditutup".
 *
 * Mode yang tidak dikenal DIANGGAP 'buka'. Ini disengaja: kalau nilai
 * konfigurasinya rusak, formulir yang keliru terbuka jauh lebih ringan
 * akibatnya daripada calon murid ditolak diam-diam tanpa ada yang tahu.
 */
function statusForm(overrides, sekarangMs) {
  const o = overrides || {};
  const sekarang = typeof sekarangMs === 'number' ? sekarangMs : Date.now();
  const mode = MODE_SAH.includes(o.formMode) ? o.formMode : 'buka';
  const pesan = String(o.formPesanTutup || '').trim();

  if (mode === 'buka') return { terbuka: true, mode, pesan: '' };

  if (mode === 'tutup') {
    return {
      terbuka: false,
      mode,
      alasan: 'ditutup_manual',
      pesan: pesan || 'Pendaftaran sedang ditutup.',
      pesanTambahan: '',
    };
  }

  // mode 'jadwal'
  const buka = waktuWibKeEpoch(o.formBukaPada);
  const tutup = waktuWibKeEpoch(o.formTutupPada);

  if (buka !== null && sekarang < buka) {
    return {
      terbuka: false,
      mode,
      alasan: 'belum_buka',
      pesan: pesan || 'Pendaftaran belum dibuka.',
      pesanTambahan: 'Dibuka ' + formatWib(buka) + '.',
      bukaPada: buka,
    };
  }

  if (tutup !== null && sekarang > tutup) {
    return {
      terbuka: false,
      mode,
      alasan: 'sudah_tutup',
      pesan: pesan || 'Pendaftaran sudah ditutup.',
      pesanTambahan: 'Ditutup ' + formatWib(tutup) + '.',
      tutupPada: tutup,
    };
  }

  return {
    terbuka: true,
    mode,
    pesan: '',
    // Dikirim ke halaman /daftar supaya bisa menampilkan "ditutup tanggal
    // sekian", yang mendorong orang tidak menunda-nunda.
    tutupPada: tutup,
    tutupPadaTeks: tutup !== null ? formatWib(tutup) : '',
  };
}

module.exports = { statusForm, waktuWibKeEpoch, formatWib, MODE_SAH };
