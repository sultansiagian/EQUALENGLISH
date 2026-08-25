/**
 * Materi kelas: nilai bawaan, isi dari /atur-kelas, dan pembacaan
 * sheet materi.
 *
 * Dipisah dari verify-access.js pada 2026-08-25, dipindah apa adanya.
 */

const { csvToRows } = require('./csv');
const { cachedFetch, fetchTextWithRetry, ISI_KELAS_CACHE_TTL_MS } = require('./ambil-sheet');

const DEFAULT_MATERIALS = {
  zoomJoinUrl:
    'https://ui-ac-id.zoom.us/j/91548748401?pwd=WFhzja7b2aC5iamDQwMNaoHi7maipt.1',
  driveUrl:
    'https://drive.google.com/drive/folders/12HtL4Rchwy6JdPBs3hEa81lgwk5dxluU?usp=sharing',
  communityUrl: 'https://chat.whatsapp.com/DZsFkQv353M2u3Ue0HKbjJ',
  practiceReadingUrl: 'https://wayground.com/join?gc=09747545',
  practiceListeningUrl: 'https://wayground.com/join?gc=57785433',
  practiceWritingUrl: 'https://wayground.com/join?gc=10992729',
  announcement:
    'Semua materi ada di folder Drive ini. Rekaman Zoom ditambahkan langsung ke dalamnya setelah tiap sesi.',
};

// ============================================================
// CACHE + RETRY UNTUK SEMUA FETCH KE GOOGLE (Sheets & kunci publik JWT)
//
// Kenapa ini ada: tanpa cache, tiap SATU siswa login = fetch ulang total
// roster + jadwal + materi dari nol ke Google -- padahal isinya SAMA
// PERSIS buat semua orang selama beberapa puluh detik ke depan. Kalau
// puluhan/ratusan siswa login bersamaan (mis. persis pas kelas mau
// mulai -- momen paling mungkin ini kejadian beneran), itu jadi ratusan
// request duplikat yang sia-sia dan menaikkan risiko kena rate-limit
// dari sisi Google.
//
// Cache-nya nyimpen PROMISE-nya, bukan cuma hasil akhirnya -- supaya
// request yang datang HAMPIR BERSAMAAN (sebelum fetch pertama selesai)
// ikut "numpang" ke fetch yang sama, bukan masing-masing bikin fetch
// baru sendiri-sendiri. Ini cuma efektif kalau beberapa request
// mendarat di instance server Vercel yang sama (instance "hangat" bisa
// dipakai ulang); kalau tiap request dapat instance baru, cache ini
// gak kepakai -- tapi tetap gak rugi, cuma balik ke perilaku lama.
//
// Kegagalan TIDAK ikut di-cache (langsung dihapus lagi dari cache begitu
// gagal) supaya satu hiccup sesaat gak bikin semua orang gagal login
// selama sisa TTL.
// ============================================================
/**
 * ============================================================
 * TTL DIPISAH MENURUT SEBERAPA CEPAT ISINYA BERUBAH
 * ============================================================
 *
 * Dulu ketiga sheet memakai satu TTL 45 detik. Itu diambil dari
 * kebutuhan roster, lalu dipakai juga untuk jadwal dan materi yang
 * sebenarnya berubah beberapa kali PER BATCH, bukan per menit. Akibatnya
 * dua pengambilan ke Google diulang tiap 45 detik tanpa alasan.
 *
 * ROSTER tetap pendek dan tidak boleh dipanjangkan: angka ini adalah
 * jeda antara admin menekan Setujui dan siswanya benar-benar bisa masuk.
 * Menaikkannya jadi lima menit berarti lima menit siswa yang sudah
 * dibayar ditolak di pintu, dan itu keluhan yang pasti datang.
 *
 * ============================================================
 * KENAPA BUKAN CACHE-CONTROL DI BALASANNYA
 * ============================================================
 * Sempat direncanakan begitu, dan itu KELIRU. Balasan endpoint ini
 * bergantung pada siapa yang login: isinya materi kelas untuk email
 * tertentu. Menaruhnya di cache bersama (CDN/edge) berarti balasan satu
 * siswa bisa disajikan ke siswa lain yang kebetulan meminta sesudahnya.
 * Cache di sini HARUS per proses dan per data, bukan per balasan HTTP.
 *
 * Konsekuensi yang diterima: cache ini hilang setiap cold start, jadi
 * login pertama setelah masa sepi tetap menarik ulang sheet-nya. Itu
 * memang tidak diselesaikan di sini, dan menyelesaikannya menuntut
 * penyimpanan di luar proses -- satu layanan baru pada alur yang paling
 * tidak boleh gagal di situs ini.
 */

