import formidable from 'formidable';
import { PDFDocument } from 'pdf-lib';
import archiver from 'archiver';
import fs from 'fs';

// Vercel config: matikan body parser bawaan karena kita pakai formidable untuk file upload
export const config = {
    api: { bodyParser: false }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const form = formidable({ multiples: true });

    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Gagal memproses form data' });

        try {
            // Normalisasi input: memastikan selalu menjadi array
            const uploadedFiles = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];
            const level = fields.level ? fields.level[0] : 'medium';
            const maxMb = fields.maxMb ? parseFloat(fields.maxMb[0]) : null;

            if (uploadedFiles.length === 0) {
                return res.status(400).json({ error: 'Tidak ada file PDF yang diunggah' });
            }

            // Jika hanya 1 file, kembalikan langsung sebagai PDF
            if (uploadedFiles.length === 1) {
                const pdfData = await processPDF(uploadedFiles[0].filepath, level, maxMb);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="compressed_${uploadedFiles[0].originalFilename}"`);
                return res.send(Buffer.from(pdfData));
            }

            // Jika lebih dari 1 file (Batch Processing), kembalikan sebagai ZIP
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename="compressed_pdfs.zip"');
            
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(res);

            for (const file of uploadedFiles) {
                const pdfData = await processPDF(file.filepath, level, maxMb);
                archive.append(Buffer.from(pdfData), { name: `compressed_${file.originalFilename}` });
            }

            await archive.finalize();

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Terjadi kesalahan saat kompresi file' });
        }
    });
}

// Fungsi kompresi murni JS menggunakan pdf-lib
async function processPDF(filePath, level, maxMb) {
    const existingPdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    // Logika optimasi struktural
    // Menghapus metadata, memperbarui stream object untuk mengurangi ukuran
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    // Anda bisa mengembangkan logika "Level" dan "Max MB" di sini di masa depan
    // Menggunakan opsi useObjectStreams: true adalah kunci kompresi struktural pdf-lib
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return pdfBytes;
}
