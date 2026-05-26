#include "tuning_presets.h"
#include "nvs_config.h"
#include "esp_log.h"

static const char *TAG = "tuning_presets";

// ---------------------------------------------------------------------------
// Dynamic ASIC limits — filled by tuning_presets_init()
// ---------------------------------------------------------------------------
static TuningLimits s_limits = {
    // Sane defaults until init runs (BM1366-like)
    .freq_min  = 400,
    .freq_max  = 575,
    .volt_min  = 1100,
    .volt_max  = 1300,
    .asic_name = "Unknown",
};

// ---------------------------------------------------------------------------
// Per-ASIC preset tables
// ---------------------------------------------------------------------------

static const TuningPreset PRESETS_BM1397[PRESET_COUNT] = {
    [PRESET_ECO] = {
        .name = "Eco", .description = "Low power, quiet. ~250 GH/s.",
        .frequency = 425, .voltage = 1200, .fan_speed = 0, .auto_fan = true, .temp_target = 55,
    },
    [PRESET_BALANCED] = {
        .name = "Balanced", .description = "Default settings. Good hashrate with moderate power.",
        .frequency = 500, .voltage = 1300, .fan_speed = 0, .auto_fan = true, .temp_target = 60,
    },
    [PRESET_PERFORMANCE] = {
        .name = "Performance", .description = "Higher hashrate, more power and heat.",
        .frequency = 550, .voltage = 1400, .fan_speed = 0, .auto_fan = true, .temp_target = 62,
    },
    [PRESET_LOTTO] = {
        .name = "Lotto Mode", .description = "Maximum hashrate for solo mining. Full send.",
        .frequency = 600, .voltage = 1500, .fan_speed = 100, .auto_fan = false, .temp_target = 65,
    },
};

static const TuningPreset PRESETS_BM1366[PRESET_COUNT] = {
    [PRESET_ECO] = {
        .name = "Eco", .description = "Low power, quiet. ~350 GH/s, minimal heat.",
        .frequency = 400, .voltage = 1150, .fan_speed = 0, .auto_fan = true, .temp_target = 55,
    },
    [PRESET_BALANCED] = {
        .name = "Balanced", .description = "Default settings. Good hashrate with moderate power.",
        .frequency = 485, .voltage = 1200, .fan_speed = 0, .auto_fan = true, .temp_target = 60,
    },
    [PRESET_PERFORMANCE] = {
        .name = "Performance", .description = "Higher hashrate, more power and heat. ~550 GH/s.",
        .frequency = 525, .voltage = 1250, .fan_speed = 0, .auto_fan = true, .temp_target = 62,
    },
    [PRESET_LOTTO] = {
        .name = "Lotto Mode", .description = "Maximum hashrate for solo mining. Full send.",
        .frequency = 575, .voltage = 1300, .fan_speed = 100, .auto_fan = false, .temp_target = 65,
    },
};

static const TuningPreset PRESETS_BM1368[PRESET_COUNT] = {
    [PRESET_ECO] = {
        .name = "Eco", .description = "Low power, quiet operation.",
        .frequency = 400, .voltage = 1100, .fan_speed = 0, .auto_fan = true, .temp_target = 55,
    },
    [PRESET_BALANCED] = {
        .name = "Balanced", .description = "Default settings. Good hashrate with moderate power.",
        .frequency = 490, .voltage = 1200, .fan_speed = 0, .auto_fan = true, .temp_target = 60,
    },
    [PRESET_PERFORMANCE] = {
        .name = "Performance", .description = "Higher hashrate, more power and heat.",
        .frequency = 525, .voltage = 1250, .fan_speed = 0, .auto_fan = true, .temp_target = 62,
    },
    [PRESET_LOTTO] = {
        .name = "Lotto Mode", .description = "Maximum hashrate for solo mining. Full send.",
        .frequency = 575, .voltage = 1300, .fan_speed = 100, .auto_fan = false, .temp_target = 65,
    },
};

static const TuningPreset PRESETS_BM1370[PRESET_COUNT] = {
    [PRESET_ECO] = {
        .name = "Eco", .description = "Low power, efficient operation.",
        .frequency = 490, .voltage = 1060, .fan_speed = 0, .auto_fan = true, .temp_target = 55,
    },
    [PRESET_BALANCED] = {
        .name = "Balanced", .description = "Default settings. Good hashrate with moderate power.",
        .frequency = 525, .voltage = 1150, .fan_speed = 0, .auto_fan = true, .temp_target = 60,
    },
    [PRESET_PERFORMANCE] = {
        .name = "Performance", .description = "Higher hashrate, more power and heat.",
        .frequency = 600, .voltage = 1200, .fan_speed = 0, .auto_fan = true, .temp_target = 62,
    },
    [PRESET_LOTTO] = {
        .name = "Lotto Mode", .description = "Maximum hashrate for solo mining. Full send.",
        .frequency = 625, .voltage = 1250, .fan_speed = 100, .auto_fan = false, .temp_target = 65,
    },
};

