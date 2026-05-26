#ifndef LOTTOAXE_TUNING_PRESETS_H
#define LOTTOAXE_TUNING_PRESETS_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "cJSON.h"
#include "device_config.h"

// Universal thermal safety limits (same for all ASICs)
#define TUNING_TEMP_WARN       62
#define TUNING_TEMP_CRIT       68
#define TUNING_TEMP_SHUTDOWN   72

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

// Active ASIC limits — populated at init from detected hardware
typedef struct {
    uint16_t freq_min;
    uint16_t freq_max;
    uint16_t volt_min;
    uint16_t volt_max;
    const char *asic_name;
} TuningLimits;

/**
 * Initialize tuning presets for the detected ASIC.
 * Must be called after device_config_init so the ASIC config is known.
 */
void tuning_presets_init(const AsicConfig *asic);

const TuningPreset *tuning_presets_get(TuningPresetId id);
cJSON *tuning_presets_to_json(void);
esp_err_t tuning_presets_apply(TuningPresetId id);
bool tuning_presets_validate_frequency(float freq);
bool tuning_presets_validate_voltage(uint16_t voltage);
float tuning_presets_clamp_frequency(float freq);
uint16_t tuning_presets_clamp_voltage(uint16_t voltage);

/** Return the active limits derived from the detected ASIC config. */
const TuningLimits *tuning_presets_get_limits(void);

#endif
