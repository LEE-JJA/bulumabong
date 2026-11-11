// IP당 1분 호출 제한. brief.js와 verify.js가 각자 하나씩 만들어 쓴다 (_로 시작해 Vercel 함수로는 안 잡힘)
// shortcut: 서버 메모리 안에서만 센다(서버리스는 인스턴스마다 따로), 공개 운영 전에 API Gateway 등 앞단 제한을 걸 것
module.exports = perMinute => {
  const hits = new Map();
  let minute = 0;
  return req => {
    const now = Math.floor(Date.now() / 60000);
    if (now !== minute) { minute = now; hits.clear(); }
    // 클라이언트가 꾸밀 수 있는 X-Forwarded-For는 안 본다. Vercel에서는 플랫폼이 넣는 x-real-ip, 그 밖에는 접속 주소
    const ip = String((process.env.VERCEL && req.headers?.['x-real-ip']) || req.socket?.remoteAddress || '');
    if (!hits.has(ip) && hits.size >= 10000) return true; // 기록이 가득 차면 새 주소는 막는다(닫힌 쪽으로 실패)
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    return n > perMinute;
  };
};
