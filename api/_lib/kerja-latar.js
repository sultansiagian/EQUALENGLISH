/**
 * Menjalankan pekerjaan yang boleh selesai SETELAH balasan dikirim ke
 * pengunjung, tanpa pekerjaan itu ikut hilang di tengah jalan.
 *
 * ============================================================
 * KENAPA INI PERLU
 * ============================================================
 * Di Vercel, begitu res.json() selesai, fungsi serverless-nya dibekukan.
 * Promise yang saat itu masih menggantung TIDAK dijamin ikut selesai:
 * fetch yang baru mau berangkat bisa berhenti persis di tengah jalan dan
 * tidak pernah sampai ke tujuan.
 *
 * Artinya pola "panggil tanpa await lalu langsung balas" tidak bisa
 * dipakai apa adanya. Pola itu kelihatan jalan waktu dicoba sekali dua
 * kali (kadang request-nya keburu berangkat sebelum dibekukan), lalu
 * diam-diam meleset di produksi. Itu bentuk kegagalan yang paling buruk:
 * tidak ada error, tidak ada gejala, emailnya cuma tidak pernah datang.
 *
 * waitUntil() menunda pembekuan itu sampai promise-nya selesai.
 * Pengunjung tetap menerima balasannya seketika.
 *
 * ============================================================
 * KENAPA SIMBOLNYA DIBACA LANGSUNG, BUKAN LEWAT @vercel/functions
 * ============================================================
 * Paket itu isinya persis satu baris yang sama dengan di bawah, dan
 * fungsi waitUntil-nya memakai optional chaining: di luar konteks request
 * ia DIAM-DIAM tidak melakukan apa-apa, bukan melempar error. Jadi paket
 * itu tidak bisa dipakai untuk mengetahui apakah pekerjaannya benar-benar
 * dititipkan atau hilang begitu saja -- padahal justru itu yang perlu
 * diketahui di sini untuk memutuskan perlu tidaknya cara cadangan.
 * Membaca konteksnya sendiri memberi jawaban itu, dan sekalian tidak
 * menambah dependency baru.
 */

// Simbol yang dipasang runtime Vercel di globalThis. Ini juga persis yang
// dipakai @vercel/functions di dalamnya.
const SIMBOL_KONTEKS = Symbol.for('@vercel/request-context');

// Cukup longgar untuk satu panggilan Apps Script yang lambat (biasanya
// 1-3 detik), masih jauh di bawah batas waktu fungsi Vercel.
const BATAS_TUNGGU_MS = 8000;

function ambilWaitUntil() {
  try {
    const wadah = globalThis[SIMBOL_KONTEKS];
    const konteks = wadah && typeof wadah.get === 'function' ? wadah.get() : null;
    return konteks && typeof konteks.waitUntil === 'function' ? konteks.waitUntil : null;
  } catch (err) {
    return null;
  }
}

function jeda(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {() => Promise<any>} buatTugas  fungsi yang memulai pekerjaannya
 * @param {string} label                  nama pendek untuk catatan log
 *
 * Pemanggil WAJIB meng-await ini sebelum mengirim balasan, walaupun
 * maksudnya justru supaya tidak menunggu. Yang di-await bukan
 * pekerjaannya, melainkan penitipan pekerjaan itu ke runtime, dan itu
 * harus terjadi selagi request-nya masih hidup.
 *
 * Kalau penitipan tidak tersedia (dijalankan di luar Vercel, atau
 * runtime-nya berubah), pekerjaannya DITUNGGU biasa dengan batas waktu.
 * Lebih lambat buat yang menunggu di layar, tapi benar-benar terkirim.
 * Batas waktunya menjaga supaya pekerjaan yang macet tidak ikut menahan
 * permintaan aslinya selamanya.
 *
 * Tidak pernah melempar. Kegagalan pekerjaannya dicatat ke log dan
 * berhenti di situ, karena semua pemakainya memang memperlakukan
 * kegagalan itu sebagai hal yang tidak menggagalkan apa pun.
 */
async function kerjakanDiLatar(buatTugas, label) {
  const tugas = Promise.resolve()
    .then(buatTugas)
    .catch((err) => {
      console.error('kerja-latar (' + label + ') gagal: ' + err.message);
    });

  const waitUntil = ambilWaitUntil();
  if (waitUntil) {
    try {
      waitUntil(tugas);
      return;
    } catch (err) {
      console.error('kerja-latar: waitUntil ditolak, ditunggu biasa: ' + err.message);
    }
  }

  await Promise.race([tugas, jeda(BATAS_TUNGGU_MS)]);
}

module.exports = { kerjakanDiLatar };
