/**
 * Halaman /atur-form: menyusun pertanyaan formulir pendaftaran.
 *
 * Login ditangani admin-auth.js yang dimuat lebih dulu; file ini cuma
 * menyediakan window.onAdminReady.
 *
 * Yang perlu dipahami sebelum mengubah file ini: URUTAN TAMPILAN dan
 * KOLOM SPREADSHEET adalah dua hal berbeda. Halaman ini cuma mengatur
 * urutan tampilan. Kolom ditetapkan server (api/_lib/form-schema.js) dan
 * TIDAK PERNAH ikut berubah, supaya memindahkan pertanyaan tidak
 * menggeser data lama di spreadsheet ke kolom yang salah.
 */

var fields = [];

var LABEL_TIPE = {
  teks: 'Isian singkat',
  teksPanjang: 'Isian panjang',
  email: 'Email',
  telepon: 'Nomor HP',
  pilihan: 'Pilihan',
  upload: 'Unggah gambar',
  paket: 'Pilihan paket',
  peserta: 'Data peserta lain',
};

window.onAdminReady = function (data) {
  document.querySelector('[data-key="daftarTitle"]').value = data.values.daftarTitle || '';
  document.querySelector('[data-key="daftarDesc"]').value = data.values.daftarDesc || '';
  document.querySelector('[data-key="driveFolder"]').value = data.values.driveFolder || '';
  document.querySelector('[data-key="formBukaPada"]').value = data.values.formBukaPada || '';
  document.querySelector('[data-key="formTutupPada"]').value = data.values.formTutupPada || '';
  document.querySelector('[data-key="formPesanTutup"]').value = data.values.formPesanTutup || '';

  var mode = data.values.formMode || 'buka';
  var radio = document.querySelector('input[name="formMode"][value="' + mode + '"]');
  if (radio) radio.checked = true;
  perbaruiMode();

  muatFields();
};

// ============================================================
// BUKA / TUTUP PENDAFTARAN
// ============================================================

function modeTerpilih() {
  var r = document.querySelector('input[name="formMode"]:checked');
  return r ? r.value : 'buka';
}

// Isian tanggal cuma relevan di mode 'jadwal'. Disembunyikan di mode lain
// supaya tidak ada kesan tanggalnya sedang berlaku padahal tidak.
function perbaruiMode() {
  document.getElementById('form-jadwal-isian').hidden = modeTerpilih() !== 'jadwal';
  perbaruiPratinjau();
}

// Terjemahan "2026-09-01T23:59" jadi kalimat Indonesia. Sengaja dihitung
// ulang di sini (bukan meminta ke server) supaya admin langsung melihat
// akibat pilihannya sebelum menekan Simpan.
function formatWibLokal(teks) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(teks || '').trim());
  if (!m) return '';
  var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return Number(m[3]) + ' ' + bulan[Number(m[2]) - 1] + ' ' + m[1] + ' pukul ' + m[4] + '.' + m[5] + ' WIB';
}

function perbaruiPratinjau() {
  var el = document.getElementById('form-status-pratinjau');
  var mode = modeTerpilih();
  var pesan = document.querySelector('[data-key="formPesanTutup"]').value.trim();

  if (mode === 'buka') {
    el.dataset.state = 'buka';
    el.textContent = 'Sekarang: pendaftaran TERBUKA, siapa pun bisa mengisi.';
    return;
  }
  if (mode === 'tutup') {
    el.dataset.state = 'tutup';
    el.textContent =
      'Sekarang: pendaftaran DITUTUP. Pengunjung melihat pesan: "' +
      (pesan || 'Pendaftaran sedang ditutup.') + '"';
    return;
  }

  var buka = formatWibLokal(document.querySelector('[data-key="formBukaPada"]').value);
  var tutup = formatWibLokal(document.querySelector('[data-key="formTutupPada"]').value);
  el.dataset.state = 'jadwal';

  if (!buka && !tutup) {
    // Mode jadwal tanpa satu pun tanggal itu sama saja dengan "buka", dan
    // itu perlu dikatakan terang-terangan supaya admin tidak mengira sudah
    // memasang jadwal padahal belum.
    el.textContent = 'Belum ada tanggal yang diisi, jadi pendaftaran TERBUKA terus.';
    return;
  }
  el.textContent =
    'Terbuka ' + (buka ? 'mulai ' + buka : 'sejak sekarang') +
    (tutup ? ', ditutup ' + tutup : ', tanpa batas akhir') + '.';
}

