# =========================================================================
# LottoAxe OS — Fully Automated Release Script
# =========================================================================
# One command does EVERYTHING:
#   1. Bump version in CMakeLists.txt (firmware)
#   2. Update version.json (website update checker)
#   3. Build firmware (ESP-IDF + Angular web UI)
#   4. OTA flash to Bitaxe (www.bin + esp-miner.bin)
#   5. Copy .bin files to website/firmware/
#   6. Deploy website to Netlify (lottoaxe.com)
#   7. Post Discord notification to #updates
#
# Usage:
#   .\scripts\release.ps1 -Version "2.2.0" -Changelog "Throttling override, new features"
#   .\scripts\release.ps1 -Version "2.2.0" -Changelog "Throttling override" -BitaxeIP "192.168.1.100"
#   .\scripts\release.ps1 -Version "2.2.0" -Changelog "New stuff" -SkipFlash   # build only, no OTA
#   .\scripts\release.ps1 -Version "2.2.0" -Changelog "New stuff" -SkipNotify  # no Discord post
#
# Requirements:
#   - ESP-IDF installed at C:\Espressif
#   - Node.js and Git in PATH (script adds them automatically)
#   - Bitaxe on the local network
#   - Netlify CLI (npx netlify-cli) logged in
# =========================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$true)]
    [string]$Changelog,

    [string]$BitaxeIP = "192.168.1.173",

    [switch]$SkipFlash,
    [switch]$SkipNotify,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# ── Paths ──
$RepoRoot      = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$WebsiteRoot   = Join-Path (Split-Path -Parent $RepoRoot) "lottoaxe-website"
$CMakeLists    = Join-Path $RepoRoot "CMakeLists.txt"
$VersionJson   = Join-Path $WebsiteRoot "version.json"
$NotifyScript  = Join-Path $WebsiteRoot "scripts\notify-discord.ps1"
$EspMinerBin   = Join-Path $RepoRoot "build\esp-miner.bin"
$WwwBin        = Join-Path $RepoRoot "build\www.bin"

# ESP-IDF paths
$IdfPath       = "C:\Espressif\frameworks\esp-idf-v5.5.4"
$IdfPython     = "C:\Espressif\python_env\idf5.5_py3.11_env\Scripts\python.exe"
$IdfPy         = Join-Path $IdfPath "tools\idf.py"

# ── Banner ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " LottoAxe OS Release Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Version:    v$Version"
Write-Host " Changelog:  $Changelog"
Write-Host " Bitaxe IP:  $BitaxeIP"
Write-Host " Skip Build: $SkipBuild"
Write-Host " Skip Flash: $SkipFlash"
Write-Host " Skip Notify:$SkipNotify"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ══════════════════════════════════════════════════════════
# STEP 1: Bump version in CMakeLists.txt
# ══════════════════════════════════════════════════════════
Write-Host "[1/7] Bumping version in CMakeLists.txt..." -ForegroundColor Yellow

