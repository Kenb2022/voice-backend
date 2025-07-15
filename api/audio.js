const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const speech = require('@google-cloud/speech');
const wav = require('wav-decoder');
const ffmpeg = require('fluent-ffmpeg'); // Thêm dòng này

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
async function isAudioLoudEnough(filePath, threshold = 0.005) { // Giảm threshold
    try {
        const buffer = fs.readFileSync(filePath);
        // Log header file để kiểm tra định dạng
        console.log('🔎 File header:', buffer.slice(0, 32).toString('hex'));
        const audioData = await wav.decode(buffer);
        const channelData = audioData.channelData[0];
        const energy = channelData.reduce((sum, sample) => sum + Math.abs(sample), 0) / channelData.length;
        console.log('🔎 Energy:', energy); // Log năng lượng để debug
        return energy > threshold;
    } catch (err) {
        console.error('❌ Lỗi kiểm tra năng lượng file:', err); // Log lỗi chi tiết
        throw err;
    }
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

        const inputPath = req.file.path;
        const wavPath = path.join(os.tmpdir(), `${req.file.filename}-converted.wav`);
        ffmpeg(inputPath)
            .output(wavPath)
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(44100)
            .on('end', async () => {
                fs.unlink(inputPath, () => { });
                try {
                    const loudEnough = await isAudioLoudEnough(wavPath);
                    if (!loudEnough) {
                        console.error('❌ File quá nhỏ hoặc không rõ tiếng');
                        fs.unlink(wavPath, () => { });
                        return res.status(400).json({ error: 'File ghi âm không rõ tiếng hoặc quá nhỏ' });
                    }
                } catch (checkErr) {
                    console.error('❌ Lỗi kiểm tra năng lượng file:', checkErr);
                    fs.unlink(wavPath, () => { });
                    return res.status(400).json({ error: 'Không thể kiểm tra file ghi âm' });
                }

                try {
                    const text = await transcribeAudio(wavPath);
                    fs.unlink(wavPath, () => { });
                    console.log('📄 Văn bản nhận dạng:', text);
                    return res.status(200).json({
                        text,
                        filename: req.file.originalname,
                        size: req.file.size,
                    });
                } catch (error) {
                    console.error('❌ Lỗi nhận dạng giọng nói:', error);
                    fs.unlink(wavPath, () => { });
                    return res.status(500).json({ error: 'Không thể nhận dạng giọng nói' });
                }
            })
            .on('error', (ffErr) => {
                console.error('❌ Lỗi chuyển đổi audio bằng ffmpeg:', ffErr);
                fs.unlink(inputPath, () => { });
                fs.unlink(wavPath, () => { });
                res.status(500).json({ error: 'Lỗi chuyển đổi audio', detail: ffErr.message });
            })
            .run();
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

// API chuyển đổi audio sang WAV PCM 16-bit mono
module.exports.convert = (req, res) => {
    const uploadConvert = multer({ dest: os.tmpdir() }).single('audio');
    uploadConvert(req, res, (err) => {
        if (err || !req.file) {
            return res.status(400).json({ error: 'Upload thất bại hoặc thiếu file audio' });
        }
        const inputPath = req.file.path;
        const outputPath = path.join(os.tmpdir(), `${req.file.filename}-converted.wav`);
        ffmpeg(inputPath)
            .output(outputPath)
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(44100)
            .on('end', () => {
                res.sendFile(outputPath, err => {
                    fs.unlink(inputPath, () => { });
                    fs.unlink(outputPath, () => { });
                });
            })
            .on('error', (ffErr) => {
                fs.unlink(inputPath, () => { });
                fs.unlink(outputPath, () => { });
                res.status(500).json({ error: 'Lỗi chuyển đổi audio', detail: ffErr.message });
            })
            .run();
    });
};
