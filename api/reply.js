const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
    const filePath = '/tmp/reply.mp3';
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Không tìm thấy file âm thanh');
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    fs.createReadStream(filePath).pipe(res);
};
