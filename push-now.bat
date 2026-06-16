@echo off
cd /d "%~dp0"
echo Removing git lock if stuck...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo Adding all changed files...
git add gallery.html server-fixed.js push-now.bat

echo Committing...
git commit -m "fix YouTube: hqdefault thumbnails, play button, lightbox embed"

echo Pushing to GitHub...
git push origin main

echo.
echo ============================================================
echo  DONE! Render will auto-deploy in about 2 minutes.
echo  Check: https://dashboard.render.com
echo ============================================================
pause
