$pages = @(
  '/',
  '/booking.html',
  '/pillar-radha.html',
  '/pillar-veronica.html',
  '/pillar-tour.html',
  '/admin/login.html',
  '/media-studio.html'
)

foreach ($p in $pages) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3005$p" -UseBasicParsing
    Write-Host "$p -> $($r.StatusCode)"
  } catch {
    Write-Host "$p -> ERROR: $_"
  }
}
