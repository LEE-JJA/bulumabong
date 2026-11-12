// GET /api/vol : 1365 자원봉사포털에서 원주시 모집 중인 봉사를 가져옵니다 (행정안전부_봉사참여정보서비스, 공공데이터포털)
// 환경변수 DATA_GO_KR_KEY: 공공데이터포털 일반 인증키. 없으면 503. 키는 서버에서만 쓰고 화면에 보내지 않는다
// 개발 계정은 하루 1,000번까지라 10분 동안 결과를 서버 메모리에 담아 두고 같이 쓴다
const limited = require('./_limit')(30);
const URL_ = 'https://apis.data.go.kr/1741000/volunteerPartcptnService/getVltrAreaList';
const WONJU = { schSido: '6420000', schSign1: '4190000' }; // 강원특별자치도 원주시 (1365 지역코드)
const TTL = 10 * 60e3;
let cache = { at: 0, items: null };

const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ymd = s => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : '';
function parse(xml, today) {
  const code = (xml.match(/<resultCode>([^<]*)/) || [])[1];
  if (code !== '00') throw new Error('1365 응답 오류: ' + String(code || xml.slice(0, 80)));
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const f = Object.fromEntries([...it.matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map(([, k, v]) => [k, ent(v).trim()]));
    return { no: f.progrmRegistNo, title: f.progrmSj, org: f.nanmmbyNm, from: ymd(f.progrmBgnde), to: ymd(f.progrmEndde), open: f.progrmSttusSe === '2' };
  }).filter(v => /^\d{1,12}$/.test(v.no || '') && v.title && v.open && v.to >= today)
    .map(({ open, ...v }) => ({ ...v, url: 'https://1365.go.kr/vols/P9210/partcptn/timeCptn.do?type=show&progrmRegistNo=' + v.no }))
    .sort((a, b) => a.to.localeCompare(b.to));
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 받아요' });
  if (limited(req)) return res.status(429).json({ error: '요청이 많아요. 잠시 뒤에 다시 해 주세요' });
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return res.status(503).json({ error: '1365 연동 설정이 아직 안 됐어요' });
  if (!cache.items || Date.now() - cache.at > TTL) {
    try {
      // shortcut: 한 번에 100건까지만 가져온다(2026-11 원주 70건), 넘으면 pageNo로 이어 받을 것
      const q = new URLSearchParams({ serviceKey: key, ...WONJU, numOfRows: '100', pageNo: '1' });
      const r = await fetch(`${URL_}?${q}`, { signal: AbortSignal.timeout(8000) });
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      cache = { at: Date.now(), items: parse(await r.text(), today) };
    } catch (e) {
      console.error('[vol]', e.message);
      if (!cache.items) return res.status(502).json({ error: '1365 정보를 가져오지 못했어요' });
      cache.at = Date.now(); // 실패하면 지난 결과를 10분 더 쓴다(매 요청마다 다시 부르지 않게)
    }
  }
  return res.status(200).json({ items: cache.items, at: new Date(cache.at).toISOString() });
}

module.exports = handler;
module.exports.parse = parse;
