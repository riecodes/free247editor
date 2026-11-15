# One-paste setup for free247editor on Windows. Installs what is missing (Git, Node.js LTS, FFmpeg, Claude Code),
# puts the editor in %USERPROFILE%\free247editor (not Documents, which OneDrive often syncs), runs its setup.mjs, then opens Claude on "start". Safe to run again.
#   irm https://webinar.riecodes.com/editor.ps1 | iex
# English messages: $env:RIE_LANG='en'; irm https://webinar.riecodes.com/editor.ps1 | iex
# Dry run (prints every step, installs and changes nothing): $env:RIE_DRY='1'; irm https://webinar.riecodes.com/editor.ps1 | iex
# Node.js LTS has no per-user installer on winget, so it asks one Windows "Yes". Git and FFmpeg install per user.
# Claude Code comes from webinar's claude.ps1, run with its output piped so it installs or fixes PATH but does not launch.
# Keep this file ASCII: Windows PowerShell 5.1 runs it.
& {
  $dry = $env:RIE_DRY -eq '1'
  $english = $env:RIE_LANG -eq 'en'
  $bin = Join-Path $env:USERPROFILE '.local\bin'
  $exe = Join-Path $bin 'claude.exe'
  $dir = Join-Path $env:USERPROFILE 'free247editor'
  $repo = 'https://github.com/riecodes/free247editor.git'
  $winget = '--exact', '--source', 'winget', '--silent', '--disable-interactivity', '--accept-package-agreements', '--accept-source-agreements'
  function L([string]$fil, [string]$en) { if ($english) { $en } else { $fil } }
  function Say([string]$text, [string]$color = 'Cyan') { Write-Host "`n== $text" -ForegroundColor $color }
  function Step([int]$n, [string]$text) { Say "[$n/7] $text" }
  # Every change goes through Run, so the dry run prints exactly what a real run would do.
  function Run([string]$what, [scriptblock]$action) {
    if ($dry) { Write-Host "   [dry run] $what" -ForegroundColor DarkGray } else { & $action }
  }
  function Stop-Here([string]$fil, [string]$en) { Say ((L $fil $en) + ' ' + (L 'I-screenshot ito at i-send kay Eirmon.' 'Take a screenshot and send it to Eirmon.')) 'Red' }
  # New installs land in the registry, not in this window: reload PATH from there before every look.
  function Reload { $env:Path = "$bin;" + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
  function Has([string]$cmd) { [bool](Get-Command $cmd -CommandType Application -ErrorAction SilentlyContinue) }
  function Node-Major { if (Has node) { try { [int]((node -v) -replace '^v(\d+).*', '$1') } catch { 0 } } else { 0 } }
  # Same rule as claude.ps1: an old Claude desktop app's claude.exe in WindowsApps opens the app, not Claude Code.
  function Find-Claude {
    Reload
    if (Test-Path $exe) { return $exe }
    $found = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike '*\WindowsApps\*' } | Select-Object -First 1
    if ($found) { return $found.Source }
    return $null
  }

  Reload
  if ($dry) { Say (L 'DRY RUN: walang ini-install o binabago. Pinapakita lang ang gagawin.' 'DRY RUN: nothing is installed or changed. This only shows what would happen.') 'Yellow' }
  Step 1 (L 'Na-paste mo na ang setup. Tapos na ito.' 'You pasted the setup. This step is done.')

  $needGit = -not (Has git)
  $needNode = (Node-Major) -lt 22
  $needFfmpeg = -not ((Has ffmpeg) -and (Has ffprobe))
  if (($needGit -or $needNode -or $needFfmpeg) -and -not (Has winget)) {
    Stop-Here 'Walang winget sa PC mo. I-update ang "App Installer" sa Microsoft Store, tapos i-paste ulit.' 'Your PC has no winget. Update "App Installer" in the Microsoft Store, then paste the line again.'
    return
  }

  Step 2 'Git'
  if ($needGit) { Run 'winget install --id Git.Git --scope user' { winget install --id Git.Git --scope user @winget } }
  else { Write-Host (L '   Meron na.' '   Already there.') }

  Step 3 'Node.js'
  if ($needNode) {
    Say (L 'May lalabas na Windows prompt. Pindutin ang Yes.' 'A Windows prompt will pop up. Click Yes.') 'Yellow'
    Run 'winget install --id OpenJS.NodeJS.LTS  (one UAC prompt)' { winget install --id OpenJS.NodeJS.LTS @winget }
  } else { Write-Host ((L '   Meron na: ' '   Already there: ') + (node -v)) }

  Step 4 'FFmpeg'
  if ($needFfmpeg) { Run 'winget install --id Gyan.FFmpeg' { winget install --id Gyan.FFmpeg @winget } }
  else { Write-Host (L '   Meron na.' '   Already there.') }

  Reload
  if (-not $dry) {
    $still = @()
    if (-not (Has git)) { $still += 'Git' }
    if ((Node-Major) -lt 22) { $still += 'Node.js 22+' }
    if (-not ((Has ffmpeg) -and (Has ffprobe))) { $still += 'FFmpeg' }
    if ($still) { Stop-Here ('Hindi na-install: ' + ($still -join ', ') + '.') ("Didn't install: " + ($still -join ', ') + '.'); return }
  }

  Step 5 'Claude Code'
  $claude = Find-Claude
  if ($claude) { Write-Host ((L '   Meron na: ' '   Already there: ') + $claude) }
  # Run either way: claude.ps1 also repairs the PATH for an install that "is not recognized". The pipe stops its launch.
  Run 'irm https://webinar.riecodes.com/claude.ps1 | iex  (piped, so it installs or fixes PATH and does not open Claude)' {
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; irm https://webinar.riecodes.com/claude.ps1 | iex" | Out-Host
  }
  $claude = Find-Claude
  if (-not $claude -and -not $dry) { Stop-Here 'Hindi na-install ang Claude Code.' "Claude Code didn't install."; return }

  Step 6 (L "free247editor sa $dir. Ilang minuto ito." "free247editor in $dir. This takes a few minutes.")
  if (Test-Path (Join-Path $dir '.git')) {
    # A failed update is fine: the copy already there still works.
    Run "git -C $dir pull --ff-only" { git -C $dir pull --ff-only; if ($LASTEXITCODE) { Say (L 'Hindi na-update, gagamitin ang dati.' "Couldn't update, using the copy you have.") 'Yellow' } }
  } else {
    Run "git clone --depth 1 $repo $dir" { git clone --depth 1 $repo $dir }
    if (-not $dry -and -not (Test-Path (Join-Path $dir '.git'))) { Stop-Here "Hindi ma-download ang free247editor sa $dir." "Couldn't download free247editor into $dir."; return }
  }
  # If setup stops halfway, Claude still opens next and helps finish it.
  Run "node setup.mjs  (in $dir)" { Push-Location $dir; node setup.mjs; $ok = $LASTEXITCODE -eq 0; Pop-Location
    if (-not $ok) { Say (L 'May kulang pa sa setup. Si Claude na ang tutulong pag bukas niya.' "Setup isn't finished. Claude helps with it once it opens.") 'Yellow' } }

  Step 7 (L 'Bubuksan na si Claude. Piliin ang "Claude account with subscription" at mag-log in gamit ang Pro o Max mo.' 'Opening Claude. Choose "Claude account with subscription" and log in with your Pro or Max.')
  # Started from a script or a log (not a person at a window): stop here.
  if (-not $dry -and ([Console]::IsOutputRedirected -or [Console]::IsInputRedirected)) { return }
  Run "claude --chrome ""start""  (in $dir)" { Set-Location $dir; & $claude --chrome 'start' }
  if ($dry) { Say (L 'Tapos ang dry run. Walang binago.' 'Dry run finished. Nothing changed.') 'Green' }
}
