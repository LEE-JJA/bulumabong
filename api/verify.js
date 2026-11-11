// POST /api/verify : 봉사 확인 코드를 발급하고 확인합니다. 데이터베이스 없이 비밀값 하나로 동작합니다.
//
// 흐름
//   1. 운영자가 시설마다 기관 키를 만들어 담당자에게 따로 전한다: node api/verify.js key <시설 id>
//   2. 담당자: { action: 'issue', fid, key, rid, date, hours } → { code } (6자리)
//      코드는 시설, 요청, 날짜, 봉사 시간에 묶인다. 담당자가 실제로 확인한 시간으로 발급한다
//   3. 학생: { action: 'check', fid, rid, date, hours, code } → { ok: true, receipt }
//      receipt는 나중에 서버가 이 인증을 다시 확인할 때 쓰는 영수증
//
// 환경변수
//   CODE_SECRET  아무도 모르는 긴 문자열. 없으면 발급도 확인도 하지 않는다
//
// shortcut: 같은 코드를 정원보다 많은 사람이 써도 막지 못한다(누가 이미 썼는지 저장할 곳이 없음), 공용 저장소가 생기면 receipt로 중복을 막을 것
const crypto = require('crypto');
const limited = require('./_limit')(10);

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const mac = (secret, ...parts) => crypto.createHmac('sha256', secret).update(parts.join('|')).digest();
const facKey = (secret, fid) => mac(secret, 'fac', fid).toString('base64url').slice(0, 16);
const codeFor = (secret, fid, rid, date, hours) => String(mac(secret, 'code', fid, rid, date, hours).readUInt32BE(0) % 1e6).padStart(6, '0');
const receiptFor = (secret, fid, rid, date, hours) => mac(secret, 'ok', fid, rid, date, hours).toString('base64url').slice(0, 22);
// IP를 바꿔 가며 코드를 맞히는 것을 막으려고, 요청(시설·요청·날짜)마다 틀린 횟수를 센다. 1시간에 10번 틀리면 그 시간 동안 잠근다
// shortcut: 서버 메모리 안에서만 센다(서버리스는 인스턴스마다 따로), 공용 저장소(Redis 등)가 생기면 그쪽으로 옮길 것
const MAX_FAILS = 10, fails = new Map();
let failHour = 0;
function failCount(target, add) {
  const hour = Math.floor(Date.now() / 3600e3);
  if (hour !== failHour) { failHour = hour; fails.clear(); }
  if (add) {
    // 표가 가득 차면 가장 오래된 기록을 지운다. 새 대상을 막으면 가짜 대상으로 표를 채워 모두를 막을 수 있고,
    // 지우는 쪽은 한 대상을 밀어내는 데 요청 1만 번(IP 제한으로 IP 1,000개×1분)이 들어 맞히기에 도움이 안 된다
    if (!fails.has(target) && fails.size >= 10000) fails.delete(fails.keys().next().value);
    fails.set(target, (fails.get(target) || 0) + 1);
  }
  return fails.get(target) || 0;
}
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받아요' });
  if (limited(req)) return res.status(429).json({ error: '요청이 많아요. 잠시 뒤에 다시 해 주세요' });
  const secret = process.env.CODE_SECRET;
  if (!secret) return res.status(503).json({ error: '인증 서버 설정이 아직 안 됐어요' });
  const { action, fid, rid, date, key, code } = req.body || {};
  const hours = Number((req.body || {}).hours);
  if (!ID.test(fid || '') || !ID.test(rid || '') || !DATE.test(date || '') || !Number.isInteger(hours) || hours < 1 || hours > 8)
    return res.status(400).json({ error: '요청 정보가 올바르지 않아요' });
  if (action === 'issue') {
    if (!same(key || '', facKey(secret, fid))) return res.status(403).json({ error: '기관 키가 맞지 않아요' });
    return res.status(200).json({ code: codeFor(secret, fid, rid, date, hours) });
  }
  if (action === 'check') {
    const target = [fid, rid, date].join('|');
    if (failCount(target) >= MAX_FAILS) return res.status(429).json({ error: '이 요청은 확인 코드가 여러 번 틀려 잠시 잠겼어요. 한 시간 뒤에 다시 해 주세요' });
    if (!/^\d{6}$/.test(code || '') || !same(code, codeFor(secret, fid, rid, date, hours))) {
      failCount(target, true);
      return res.status(200).json({ ok: false, error: '확인 코드가 맞지 않아요. 날짜와 봉사 시간이 기관이 발급한 것과 같은지 봐 주세요' });
    }
    return res.status(200).json({ ok: true, receipt: receiptFor(secret, fid, rid, date, hours) });
  }
  return res.status(400).json({ error: 'action은 issue 또는 check예요' });
}

module.exports = handler;
module.exports.facKey = facKey;
module.exports.failCount = failCount;

// 운영자용: CODE_SECRET을 넣고 node api/verify.js key f1 → 그 시설의 기관 키
if (require.main === module) {
  const [cmd, fid] = process.argv.slice(2);
  if (cmd !== 'key' || !ID.test(fid || '') || !process.env.CODE_SECRET) {
    console.error('사용법: CODE_SECRET을 환경변수로 넣고 node api/verify.js key <시설 id>');
    process.exit(1);
  }
  console.log(facKey(process.env.CODE_SECRET, fid));
}
