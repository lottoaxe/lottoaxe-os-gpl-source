const fs = require('fs');
const path = require('path');

// ─── Version must EXACTLY match the firmware binary's PROJECT_VER ───
// The firmware (esp-miner.bin) bakes its version at compile time via
// CMakeLists.txt → PROJECT_VER.  The UI (www.bin) stores its version in
// /version.txt inside SPIFFS.  If these two strings don't match, the
// dashboard shows a scary "versions do not match" banner.
//
// Because the ESP-IDF build and the Angular build run in different
// environments (git may or may not be in PATH), the safest approach is
// to hardcode the shipping version here so it always matches the
// compiled firmware.  Bump this when you tag + rebuild the firmware.
const version = '2.2.1';

const outputPath = path.join(__dirname, 'dist', 'axe-os', 'version.txt');
fs.writeFileSync(outputPath, version);

console.log(`Generated ${outputPath} with version ${version}`);
