const DEFAULTS = require('./site-defaults');
const { panggilAppsScript } = require('./apps-script');

/**
 * Email otomatis ke pendaftar, dikirim lewat Apps Script di spreadsheet
 * (akun Google pemilik sheet), bukan lewat layanan email berbayar.
 *
 * ============================================================
 * KEGAGALAN KIRIM TIDAK PERNAH MENGGAGALKAN APA PUN
 * ============================================================
 * Seluruh fungsi di sini menelan errornya sendiri dan cuma mencatat ke
 * log. Alasannya sederhana: orang yang sudah mentransfer uang tidak boleh
 * gagal terdaftar cuma karena kuota email habis atau Gmail sedang
 * bermasalah. Email bisa disusulkan manual kapan saja; data pendaftaran
 * yang hilang tidak bisa dikembalikan.
 *
 * Karena itu pemanggilnya TIDAK perlu (dan tidak boleh) menunggu hasil
 * fungsi ini sebelum membalas berhasil ke pendaftar.
 */

// Batas panjang, semata supaya isi yang tidak wajar tidak diteruskan
// mentah-mentah ke Gmail.
const MAKS_SUBJEK = 200;
const MAKS_ISI = 5000;

// Di bawah angka ini, sisa kuota Gmail dicatat sebagai error supaya
// terlihat waktu menengok log, bukan cuma sebagai catatan biasa.
const AMBANG_KUOTA_TIPIS = 10;

function ambil(overrides, kunci) {
  const o = overrides || {};
  return o[kunci] !== undefined ? o[kunci] : DEFAULTS[kunci];
}

function emailSah(nilai) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(nilai || '').trim());
}

/**
 * Ganti penanda {nama} dan {link} dengan nilai sebenarnya.
 *
 * Penggantiannya memakai fungsi, bukan string, supaya isi variabel yang
 * kebetulan mengandung "$&" atau "$1" tidak diperlakukan sebagai pola
 * pengganti oleh String.replace.
 */
function isiPenanda(teks, nilai) {
  return String(teks || '').replace(/\{(nama|link)\}/g, function (cocok, kunci) {
    return nilai[kunci] !== undefined ? String(nilai[kunci]) : cocok;
  });
}

async function kirim(overrides, jenis, tujuan, nilai) {
  const aktif = ambil(overrides, jenis + 'Aktif');
  const subjek = String(ambil(overrides, jenis + 'Subjek') || '').trim();
  const isi = String(ambil(overrides, jenis + 'Isi') || '').trim();

  // Dimatikan admin, atau teksnya dikosongkan: bukan error, memang tidak
  // diminta mengirim apa-apa.
  if (aktif === false || !subjek || !isi) return { ok: false, alasan: 'dimatikan' };
  if (!emailSah(tujuan)) return { ok: false, alasan: 'alamat_tidak_sah' };

  try {
    const hasil = await panggilAppsScript('email', {
      ke: String(tujuan).trim(),
      subjek: isiPenanda(subjek, nilai).slice(0, MAKS_SUBJEK),
      isi: isiPenanda(isi, nilai).slice(0, MAKS_ISI),
    });

    // Apps Script mengembalikan sisa kuota Gmail hari itu. Diperhatikan
    // karena ini satu-satunya peringatan dini yang tersedia: begitu kuota
    // habis, semua email berhenti terkirim dan kegagalannya tidak muncul
    // di layar siapa pun.
    const sisa = hasil && typeof hasil.sisaKuota === 'number' ? hasil.sisaKuota : null;
    if (sisa !== null && sisa <= AMBANG_KUOTA_TIPIS) {
      console.error(
        'kirim-email: sisa kuota Gmail hari ini tinggal ' + sisa + ' email. Setelah ' +
          'habis, email otomatis berhenti terkirim sampai besok.'
      );
    }

    return { ok: true, sisaKuota: sisa };
  } catch (err) {
    console.error('kirim-email (' + jenis + ') gagal ke ' + tujuan + ': ' + err.message);
    return { ok: false, alasan: err.message };
  }
}

// Tanda terima, dikirim begitu formulir masuk.
function kirimTandaTerima(overrides, tujuan, nama) {
  return kirim(overrides, 'emailTerima', tujuan, { nama: nama || 'calon peserta' });
}

/**
 * Pemberitahuan akses dibuka, dikirim waktu admin menekan Setujui.
 *
 * Dikirim ke SEMUA email di baris itu, bukan cuma pendaftarnya: pada
 * paket Pair dan Group, teman-temannya juga langsung punya akses dan
 * perlu tahu. Duplikat dibuang supaya orang yang emailnya muncul dua kali
 * di baris (pendaftar tercatat di kolom datanya sendiri dan di blok
 * Person 1) tidak menerima email dobel.
 */
async function kirimAksesDibuka(overrides, daftarTujuan, nama) {
  const link = ambil(overrides, 'linkRuangKelas');
  const unik = [];
  (daftarTujuan || []).forEach(function (t) {
    const bersih = String(t || '').trim().toLowerCase();
    if (emailSah(bersih) && unik.indexOf(bersih) === -1) unik.push(bersih);
  });

  const hasil = [];
  for (const tujuan of unik) {
    hasil.push(await kirim(overrides, 'emailSetuju', tujuan, { nama: nama || 'peserta', link }));
  }
  return { terkirim: hasil.filter((h) => h.ok).length, total: unik.length };
}

/**
 * Kirim satu email percobaan lewat jalur yang PERSIS SAMA dengan email
 * sungguhan: template yang tersimpan, Apps Script yang sama, akun Gmail
 * yang sama. Kesamaan itulah yang membuatnya berguna -- kalau yang ini
 * sampai, yang sungguhan juga sampai.
 *
 * Dipakai tombol uji di /atur-form. Tanpa ini, satu-satunya cara tahu
 * pengiriman email masih hidup adalah menunggu ada pendaftar asli, lalu
 * baru bertanya-tanya kenapa orangnya tidak menerima apa-apa.
 */
async function kirimUji(overrides, jenis, tujuan) {
  if (jenis !== 'emailTerima' && jenis !== 'emailSetuju') {
    return { ok: false, alasan: 'jenis_tidak_dikenal' };
  }

  const subjek = String(ambil(overrides, jenis + 'Subjek') || '').trim();
  const isi = String(ambil(overrides, jenis + 'Isi') || '').trim();
  if (!subjek || !isi) return { ok: false, alasan: 'teks_kosong' };

  // Centang aktif/mati sengaja diabaikan: yang sedang diuji adalah
  // jalurnya, dan admin baru saja menekan tombolnya sendiri. Judulnya
  // ditandai supaya tidak tertukar dengan email sungguhan di kotak masuk.
  const salinan = Object.assign({}, overrides || {});
  salinan[jenis + 'Aktif'] = true;
  salinan[jenis + 'Subjek'] = '[UJI] ' + subjek;

  return kirim(salinan, jenis, tujuan, {
    nama: 'Contoh Pendaftar',
    link: ambil(overrides, 'linkRuangKelas'),
  });
}

module.exports = { kirimTandaTerima, kirimAksesDibuka, kirimUji, isiPenanda };
