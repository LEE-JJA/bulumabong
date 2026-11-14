const fs = require('fs');
const path = require('path');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, '.pw-browsers');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ffmpeg = require('ffmpeg-static');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'video');
const BASE = 'http://3.106.70.230';
const MEMO = '혼자 사시는 할머니 010-1234-5678, 병원 예약 앱 까는 걸 도와 달라고 하심. 한 시간쯤';
const scenes = [], captions = [], transitions = [];
let started;
const elapsed = () => (Date.now() - started) / 1000;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(sec) { if (elapsed() < sec) await pause((sec - elapsed()) * 1000); }
async function caption(page, text) {
  captions.push({time: Math.round(elapsed()*10)/10, text});
  await page.evaluate(text => {
    let bar = document.getElementById('video-caption');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'video-caption';
      Object.assign(bar.style, { position:'fixed', zIndex:'2147483647', left:'8%', bottom:'24px', width:'84%', maxWidth:'1600px', margin:'auto', padding:'15px 28px', borderRadius:'12px', background:'rgba(0,0,0,.86)', color:'#fff', font:'700 34px/1.4 "IBM Plex Sans KR","Malgun Gothic",sans-serif', textAlign:'center', pointerEvents:'none', boxShadow:'0 8px 30px rgba(0,0,0,.3)' });
      document.body.appendChild(bar);
    }
    bar.textContent = text;
  }, text);
}
async function click(page, selector, options={}) {
  const item = page.locator(selector).first();
  await item.scrollIntoViewIfNeeded();
  await item.evaluate(el => { el.style.outline = '4px solid #F2C230'; el.style.outlineOffset = '5px'; });
  await pause(550);
  await item.click(options);
  await pause(900);
}
async function navigate(page, url) { const at = elapsed(); await page.goto(url, {waitUntil:'domcontentloaded',timeout:30000}); transitions.push({at:Math.round(at*10)/10, done:Math.round(elapsed()*10)/10}); }
function mark(name) { const time = Math.round(elapsed()*10)/10; scenes.push({name,time}); console.log(time.toFixed(1)+'s '+name); }
async function main() {
  fs.mkdirSync(OUT, {recursive:true});
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const context = await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:OUT,size:{width:1920,height:1080}},locale:'ko-KR'});
  const page = await context.newPage(); started = Date.now();
  try {
    await page.goto(BASE+'/#test', {waitUntil:'domcontentloaded',timeout:30000});
    await caption(page,'부루마봉: 원주권 대학이 봉사 시간으로 겨루는 원주 봉사 대항전'); mark('첫 화면');
    await until(12);
    await caption(page,'우리 대학을 고르면, 구역마다 1위 대학의 건물이 지도에 섭니다'); mark('대학 선택');
    await click(page,'[data-role="student"]'); await click(page,'#teamBtns [data-team]');
    if (await page.locator('#testPanel').evaluate(el=>el.classList.contains('open'))) await click(page,'#testFab');
    await until(25);
    await caption(page,'손이 부족한 먼 읍·면, 요양원·보육원일수록 점수가 커서 봉사가 그곳으로 갑니다'); mark('구역 정보');
    await click(page,'path.dist',{force:true});
    await until(40);
    await caption(page,'1365 자원봉사포털의 원주 모집 봉사 67건을 공공데이터 API로 지도에 띄웠습니다'); mark('1365 모집');
    await click(page,'[data-zoom="town"]'); await click(page,'.vmk',{force:true});
    await until(58);
    await navigate(page, BASE+'/org.html#test');
    await caption(page,'앱이 어려운 어르신은 전화 한 통. AI가 개인정보를 가린 메모를 익명 요청 카드로 정리합니다'); mark('기관 전화 메모');
    await click(page,'#authForm button'); await click(page,'#memoTab');
    await page.locator('#memo').fill(MEMO); await pause(950); await click(page,'#memoBtn');
    await page.waitForFunction(()=>!document.querySelector('#memoBtn').disabled,{timeout:15000});
    await pause(1700); const title = await page.locator('#title').inputValue();
    if (!title || /010-1234-5678/.test(title)) throw Error('익명 요청 카드가 만들어지지 않았습니다');
    const memoSource = await page.locator('#memoErr').innerText(); if (memoSource.includes('연결되지')) throw Error('새 배포의 AI 카드 생성이 실패했습니다');
    await click(page,'#saveBtn');
    const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('ttbb.demo.reqs')||'[]')[0]);
    if (!saved || saved.title !== title) throw Error('기관 요청이 저장되지 않았습니다');
    await until(82);
    await navigate(page, BASE+'/#test');
    await caption(page,'학생은 도움 요청을 보고 신청합니다. 정원이 차면 마감돼요'); mark('학생 신청');
    if (await page.locator('#testPanel').evaluate(el=>el.classList.contains('open'))) await click(page,'#testFab');
    await click(page,'[data-apply="'+saved.id+'"]');
    await until(98);
    await caption(page,'AI(Amazon Bedrock) 봉사 브리핑은 필요한 구역과 우리 건물의 상황을 알려 줍니다'); mark('봉사 브리핑');
    await click(page,'#briefBtn');
    await page.waitForFunction(()=>document.querySelector('#briefSrc').textContent.trim().length>0,{timeout:15000}).catch(()=>{});
    const briefSource = await page.locator('#briefSrc').innerText(); if (!briefSource.includes('Amazon Bedrock')) throw Error('Bedrock 브리핑 출처가 확인되지 않았습니다: '+briefSource); await pause(1800);
    await until(110);
    await navigate(page, BASE+'/org.html#test');
    await caption(page,'봉사를 마치면 기관이 6자리 확인 코드를 줍니다. 요청·날짜·시간에 묶여 있어요'); mark('확인 코드 발급');
    await click(page,'#authForm button'); await page.locator('#issueReq').selectOption(saved.id); await page.locator('#issueHrs').selectOption(String(saved.hours)); await click(page,'#issueForm button');
    const code = (await page.locator('#issueOut').innerText()).trim(); if (!/^\d{6}$/.test(code)) throw Error('6자리 코드 발급 실패');
    await pause(1200);
    await navigate(page, BASE+'/#test'); await caption(page,'학생이 코드를 입력하면 봉사 시간이 인증되고 점수가 쌓입니다');
    if (await page.locator('#testPanel').evaluate(el=>el.classList.contains('open'))) await click(page,'#testFab');
    await page.locator('#reqSel').selectOption(saved.id); await page.locator('#codeIn').fill(code); await pause(800); await click(page,'#logForm button[type="submit"]');
    const logError=await page.locator('#codeErr').innerText(); if (logError) throw Error('인증 실패: '+logError);
    await until(130);
    await caption(page,'따라잡히거나 봉사가 끊기면 건물이 내려앉고, 종강 때 시즌을 결산합니다'); mark('대학 추격과 결산');
    await click(page,'#testFab'); await click(page,'#tRaid'); await pause(4000);
    await click(page,'#testFab'); await click(page,'#tSeasonEnd');
    await page.locator('#resultModal.open').waitFor({timeout:20000});
    await until(148);
    await caption(page,'부루마봉: 경쟁하다 보면 도움이 필요한 곳에 닿는 봉사'); mark('맺음말');
    await until(155); await pause(500);
    fs.writeFileSync(path.join(OUT,'시연-기록.json'),JSON.stringify({base:BASE,scenes,captions,transitions,memoSource,briefSource,savedTitle:title},null,2));
  } finally {
    await context.close(); await browser.close();
  }
  const webm = await page.video().path();
  const mp4 = path.join(OUT,'부루마봉-시연-원본.mp4');
  execFileSync(ffmpeg,['-y','-i',webm,'-an','-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',mp4],{stdio:'inherit'});
  console.log('MP4:',mp4);
}
main().catch(e=>{console.error(e);process.exitCode=1});