// Susunan diambil dari endpoint publik yang sama dengan yang dipakai
// /daftar, supaya yang admin lihat di sini persis yang dilihat pendaftar.
// Bedanya di sini SEMUA field ditampilkan, termasuk yang dimatikan.
async function muatFields() {
  try {
    var res = await fetch('/api/atur-form', { headers: authHeaders() });
    var data = await res.json();
    if (res.status === 401) return handleUnauthorized(data.reason);
    if (!res.ok || !data.ok) throw new Error(data.pesan || data.reason || res.status);
    fields = data.fields;
    render();
  } catch (err) {
    document.getElementById('form-list').innerHTML =
      '<p class="admin-hint" style="color:var(--red)">Gagal memuat susunan: ' + err.message + '</p>';
  }
}

function escapeHtml(t) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  var list = document.getElementById('form-list');
  list.textContent = '';

  fields.forEach(function (f, i) {
    var kartu = document.createElement('div');
    kartu.className = 'form-field' + (f.aktif ? '' : ' form-field-mati');

    kartu.innerHTML =
      '<div class="form-field-head">' +
      '<span class="form-field-tipe">' + escapeHtml(LABEL_TIPE[f.tipe] || f.tipe) + '</span>' +
      (f.inti ? '<span class="form-field-kunci" title="Tidak bisa dihapus atau dimatikan">kunci</span>' : '') +
      '<span class="form-field-aksi">' +
      '<button type="button" data-aksi="naik" aria-label="Pindah ke atas"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" data-aksi="turun" aria-label="Pindah ke bawah"' + (i === fields.length - 1 ? ' disabled' : '') + '>↓</button>' +
      (f.inti ? '' : '<button type="button" data-aksi="hapus" class="form-field-hapus" aria-label="Hapus pertanyaan">Hapus</button>') +
      '</span>' +
      '</div>' +
      '<label class="admin-field"><span>Pertanyaan</span>' +
      '<input type="text" data-f="label" value="' + escapeHtml(f.label) + '" /></label>' +
      '<label class="admin-field"><span>Keterangan tambahan (opsional)</span>' +
      '<input type="text" data-f="bantuan" value="' + escapeHtml(f.bantuan || '') + '" /></label>' +
      (f.tipe === 'pilihan'
        ? '<label class="admin-field"><span>Pilihan jawaban, pisahkan dengan koma</span>' +
          '<input type="text" data-f="pilihan" value="' + escapeHtml((f.pilihan || []).join(', ')) + '" /></label>'
        : '') +
      '<div class="form-field-toggle">' +
      '<label class="admin-checkbox"><input type="checkbox" data-f="wajib"' +
      (f.wajib ? ' checked' : '') + (f.inti ? ' disabled' : '') + ' /><span>Wajib diisi</span></label>' +
      '<label class="admin-checkbox"><input type="checkbox" data-f="aktif"' +
      (f.aktif ? ' checked' : '') + (f.inti ? ' disabled' : '') + ' /><span>Tampilkan di formulir</span></label>' +
      '</div>';

    // Tiap ketikan langsung masuk ke state, supaya memindah atau menghapus
    // kartu lain tidak menghilangkan yang sudah diketik (daftar ini
    // digambar ulang penuh setiap kali berubah).
    kartu.querySelectorAll('[data-f]').forEach(function (input) {
      input.addEventListener('input', function () {
        var k = input.dataset.f;
        if (k === 'pilihan') {
          fields[i].pilihan = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        } else if (input.type === 'checkbox') {
          fields[i][k] = input.checked;
          if (k === 'aktif') render(); // kartunya ikut meredup
        } else {
          fields[i][k] = input.value;
        }
      });
      if (input.type === 'checkbox') {
        input.addEventListener('change', function () {
          fields[i][input.dataset.f] = input.checked;
          render();
        });
      }
    });

    kartu.querySelectorAll('[data-aksi]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.dataset.aksi;
        if (a === 'naik' && i > 0) tukar(i, i - 1);
        else if (a === 'turun' && i < fields.length - 1) tukar(i, i + 1);
        else if (a === 'hapus') {
          if (window.confirm('Hapus pertanyaan "' + (fields[i].label || '') + '"? Jawaban lama di spreadsheet tidak ikut terhapus.')) {
            fields.splice(i, 1);
            render();
          }
        }
      });
    });

    list.appendChild(kartu);
  });

  var aktif = fields.filter(function (f) { return f.aktif; }).length;
  document.getElementById('form-jumlah').textContent =
    aktif + ' tampil, ' + fields.length + ' total';
}