const PETA_MATERI_CONFIG = {
  zoomJoinUrl: 'kelasZoomUrl',
  driveUrl: 'kelasDriveUrl',
  communityUrl: 'kelasCommunityUrl',
  practiceReadingUrl: 'kelasPracticeReadingUrl',
  practiceListeningUrl: 'kelasPracticeListeningUrl',
  practiceWritingUrl: 'kelasPracticeWritingUrl',
  announcement: 'kelasPengumuman',
};

/**
 * Materi kelas yang diisi dari /atur-kelas.
 *
 * Field yang DIKOSONGKAN admin sengaja tidak ikut, supaya sheet materi
 * (atau DEFAULT_MATERIALS) yang mengisinya. Jadi pemasangan lama yang
 * masih mengandalkan sheet tidak mendadak kehilangan isinya begitu
 * halaman /atur-kelas ada.
 *
 * `lengkap` menandakan semua field sudah diisi di admin, artinya sheet
 * materi tidak perlu diambil sama sekali -- satu permintaan ke Google
 * lebih sedikit di setiap login.
 */
function materiDariConfig(overrides) {
  const o = overrides || {};
  const nilai = {};

  Object.keys(PETA_MATERI_CONFIG).forEach((field) => {
    const v = String(o[PETA_MATERI_CONFIG[field]] || '').trim();
    if (v) nilai[field] = v;
  });

  const buka = {
    reading: String(o.kelasKuisReadingBuka || '').trim(),
    listening: String(o.kelasKuisListeningBuka || '').trim(),
    writing: String(o.kelasKuisWritingBuka || '').trim(),
  };
  const adaTanggalKuis = Boolean(buka.reading || buka.listening || buka.writing);
  if (adaTanggalKuis) nilai.practiceUnlockDates = buka;

  const lengkap =
    Object.keys(PETA_MATERI_CONFIG).every((field) => Boolean(nilai[field])) && adaTanggalKuis;

  return { nilai, lengkap };
}

/**
 * Jadwal sesi yang disusun admin di /atur-kelas, diubah ke bentuk yang
 * sama persis dengan hasil extractSchedule() supaya seluruh kode di
 * bawahnya (timer, kunci Zoom, bar progres) tidak perlu
 * tahu jadwalnya datang dari mana.
 *
 * Balik null kalau admin belum menyusun jadwal sama sekali, dan itu
 * yang menandakan sheet jadwal masih perlu diambil.
 */

const MATERIALS_FIELDS = [
  { key: 'zoomJoinUrl', keywords: ['zoom'] },
  { key: 'driveUrl', keywords: ['drive'] },
  { key: 'communityUrl', keywords: ['whatsapp', 'grup'] },
  { key: 'practiceReadingUrl', keywords: ['reading'] },
  { key: 'practiceListeningUrl', keywords: ['listening'] },
  { key: 'practiceWritingUrl', keywords: ['writing'] },
  { key: 'announcement', keywords: ['pengumuman', 'announcement'] },
];

