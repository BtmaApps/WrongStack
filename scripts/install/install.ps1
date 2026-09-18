# WrongStack standalone installer (Windows).
#
#   irm https://github.com/WrongStack/WrongStack/releases/latest/download/install.ps1 | iex
#
# Environment:
#   WSTACK_VERSION      release to install, e.g. 1.0.21 (default: latest)
#   WSTACK_INSTALL_DIR  target directory (default: %USERPROFILE%\.wrongstack\bin)
#   WSTACK_DOWNLOAD_BASE  mirror serving the release assets (overrides the version URL)
#   WSTACK_NO_MODIFY_PATH=1  leave the user PATH untouched
#
# Downloads the single self-contained executable, verifies it against the
# release's SHA256SUMS, installs it as wstack.exe with a `wrongstack` alias and
# adds the directory to the user PATH. No Node.js or npm is required.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'WrongStack/WrongStack'
$InstallDir = if ($env:WSTACK_INSTALL_DIR) { $env:WSTACK_INSTALL_DIR } else { Join-Path $HOME '.wrongstack\bin' }
# Windows on ARM runs the x64 build under emulation.
$Asset = 'wstack-windows-x64.exe'
$Base = if ($env:WSTACK_DOWNLOAD_BASE) {
  $env:WSTACK_DOWNLOAD_BASE.TrimEnd('/')
} elseif ($env:WSTACK_VERSION) {
  "https://github.com/$Repo/releases/download/v$($env:WSTACK_VERSION.TrimStart('v'))"
} else {
  "https://github.com/$Repo/releases/latest/download"
}

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wstack-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  Write-Host "Downloading $Asset..."
  $Exe = Join-Path $Tmp $Asset
  $Sums = Join-Path $Tmp 'SHA256SUMS'
  Invoke-WebRequest -Uri "$Base/$Asset" -OutFile $Exe -UseBasicParsing
  Invoke-WebRequest -Uri "$Base/SHA256SUMS" -OutFile $Sums -UseBasicParsing

  $Expected = $null
  foreach ($Line in Get-Content $Sums) {
    $Parts = $Line.Trim() -split '\s+', 2
    if ($Parts.Count -eq 2 -and $Parts[1].TrimStart('*') -eq $Asset) { $Expected = $Parts[0].ToLower() }
  }
  if (-not $Expected) { throw "SHA256SUMS has no entry for $Asset" }
  $Actual = (Get-FileHash -Algorithm SHA256 $Exe).Hash.ToLower()
  if ($Expected -ne $Actual) { throw "checksum mismatch for $Asset" }

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $Target = Join-Path $InstallDir 'wstack.exe'
  if (Test-Path $Target) {
    # A running wstack.exe cannot be overwritten, but it can be renamed.
    $Aside = "$Target.old"
    Remove-Item -Force $Aside -ErrorAction SilentlyContinue
    Move-Item -Force $Target $Aside
  }
  Move-Item -Force $Exe $Target
  Set-Content -Path (Join-Path $InstallDir 'wrongstack.cmd') -Value "@`"%~dp0wstack.exe`" %*" -Encoding Ascii

  $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $Entries = if ($UserPath) { $UserPath -split ';' } else { @() }
  if (-not $env:WSTACK_NO_MODIFY_PATH -and $Entries -notcontains $InstallDir) {
    $NewPath = (@($Entries | Where-Object { $_ }) + $InstallDir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "Added $InstallDir to your user PATH (open a new terminal to pick it up)."
  }

  $Version = & $Target version 2>$null | Select-Object -First 1
  Write-Host ""
  Write-Host "Installed $Version -> $Target"
  Write-Host "Update later with: wstack update"
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
