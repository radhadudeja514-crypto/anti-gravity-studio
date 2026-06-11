@echo off
title Git Push — Anti Gravity Studio
cd /d "%~dp0"

echo Removing stale git lock...
del /f /q ".git\index.lock" 2>nul

echo Staging all changes...
git add -A

echo Committing...
git commit -m "feat: Google Photos popup OAuth, YouTube import fix, render/railway deploy config"

echo Pushing to GitHub...
git push origin main

echo.
echo Done! Press any key to close.
pause
