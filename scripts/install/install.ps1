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

  $ExpectedMatches = @()
  foreach ($Line in Get-Content $Sums) {
    $Parts = $Line.Trim() -split '\s+', 2
    if ($Parts.Count -eq 2 -and $Parts[1].TrimStart('*') -eq $Asset) {
      $ExpectedMatches += $Parts[0].ToLower()
    }
  }
  if ($ExpectedMatches.Count -ne 1) {
    throw "SHA256SUMS must contain exactly one entry for $Asset"
  }
  $Expected = $ExpectedMatches[0]
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

  # Put the install dir FIRST on the user PATH (moving it there if an earlier
  # run appended it): an older npm/pnpm/bun global `wstack` earlier on PATH
  # would otherwise keep winning and the new binary would never run.
  $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $Entries = @(if ($UserPath) { $UserPath -split ';' | Where-Object { $_ } })
  $Others = @($Entries | Where-Object { $_.TrimEnd('\') -ne $InstallDir.TrimEnd('\') })
  if (-not $env:WSTACK_NO_MODIFY_PATH -and ($Entries.Count -eq 0 -or $Entries[0].TrimEnd('\') -ne $InstallDir.TrimEnd('\'))) {
    [Environment]::SetEnvironmentVariable('Path', ((@($InstallDir) + $Others) -join ';'), 'User')
    $SessionOthers = @($env:Path -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $InstallDir.TrimEnd('\') })
    $env:Path = (@($InstallDir) + $SessionOthers) -join ';'
    Write-Host "Put $InstallDir first on your user PATH (open a new terminal to pick it up)."
  }

  $Version = & $Target version 2>$null | Select-Object -First 1
  Write-Host ""
  Write-Host "Installed $Version -> $Target"

  # Globals left by the old npm distribution (wrongstack / @wrongstack/cli via
  # npm, pnpm, yarn or bun) carry their own wstack shim that keeps shadowing
  # this binary, so they get removed. An interactive session is asked first
  # (default yes); a non-interactive run removes them without asking.
  $OldInstalls = @()
  foreach ($Pm in 'npm', 'pnpm', 'yarn', 'bun') {
    if (-not (Get-Command $Pm -ErrorAction SilentlyContinue)) { continue }
    $Root = $null
    try {
      switch ($Pm) {
        'npm' { $Root = & npm root -g 2>$null | Select-Object -First 1 }
        'pnpm' { $Root = & pnpm root -g 2>$null | Select-Object -First 1 }
        'yarn' {
          $YarnDir = & yarn global dir 2>$null | Select-Object -First 1
          if ($YarnDir) { $Root = Join-Path $YarnDir 'node_modules' }
        }
        'bun' {
          $BunHome = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME '.bun' }
          $Root = Join-Path $BunHome 'install\global\node_modules'
        }
      }
    } catch { $Root = $null }
    if (-not $Root) { continue }
    foreach ($Pkg in 'wrongstack', '@wrongstack/cli') {
      if (Test-Path -PathType Leaf (Join-Path $Root "$Pkg\package.json")) {
        $OldInstalls += [pscustomobject]@{ Pm = $Pm; Pkg = $Pkg }
      }
    }
  }

  if ($OldInstalls.Count -gt 0) {
    Write-Host ""
    Write-Host "Old WrongStack installs from the npm era are still on this machine:" -ForegroundColor Yellow
    $OldInstalls | ForEach-Object { Write-Host "  $($_.Pkg)  ($($_.Pm) global)" }
    Write-Host "They shadow the standalone binary, so they are coming off."
    $Answer = 'y'
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
      try { $Answer = Read-Host 'Uninstall them now? [Y/n]' } catch { $Answer = 'y' }
    }
    if ($Answer -match '^[nN]') {
      Write-Host "Kept. Until they are gone, wstack may keep running the old version." -ForegroundColor Yellow
    } else {
      foreach ($Old in $OldInstalls) {
        $PmArgs = switch ($Old.Pm) {
          'npm' { @('uninstall', '-g', $Old.Pkg) }
          'pnpm' { @('remove', '-g', $Old.Pkg) }
          'yarn' { @('global', 'remove', $Old.Pkg) }
          'bun' { @('remove', '-g', $Old.Pkg) }
        }
        $Line = "$($Old.Pm) $($PmArgs -join ' ')"
        Write-Host "Uninstalling: $Line"
        $Ok = $false
        try { & $Old.Pm @PmArgs *> $null; $Ok = ($LASTEXITCODE -eq 0) } catch { $Ok = $false }
        if (-not $Ok) { Write-Host "Failed (stop any running wstack and retry): $Line" -ForegroundColor Yellow }
      }
    }
  }

  # Anything else still reachable can shadow this one (the machine PATH is
  # searched before the user PATH).
  $Shadows = @(Get-Command wstack, wrongstack -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -and -not $_.Source.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { $_.Source } | Sort-Object -Unique)
  if ($Shadows.Count -gt 0) {
    Write-Host ""
    Write-Host "Other WrongStack installs are still reachable and may run instead of this one:" -ForegroundColor Yellow
    $Shadows | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host "Update later with: wstack update"
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