// Pointer to the active preset table (set at init)
static const TuningPreset *s_active_presets = PRESETS_BM1366;  // default fallback

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk a zero-terminated uint16_t options array to find min and max values. */
static void options_minmax(const uint16_t *opts, uint16_t *out_min, uint16_t *out_max)
{
    if (!opts || opts[0] == 0) return;
    *out_min = opts[0];
    *out_max = opts[0];
    for (int i = 1; opts[i] != 0; i++) {
        if (opts[i] < *out_min) *out_min = opts[i];
        if (opts[i] > *out_max) *out_max = opts[i];
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

void tuning_presets_init(const AsicConfig *asic)
{
    if (!asic) {
        ESP_LOGW(TAG, "tuning_presets_init called with NULL ASIC config, using defaults");
        return;
    }

    s_limits.asic_name = asic->name;
    options_minmax(asic->frequency_options, &s_limits.freq_min, &s_limits.freq_max);
    options_minmax(asic->voltage_options,   &s_limits.volt_min, &s_limits.volt_max);

    // Select the preset table for this ASIC
    switch (asic->id) {
        case BM1397: s_active_presets = PRESETS_BM1397; break;
        case BM1366: s_active_presets = PRESETS_BM1366; break;
        case BM1368: s_active_presets = PRESETS_BM1368; break;
        case BM1370: s_active_presets = PRESETS_BM1370; break;
        default:     s_active_presets = PRESETS_BM1366; break;
    }

    ESP_LOGI(TAG, "Tuning presets initialized for %s  (freq %u-%u MHz, volt %u-%u mV)",
             s_limits.asic_name, s_limits.freq_min, s_limits.freq_max,
             s_limits.volt_min, s_limits.volt_max);
}

const TuningLimits *tuning_presets_get_limits(void)
{
    return &s_limits;
}

const TuningPreset *tuning_presets_get(TuningPresetId id)
{
    if (id >= PRESET_COUNT) return NULL;
    return &s_active_presets[id];
}

cJSON *tuning_presets_to_json(void)
{
    cJSON *arr = cJSON_CreateArray();
    for (int i = 0; i < PRESET_COUNT; i++) {
        cJSON *p = cJSON_CreateObject();
        cJSON_AddStringToObject(p, "id", s_active_presets[i].name);
        cJSON_AddStringToObject(p, "name", s_active_presets[i].name);
        cJSON_AddStringToObject(p, "description", s_active_presets[i].description);
        cJSON_AddNumberToObject(p, "frequency", s_active_presets[i].frequency);
        cJSON_AddNumberToObject(p, "voltage", s_active_presets[i].voltage);
        cJSON_AddNumberToObject(p, "fanSpeed", s_active_presets[i].fan_speed);
        cJSON_AddBoolToObject(p, "autoFan", s_active_presets[i].auto_fan);
        cJSON_AddNumberToObject(p, "tempTarget", s_active_presets[i].temp_target);
        cJSON_AddItemToArray(arr, p);
    }
    return arr;
}

esp_err_t tuning_presets_apply(TuningPresetId id)
{
    if (id >= PRESET_COUNT) return ESP_ERR_INVALID_ARG;

    const TuningPreset *preset = &s_active_presets[id];

    // Validate before applying
    if (!tuning_presets_validate_frequency(preset->frequency)) {
        ESP_LOGE(TAG, "Preset frequency %.0f out of safe range for %s", preset->frequency, s_limits.asic_name);
        return ESP_ERR_INVALID_STATE;
    }
    if (!tuning_presets_validate_voltage(preset->voltage)) {
        ESP_LOGE(TAG, "Preset voltage %d out of safe range for %s", preset->voltage, s_limits.asic_name);
        return ESP_ERR_INVALID_STATE;
    }

    nvs_config_set_float(NVS_CONFIG_ASIC_FREQUENCY, preset->frequency);
    nvs_config_set_u16(NVS_CONFIG_ASIC_VOLTAGE, preset->voltage);
    nvs_config_set_bool(NVS_CONFIG_AUTO_FAN_SPEED, preset->auto_fan);
    if (!preset->auto_fan) {
        nvs_config_set_u16(NVS_CONFIG_MANUAL_FAN_SPEED, preset->fan_speed);
    }
    nvs_config_set_u16(NVS_CONFIG_TEMP_TARGET, preset->temp_target);

    ESP_LOGI(TAG, "Applied preset '%s' for %s: %.0f MHz, %d mV, fan=%s, temp=%d",
             preset->name, s_limits.asic_name,
             preset->frequency, preset->voltage,
             preset->auto_fan ? "auto" : "manual", preset->temp_target);

    return ESP_OK;
}

bool tuning_presets_validate_frequency(float freq)
{
    return (freq >= s_limits.freq_min && freq <= s_limits.freq_max);
}

bool tuning_presets_validate_voltage(uint16_t voltage)
{
    return (voltage >= s_limits.volt_min && voltage <= s_limits.volt_max);
}

float tuning_presets_clamp_frequency(float freq)
{
    if (freq < s_limits.freq_min) return s_limits.freq_min;
    if (freq > s_limits.freq_max) return s_limits.freq_max;
    return freq;
}

uint16_t tuning_presets_clamp_voltage(uint16_t voltage)
{
    if (voltage < s_limits.volt_min) return s_limits.volt_min;
    if (voltage > s_limits.volt_max) return s_limits.volt_max;
    return voltage;
}
