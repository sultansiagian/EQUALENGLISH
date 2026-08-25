/**
 * Roster siswa: membaca sheet, menyamakan email, dan memutuskan siapa
 * yang aksesnya masih berlaku.
 *
 * INI KODE YANG MENENTUKAN SIAPA BOLEH MASUK KELAS BERBAYAR. Kalau
 * ada yang diubah di sini, jalankan `npm test` dan coba satu login
 * siswa asli di preview sebelum merge.
 *
 * Dipisah dari verify-access.js pada 2026-08-25, dipindah apa adanya.
 */

const { csvToRows } = require('./csv');
const { cachedFetch, fetchTextWithRetry, CSV_CACHE_TTL_MS } = require('./ambil-sheet');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Samakan bentuk email sebelum dicocokkan.
 *
 * MASALAH YANG DIPECAHKAN: Gmail memperlakukan titik dan tanda plus di
 * bagian sebelum @ sebagai TIDAK ADA. budi.santoso@gmail.com,
 * budisantoso@gmail.com, dan budi.santoso+kelas@gmail.com semuanya kotak
 * masuk yang sama persis. Google mengirimkan satu bentuk kanonik di token
 * login, sementara siswa mengetik bentuk lain waktu mengisi formulir.
 *
 * Tanpa penyamaan ini, siswa yang sudah bayar akan ditolak masuk dengan
 * pesan "email belum terdaftar", padahal emailnya SAMA. Gejalanya
 * membingungkan karena dari matanya, yang tertulis di sheet dan yang dia
 * pakai login terlihat identik.
 *
 * HANYA untuk gmail.com dan googlemail.com. Di domain lain (termasuk
 * kampus seperti @ui.ac.id), titik itu BERARTI: budi.s@ui.ac.id dan
 * budis@ui.ac.id bisa jadi dua orang berbeda, dan menyamakannya akan
 * memberi akses ke orang yang salah.
 */
function normalisasiEmail(email) {
  const bersih = String(email || '').trim().toLowerCase();
  const posAt = bersih.lastIndexOf('@');
  if (posAt === -1) return bersih;

  let lokal = bersih.slice(0, posAt);
  let domain = bersih.slice(posAt + 1);

  // googlemail.com itu alias resmi gmail.com dari Google sendiri.
  if (domain === 'googlemail.com') domain = 'gmail.com';

  if (domain === 'gmail.com') {
    lokal = lokal.split('+')[0].replace(/\./g, '');
  }

  // Kalau penyamaan malah menghabiskan bagian sebelum @ (mis. email
  // berbentuk "...@gmail.com" yang isinya cuma titik), pakai bentuk
  // aslinya saja daripada menghasilkan email cacat yang bisa tidak
  // sengaja cocok dengan baris lain.
  if (!lokal) return bersih;

  return lokal + '@' + domain;
}

// Cara mencabut akses satu siswa (atau satu baris pendaftaran Pair/
// Group, yang otomatis mencabut semua nama di baris itu): ketik kata
// ini persis di sel PALING KANAN baris tersebut di sheet mana pun
// (form atau manual). Tidak perlu ubah tanggal atau env var apa pun.
const REVOKED_MARKER = 'done';

// Kolom W di sheet: tanggal berakhirnya akses ruang kelas untuk pendaftar
// yang masuk lewat form di situs. Angkanya HARUS sama dengan
// KOLOM_BERLAKU_SAMPAI di api/_lib/form-schema.js -- sengaja ditulis ulang
// di sini, bukan di-import, supaya file ini tetap berdiri sendiri tanpa
// bergantung pada modul lain (kalau modul itu error, gerbang kelas ikut
// mati, dan itu risiko yang tidak sebanding untuk satu angka).
const KOLOM_BERLAKU_SAMPAI = 22;

