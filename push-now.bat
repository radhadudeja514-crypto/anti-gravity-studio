@echo off
cd /d "%~dp0"
echo Removing git lock if stuck...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo Adding all changed files...
git add admin/media.html
git add admin/config.html
git add admin/google-photos-import.html
git add admin/gp-bookmarklet.html
git add admin/oauth-callback.html
git add index.html
git add server-fixed.js
git add push-now.bat

echo Committing...
git commit -m "hero slideshow, media 5-tabs, Gemini AI bulk, GP postMessage fix"

echo Pushing to GitHub...
git push origin main

echo.
echo ============================================================
echo  DONE! Render will auto-deploy in about 2 minutes.
echo  Check: https://dashboard.render.com
echo ============================================================
pause
