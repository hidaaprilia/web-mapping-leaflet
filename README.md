# Web Mapping System — BPS Kabupaten Tanjung Jabung Barat

Aplikasi peta web interaktif (*Client-Side Web GIS*) untuk visualisasi batas spasial Blok Sensus (BS), Satuan Lingkungan Setempat (SLS), dan Batas Desa di Kabupaten Tanjung Jabung Barat.

Aplikasi ini dibangun menggunakan arsitektur **statis murni (HTML5, CSS3, JavaScript modern, dan Leaflet.js)** tanpa ketergantungan server backend Python.

---

## 🚀 Fitur & Pembaruan Sistem

1. **Warna Layer Standar**:
   - **Blok Sensus (BS)**: Warna **Hijau** (`#22c55e` / stroke `#15803d`).
   - **Satuan Lingkungan Setempat (SLS)**: Warna **Biru** (`#3b82f6` / stroke `#1d4ed8`).
   - **Batas Desa (Overlay)**: Garis batas putus-putus warna oranye.
   - **Target Cocok / Survei**: Poligon disorot warna **Merah** mencolok.
2. **Pilihan Basemap**:
   - **Google Satellite Hybrid** (Citra satelit resolusi tinggi dengan jalan & label).
   - **Bing Satellite** (Citra satelit Microsoft Bing Maps resolusi tinggi).
   - **Esri World Imagery**.
   - **OpenStreetMap Standard**.
3. **Sistem Autentikasi Pengguna (Login Petugas BPS)**:
   - **Mode Tamu (Tanpa Login)**: Akses umum untuk eksplorasi peta, filter wilayah (Kecamatan/Desa), pencarian ID, dan statistik dasar.
   - **Mode Petugas (Setelah Login)**:
     - Akses penuh ke **Histori Survei Lapangan**.
     - Memuat (*load*) riwayat survei sebelumnya langsung ke peta dengan status progres (Selesai/Proses).
     - Menyimpan target wilayah dan filter aktif saat ini sebagai survei baru ke penyimpanan lokal (*LocalStorage*).
     - Menghapus riwayat survei lama.
     - Login cepat dengan akun demo Pengawas Lapangan (PML) atau Petugas Pencacah (PCL).
4. **Pencarian & Upload Sampel**:
   - Input instan IDBS / IDSLS.
   - Upload file Excel (`.xlsx`) atau `.csv` daftar sampel untuk menyorot poligon target di peta secara otomatis.
5. **Drawer Tabel Data & Ekspor**:
   - Tampilan data tabular interaktif dengan tombol **Fokus** ke poligon di peta.
   - Ekspor data terfilter ke format CSV dan salin semua ID ke clipboard.

---

## 💻 Cara Menjalankan Secara Lokal

Buka Terminal pada folder ini dan jalankan:
```bash
cd "/Users/hiden/Documents/BPS Tanjung Jabung Barat/2026/koding/web-mapping-leaflet"
python3 -m http.server 8000
```
Buka peramban di: **`http://localhost:8000`**

---

## ⚡ Panduan Deploy ke Vercel (Gratis & Cepat 24/7)

### Cara 1: Menggunakan GitHub + Dashboard Vercel (Rekomendasi)
1. Inisialisasi Git dan upload folder ini ke GitHub:
   ```bash
   cd "/Users/hiden/Documents/BPS Tanjung Jabung Barat/2026/koding/web-mapping-leaflet"
   git init
   git add .
   git commit -m "Siap deploy ke Vercel"
   git branch -M main
   git remote add origin https://github.com/<username-anda>/web-mapping-tanjabbar.git
   git push -u origin main
   ```
2. Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
3. Klik tombol **"Add New..."** -> **"Project"**.
4. Pilih repositori **`web-mapping-tanjabbar`**, pada Framework Preset pilih **"Other"**.
5. Klik **"Deploy"**. Dalam 10-20 detik situs akan aktif di domain gratis `https://web-mapping-tanjabbar.vercel.app`.

### Cara 2: Langsung Menggunakan Terminal (Vercel CLI)
Jalankan perintah ini di Terminal tanpa perlu instalasi rumit:
```bash
cd "/Users/hiden/Documents/BPS Tanjung Jabung Barat/2026/koding/web-mapping-leaflet"
npx vercel --prod
```
Ikuti instruksi singkat di layar untuk login dan menentukan nama proyek.

---

## 🌐 Panduan Deploy Alternatif (GitHub Pages)

1. Inisialisasi Git dan commit file:
   ```bash
   git init
   git add .
   git commit -m "Update Web Mapping System dengan Bing Satellite, warna BS/SLS, dan Login Pengguna"
   ```
2. Hubungkan ke repositori GitHub Anda:
   ```bash
   git remote add origin https://github.com/<username-anda>/web-mapping-tanjabbar.git
   git branch -M main
   git push -u origin main
   ```
3. Buka **Settings** -> **Pages** di repositori GitHub Anda, pilih Branch `main`, lalu klik **Save**.
4. Situs Anda akan online 24/7 tanpa batas waktu inaktivitas!
