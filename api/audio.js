const fs = require('fs');
const path = require('path');
const multer = require('multer');
const speech = require('@google-cloud/speech');
const tts = require('@google-cloud/text-to-speech');
const util = require('util');

const upload = multer({ dest: '/tmp' });

// Khởi tạo Speech-to-Text
const speechClient = new speech.SpeechClient({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || fs.readFileSync(path.join(__dirname, '../Ggkey/google-stt-key.json')))
});

// Khởi tạo Text-to-Speech
const ttsClient = new tts.TextToSpeechClient({
    credentials: JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS_JSON || fs.readFileSync(path.join(__dirname, '../Ggkey/google-tts-key.json')))
});

// Hàm chuyển âm thanh thành văn bản
async function transcribeAudio(filePath) {
    const audioBytes = fs.readFileSync(filePath).toString('base64');

    const request = {
        audio: { content: audioBytes },
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 44100,
            languageCode: 'vi-VN',
        },
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results.map(r => r.alternatives[0].transcript).join('\n');
    return transcription;
}

// Hàm chuyển văn bản thành âm thanh
async function synthesizeSpeech(text, filePath) {
    const request = {
        input: { text },
        voice: { languageCode: 'vi-VN', ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    fs.writeFileSync(filePath, response.audioContent, 'binary');
    console.log('✅ Đã tạo file TTS:', filePath);
}

// Handler API chính
module.exports = (req, res) => {
    upload.single('audio')(req, res, async (err) => {
        if (err || !req.file) {
            return res.status(400).json({ error: 'Thiếu file ghi âm' });
        }

        const audioPath = req.file.path;
        const replyPath = '/tmp/reply.mp3';

        try {
            const text = await transcribeAudio(audioPath);
            console.log('📝 Văn bản:', text);

            // Ở đây bạn có thể gửi đến AI chatbot hoặc trả về nội dung đơn giản
            const botReply = `Bạn vừa nói: ${text}`; // Ví dụ

            await synthesizeSpeech(botReply, replyPath);

            const host = req.headers.host;
            const voiceUrl = `https://${host}/api/reply`;

            return res.status(200).json({ text, voiceUrl });
        } catch (error) {
            console.error('❌ Lỗi xử lý:', error);
            return res.status(500).json({ error: 'Lỗi nội bộ server' });
        } finally {
            fs.unlink(audioPath, () => { });
        }
