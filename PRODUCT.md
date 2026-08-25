# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mahasiswa S1 Universitas Indonesia (mulai ekspansi ke kampus lain) yang sedang
mengejar target skor EPT UI (setara TOEFL), banyak dari jurusan non-bahasa,
butuh persiapan cepat sebelum ujian tanpa pendekatan yang intimidatif.

## Product Purpose

Bootcamp intensif 10 hari yang mempersiapkan mahasiswa UI buat EPT UI
(listening/reading/writing) lewat sesi Zoom langsung dibimbing SATU mentor
bersertifikat asli (IELTS 8, EPT UI 673), dilengkapi kuis latihan interaktif,
rekaman sesi tak terbatas, dan komunitas WhatsApp pendamping.

## Positioning

Beda dari kursus bahasa Inggris umum (kelas besar, materi generik, "gym
membership"): EQUAL fokus sempit ke EPT UI spesifik, dipandu satu mentor yang
skornya nyata dan terverifikasi (bukan cuma label "bersertifikat"), formatnya
padat (10 hari, bukan berbulan-bulan), dan latihannya dikemas sebagai kuis
interaktif (fun quiz), bukan drill soal.

## Operating Context

Siswa daftar (Google Form, atau dicatat manual kalau bayar duluan) → masuk
roster sheet → login `kelas.html` pakai akun Google yang emailnya cocok
dengan roster → akses materi (link Zoom yang dipakai berulang, folder Drive
rekaman + materi, grup WhatsApp, jadwal sesi, kuis latihan Wayground per
skill R/L/W, pengumuman). Batch berganti secara berkala; materi, jadwal, dan
harga diedit langsung oleh pemilik lewat Google Sheets tanpa sentuh kode.

## Capabilities and Constraints

Situs statis vanilla HTML/CSS/JS tanpa build step/npm (keputusan teknis yang
disengaja, dipertahankan — tidak ada Node/npm terpasang di mesin developer).
Vercel serverless function menangani gerbang login (verifikasi token Google +
cek roster). Google Sheets berfungsi sebagai "CMS" ringan yang bisa diedit
non-teknis: roster siswa, jadwal kelas, materi (link Zoom/Drive/WA/kuis +
pengumuman), dan sebagian konten `index.html` (section Bootcamp, Pilihan
Paket, Mentor).

## Brand Commitments

Nama "EQUAL English". Copy Bahasa Indonesia saja, gaya casual-akrab, tanpa
em dash, tanpa klaim statistik yang dikarang. Identitas visual `index.html`
dan gerbang login `kelas.html` (`.kelas-hero`) sudah mapan: font Syne
(display) + DM Sans (body dan label; DM Mono DIBUANG 2026-08-25 atas
permintaan pemilik, font monospace tidak dipakai lagi di mana pun), palet pink (#ffacdf) /
hitam / paper cream (#f7f5f2) — hasil banyak sesi kolaborasi sebelumnya.
Kredensial mentor (IELTS 8/9, EPT UI 673/674) adalah fakta terverifikasi,
tidak boleh diubah atau dikarang.

## Evidence on Hand

Kredensial skor mentor asli (IELTS 8 dari 9, EPT UI 673 dari 674). Statistik
"130 siswa sudah dibantu" di homepage (real, sudah live di situs). Harga
paket nyata (Individual/Pair/Group). Section testimonial sengaja
dinonaktifkan sampai ada kutipan asli dari siswa — jangan dikarang.

## Product Principles

1. Kecil dan personal mengalahkan besar dan generik — satu mentor asli,
   bukan tim anonim.
2. Bukti nyata, bukan klaim dikarang — skor mentor asli, statistik asli,
   testimoni cuma dipasang kalau beneran nyata.
3. Non-teknis harus bisa jalanin sendiri — materi/jadwal/harga harus bisa
   diubah pemilik tanpa sentuh kode atau minta bantuan developer.
4. Fokus sempit, hasil cepat — EPT UI spesifik, format padat 10 hari, bukan
   kursus umum berbulan-bulan.
5. Ringan secara teknis — zero build step, minim dependency, gampang
   di-maintain solo.

## Accessibility & Inclusion

Tidak ada requirement khusus yang established secara eksplisit; ikuti
standar web wajar (situs sudah punya alt text dan focus-visible state yang
cukup baik per polish pass sebelumnya).
