from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Panduan_Penggunaan_PosQue.pdf"

PAGE_W, PAGE_H = A4
BLUE = colors.HexColor("#2563EB")
BLUE_DARK = colors.HexColor("#1E3A8A")
BLUE_LIGHT = colors.HexColor("#EFF6FF")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5F6B7A")
BORDER = colors.HexColor("#D9E2F1")
SUCCESS = colors.HexColor("#047857")
WHITE = colors.white


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=31, leading=35, textColor=WHITE, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=12.5, leading=18, textColor=colors.HexColor("#DBEAFE"),
))
styles.add(ParagraphStyle(
    name="H1Blue", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=19, leading=23, textColor=BLUE_DARK, spaceBefore=2, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="H2Blue", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12.5, leading=16, textColor=BLUE, spaceBefore=9, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodyID", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.2, leading=13.2, textColor=INK, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodySmall", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.2, leading=11.5, textColor=INK,
))
styles.add(ParagraphStyle(
    name="BulletID", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9, leading=12.7, textColor=INK, leftIndent=12, firstLineIndent=-8,
    bulletIndent=2, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="StepNum", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.5, leading=11, textColor=WHITE, alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.8, leading=12.5, textColor=BLUE_DARK,
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.2, leading=10.2, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.8, leading=10.4, textColor=INK,
))


def p(text, style="BodyID"):
    return Paragraph(esc(text), styles[style])


def bullet(text):
    return Paragraph("• " + esc(text), styles["BulletID"])


def heading(text):
    return Paragraph(esc(text), styles["H1Blue"])


def subheading(text):
    return Paragraph(esc(text), styles["H2Blue"])


