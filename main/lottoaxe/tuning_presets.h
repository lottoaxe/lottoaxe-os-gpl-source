#ifndef LOTTOAXE_TUNING_PRESETS_H
#define LOTTOAXE_TUNING_PRESETS_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "cJSON.h"

// BM1366 safe limits (from device_config.h: 400-575 MHz, 1100-1300 mV)
#define BM1366_FREQ_MIN     400
#define BM1366_FREQ_MAX     575
#define BM1366_FREQ_SAFE    525
#define BM1366_VOLT_MIN     1100
#define BM1366_VOLT_MAX     1300
#define BM1366_VOLT_SAFE    1200
#define BM1366_TEMP_WARN    62
#define BM1366_TEMP_CRIT    68
#define BM1366_TEMP_SHUTDOWN 72

typedef enum {
    PRESET_ECO = 0,
    PRESET_BALANCED,
    PRESET_PERFORMANCE,
    PRESET_LOTTO,
    PRESET_COUNT
} TuningPresetId;

typedef struct {
    const char *name;
    const char *description;
    float frequency;
    uint16_t voltage;
    uint16_t fan_speed;     // 0 = auto
    bool auto_fan;
    uint16_t temp_target;
} TuningPreset;

const TuningPreset *tuning_presets_get(TuningPresetId id);
cJSON *tuning_presets_to_json(void);
esp_err_t tuning_presets_apply(TuningPresetId id);
bool tuning_presets_validate_frequency(float freq);
bool tuning_presets_validate_voltage(uint16_t voltage);
float tuning_presets_clamp_frequency(float freq);
uint16_t tuning_presets_clamp_voltage(uint16_t voltage);

#endif
