$ErrorActionPreference = 'Continue'
$GIT = 'C:\Program Files\Git\cmd\git.exe'
$ProjectPath = 'C:\Users\bamet\Downloads\insta-main (2)'
Set-Location $ProjectPath

Write-Host "=== Killing any running git processes ===" -ForegroundColor Cyan
Get-Process git -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "`n=== Removing old .git folder (clean slate) ===" -ForegroundColor Cyan
Remove-Item -Recurse -Force ".git" -ErrorAction SilentlyContinue
Write-Host "Old .git removed."

Write-Host "`n=== Initializing fresh repo ===" -ForegroundColor Cyan
& $GIT init -b main
& $GIT config user.email "radhadudeja514@gmail.com"
& $GIT config user.name "Radha Dudeja"

Write-Host "`n=== Staging all files (gitignore excludes videos/qdrant) ===" -ForegroundColor Cyan
& $GIT add .
& $GIT status --short | Select-Object -First 20

Write-Host "`n=== Creating clean initial commit ===" -ForegroundColor Cyan
& $GIT commit -m "feat: Anti Gravity Studio - full site with SEO, GA4, GMB, all pillars"

Write-Host "`n=== Setting remote and force pushing ===" -ForegroundColor Cyan
$token = ""
# Get token from credential manager
$credInput = "protocol=https`nhost=github.com`n`n"
$credResult = ($credInput | & "C:\Program Files\Git\cmd\git.exe" credential fill 2>&1)
$tokenLine = $credResult | Where-Object { $_ -match "^password=" }
if ($tokenLine) {
    $token = $tokenLine -replace "^password=", ""
    Write-Host "Token retrieved." -ForegroundColor Green
}

$repoUrl = "https://$token@github.com/radhadudeja514-crypto/anti-gravity-studio.git"
& $GIT remote add origin $repoUrl
& $GIT push -u origin main --force 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS! Pushed to https://github.com/radhadudeja514-crypto/anti-gravity-studio" -ForegroundColor Green
} else {
    Write-Host "`nPush failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
pause
