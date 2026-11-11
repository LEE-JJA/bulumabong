// 설치 없이 로컬에서 앱과 AI 브리핑을 같이 띄우는 서버 (Node 18 이상)
// 실행: node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const brief = require('./api/brief');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };

  if (req.url.startsWith('/api/brief')) {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e4) req.destroy(); }); // 큰 본문은 끊는다
    req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      brief(req, res);
    });
    return;
  }
  const file = path.join(__dirname, 'index.html');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`부루마봉: http://localhost:${PORT}`));
