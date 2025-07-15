const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os'); // Thêm dòng này
const speech = require('@google-cloud/speech');
const wav = require('wav-decoder'); // Thêm dòng này

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

// Hàm kiểm tra năng lượng trung bình của file WAV
async function isAudioLoudEnough(filePath, threshold = 0.01) {
    const buffer = fs.readFileSync(filePath);
    const audioData = await wav.decode(buffer);
    const channelData = audioData.channelData[0]; // Lấy kênh đầu tiên
    const energy = channelData.reduce((sum, sample) => sum + Math.abs(sample), 0) / channelData.length;
    return energy > threshold;
}

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

        // Kiểm tra năng lượng file audio
        try {
            const loudEnough = await isAudioLoudEnough(filePath);
            if (!loudEnough) {
                fs.unlink(filePath, () => { });
                return res.status(400).json({ error: 'File ghi âm không rõ tiếng hoặc quá nhỏ' });
            }
        } catch (checkErr) {
            fs.unlink(filePath, () => { });
            return res.status(400).json({ error: 'Không thể kiểm tra file ghi âm' });
        }

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

// Thêm đoạn này ở cuối file
module.exports.getAudio = (req, res) => {
    const { filename } = req.query;
    if (!filename) return res.status(400).json({ error: 'Thiếu tên file' });
    const filePath = path.join(os.tmpdir(), filename);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).json({ error: 'Không tìm thấy file ghi âm' });
        res.sendFile(filePath);
    });
};
