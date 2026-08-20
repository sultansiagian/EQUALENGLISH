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

/**
 * ============================================================
 * HARGA DIPAKAI MENURUT KAPAN ORANGNYA MENDAFTAR
 * ============================================================
 * Harga paket bisa berubah antar batch. Kalau semua baris dihitung
 * memakai harga yang berlaku SEKARANG, menaikkan harga untuk batch
 * berikutnya akan diam-diam menaikkan juga pendapatan batch-batch lama,
 * dan catatan yang tadinya benar jadi salah tanpa ada yang menyentuhnya.
 *
 * Karena itu tiap perubahan harga dicatat beserta waktu berlakunya
 * (lihat hargaRiwayat di site-defaults.js dan penulisnya di
 * api/admin-content.js), dan tiap baris dihargai memakai catatan yang
 * berlaku pada tanggal pendaftarannya.
 *
 * Selama belum pernah ada perubahan harga, riwayatnya kosong dan
 * semuanya memakai harga sekarang -- persis seperti perilaku lama.
 */
function susunRiwayatHarga(overrides) {
  const o = overrides || {};
  const riwayat = Array.isArray(o.hargaRiwayat) ? o.hargaRiwayat : [];

  const daftar = riwayat
    .map((r) => ({
      // null berarti berlaku sejak awal.
      sejak: r && r.berlakuSejak ? new Date(r.berlakuSejak).getTime() : null,
      harga: PAKET.map((p) => {
        const n = Number(String((r && r[p.kunciHarga]) || 0).replace(/[^\d]/g, ""));
        return Number.isFinite(n) ? n : 0;
      }),
    }))
    .filter((r) => r.sejak === null || Number.isFinite(r.sejak))
    .sort((a, b) => (a.sejak === null ? -1 : b.sejak === null ? 1 : a.sejak - b.sejak));

  // Harga yang berlaku sekarang selalu jadi entri terakhir, supaya
  // pendaftar sesudah perubahan terakhir tetap terhargai dengan benar
  // tanpa menunggu ada perubahan berikutnya.
  const sekarang = PAKET.map((p) => ambilHarga(o, p.kunciHarga));
  const terakhir = daftar[daftar.length - 1];
  if (!terakhir || terakhir.harga.join() !== sekarang.join()) {
    daftar.push({ sejak: daftar.length === 0 ? null : Date.now(), harga: sekarang });
  }

  return daftar;
}

/**
 * Harga satu paket pada tanggal tertentu.
 *
 * Baris yang tanggalnya tidak terbaca dihargai memakai catatan PALING
 * AWAL, bukan yang terbaru. Baris tanpa tanggal di data ini datangnya
 * dari respons Google Form lama, jadi menebak "lama" lebih sering benar
 * daripada menebak "baru", dan tebakan itu tidak pernah menggelembungkan
 * pendapatan.
 */
function hargaPada(riwayat, indeksPaket, tanggal) {
  const t = tanggal ? tanggal.getTime() : null;
  let dipakai = riwayat[0];

  if (t !== null) {
    for (const r of riwayat) {
      if (r.sejak === null || r.sejak <= t) dipakai = r;
      else break;
    }
  }

  return dipakai ? dipakai.harga[indeksPaket] : 0;
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
      hargaBeragam: false,
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
  const riwayatHarga = susunRiwayatHarga(overrides);
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

    // Tanggal dibaca untuk SEMUA baris, bukan cuma waktu ada jendela:
    // selain menentukan batch, tanggal juga menentukan harga mana yang
    // berlaku untuk baris itu.
    const tgl = bacaTanggal(row[KOLOM.timestamp]);

    if (pakaiJendela) {
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

    const indeks = hasil.perPaket.findIndex((x) => x.id === paketId);
    const p = hasil.perPaket[indeks];
    const hargaBaris = hargaPada(riwayatHarga, indeks, tgl);

    // Ditandai kalau ada baris di paket ini yang harganya berbeda dari
    // harga yang berlaku sekarang. Tanpa penanda, tabel akan menampilkan
    // "Rp59.000 x 18" padahal sebagian dibayar dengan harga lain, dan
    // perkaliannya tidak akan pernah cocok dengan totalnya.
    if (hargaBaris !== p.harga) p.hargaBeragam = true;

    p.pendaftaran++;
    p.orang += p.orangPerPendaftaran;
    p.pendapatan += p.orangPerPendaftaran * hargaBaris;

    hasil.totalPendaftaran++;
    hasil.totalOrang += p.orangPerPendaftaran;
    hasil.totalPendapatan += p.orangPerPendaftaran * hargaBaris;
  }

  return hasil;
}

/**
 * Jumlahkan hasil dari beberapa sheet jadi satu.
 *
 * ROSTER_CSV_URLS boleh berisi lebih dari satu sumber (sheet respons
 * Google Form DAN sheet manual berisi orang yang sudah bayar tapi belum
 * sempat mengisi form). Keduanya harus ikut terhitung, dan formatnya
 * ditebak per sheet karena tiap sheet bisa punya locale tanggal sendiri.
 */
function gabungStatistik(daftar) {
  const hasil = hitungStatistik('', {}, {});
  if (!daftar || daftar.length === 0) return hasil;

  // Harga dan nama paket diambil dari hasil pertama: nilainya sama untuk
  // semua sheet karena datangnya dari Global Config, bukan dari sheet.
  hasil.perPaket = daftar[0].perPaket.map((p) => Object.assign({}, p, {
    pendaftaran: 0, orang: 0, pendapatan: 0,
  }));

  for (const s of daftar) {
    hasil.takDikenal += s.takDikenal;
    hasil.tanpaTanggal += s.tanpaTanggal;
    hasil.totalPendaftaran += s.totalPendaftaran;
    hasil.totalOrang += s.totalOrang;
    hasil.totalPendapatan += s.totalPendapatan;
    hasil.barisDibaca += s.barisDibaca;
    s.perPaket.forEach((p, i) => {
      hasil.perPaket[i].pendaftaran += p.pendaftaran;
      hasil.perPaket[i].orang += p.orang;
      hasil.perPaket[i].pendapatan += p.pendapatan;
      if (p.hargaBeragam) hasil.perPaket[i].hargaBeragam = true;
    });
  }

  return hasil;
}

module.exports = { hitungStatistik, gabungStatistik, tebakPaket, PAKET };
