# LottoAxe OS

Custom firmware for Bitaxe Ultra 1366 (BM1366 ASIC) based on ESP-Miner/AxeOS.
Optimized for solo/lotto mining with enhanced pool management, tuning presets, and safety features.

## Features

### Pool Profiles
- Save up to 8 pool configurations
- One-click switch between profiles
- Preset pools: DGB Solo (SoloHash CA), BTC Solo (Public Pool), Zpool SHA256
- Custom pool entry with full stratum configuration

### Tuning Presets
- **Eco**: 400 MHz / 1150 mV — quiet, low power (~350 GH/s)
- **Balanced**: 485 MHz / 1200 mV — stock performance
- **Performance**: 525 MHz / 1250 mV — higher hashrate (~550 GH/s)
- **Lotto Mode**: 575 MHz / 1300 mV — maximum hashrate, full fan

### Safety System
- Auto-throttle: reduces frequency when chip temp exceeds 65C
- Recovery: restores frequency when temp drops below 60C
- Emergency shutdown at 72C (uses existing ESP-Miner overheat mode)
- All user-requested frequency/voltage values clamped to safe BM1366 ranges (400-575 MHz, 1100-1300 mV)
- Confirmation dialog before applying aggressive presets

### Config Backup/Restore
- Export all settings as JSON
- Import from previously exported file
- Factory reset (double-confirm required)

### Web UI
- Rebranded to "LottoAxe OS"
- Dark mode support (existing AxeOS theme system preserved)
- New sidebar navigation: Pool Profiles, Tuning, Config
- All existing AxeOS pages preserved (Dashboard, Pool, Settings, Logs, Scoreboard, Swarm, etc.)

### Preserved Stock Features
- All stock ESP-Miner mining functionality
- Stratum V1 and V2 support
- OTA firmware and web UI updates
- WiFi AP mode for initial setup
- Recovery mode for failed OTA
- Self-test on boot button press
- Display/OLED support
- BAP accessory protocol

---

## Hardware Target

| Component | Specification |
|-----------|--------------|
| Board | Bitaxe Ultra (v2.05) |
| ASIC | BM1366, single chip |
| Controller | ESP32-S3 (16MB flash, 8MB PSRAM) |
| Thermal | EMC2101 sensor + PWM fan |
| Power | DS4432U DAC + INA260 monitor |
| Max Power | 25W |

---

## Build Instructions

### Prerequisites

1. **ESP-IDF v5.5.x** — Install from https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32s3/get-started/
   - Windows: Use the ESP-IDF Tools Installer from https://dl.espressif.com/dl/esp-idf/
   - Linux/Mac: Follow the manual install guide

2. **Node.js 18+** and **npm** — Required for building the Angular web UI

3. **Git** — Already installed if you're reading this

### Build Steps

```bash
# 1. Clone this repo (already done if you have this file)
git clone https://github.com/YOUR_FORK/ESP-Miner.git
cd ESP-Miner
git checkout lottoaxe-os

# 2. Set ESP-IDF environment
# Windows (ESP-IDF PowerShell):
. $HOME\esp\v5.5.1\esp-idf\export.ps1
# Linux/Mac:
. ~/esp/esp-idf/export.sh

# 3. Build the web UI
cd main/http_server/axe-os
npm install
npm run generate:api
npx ng build --configuration=production
cd ../../..

# 4. Build the firmware
idf.py set-target esp32s3
idf.py build

# 5. Binaries are in build/ directory:
#    - build/esp-miner.bin (OTA image)
#    - build/bootloader/bootloader.bin
#    - build/partition_table/partition-table.bin
```

### Create Factory Image (merged binary)

```bash
# Merge all partitions into a single flashable binary
esptool.py --chip esp32s3 merge_bin \
  -o build/lottoaxe-factory.bin \
  --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x0 build/bootloader/bootloader.bin \
  0x8000 build/partition_table/partition-table.bin \
  0x9000 config-205.cvs \
  0x10000 build/esp-miner.bin \
  0x410000 build/www.bin
```

---

## Flashing Instructions

### First Flash (Factory)

```bash
# Connect Bitaxe via USB-C, put in download mode (hold BOOT, press RESET)
esptool.py --chip esp32s3 --port COM3 --baud 921600 \
  write_flash 0x0 build/lottoaxe-factory.bin
```

### OTA Update (from web UI)

1. Open the LottoAxe OS web UI in your browser
2. Navigate to **Update** page
3. Upload `build/esp-miner.bin` as firmware
4. Upload `build/www.bin` as web UI (if changed)
5. Device will reboot automatically

---

## Rollback to Stock ESP-Miner

### Method 1: OTA (if device is accessible)

