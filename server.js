const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Thiết lập CORS cho phép app frontend truy cập
app.use(cors());

// Thiết lập nơi lưu trữ file upload
const upload = multer({ dest: 'uploads/' });

// Route API nhận file audio từ client
app.post('/api/audio', upload.single('audio'), async (req, res) => {
    try {
        console.log('🛎️ Nhận file ghi âm:', req.file.originalname);

        // Giả lập quá trình:
        // 1. Gửi file đến Google Speech-to-Text => lấy văn bản
        // 2. Gửi văn bản đến Gemini => lấy câu trả lời
        // 3. Gửi văn bản đến Google TTS => nhận file mp3

        // Ở đây mình giả lập sẵn file phản hồi có tên `reply.mp3`
        const voiceUrl = `http://localhost:${PORT}/reply.mp3`;

        res.json({ voiceUrl });
    } catch (err) {
        console.error('Lỗi xử lý audio:', err);
        res.status(500).json({ error: 'Xử lý thất bại' });
    }
});

// Phục vụ file giọng nói phản hồi
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});