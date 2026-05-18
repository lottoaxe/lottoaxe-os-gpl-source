#include "tuning_presets.h"
#include "nvs_config.h"
#include "esp_log.h"

static const char *TAG = "tuning_presets";

static const TuningPreset PRESETS[PRESET_COUNT] = {
    [PRESET_ECO] = {
        .name = "Eco",
        .description = "Low power, quiet operation. ~350 GH/s, minimal heat.",
        .frequency = 400,
        .voltage = 1150,
        .fan_speed = 0,
        .auto_fan = true,
        .temp_target = 55,
    },
    [PRESET_BALANCED] = {
        .name = "Balanced",
        .description = "Default settings. Good hashrate with moderate power.",
        .frequency = 485,
        .voltage = 1200,
        .fan_speed = 0,
        .auto_fan = true,
        .temp_target = 60,
    },
    [PRESET_PERFORMANCE] = {
        .name = "Performance",
        .description = "Higher hashrate, more power and heat. ~550 GH/s.",
        .frequency = 525,
        .voltage = 1250,
        .fan_speed = 0,
        .auto_fan = true,
        .temp_target = 62,
    },
    [PRESET_LOTTO] = {
        .name = "Lotto Mode",
        .description = "Maximum hashrate for solo mining. Louder fan, more heat.",
        .frequency = 575,
        .voltage = 1300,
        .fan_speed = 100,
        .auto_fan = false,
        .temp_target = 65,
    },
};

const TuningPreset *tuning_presets_get(TuningPresetId id)
{
    if (id >= PRESET_COUNT) return NULL;
    return &PRESETS[id];
}

cJSON *tuning_presets_to_json(void)
{
    cJSON *arr = cJSON_CreateArray();
    for (int i = 0; i < PRESET_COUNT; i++) {
        cJSON *p = cJSON_CreateObject();
        cJSON_AddStringToObject(p, "id", PRESETS[i].name);
        cJSON_AddStringToObject(p, "name", PRESETS[i].name);
        cJSON_AddStringToObject(p, "description", PRESETS[i].description);
        cJSON_AddNumberToObject(p, "frequency", PRESETS[i].frequency);
        cJSON_AddNumberToObject(p, "voltage", PRESETS[i].voltage);
        cJSON_AddNumberToObject(p, "fanSpeed", PRESETS[i].fan_speed);
        cJSON_AddBoolToObject(p, "autoFan", PRESETS[i].auto_fan);
        cJSON_AddNumberToObject(p, "tempTarget", PRESETS[i].temp_target);
        cJSON_AddItemToArray(arr, p);
    }
    return arr;
}

esp_err_t tuning_presets_apply(TuningPresetId id)
{
    if (id >= PRESET_COUNT) return ESP_ERR_INVALID_ARG;

    const TuningPreset *preset = &PRESETS[id];

    // Validate before applying
    if (!tuning_presets_validate_frequency(preset->frequency)) {
        ESP_LOGE(TAG, "Preset frequency %.0f out of safe range", preset->frequency);
        return ESP_ERR_INVALID_STATE;
    }
    if (!tuning_presets_validate_voltage(preset->voltage)) {
        ESP_LOGE(TAG, "Preset voltage %d out of safe range", preset->voltage);
        return ESP_ERR_INVALID_STATE;
    }

    nvs_config_set_float(NVS_CONFIG_ASIC_FREQUENCY, preset->frequency);
    nvs_config_set_u16(NVS_CONFIG_ASIC_VOLTAGE, preset->voltage);
    nvs_config_set_bool(NVS_CONFIG_AUTO_FAN_SPEED, preset->auto_fan);
    if (!preset->auto_fan) {
        nvs_config_set_u16(NVS_CONFIG_MANUAL_FAN_SPEED, preset->fan_speed);
    }
    nvs_config_set_u16(NVS_CONFIG_TEMP_TARGET, preset->temp_target);

    ESP_LOGI(TAG, "Applied preset '%s': %.0f MHz, %d mV, fan=%s, temp=%d",
             preset->name, preset->frequency, preset->voltage,
             preset->auto_fan ? "auto" : "manual", preset->temp_target);

    return ESP_OK;
}

bool tuning_presets_validate_frequency(float freq)
{
    return (freq >= BM1366_FREQ_MIN && freq <= BM1366_FREQ_MAX);
}

bool tuning_presets_validate_voltage(uint16_t voltage)
{
    return (voltage >= BM1366_VOLT_MIN && voltage <= BM1366_VOLT_MAX);
}

float tuning_presets_clamp_frequency(float freq)
{
    if (freq < BM1366_FREQ_MIN) return BM1366_FREQ_MIN;
    if (freq > BM1366_FREQ_MAX) return BM1366_FREQ_MAX;
    return freq;
}

uint16_t tuning_presets_clamp_voltage(uint16_t voltage)
{
    if (voltage < BM1366_VOLT_MIN) return BM1366_VOLT_MIN;
    if (voltage > BM1366_VOLT_MAX) return BM1366_VOLT_MAX;
    return voltage;
}