function extractMaterials(csvText) {
  // Sheet ini sengaja dibuat baru dari nol (bukan nebeng sheet lama yang
  // berantakan kayak roster), jadi posisi kolom dianggap tetap: kolom A
  // nama field, kolom B isinya. Yang FLEKSIBEL cuma teks nama fieldnya --
  // dicocokkan lewat keyword, bukan harus persis sama -- supaya salah
  // ketik kecil atau variasi kata (mis. "Link Zoom" vs "Zoom Meeting")
  // tetap kebaca.
  const rows = csvToRows(csvText);
  const found = {};
  const unlockDates = {};

  for (const row of rows) {
    const label = (row[0] || '').trim().toLowerCase();
    if (!label) continue;
    const value = (row[1] || '').trim();
    if (!value) continue;

    // Baris tanggal buka kuis ("Kuis Reading Buka", dst) dicek DULUAN,
    // sebelum daftar MATERIALS_FIELDS di bawah -- kalau tidak, label
    // itu bisa kepeleset ketimpa jadi practiceReadingUrl (keyword-nya
    // cuma 'reading', juga ketemu di label ini) dan isi kuisnya jadi
    // tanggal, bukan link.
    if (label.includes('buka') || label.includes('unlock')) {
      if (label.includes('reading')) unlockDates.reading = value;
      else if (label.includes('listening')) unlockDates.listening = value;
      else if (label.includes('writing')) unlockDates.writing = value;
      continue;
    }

    const field = MATERIALS_FIELDS.find((f) => f.keywords.some((kw) => label.includes(kw)));
    if (field) found[field.key] = value;
  }

  found.practiceUnlockDates = unlockDates;
  return found;
}

async function fetchMaterialsOverrides(url) {
  // Sama seperti roster & jadwal: gagal diakses atau tidak ada baris yang
  // kebaca TIDAK BOLEH menggagalkan login. Field yang tidak ketemu di
  // sini otomatis jatuh balik ke DEFAULT_MATERIALS di pemanggil.
  try {
    const text = await cachedFetch('materials:' + url, ISI_KELAS_CACHE_TTL_MS, () =>
      fetchTextWithRetry(url)
    );
    const found = extractMaterials(text);

    // practiceUnlockDates dihitung terpisah dari MATERIALS_FIELDS (bukan
    // salah satu field di array itu), jadi dilaporkan sendiri di bawah
    // supaya angka "ketemu X dari Y field" di sini tetap akurat.
    const regularFieldsFound = Object.keys(found).filter((k) => k !== 'practiceUnlockDates');
    console.log(
      'extractMaterials: ketemu ' + regularFieldsFound.length + ' dari ' +
        MATERIALS_FIELDS.length + ' field di MATERIALS_CSV_URL (' +
        regularFieldsFound.join(', ') + '). Field yang tidak ketemu pakai ' +
        'nilai DEFAULT_MATERIALS.'
    );

    // Baris ini yang paling gampang dipakai buat mastiin lewat Vercel >
    // Functions log apakah baris "Kuis Reading Buka" dkk kebaca benar,
    // tanpa perlu buka sheet-nya langsung (URL-nya cuma ada sebagai env
    // var, tidak pernah tersimpan di kode).
    const unlockDates = found.practiceUnlockDates || {};
    const unlockSummary = ['reading', 'listening', 'writing']
      .map((skill) => skill + '=' + (unlockDates[skill] ? '"' + unlockDates[skill] + '"' : 'kosong'))
      .join(', ');
    console.log('extractMaterials: tanggal buka kuis dari MATERIALS_CSV_URL -- ' + unlockSummary);

    return found;
  } catch (err) {
    console.error('Gagal memuat sheet materi dari MATERIALS_CSV_URL: ' + err.message);
    return {};
  }
}

module.exports = { DEFAULT_MATERIALS, materiDariConfig, extractMaterials, fetchMaterialsOverrides, PETA_MATERI_CONFIG, MATERIALS_FIELDS };