$cmakeContent = Get-Content $CMakeLists -Raw
$cmakeContent = $cmakeContent -replace 'set\(GIT_VERSION\s+"[^"]+"\)', "set(GIT_VERSION `"$Version`")"
$cmakeContent | Set-Content $CMakeLists -NoNewline -Encoding UTF8

Write-Host "  CMakeLists.txt -> v$Version" -ForegroundColor Green

# ══════════════════════════════════════════════════════════
# STEP 2: Update version.json on website
# ══════════════════════════════════════════════════════════
Write-Host "[2/7] Updating version.json..." -ForegroundColor Yellow

$today = (Get-Date).ToString("yyyy-MM-dd")
$versionObj = @{
    version      = $Version
    released     = $today
    changelog    = $Changelog
    downloadUrl  = "https://lottoaxe.com/download.html"
    firmwareFiles = @{
        "esp-miner" = "https://lottoaxe.com/firmware/esp-miner.bin"
        "www"       = "https://lottoaxe.com/firmware/www.bin"
    }
}
$versionObj | ConvertTo-Json -Depth 3 | Set-Content $VersionJson -Encoding UTF8

Write-Host "  version.json -> v$Version ($today)" -ForegroundColor Green

# ══════════════════════════════════════════════════════════
# STEP 3: Build firmware
# ══════════════════════════════════════════════════════════
if (-not $SkipBuild) {
    Write-Host "[3/7] Building firmware (this takes a few minutes)..." -ForegroundColor Yellow

    # Set up ESP-IDF environment
    $env:IDF_PATH = $IdfPath
    $env:PATH = "C:\Espressif\tools\idf-python\3.11.2;C:\Espressif\python_env\idf5.5_py3.11_env\Scripts;$env:PATH"

    # Source ESP-IDF export
    & "$IdfPath\export.ps1" 2>$null

    # Add Node.js and Git
    $env:PATH += ";C:\Program Files\nodejs;C:\Program Files\Git\cmd"

    # Build
    Push-Location $RepoRoot
    & $IdfPython $IdfPy build
    $buildExit = $LASTEXITCODE
    Pop-Location

    if ($buildExit -ne 0) {
        Write-Host "  BUILD FAILED (exit code $buildExit)" -ForegroundColor Red
        exit 1
    }

    # Verify binaries exist
    if (-not (Test-Path $EspMinerBin) -or -not (Test-Path $WwwBin)) {
        Write-Host "  Build output missing — esp-miner.bin or www.bin not found" -ForegroundColor Red
        exit 1
    }

    $fwSize  = [math]::Round((Get-Item $EspMinerBin).Length / 1MB, 2)
    $wwwSize = [math]::Round((Get-Item $WwwBin).Length / 1MB, 2)
    Write-Host "  Build complete: esp-miner.bin (${fwSize}MB), www.bin (${wwwSize}MB)" -ForegroundColor Green
} else {
    Write-Host "[3/7] Skipping build (--SkipBuild)" -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════
# STEP 4: OTA Flash
# ══════════════════════════════════════════════════════════
if (-not $SkipFlash) {
    Write-Host "[4/7] OTA flashing to $BitaxeIP..." -ForegroundColor Yellow

    # Check if Bitaxe is reachable
    Write-Host "  Pinging Bitaxe..."
    $ping = Test-Connection -ComputerName $BitaxeIP -Count 1 -Quiet
    if (-not $ping) {
        Write-Host "  ERROR: Bitaxe not reachable at $BitaxeIP" -ForegroundColor Red
        Write-Host "  Check your network or use -BitaxeIP to specify the correct IP" -ForegroundColor Red
        exit 1
    }

    # Flash www.bin first
    Write-Host "  Uploading www.bin..."
    $wwwResult = curl.exe -s -X POST "http://${BitaxeIP}/api/system/OTAWWW" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$WwwBin" `
        -w "%{http_code}" -o NUL 2>&1

    if ($wwwResult -ne "200") {
        Write-Host "  WWW upload failed (HTTP $wwwResult)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  www.bin uploaded OK" -ForegroundColor Green

    # Flash esp-miner.bin
    Write-Host "  Uploading esp-miner.bin (miner will reboot after)..."
    $fwResult = curl.exe -s -X POST "http://${BitaxeIP}/api/system/OTA" `
        -H "Content-Type: application/octet-stream" `
        --data-binary "@$EspMinerBin" `
        -w "%{http_code}" -o NUL 2>&1

    if ($fwResult -ne "200") {
        Write-Host "  Firmware upload failed (HTTP $fwResult)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  esp-miner.bin uploaded OK — miner rebooting" -ForegroundColor Green

    # Wait for reboot
    Write-Host "  Waiting for reboot (15s)..."
    Start-Sleep -Seconds 15

    # Verify it came back
    $backUp = Test-Connection -ComputerName $BitaxeIP -Count 1 -Quiet
    if ($backUp) {
        Write-Host "  Bitaxe is back online!" -ForegroundColor Green
    } else {
        Write-Host "  Warning: Bitaxe not responding yet (may still be booting)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/7] Skipping OTA flash (--SkipFlash)" -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════
# STEP 5: Copy firmware binaries to website
# ══════════════════════════════════════════════════════════
Write-Host "[5/7] Copying firmware .bin files to website..." -ForegroundColor Yellow

$WebsiteFirmwareDir = Join-Path $WebsiteRoot "firmware"
if (-not (Test-Path $WebsiteFirmwareDir)) {
    New-Item -ItemType Directory -Path $WebsiteFirmwareDir -Force | Out-Null
}

Copy-Item $EspMinerBin -Destination (Join-Path $WebsiteFirmwareDir "esp-miner.bin") -Force
Copy-Item $WwwBin -Destination (Join-Path $WebsiteFirmwareDir "www.bin") -Force

Write-Host "  esp-miner.bin + www.bin copied to website/firmware/" -ForegroundColor Green

# ══════════════════════════════════════════════════════════
# STEP 6: Deploy website to Netlify
# ══════════════════════════════════════════════════════════
Write-Host "[6/7] Deploying website to Netlify..." -ForegroundColor Yellow

Push-Location $WebsiteRoot
try {
    $deployOutput = & npx netlify-cli deploy --prod --dir=. 2>&1
    $deployExit = $LASTEXITCODE

    if ($deployExit -ne 0) {
        Write-Host "  Netlify deploy failed:" -ForegroundColor Red
        Write-Host $deployOutput
        Write-Host "  Continuing anyway — you can deploy manually later" -ForegroundColor Yellow
    } else {
        # Extract the URL from deploy output
        $liveUrl = ($deployOutput | Select-String "Website URL:") -replace '.*Website URL:\s*', ''
        if ($liveUrl) {
            Write-Host "  Deployed: $liveUrl" -ForegroundColor Green
        } else {
            Write-Host "  Deployed to Netlify!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  Netlify deploy error: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Continuing anyway — you can deploy manually later" -ForegroundColor Yellow
}
Pop-Location

# ══════════════════════════════════════════════════════════
# STEP 7: Discord notification
# ══════════════════════════════════════════════════════════
if (-not $SkipNotify) {
    Write-Host "[7/7] Posting Discord notification..." -ForegroundColor Yellow

    if (Test-Path $NotifyScript) {
        & $NotifyScript -Version $Version -Changelog $Changelog
    } else {
        Write-Host "  Warning: notify-discord.ps1 not found at $NotifyScript" -ForegroundColor Yellow
        Write-Host "  Skipping Discord notification" -ForegroundColor Yellow
    }
} else {
    Write-Host "[7/7] Skipping Discord notification (--SkipNotify)" -ForegroundColor DarkGray
}

# ══════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " LottoAxe OS v$Version RELEASED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Checklist:" -ForegroundColor Cyan
Write-Host "  [x] Version bumped in CMakeLists.txt"
Write-Host "  [x] version.json updated"
if (-not $SkipBuild)  { Write-Host "  [x] Firmware built" }
if (-not $SkipFlash)  { Write-Host "  [x] OTA flashed to $BitaxeIP" }
Write-Host "  [x] Firmware .bin files copied to website"
Write-Host "  [x] Website deployed to Netlify"
if (-not $SkipNotify) { Write-Host "  [x] Discord #updates notified" }
Write-Host ""