/**
 * Apakah tanggal "YYYY-MM-DD" sudah lewat?
 *
 * Aksesnya berlaku SAMPAI AKHIR hari itu waktu WIB, bukan sampai jam 00.00.
 * "Berlaku sampai 31 Maret" yang mati pada 31 Maret dini hari akan terasa
 * seperti kecolongan sehari bagi orang yang membacanya.
 *
 * Balik false untuk apa pun yang tidak bisa dibaca, supaya sel yang salah
 * ketik tidak pernah mengunci orang keluar (gagal terbuka).
 */
function sudahKedaluwarsa(teks) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || '').trim());
  if (!cocok) return false;

  const [, thn, bln, tgl] = cocok.map(Number);
  if (bln < 1 || bln > 12 || tgl < 1 || tgl > 31) return false;

  // Akhir hari WIB = 16:59:59 UTC di hari yang sama (WIB = UTC+7).
  const batasMs = Date.UTC(thn, bln - 1, tgl, 16, 59, 59, 999);
  if (!Number.isFinite(batasMs)) return false;

  return Date.now() > batasMs;
}

function findColumnIndex(headerRow, keyword) {
  // Cocok dengan huruf saja (angka/spasi/tanda hubung dibuang) supaya
  // variasi kecil di nama kolom tetap ketemu -- lihat bug "E-mail" vs
  // "email" yang pernah kejadian di sini.
  const normalized = headerRow.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  return normalized.findIndex((h) => h.includes(keyword));
}

function extractEmailsFromSheet(csvText, cutoffDate) {
  // Sengaja TIDAK bergantung pada baris header untuk KOLOM EMAIL (mis.
  // mencari kolom yang namanya mengandung "email"). Sheet respons
  // Google Form rapi dan punya header yang jelas, tapi sheet manual
  // yang diisi tangan bisa saja baris pertamanya kosong, ada label
  // seperti "MANUAL" di tengah, atau kolomnya bergeser -- semua itu
  // bikin pencarian lewat header gagal diam-diam dan seluruh sheet
  // dianggap kosong. Jadi tiap sel diuji langsung: kalau bentuknya
  // seperti alamat email, dianggap email, apa pun posisi kolomnya.
  //
  // Kolom TIMESTAMP beda cerita: itu nama yang dibuat otomatis oleh
  // Google Form sendiri (bukan ketikan manual), jadi bisa dipercaya
  // konsisten. Dipakai untuk memfilter batch lama kalau BATCH_CUTOFF_DATE
  // diisi. Sheet yang tidak punya kolom ini (mis. sheet manual) sama
  // sekali tidak kena filter tanggal.
  const rows = csvToRows(csvText);
  if (rows.length === 0) return [];

  const timestampCol = findColumnIndex(rows[0], 'timestamp');
  const emails = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Baris dicabut aksesnya kalau ADA SEL MANA PUN yang isinya persis
    // kata "done".
    //
    // Dulu yang diperiksa cuma sel PALING KANAN, dihitung dari baris
    // terlebar di seluruh sheet. Itu diam-diam rapuh: begitu ada kolom
    // baru terisi di sheet (mis. kolom W untuk tanggal berakhirnya akses
    // pendaftar web), posisi "paling kanan" bergeser, dan semua tanda
    // "done" lama berhenti berfungsi TANPA gejala apa pun -- orang yang
    // sudah dicabut aksesnya diam-diam bisa masuk lagi.
    //
    // Memindai seluruh sel menghilangkan ketergantungan pada lebar sheet
    // sama sekali. Risiko salah tangkap sangat kecil karena yang dicocokkan
    // adalah SELURUH isi sel yang persis "done", bukan sel yang mengandung
    // kata itu; jawaban wajar tidak pernah berbentuk begitu.
    const dicabut = row.some((cell) => (cell || '').trim().toLowerCase() === REVOKED_MARKER);
    if (dicabut) continue;

    // Tanggal berakhirnya akses, diisi otomatis waktu admin menyetujui
    // pendaftar dari /pendaftar (lihat KOLOM_BERLAKU_SAMPAI di
    // api/_lib/form-schema.js). Formatnya "YYYY-MM-DD".
    //
    // Baris lama dari Google Form dan sheet manual TIDAK punya isi di
    // kolom ini, jadi mereka tidak pernah kedaluwarsa dan tetap diatur
    // manual dengan kata "done" seperti selama ini.
    //
    // GAGAL TERBUKA: sel kosong, format tidak dikenali, atau tanggal yang
    // tidak masuk akal semuanya diperlakukan sebagai "tanpa batas waktu".
    // Mengunci orang yang sudah bayar gara-gara satu sel salah ketik jauh
    // lebih merugikan daripada akses yang telat dicabut beberapa hari.
    const berlakuSampai = (row[KOLOM_BERLAKU_SAMPAI] || '').trim();
    if (berlakuSampai && sudahKedaluwarsa(berlakuSampai)) continue;

    if (cutoffDate && timestampCol !== -1) {
      const raw = (row[timestampCol] || '').trim();
      const rowDate = raw ? new Date(raw) : null;
      const isValidDate = rowDate && !Number.isNaN(rowDate.getTime());
      // Baris dengan tanggal yang gagal dibaca sengaja DIANGGAP di luar
      // batch aktif (bukan malah diloloskan). Kalau ini salah mengunci
      // siswa batch baru, mereka tetap bisa menghubungi lewat WhatsApp
      // di halaman "belum terdaftar", dan sementara itu ditambahkan ke
      // sheet manual sambil dicek kenapa tanggalnya tidak terbaca.
      if (!isValidDate || rowDate < cutoffDate) continue;
    }

    row.forEach((cell) => {
      const value = cell.trim().toLowerCase();
      if (EMAIL_PATTERN.test(value)) emails.push(normalisasiEmail(value));
    });
  }

  return emails;
}

