@echo off
title Git Push — Anti Gravity Studio
cd /d "%~dp0"

echo Removing stale git lock...
del /f /q ".git\index.lock" 2>nul

echo Staging all changes...
git add -A

echo Committing...
git commit -m "fix: pin Node 20 for sqlite3 compat, guard instagram_queue db.run on null"

echo Pushing to GitHub...
git push origin main

echo.
echo Done! Press any key to close.
pause