1. Download the latest official ESP-Miner release from https://github.com/bitaxeorg/ESP-Miner/releases
2. Open your Bitaxe web UI → Update page
3. Flash the stock `.bin` firmware file

### Method 2: USB Flash (if device is bricked/unreachable)

```bash
# Download latest stock factory image from ESP-Miner releases
# Put Bitaxe in download mode (hold BOOT, press RESET)
esptool.py --chip esp32s3 --port COM3 --baud 921600 \
  write_flash 0x0 esp-miner-factory-v2.X.X.bin
```

### Method 3: Recovery Mode

If the web UI is accessible but pool config is broken:
1. Navigate to `http://DEVICE_IP/recovery`
2. Upload stock firmware from the recovery page

---

## Changed Files

### New Files (LottoAxe modules)
```
main/lottoaxe/
  pool_profiles.h      — Pool profile data structures and API
  pool_profiles.c      — NVS storage, CRUD operations, preset pools
  tuning_presets.h     — Preset definitions and validation functions
  tuning_presets.c     — Eco/Balanced/Performance/Lotto presets
  config_backup.h      — Config export/import API
  config_backup.c      — JSON serialization, factory reset
  safety.h             — Auto-throttle state and validation
  safety.c             — Temperature monitoring, frequency throttling
  lottoaxe_api.h       — HTTP endpoint registration
  lottoaxe_api.c       — REST API handlers for all LottoAxe features
```

### New Web UI Components
```
main/http_server/axe-os/src/app/components/
  pool-profiles/
    pool-profiles.component.ts    — Pool profile management UI logic
    pool-profiles.component.html  — Pool profile cards and add form
  tuning-presets/
    tuning-presets.component.ts   — Tuning preset UI logic with safety warnings
    tuning-presets.component.html — Preset cards with apply buttons
  config-backup/
    config-backup.component.ts    — Export/import/reset logic
    config-backup.component.html  — Three-panel backup UI
```

### Modified Files
```
main/CMakeLists.txt              — Added lottoaxe source files and include dir
main/main.c                      — Added lottoaxe_api_init() call, updated welcome message
main/http_server/http_server.c   — Added lottoaxe_api.h include, registered endpoints

main/http_server/axe-os/src/app/
  app-routing.module.ts          — Changed TITLE_PREFIX to 'LottoAxe OS', added 3 routes
  app.module.ts                  — Registered 3 new components
  layout/app.menu.component.ts   — Added Pool Profiles, Tuning, Config menu items
  layout/app.topbar.component.html — Replaced SVG logo with LottoAxe OS text branding
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lottoaxe/profiles` | Get all pool profiles |
| POST | `/api/lottoaxe/profiles` | Add new pool profile |
| PUT | `/api/lottoaxe/profiles/activate?index=N` | Activate profile N |
| DELETE | `/api/lottoaxe/profiles?index=N` | Delete profile N |
| GET | `/api/lottoaxe/presets` | Get tuning presets + safety state |
| POST | `/api/lottoaxe/presets/apply?id=N` | Apply preset N |
| GET | `/api/lottoaxe/config/export` | Export config as JSON |
| POST | `/api/lottoaxe/config/import` | Import config from JSON |
| POST | `/api/lottoaxe/config/factory-reset` | Factory reset + reboot |
| GET | `/api/lottoaxe/safety` | Get safety/throttle state |

---

## Default Pool Presets

| Name | URL | Port | Default User |
|------|-----|------|-------------|
| DGB Solo (Low Diff) | solo-ca.solohash.co.uk | 3341 | DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E.bitaxe |
| DGB Solo (High Diff) | solo-ca.solohash.co.uk | 3342 | DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E.bitaxe |
| BTC Solo (Public Pool) | public-pool.io | 21496 | YOUR_BTC_ADDRESS.bitaxe |
| Zpool SHA256 | sha256.na.mine.zpool.ca | 3333 | DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E |

---

## Safety Design

1. **Frequency/voltage clamping**: All values validated against BM1366 safe ranges before NVS write
2. **Auto-throttle**: Monitors chip temp, reduces frequency in 25 MHz steps when >65C
3. **Recovery**: Restores original frequency when temp drops below 60C
4. **Emergency**: ESP-Miner's existing overheat_mode triggers at 72C (pauses mining)
5. **Boot safety**: If NVS contains invalid values, ESP-Miner defaults are used (from Kconfig)
6. **Preset warnings**: UI shows confirmation dialog before applying Performance/Lotto presets
7. **Factory reset**: Double-confirm required, erases NVS and reboots to AP mode

---

## License

Based on ESP-Miner by bitaxeorg. Licensed under the same terms as the upstream project.
