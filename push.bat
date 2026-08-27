@echo off
chcp 65001 >nul
echo 🚀 변경사항을 깃허브에 푸시합니다...
git add .
git commit -m "style: 금기어 추가/변경 모달 스크롤 추가 및 GEMINI.md 규칙 파일 생성"
git push
echo.
echo ✅ 푸시가 완료되었습니다! (3초 후 창이 닫힙니다)
timeout /t 3 >nul
