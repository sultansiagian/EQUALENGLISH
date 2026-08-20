const { csvToRows, buatPembacaTanggal } = require('./csv');
const { KOLOM } = require('./form-schema');
const DEFAULTS = require('./site-defaults');

/**
 * Menghitung angka untuk halaman /analitik dari isi sheet roster.
 *
 * Sengaja MURNI: fungsi di sini menerima teks CSV dan mengembalikan
 * angka, tidak mengambil apa pun dari jaringan. Pengambilan datanya ada
 * di api/admin-statistik.js. Dengan begitu perhitungannya bisa diuji
 * dengan data karangan tanpa menyentuh spreadsheet sungguhan.
 *
 * ============================================================
 * SATU BARIS BUKAN SATU ORANG
 * ============================================================
 * Paket Pair mengisi kolom peserta 2, Group mengisi peserta 2 dan 3.
 * Jadi satu baris Group = tiga siswa. Harga di situs tertulis "per
 * orang", jadi pendapatan satu baris Group = 3 x harga Group.
 *
 * Karena itu di seluruh file ini "pendaftaran" (jumlah baris) dan
 * "orang" (jumlah siswa) selalu dibedakan, tidak pernah dicampur.
 */

// Jumlah orang per satu pendaftaran, dan kunci harga yang dipakainya di
// site-defaults.js.
const PAKET = [
  { id: 'individual', label: 'Individual', orang: 1, kunciHarga: 'pkg1Price', kunciNama: 'pkg1Name' },
  { id: 'pair', label: 'Pair', orang: 2, kunciHarga: 'pkg2Price', kunciNama: 'pkg2Name' },
  { id: 'group', label: 'Group', orang: 3, kunciHarga: 'pkg3Price', kunciNama: 'pkg3Name' },
];

/**
 * Tebak paket dari teks selnya.
 *
 * Dicocokkan lewat KATA KUNCI, bukan disamakan persis dengan
 * PILIHAN_PAKET. Alasannya: baris lama dari Google Form bisa memakai
 * tulisan yang sedikit berbeda ("Individual", "Individual (1 student)",
 * "INDIVIDUAL"), dan pemilik situs bisa mengganti nama paket dari /admin
 * kapan saja. Yang tidak berubah cuma kata intinya.
 */
function tebakPaket(sel) {
  const t = String(sel || '').trim().toLowerCase();
  if (!t) return null;
  if (t.includes('individual') || t.includes('solo')) return 'individual';
  if (t.includes('pair')) return 'pair';
  if (t.includes('group')) return 'group';
  return null;
}

function ambilHarga(overrides, kunci) {
  const o = overrides || {};
  const nilai = o[kunci] !== undefined ? o[kunci] : DEFAULTS[kunci];
  const angka = Number(String(nilai).replace(/[^\d]/g, ''));
  return Number.isFinite(angka) ? angka : 0;
}

function ambilNama(overrides, kunci, cadangan) {
  const o = overrides || {};
  const nilai = o[kunci] !== undefined ? o[kunci] : DEFAULTS[kunci];
  return String(nilai || cadangan).trim() || cadangan;
}

/**
 * @param {string} csvText   isi sheet roster apa adanya
 * @param {object} overrides nilai dari Global Config (harga & nama paket)
 * @param {object} jendela   { mulai: Date|null, selesai: Date|null }
 *                           null berarti tanpa batas di sisi itu
 */
function hitungStatistik(csvText, overrides, jendela) {
  const rows = csvToRows(String(csvText || ''));
  const batas = jendela || {};

  const hasil = {
    perPaket: PAKET.map((p) => ({
      id: p.id,
      label: p.label,
      nama: ambilNama(overrides, p.kunciNama, p.label),
      orangPerPendaftaran: p.orang,
      harga: ambilHarga(overrides, p.kunciHarga),
      pendaftaran: 0,
      orang: 0,
      pendapatan: 0,
    })),
    // Baris yang kolom paketnya kosong atau tidak dikenali. TIDAK ditebak
    // dan TIDAK dibuang diam-diam: ditampilkan apa adanya supaya kalau
    // sheet-nya berisi baris aneh, itu terlihat, bukan menguap dari total.
    takDikenal: 0,
    // Baris yang tanggalnya tidak terbaca, sehingga tidak bisa dipastikan
    // masuk batch ini atau tidak. Cuma relevan kalau jendelanya dipakai.
    tanpaTanggal: 0,
    totalPendaftaran: 0,
    totalOrang: 0,
    totalPendapatan: 0,
    barisDibaca: Math.max(0, rows.length - 1),
  };

  if (rows.length < 2) return hasil;

  // Format tanggal ditentukan dari SELURUH kolom sekaligus, lihat
  // penjelasan panjang di _lib/csv.js.
  const kolomTanggal = rows.slice(1).map((r) => (r ? r[KOLOM.timestamp] : ''));
  const bacaTanggal = buatPembacaTanggal(kolomTanggal);

  const pakaiJendela = Boolean(batas.mulai || batas.selesai);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Baris yang sama sekali kosong (sering ada di ujung sheet) dilewati
    // tanpa dihitung apa pun.
    const adaIsi = row.some((sel) => String(sel || '').trim());
    if (!adaIsi) continue;

    if (pakaiJendela) {
      const tgl = bacaTanggal(row[KOLOM.timestamp]);
      if (!tgl) {
        hasil.tanpaTanggal++;
        continue;
      }
      if (batas.mulai && tgl < batas.mulai) continue;
      if (batas.selesai && tgl > batas.selesai) continue;
    }

    const paketId = tebakPaket(row[KOLOM.paket]);
    if (!paketId) {
      hasil.takDikenal++;
      hasil.totalPendaftaran++;
      continue;
    }

    const p = hasil.perPaket.find((x) => x.id === paketId);
    p.pendaftaran++;
    p.orang += p.orangPerPendaftaran;
    p.pendapatan += p.orangPerPendaftaran * p.harga;

    hasil.totalPendaftaran++;
    hasil.totalOrang += p.orangPerPendaftaran;
    hasil.totalPendapatan += p.orangPerPendaftaran * p.harga;
  }

  return hasil;
}

module.exports = { hitungStatistik, tebakPaket, PAKET };