async function fetchEnrolledEmails(csvUrls, cutoffDate) {
  const emails = new Set();
  const failures = [];

  // Semua sumber diambil paralel. Satu sumber yang gagal (sheet belum
  // di-publish ulang, jaringan bermasalah, dll.) tidak boleh
  // menggagalkan sumber lain -- makanya try/catch ada di dalam setiap
  // iterasi, bukan membungkus semuanya sekaligus.
  await Promise.all(
    csvUrls.map(async (url) => {
      try {
        const text = await cachedFetch('roster:' + url, CSV_CACHE_TTL_MS, () =>
          fetchTextWithRetry(url)
        );
        extractEmailsFromSheet(text, cutoffDate).forEach((email) => emails.add(email));
      } catch (err) {
        failures.push(url + ' -> ' + err.message);
      }
    })
  );

  if (failures.length > 0) {
    // Tidak menghentikan proses selama ada sumber lain yang berhasil,
    // tapi tetap dicatat supaya kelihatan di Vercel > Functions log
    // kalau salah satu sheet berhenti bisa diakses.
    console.error('Sebagian sumber roster gagal dimuat: ' + failures.join('; '));
  }
  if (emails.size === 0 && failures.length === csvUrls.length) {
    throw new Error('Semua sumber daftar siswa gagal diakses: ' + failures.join('; '));
  }

  return emails;
}

// Nama bulan Indonesia dipakai buat cocokin sel seperti "AGUSTUS" atau
// "SEPTEMBER" di sheet jadwal. Daftar manual, bukan lewat locale bawaan
// JS (mis. toLocaleDateString('id-ID')), karena arahnya kebalik -- di sini
// yang perlu diubah adalah TEKS jadi ANGKA bulan, dan environment server
// tidak dijamin punya data locale id-ID lengkap terpasang.

module.exports = { normalisasiEmail, sudahKedaluwarsa, findColumnIndex, extractEmailsFromSheet, fetchEnrolledEmails, EMAIL_PATTERN, REVOKED_MARKER, KOLOM_BERLAKU_SAMPAI };
