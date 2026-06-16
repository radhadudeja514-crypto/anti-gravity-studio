@echo off
cd /d "%~dp0"
echo Removing git lock if stuck...
del /f /q ".git\index.lock" 2>nul

echo Adding all changed files...
git add admin/dashboard.html
git add admin/google-my-business.html
git add admin/media.html
git add admin/oauth-callback.html
git add assets/js/admin-nav.js
git add review-hub.html
git add server-fixed.js

echo Committing...
git commit -m "media: AI bulk (Gemini), Google Photos, crop/trim, YouTube; Gemini CSP; review URL fix"

echo Pushing to GitHub...
git push origin main

echo.
echo ============================================================
echo  DONE! Render will auto-deploy in about 2 minutes.
echo  Check: https://dashboard.render.com
echo ============================================================
pause
