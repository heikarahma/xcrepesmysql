# Panduan Penggunaan PosQue

Versi 1.0 - Oktober 2026  
Aplikasi: [https://posque.vercel.app](https://posque.vercel.app)

## 1. Tentang PosQue

PosQue adalah aplikasi kasir dan operasional toko berbasis web. Sistem mencakup transaksi penjualan, pengelolaan menu dan topping, stok bahan baku, stock opname, retur, laporan, akun pengguna, cabang, serta pengaturan toko dan struk.

PosQue dapat dibuka melalui komputer, laptop, tablet, atau ponsel yang memiliki browser dan koneksi internet. Pengguna tidak perlu memasang aplikasi tambahan.

## 2. Jenis pengguna

| Peran | Kegunaan utama |
| --- | --- |
| Kasir | Membuat pesanan, menerima pembayaran, mencetak struk, dan memakai modul yang diberikan oleh admin. |
| Kepala Toko | Mengelola operasional toko, master data, stok, stock opname, retur, laporan, cabang yang ditugaskan, dan akun kasir. |
| Super Admin | Akses penuh ke seluruh modul, profil administrator, akun pengguna, cabang, pengaturan, dan tindakan koreksi penting. |

Hak menu akun Kasir dapat berbeda karena ditentukan oleh Kepala Toko atau Super Admin.

## 3. Masuk dan keluar

### Masuk

1. Buka `https://posque.vercel.app`.
2. Isi **Username** dan **Kata Sandi**.
3. Pilih **Masuk ke Sistem**.
4. Tunggu hingga data aplikasi selesai dimuat.

Jika login gagal, periksa kembali huruf besar-kecil, pastikan akun masih aktif, lalu hubungi Kepala Toko atau Super Admin. Percobaan login berulang terlalu cepat dapat dibatasi sementara demi keamanan.

### Keluar

1. Buka bagian profil pada sidebar.
2. Pilih **Keluar**.
3. Jangan meninggalkan perangkat kasir dalam keadaan akun masih terbuka.

## 4. Alur transaksi kasir

1. Buka menu **Kasir POS**.
2. Cari produk atau pilih kategori.
3. Pilih kartu menu yang dipesan.
4. Tentukan topping, jumlah, catatan, atau diskon item jika diperlukan.
5. Tambahkan produk ke keranjang.
6. Isi nama pelanggan bila diperlukan.
7. Pilih **Dine In** atau **Takeaway**.
8. Periksa item, jumlah, diskon, pajak, subtotal, dan total.
9. Pilih tombol pembayaran.
10. Pilih metode **Tunai**, **QRIS**, **Kartu Debit**, atau **Kartu Kredit**.
11. Untuk pembayaran tunai, masukkan uang yang diterima dan periksa kembalian.
12. Selesaikan transaksi, lalu cetak atau tampilkan struk.

Produk yang bahan resepnya tidak mencukupi dapat ditandai habis dan tidak dapat dipesan. Jangan memaksa transaksi sebelum stok atau resep diperbaiki.

## 5. Revisi, pembatalan, dan retur

- **Revisi pesanan** dipakai saat detail transaksi perlu diperbaiki. Periksa ulang item dan total sebelum menyimpan revisi.
- **Pembatalan transaksi** hanya dilakukan oleh pengguna yang berwenang. Sistem mencatat status transaksi dan mengembalikan stok sesuai aturan.
- **Retur atau remake** dipakai untuk pesanan gagal, gosong, rusak, salah pembuatan, atau komplain pelanggan.
- Isi alasan secara jelas agar laporan dan audit stok mudah diperiksa.
- Jangan menghapus catatan transaksi untuk menutupi kesalahan operasional.

## 6. Master data

Urutan pengisian yang disarankan:

1. **Satuan Ukur** - contoh: gram, kilogram, pcs, bungkus, dan box.
2. **Kategori Produk** - menentukan kelompok dan urutan menu di layar kasir.
3. **Bahan Baku** - isi nama, satuan, stok, batas stok minimum, dan harga beli.
4. **Topping** - isi nama, harga jual, serta resep atau penggunaan bahan.
5. **Menu Produk** - isi nama, kategori, harga, foto, resep bahan, dan topping yang dapat dipilih.

Resep menu dan topping menentukan pemotongan stok otomatis. Pastikan takaran dan satuan sudah benar sebelum menu mulai dijual.

## 7. Stok bahan baku

- Gunakan **Stok Bahan Baku** untuk melihat saldo, stok menipis, stok habis, dan estimasi nilai stok.
- Gunakan penambahan stok untuk mencatat bahan yang baru datang.
- Gunakan adjustment hanya untuk koreksi yang dapat dijelaskan.
- Catat bahan rusak, kedaluwarsa, tumpah, atau terbuang melalui pencatatan waste.
- Buka riwayat stok untuk melihat mutasi masuk, keluar, transaksi otomatis, waste, dan koreksi.

Stok berkurang otomatis saat transaksi selesai berdasarkan resep menu dan topping. Jika saldo tidak sesuai fisik, periksa riwayat stok sebelum melakukan koreksi.

## 8. Stock opname

### Untuk Kasir

1. Buka menu **Stock Opname**.
2. Pilih atau mulai pencatatan untuk hari berjalan.
3. Hitung stok fisik setiap bahan dan isi jumlah aktual.
4. Gunakan pencarian atau filter bahan yang belum diisi.
5. Buka halaman review dan periksa kembali selisih.
6. Kirim laporan stock opname.

### Untuk Kepala Toko atau Super Admin

1. Buka laporan stock opname yang dikirim.
2. Periksa bahan yang cocok, defisit, dan surplus.
3. Verifikasi alasan bila ada perbedaan besar.
4. Lakukan koreksi administratif bila diperlukan.
5. Terapkan dan kunci hasil agar saldo stok sistem menyesuaikan.

Setelah laporan diterapkan atau dikunci, gunakan prosedur koreksi admin agar audit trail tetap jelas.

## 9. Laporan

PosQue menyediakan beberapa laporan utama:

- **Ringkasan Menu dan Topping** untuk jumlah terjual, omzet, menu populer, topping, margin, dan attach rate.
- **Riwayat Transaksi** untuk invoice, kasir, pelanggan, tipe pesanan, metode bayar, status retur atau batal, dan detail item.
- **Pengurangan Bahan Baku** untuk penggunaan bahan dari penjualan, waste, pengeluaran manual, adjustment, dan stock opname.

Gunakan filter periode, pencarian, serta ekspor Excel atau PDF jika tersedia. Reset filter terlebih dahulu apabila laporan tampak kosong.

## 10. Akun, cabang, dan hak akses

- Super Admin dapat membuat Kepala Toko dan Kasir.
- Kepala Toko dapat mengelola akun Kasir sesuai kewenangannya.
- Tentukan cabang serta izin menu sesuai pekerjaan pengguna.
- Nonaktifkan akun pegawai yang sudah tidak bertugas.
- Jangan berbagi akun Super Admin.
- Gunakan kata sandi yang kuat dan berbeda untuk setiap akun.

## 11. Pengaturan toko dan struk

Pada menu **Pengaturan**, administrator dapat mengubah:

- nama toko, nama aplikasi, tagline, logo, telepon, email, dan alamat;
- identitas yang dicetak pada struk;
- status, nama, dan persentase pajak;
- informasi topping dan catatan pesanan pada struk;
- pesan penutup dan catatan bawah struk.

Setelah menyimpan Nama Toko, judul tab browser ikut berubah otomatis. Gunakan pratinjau struk sebelum dipakai untuk transaksi pelanggan.

## 12. Checklist operasional

### Sebelum toko buka

- Pastikan internet stabil dan PosQue dapat dibuka.
- Login dengan akun masing-masing.
- Periksa stok bahan kritis dan produk yang aktif.
- Pastikan harga, pajak, serta printer struk sudah benar.

### Saat operasional

- Konfirmasi item, topping, tipe pesanan, dan total kepada pelanggan.
- Catat waste dan retur segera setelah kejadian.
- Jangan meminjam akun pengguna lain.

### Saat tutup toko

- Periksa transaksi hari berjalan.
- Cocokkan penerimaan Tunai, QRIS, Debit, dan Kredit.
- Lakukan stock opname.
- Periksa selisih stok dan catat alasannya.
- Ekspor laporan bila diperlukan, lalu keluar dari aplikasi.

## 13. Penanganan masalah

| Masalah | Tindakan |
| --- | --- |
| Tidak bisa login | Periksa username dan kata sandi, pastikan akun aktif, tunggu sebentar jika terlalu banyak percobaan, lalu hubungi admin. |
| Menu tidak dapat dipilih | Periksa apakah bahan resep habis atau menu sedang tidak aktif. |
| Total transaksi salah | Periksa jumlah item, topping, diskon, dan konfigurasi pajak sebelum membayar. |
| Stok berbeda dengan fisik | Periksa riwayat mutasi, transaksi, waste, lalu lakukan stock opname atau koreksi resmi. |
| Laporan kosong | Ubah periode, hapus kata kunci pencarian, dan reset filter. |
| Halaman tidak memperbarui data | Muat ulang halaman sekali dan periksa koneksi internet. Hindari menekan tombol simpan berulang kali. |
| Struk tidak tercetak | Periksa printer, pilihan printer browser, ukuran kertas, dan izin pop-up. Transaksi tetap dapat dicari dari riwayat. |

## 14. Istilah penting

- **HPP**: estimasi biaya bahan yang digunakan untuk menghasilkan menu atau topping.
- **Attach Rate**: persentase penjualan menu yang menambahkan topping.
- **Mutasi OUT**: pengurangan stok karena penjualan, waste, pemakaian manual, atau adjustment.
- **Stock Opname**: pencocokan jumlah fisik dengan saldo stok pada sistem.
- **VOID**: transaksi atau laporan yang dibatalkan sesuai prosedur audit.

## 15. Bantuan

Jika terjadi masalah yang tidak terselesaikan, catat waktu kejadian, akun yang digunakan, nomor invoice jika ada, langkah sebelum masalah muncul, serta tangkapan layar. Kirim informasi tersebut kepada administrator sistem tanpa menyertakan kata sandi.

