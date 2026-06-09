# Fix git - remove large files and force push clean repo
$ErrorActionPreference = 'Continue'
$GIT = 'C:\Program Files\Git\cmd\git.exe'
$ProjectPath = 'C:\Users\bamet\Downloads\insta-main (2)'
Set-Location $ProjectPath

Write-Host "=== Killing any running git process ===" -ForegroundColor Cyan
Get-Process git -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "`n=== Removing large files from git index ===" -ForegroundColor Cyan
& $GIT rm -r --cached assets/media/gallery/videos/ 2>&1
& $GIT rm -r --cached qdrant_storage/ 2>&1
& $GIT rm --cached AntiGravityStudio-MediaKit-2026.pdf 2>&1
& $GIT rm --cached push.bat 2>&1
& $GIT rm --cached get-token.bat 2>&1
& $GIT rm --cached github-push.ps1 2>&1
& $GIT rm --cached git-init-push.ps1 2>&1

Write-Host "`n=== Creating new clean commit ===" -ForegroundColor Cyan
& $GIT add .
& $GIT commit -m "fix: exclude large binary files (videos/qdrant) from repo"

Write-Host "`n=== Pushing to GitHub (force) ===" -ForegroundColor Cyan
$repoUrl = "https://github.com/radhadudeja514-crypto/anti-gravity-studio.git"
& $GIT remote set-url origin $repoUrl

# Push with credential
& $GIT push -u origin main 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS! Pushed to https://github.com/radhadudeja514-crypto/anti-gravity-studio" -ForegroundColor Green
} else {
    Write-Host "`nTrying force push..." -ForegroundColor Yellow
    & $GIT push -u origin main --force 2>&1 | ForEach-Object { Write-Host $_ }
}

pause
