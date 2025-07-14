const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os'); // Thêm dòng này
const speech = require('@google-cloud/speech');

let client;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    client = new speech.SpeechClient({
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    });
} else {
    client = new speech.SpeechClient({
        keyFilename: path.join(__dirname, '../Ggkey/google-stt-key.json')
    });
}

// Ghi file tạm vào thư mục tạm của hệ điều hành
const upload = multer({ dest: os.tmpdir() }); // Sửa lại dòng này

// Hàm STT
async function transcribeAudio(filePath) {
    let audioBytes;
    try {
        audioBytes = fs.readFileSync(filePath).toString('base64');
    } catch (err) {
        console.error('❌ Lỗi đọc file audio:', err);
        throw err;
    }

    const request = {
        audio: { content: audioBytes },
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 44100,
            languageCode: 'vi-VN',
        },
    };

    const [response] = await client.recognize(request);
    const transcription = response.results.map(r => r.alternatives[0].transcript).join('\n');
    return transcription;
}

// Serverless handler cho Vercel
module.exports = (req, res) => {
    upload.single('audio')(req, res, async (err) => {
        if (err || !req.file) {
            console.error('❌ Lỗi upload file:', err);
            return res.status(400).json({ error: 'Upload thất bại hoặc thiếu file ghi âm' });
        }

        const filePath = req.file.path;
        console.log('✅ Đã nhận file:', req.file.originalname, 'at', filePath, 'size:', req.file.size);

        try {
            const text = await transcribeAudio(filePath);

            // Xóa file tạm
            fs.unlink(filePath, (err) => {
                if (err) console.warn('❗Không thể xóa file tạm:', err);
            });

            console.log('📄 Văn bản nhận dạng:', text);
            return res.status(200).json({
                text,
                filename: req.file.originalname,
                size: req.file.size,
            });
        } catch (error) {
            console.error('❌ STT error:', error);
            return res.status(500).json({ error: 'Không thể nhận dạng giọng nói' });
        }
    });
};