def callout(title, text, color=BLUE_LIGHT):
    body = Paragraph(f"<b>{esc(title)}</b><br/>{esc(text)}", styles["Callout"])
    table = Table([[body]], colWidths=[170 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def data_table(headers, rows, widths):
    data = [[Paragraph(esc(x), styles["TableHead"]) for x in headers]]
    data.extend([[Paragraph(esc(x), styles["TableCell"]) for x in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def step(number, title, text):
    badge = Table([[Paragraph(str(number), styles["StepNum"])]], colWidths=[8 * mm], rowHeights=[8 * mm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    body = Paragraph(f"<b>{esc(title)}</b><br/>{esc(text)}", styles["BodySmall"])
    row = Table([[badge, body]], colWidths=[11 * mm, 159 * mm])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return row


class PosQueDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
            topMargin=20 * mm, bottomMargin=18 * mm,
            title="Panduan Penggunaan PosQue",
            author="PosQue",
            subject="Panduan operasional aplikasi kasir PosQue",
        )
        normal_frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=20 * mm, rightPadding=20 * mm,
                            topPadding=28 * mm, bottomPadding=20 * mm, id="cover")
        self.addPageTemplates([
            PageTemplate(id="Cover", frames=cover_frame, onPage=self.cover_page),
            PageTemplate(id="Normal", frames=normal_frame, onPage=self.normal_page),
        ])

    def afterPage(self):
        if self.page == 1:
            self.handle_nextPageTemplate("Normal")

    @staticmethod
    def cover_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BLUE_DARK)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canvas.setFillColor(BLUE)
        canvas.circle(PAGE_W - 8 * mm, PAGE_H - 8 * mm, 54 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#60A5FA"))
        canvas.circle(PAGE_W - 5 * mm, 8 * mm, 40 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(colors.HexColor("#93C5FD"))
        canvas.setLineWidth(2)
        canvas.line(20 * mm, 29 * mm, 78 * mm, 29 * mm)
        canvas.restoreState()

    @staticmethod
    def normal_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BLUE_DARK)
        canvas.rect(0, PAGE_H - 8 * mm, PAGE_W, 8 * mm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(BLUE_DARK)
        canvas.drawString(20 * mm, PAGE_H - 14 * mm, "POSQUE - PANDUAN PENGGUNAAN")
        canvas.setStrokeColor(BORDER)
        canvas.line(20 * mm, 13 * mm, PAGE_W - 20 * mm, 13 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 8 * mm, "https://posque.vercel.app")
        canvas.drawRightString(PAGE_W - 20 * mm, 8 * mm, f"Halaman {doc.page - 1}")
        canvas.restoreState()


story = []

# Cover
story.extend([
    Spacer(1, 42 * mm),
    Paragraph("POSQUE", styles["CoverTitle"]),
    Paragraph("Panduan Penggunaan", styles["CoverTitle"]),
    Spacer(1, 4 * mm),
    Paragraph(
        "Panduan operasional untuk Kasir, Kepala Toko, dan Super Admin dalam menjalankan transaksi, master data, stok, stock opname, retur, laporan, serta pengaturan toko.",
        styles["CoverSub"],
    ),
    Spacer(1, 72 * mm),
    Paragraph("VERSI 1.0  |  OKTOBER 2026", styles["CoverSub"]),
    Spacer(1, 3 * mm),
    Paragraph("https://posque.vercel.app", styles["CoverSub"]),
    PageBreak(),
])

# Page 1
story.extend([
    heading("1. Memulai PosQue"),
    p("PosQue adalah aplikasi kasir dan operasional toko berbasis web. Aplikasi dapat dipakai melalui komputer, laptop, tablet, atau ponsel yang memiliki browser dan koneksi internet."),
    callout("Alamat aplikasi", "Buka https://posque.vercel.app. Pengunjung tidak perlu login Vercel dan tidak perlu memasang aplikasi tambahan."),
    Spacer(1, 5 * mm),
    subheading("Jenis pengguna"),
    data_table(
        ["Peran", "Fokus penggunaan", "Catatan akses"],
        [
            ["Kasir", "Transaksi, pembayaran, struk, dan modul operasional yang diberikan.", "Hak menu ditentukan admin."],
            ["Kepala Toko", "Master data, stok, stock opname, retur, laporan, cabang, dan akun kasir.", "Mengelola operasional toko."],
            ["Super Admin", "Akses penuh, akun, cabang, profil, pengaturan, dan koreksi penting.", "Gunakan hanya untuk administrasi."],
        ],
        [30 * mm, 87 * mm, 53 * mm],
    ),
    Spacer(1, 5 * mm),
    subheading("Masuk ke sistem"),
    step(1, "Buka PosQue", "Kunjungi alamat aplikasi melalui browser yang terbaru."),
    step(2, "Isi akun", "Masukkan Username dan Kata Sandi yang diberikan administrator."),
    step(3, "Masuk", "Pilih Masuk ke Sistem dan tunggu data selesai dimuat."),
    step(4, "Periksa akses", "Pastikan menu yang tampil sesuai tugas dan cabang Anda."),
    Spacer(1, 3 * mm),
    callout("Keamanan akun", "Jangan berbagi akun atau kata sandi. Keluar dari aplikasi saat meninggalkan perangkat. Login berulang terlalu cepat dapat dibatasi sementara."),
    PageBreak(),
])

# Page 2
story.extend([
    heading("2. Transaksi Kasir"),
    p("Gunakan alur berikut untuk membuat transaksi baru dengan aman dan konsisten."),
    step(1, "Pilih menu", "Buka Kasir POS, cari produk atau pilih kategori, lalu klik produk yang dipesan."),
    step(2, "Atur pesanan", "Tentukan topping, jumlah, catatan, porsi, atau diskon item jika diperlukan."),
    step(3, "Periksa keranjang", "Pastikan item, jumlah, harga, diskon, pajak, subtotal, dan total sudah benar."),
    step(4, "Isi informasi", "Isi nama pelanggan jika diperlukan, lalu pilih Dine In atau Takeaway."),
    step(5, "Pilih pembayaran", "Gunakan Tunai, QRIS, Kartu Debit, atau Kartu Kredit."),
    step(6, "Selesaikan", "Untuk tunai, masukkan uang diterima dan periksa kembalian. Selesaikan transaksi lalu cetak atau tampilkan struk."),
    Spacer(1, 4 * mm),
    callout("Stok otomatis", "Stok bahan berkurang saat transaksi selesai berdasarkan resep menu dan topping. Produk dapat ditandai habis apabila bahan resep tidak mencukupi."),
    Spacer(1, 6 * mm),
    subheading("Revisi, pembatalan, dan retur"),
    data_table(
        ["Kebutuhan", "Tindakan", "Dampak"],
        [
            ["Revisi", "Buka detail transaksi dan gunakan aksi revisi.", "Item, nilai transaksi, dan struk diperbarui."],
            ["Pembatalan", "Gunakan aksi batal dengan akun berwenang dan isi alasan.", "Status dicatat dan stok dikembalikan sesuai aturan."],
            ["Retur / remake", "Catat pesanan gagal, rusak, salah buat, atau komplain.", "Retur dan perubahan stok masuk audit."],
        ],
        [30 * mm, 72 * mm, 68 * mm],
    ),
    Spacer(1, 4 * mm),
    callout("Prinsip audit", "Jangan menghapus catatan untuk menutupi kesalahan. Gunakan revisi, pembatalan, retur, atau koreksi resmi agar jejak perubahan tetap jelas.", colors.HexColor("#FFF7ED")),
    PageBreak(),
])

# Page 3
story.extend([
    heading("3. Master Data dan Stok"),
    p("Siapkan master data dengan urutan yang benar agar transaksi dan pemotongan stok berjalan akurat."),
    data_table(
        ["Urutan", "Modul", "Isi utama"],
        [
            ["1", "Satuan Ukur", "Gram, kilogram, pcs, bungkus, box, dan satuan lain."],
            ["2", "Kategori Produk", "Kelompok dan urutan produk pada layar Kasir POS."],
            ["3", "Bahan Baku", "Nama, satuan, stok, stok minimum, dan harga beli."],
            ["4", "Topping", "Nama, harga jual, serta resep atau pemakaian bahan."],
            ["5", "Menu Produk", "Nama, kategori, harga, foto, resep, dan topping tersedia."],
        ],
        [18 * mm, 42 * mm, 110 * mm],
    ),
    Spacer(1, 5 * mm),
    callout("Penting", "Resep menentukan pemotongan stok otomatis. Periksa takaran dan satuan sebelum menu mulai dijual."),
    Spacer(1, 5 * mm),
    subheading("Stok bahan baku"),
    bullet("Pantau saldo stok, stok menipis, stok habis, dan estimasi nilai stok."),
    bullet("Catat bahan yang baru datang melalui penambahan stok atau restok."),
    bullet("Catat bahan rusak, kedaluwarsa, tumpah, atau terbuang sebagai waste."),
    bullet("Gunakan adjustment hanya untuk koreksi yang memiliki alasan jelas."),
    bullet("Periksa riwayat mutasi masuk, keluar, transaksi, waste, dan koreksi."),
    Spacer(1, 5 * mm),
    subheading("Jika stok tidak sesuai"),
    step(1, "Jangan langsung mengubah saldo", "Catat bahan dan besar selisih yang ditemukan."),
    step(2, "Periksa riwayat", "Cari transaksi, restok, waste, atau adjustment yang mungkin belum benar."),
    step(3, "Lakukan stock opname", "Masukkan hasil hitung fisik dan kirim untuk diperiksa."),
    step(4, "Koreksi resmi", "Admin menerapkan hasil atau koreksi dengan alasan agar audit trail terjaga."),
    PageBreak(),
])

# Page 4
story.extend([
    heading("4. Stock Opname dan Laporan"),
    subheading("Stock opname untuk Kasir"),
    step(1, "Mulai", "Buka Stock Opname dan mulai pencatatan untuk hari berjalan."),
    step(2, "Hitung fisik", "Isi jumlah aktual setiap bahan. Gunakan pencarian atau filter bahan belum diisi."),
    step(3, "Review", "Periksa kembali bahan, jumlah, serta selisih sebelum mengirim."),
    step(4, "Kirim", "Kirim laporan agar Kepala Toko atau Super Admin dapat memeriksa."),
    Spacer(1, 4 * mm),
    subheading("Pemeriksaan oleh Admin"),
    bullet("Periksa bahan yang cocok, defisit, dan surplus."),
    bullet("Verifikasi penyebab selisih besar dan lakukan koreksi bila diperlukan."),
    bullet("Terapkan serta kunci hasil untuk menyesuaikan saldo stok sistem."),
    Spacer(1, 5 * mm),
    callout("Setelah dikunci", "Perubahan berikutnya harus melalui koreksi admin agar riwayat pemeriksaan tetap dapat diaudit."),
    Spacer(1, 6 * mm),
    subheading("Laporan yang tersedia"),
    data_table(
        ["Laporan", "Isi", "Pemakaian"],
        [
            ["Ringkasan Menu & Topping", "Jumlah terjual, omzet, margin, topping, attach rate.", "Evaluasi performa produk."],
            ["Riwayat Transaksi", "Invoice, kasir, pelanggan, metode bayar, retur, batal, detail.", "Audit dan cetak ulang struk."],
            ["Pengurangan Bahan", "Penjualan, waste, manual out, adjustment, stock opname.", "Melacak pemakaian dan susut."],
        ],
        [45 * mm, 79 * mm, 46 * mm],
    ),
    Spacer(1, 4 * mm),
    p("Gunakan filter periode dan pencarian. Jika data tampak kosong, reset filter atau pilih periode yang lebih luas. Gunakan ekspor Excel atau PDF bila tersedia."),
    PageBreak(),
])

# Page 5
story.extend([
    heading("5. Pengaturan, Akun, dan Cabang"),
    subheading("Pengaturan toko dan struk"),
    bullet("Ubah nama toko, nama aplikasi, tagline, logo, telepon, email, dan alamat."),
    bullet("Atur nama, alamat, kontak, pesan penutup, dan catatan yang tampil pada struk."),
    bullet("Aktifkan atau nonaktifkan pajak, lalu isi nama dan persentasenya."),
    bullet("Tentukan apakah topping dan catatan pesanan dicetak pada struk."),
    bullet("Gunakan pratinjau struk sebelum dipakai untuk transaksi pelanggan."),
    Spacer(1, 3 * mm),
    callout("Nama toko", "Setelah Nama Toko disimpan, judul tab browser mengikuti nama tersebut secara otomatis."),
    Spacer(1, 6 * mm),
    subheading("Akun dan hak akses"),
    bullet("Super Admin dapat membuat Kepala Toko dan Kasir."),
    bullet("Kepala Toko dapat mengelola akun Kasir sesuai kewenangannya."),
    bullet("Tentukan cabang dan izin menu sesuai tugas setiap pengguna."),
    bullet("Nonaktifkan akun pegawai yang sudah tidak bertugas."),
    bullet("Gunakan kata sandi kuat dan berbeda untuk setiap akun."),
    Spacer(1, 6 * mm),
    subheading("Checklist harian"),
    data_table(
        ["Waktu", "Yang harus dilakukan"],
        [
            ["Sebelum buka", "Cek internet, login, stok kritis, menu aktif, harga, pajak, dan printer."],
            ["Saat transaksi", "Konfirmasi item, topping, tipe pesanan, total, pembayaran, dan kembalian."],
            ["Jika ada masalah", "Catat retur atau waste, gunakan revisi resmi, dan simpan informasi kejadian."],
            ["Saat tutup", "Periksa transaksi, cocokkan pembayaran, lakukan stock opname, ekspor laporan, lalu keluar."],
        ],
        [34 * mm, 136 * mm],
    ),
    PageBreak(),
])

# Page 6
story.extend([
    heading("6. Penanganan Masalah"),
    data_table(
        ["Masalah", "Tindakan yang disarankan"],
        [
            ["Tidak bisa login", "Periksa username dan kata sandi, pastikan akun aktif, tunggu jika terlalu banyak percobaan, lalu hubungi admin."],
            ["Menu tidak dapat dipilih", "Periksa status menu dan ketersediaan bahan pada resep menu atau topping."],
            ["Total transaksi salah", "Periksa jumlah item, topping, diskon, dan konfigurasi pajak sebelum pembayaran."],
            ["Stok berbeda dengan fisik", "Periksa riwayat mutasi, transaksi, waste, lalu gunakan stock opname atau koreksi resmi."],
            ["Laporan kosong", "Perluas periode, hapus pencarian, dan reset filter laporan."],
            ["Data belum memperbarui", "Periksa internet dan muat ulang halaman sekali. Hindari menekan Simpan berulang kali."],
            ["Struk tidak tercetak", "Periksa printer, pilihan printer browser, ukuran kertas, dan izin pop-up. Cari transaksi dari riwayat untuk cetak ulang."],
        ],
        [47 * mm, 123 * mm],
    ),
    Spacer(1, 7 * mm),
    subheading("Istilah penting"),
    data_table(
        ["Istilah", "Arti"],
        [
            ["HPP", "Estimasi biaya bahan yang dipakai untuk menghasilkan menu atau topping."],
            ["Attach Rate", "Persentase penjualan menu yang menambahkan topping."],
            ["Mutasi OUT", "Pengurangan stok dari penjualan, waste, pemakaian manual, atau adjustment."],
            ["Stock Opname", "Pencocokan stok fisik aktual dengan saldo stok pada sistem."],
            ["VOID", "Transaksi atau laporan yang dibatalkan sesuai prosedur audit."],
        ],
        [42 * mm, 128 * mm],
    ),
    Spacer(1, 7 * mm),
    callout("Saat meminta bantuan", "Catat waktu kejadian, akun yang digunakan, nomor invoice, langkah sebelum masalah muncul, dan tangkapan layar. Jangan pernah mengirimkan kata sandi."),
    Spacer(1, 10 * mm),
    Paragraph("PosQue", ParagraphStyle(
        "EndBrand", parent=styles["H1Blue"], fontSize=22, alignment=TA_CENTER, textColor=BLUE_DARK,
    )),
    Paragraph("Kasir lebih tertata, operasional lebih mudah dipantau.", ParagraphStyle(
        "EndSub", parent=styles["BodyID"], alignment=TA_CENTER, textColor=MUTED,
    )),
])


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
PosQueDoc(str(OUTPUT)).build(story)
print(OUTPUT)

