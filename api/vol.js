// GET /api/vol : 1365 자원봉사포털에서 원주시 모집 중인 봉사를 가져옵니다 (행정안전부_봉사참여정보서비스, 공공데이터포털)
// 환경변수 DATA_GO_KR_KEY: 공공데이터포털 일반 인증키. 없으면 503. 키는 서버에서만 쓰고 화면에 보내지 않는다
// 개발 계정은 하루 1,000번까지라
//   - 목록은 10분 동안 서버 메모리에 담아 두고, 응답은 Vercel CDN이 6시간 담아 둔다
//   - 위치·시간·인원이 있는 상세는 봉사마다 한 번만 불러 기억한다(처음 약 70번, 그 뒤에는 새 글만)
//   - 상세는 초당 요청 제한이 있어(약 2번) 0.45초 간격으로, 한 번에 4초까지만 부르고 나머지는 다음 요청에서 이어 부른다
//   - 서버가 새로 켜져도 다시 부르지 않게 data/1365-상세.json에 미리 받아 둔다: node api/vol.js seed
const limited = require('./_limit')(30);
const BASE = 'https://apis.data.go.kr/1741000/volunteerPartcptnService/';
const WONJU = { schSido: '6420000', schSign1: '4190000' }; // 강원특별자치도 원주시 (1365 지역코드)
const TTL = 10 * 60e3;
let cache = { at: 0, items: null };
let seed = {};
try { seed = require('../data/1365-상세.json'); } catch {}
const details = new Map(Object.entries(seed)); // 봉사 번호 → 상세. 실패한 것은 넣지 않아 다음에 다시 부른다
const wait = ms => new Promise(r => setTimeout(r, ms));
const GAP = 450, BUDGET = 4000;
async function fillDetails(get, list, budget) {
  const t0 = Date.now();
  for (const v of list.filter(x => !details.has(x.no))) {
    if (Date.now() - t0 > budget) break;
    try { details.set(v.no, parseDetail(await get('getVltrPartcptnItem', { progrmRegistNo: v.no }))); }
    catch (e) { console.error('[vol] 상세', v.no, e.message.slice(0, 80)); break; } // 막히면 멈추고 다음 요청에서 다시
    await wait(GAP);
  }
  return list.filter(x => !details.has(x.no)).length;
}

const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ymd = s => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : '';
function items(xml) {
  const code = (xml.match(/<resultCode>([^<]*)/) || [])[1];
  if (code !== '00') throw new Error('1365 응답 오류: ' + String(code || xml.slice(0, 80)));
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) =>
    Object.fromEntries([...it.matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map(([, k, v]) => [k, ent(v).trim()])));
}
function parse(xml, today) {
  return items(xml).map(f => ({ no: f.progrmRegistNo, title: f.progrmSj, org: f.nanmmbyNm, from: ymd(f.progrmBgnde), to: ymd(f.progrmEndde), open: f.progrmSttusSe === '2' }))
    .filter(v => /^\d{1,12}$/.test(v.no || '') && v.title && v.open && v.to >= today)
    .map(({ open, ...v }) => ({ ...v, url: 'https://1365.go.kr/vols/P9210/partcptn/timeCptn.do?type=show&progrmRegistNo=' + v.no }))
    .sort((a, b) => a.to.localeCompare(b.to));
}
// 상세에서 화면에 필요한 것만 고른다. 담당자 이름·전화·본문은 보내지 않는다
const int = s => /^\d{1,4}$/.test(s || '') ? +s : null;
function parseDetail(xml) {
  const f = items(xml)[0] || {};
  const [lat, lon] = String(f.areaLalo1 || '').split(',').map(Number);
  const inWonju = lat > 37.05 && lat < 37.6 && lon > 127.65 && lon < 128.3; // 좌표가 없거나 원주 밖이면 지도에 찍지 않는다
  const h = [int(f.actBeginTm), int(f.actEndTm)];
  return {
    ...(inWonju ? { lat: +lat.toFixed(5), lon: +lon.toFixed(5) } : {}),
    place: (f.actPlace || '').slice(0, 60),
    time: h[0] !== null && h[1] !== null ? `${h[0]}시~${h[1]}시` : '',
    need: int(f.rcritNmpr), adult: f.adultPosblAt === 'Y', // 신청 인원은 계속 바뀌어 기억해 두면 틀리므로 뺀다
  };
}

const getter = key => (op, params) => fetch(`${BASE}${op}?${new URLSearchParams({ serviceKey: key, ...params })}`, { signal: AbortSignal.timeout(8000) }).then(r => r.text());

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 요청만 받아요' });
  if (limited(req)) return res.status(429).json({ error: '요청이 많아요. 잠시 뒤에 다시 해 주세요' });
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return res.status(503).json({ error: '1365 연동 설정이 아직 안 됐어요' });
  if (!cache.items || cache.pending || Date.now() - cache.at > TTL) {
    const get = getter(key);
    try {
      // shortcut: 한 번에 100건까지만 가져온다(2026-11 원주 70건), 넘으면 pageNo로 이어 받을 것
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      const list = parse(await get('getVltrAreaList', { ...WONJU, numOfRows: '100', pageNo: '1' }), today);
      const pending = await fillDetails(get, list, BUDGET);
      cache = { at: Date.now(), pending, items: list.map(v => ({ ...v, ...details.get(v.no) })) };
    } catch (e) {
      console.error('[vol]', e.message);
      if (!cache.items) return res.status(502).json({ error: '1365 정보를 가져오지 못했어요' });
      cache.at = Date.now(); // 실패하면 지난 결과를 10분 더 쓴다(매 요청마다 다시 부르지 않게)
    }
  }
  // 상세를 아직 다 못 받았으면 CDN에 담지 않는다(화면이 몇 초 뒤 다시 물어 나머지를 받음)
  res.setHeader('Cache-Control', cache.pending ? 'no-store' : 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).json({ items: cache.items, pending: cache.pending || 0, at: new Date(cache.at).toISOString() });
}

module.exports = handler;
module.exports.parse = parse;
module.exports.parseDetail = parseDetail;

// 운영자용: DATA_GO_KR_KEY를 넣고 node api/vol.js seed → 지금 모집 중인 봉사의 상세를 data/1365-상세.json에 받아 둔다
if (require.main === module) {
  const key = process.env.DATA_GO_KR_KEY;
  if (process.argv[2] !== 'seed' || !key) { console.error('사용법: DATA_GO_KR_KEY를 환경변수로 넣고 node api/vol.js seed'); process.exit(1); }
  (async () => {
    const get = getter(key), today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const list = parse(await get('getVltrAreaList', { ...WONJU, numOfRows: '100', pageNo: '1' }), today);
    let left = await fillDetails(get, list, 120e3);
    if (left) { await wait(15000); left = await fillDetails(get, list, 120e3); }
    const out = Object.fromEntries(list.filter(v => details.has(v.no)).map(v => [v.no, details.get(v.no)]));
    require('fs').writeFileSync(require('path').join(__dirname, '../data/1365-상세.json'), JSON.stringify(out, null, 1) + '\n');
    console.log(`${Object.keys(out).length}건 저장, 못 받은 것 ${left}건`);
  })();
}
