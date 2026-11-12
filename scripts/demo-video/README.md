# 부루마봉 시연 영상 녹화

Windows의 Microsoft Edge와 Node.js 18 이상이 필요합니다. 영상은 배포된 `https://bulumabong.vercel.app`의 `#test` 시연 모드를 새 브라우저 컨텍스트에서 녹화합니다. 학생·기관 화면은 한 컨텍스트의 같은 페이지로 이동하므로 요청 저장소가 이어집니다.

```powershell
cd scripts/demo-video
npm install
$env:PLAYWRIGHT_BROWSERS_PATH=(Get-Location).Path + '\.pw-browsers'
npx playwright install ffmpeg
npm run record
```

결과물은 저장소 루트의 `video/부루마봉-시연.mp4`입니다. 녹화 시작 시각, 장면별 시각, 메모·브리핑 출처는 `video/시연-기록.json`에 남습니다. `video/`와 설치 파일은 Git에 포함되지 않습니다.

배포 서비스의 AI 응답이 실패하면 화면의 기본 카드·규칙 브리핑으로 진행합니다. 녹화 자막은 이 경우에도 사실에 맞도록 작성했습니다.
