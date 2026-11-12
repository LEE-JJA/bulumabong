# 부루마봉 발표용 시연 영상

Windows의 Microsoft Edge, Node.js 18 이상, Python, 인터넷 연결이 필요합니다. `http://3.106.70.230`의 `#test` 시연 모드를 새 브라우저 컨텍스트에서 녹화합니다. 학생·기관 화면은 같은 브라우저 저장소를 사용합니다.

```powershell
cd scripts/demo-video
npm install
$env:PLAYWRIGHT_BROWSERS_PATH=(Get-Location).Path + '\.pw-browsers'
npx playwright install ffmpeg
python -m pip install --target .pydeps -r requirements.txt
npm run record
python finish.py
```

`record.js`는 `video/부루마봉-시연-원본.mp4`와 자막·전환 시각이 담긴 `video/시연-기록.json`을 만듭니다. `finish.py`는 한국어 SunHi Neural 음성으로 자막을 읽고 페이지 이동 구간에 짧은 페이드를 넣어 `video/부루마봉-시연.mp4`와 별도 내레이션 `video/부루마봉-내레이션.mp3`를 만듭니다.

녹화 스크립트는 기관의 AI 카드 생성과 봉사 브리핑의 Amazon Bedrock 표시를 확인합니다. AI가 응답하지 않으면 녹화를 중단하므로, 연결 상태를 확인한 뒤 다시 실행하세요. `video/`와 설치 파일은 Git에 포함되지 않습니다.