function tukar(a, b) {
  var t = fields[a];
  fields[a] = fields[b];
  fields[b] = t;
  render();
}

function tambahField() {
  var tipe = document.getElementById('form-tipe-baru').value;
  fields.push({
    // id dibuat unik dan tidak pernah menabrak id bawaan, karena server
    // memakai id untuk menentukan mana field bawaan (yang kolomnya
    // dikunci) dan mana field tambahan.
    id: 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    label: '',
    tipe: tipe,
    bantuan: '',
    wajib: false,
    aktif: true,
    inti: false,
    pilihan: [],
  });
  render();

  var kartu = document.querySelectorAll('.form-field');
  var terakhir = kartu[kartu.length - 1];
  if (terakhir) {
    terakhir.scrollIntoView({ block: 'center' });
    terakhir.querySelector('[data-f="label"]').focus();
  }
}

function setStatus(state, teks) {
  var el = document.getElementById('form-status');
  el.textContent = teks;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

async function simpan() {
  // Pertanyaan tanpa teks akan tampil sebagai kotak kosong tanpa
  // keterangan di formulir publik, jadi dicegah di sini.
  var kosong = fields.filter(function (f) { return !String(f.label || '').trim(); });
  if (kosong.length > 0) {
    setStatus('error', 'Masih ada ' + kosong.length + ' pertanyaan yang belum diberi teks.');
    return;
  }

  var btn = document.getElementById('form-save');
  btn.disabled = true;
  setStatus(null, 'Menyimpan…');

  // Urutan dikirim sesuai posisi di layar. Kolom spreadsheet TIDAK ikut
  // dikirim; server yang menentukannya, dan untuk field bawaan selalu
  // dipaksa balik ke kolom aslinya.
  var kirim = fields.map(function (f, i) {
    return {
      id: f.id, label: f.label, tipe: f.tipe, bantuan: f.bantuan,
      wajib: f.wajib, aktif: f.aktif, pilihan: f.pilihan || [], urutan: i + 1,
    };
  });

  try {
    var res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        items: {
          formFields: kirim,
          daftarTitle: document.querySelector('[data-key="daftarTitle"]').value,
          daftarDesc: document.querySelector('[data-key="daftarDesc"]').value,
          driveFolder: document.querySelector('[data-key="driveFolder"]').value,
          formMode: modeTerpilih(),
          formBukaPada: document.querySelector('[data-key="formBukaPada"]').value,
          formTutupPada: document.querySelector('[data-key="formTutupPada"]').value,
          formPesanTutup: document.querySelector('[data-key="formPesanTutup"]').value,
        },
      }),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      setStatus('ok', 'Tersimpan. Buka /daftar untuk melihat hasilnya.');
      // Dimuat ulang dari server supaya yang tampil di layar persis yang
      // benar-benar tersimpan setelah dibersihkan server -- termasuk kalau
      // ada field inti yang dikembalikan otomatis.
      muatFields();
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setStatus('error', 'Gagal menyimpan: ' + (data.message || data.pesan || data.reason || res.status));
    }
  } catch (err) {
    setStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('form-tambah-btn').addEventListener('click', tambahField);
  document.querySelectorAll('input[name="formMode"]').forEach(function (r) {
    r.addEventListener('change', perbaruiMode);
  });
  ['formBukaPada', 'formTutupPada', 'formPesanTutup'].forEach(function (k) {
    document.querySelector('[data-key="' + k + '"]').addEventListener('input', perbaruiPratinjau);
  });
  document.getElementById('form-save').addEventListener('click', simpan);
});
