#include "safety.h"
#include "tuning_presets.h"
#include "nvs_config.h"
#include "esp_log.h"
#include "esp_timer.h"

static const char *TAG = "lottoaxe_safety";
static SafetyState state = {0};

void safety_init(void)
{
    state.throttled = false;
    state.original_frequency = 0;
    state.current_frequency = 0;
    state.throttle_count = 0;
    state.last_throttle_time = 0;
    ESP_LOGI(TAG, "Safety module initialized (throttle at %.0fC, shutdown at %.0fC)",
             SAFETY_THROTTLE_TEMP, SAFETY_SHUTDOWN_TEMP);
}

void safety_check_temperature(float chip_temp)
{
    if (chip_temp <= 0) return; // Invalid reading

    if (chip_temp >= SAFETY_SHUTDOWN_TEMP) {
        ESP_LOGE(TAG, "CRITICAL: Chip temp %.1fC >= %.0fC — triggering emergency restart",
                 chip_temp, SAFETY_SHUTDOWN_TEMP);
        // The existing overheat_mode in ESP-Miner handles this,
        // but we log it here for the LottoAxe log viewer
        return;
    }

    float current_freq = nvs_config_get_float(NVS_CONFIG_ASIC_FREQUENCY);

    if (chip_temp >= SAFETY_THROTTLE_TEMP && !state.throttled) {
        state.throttled = true;
        state.original_frequency = current_freq;
        float new_freq = current_freq - SAFETY_THROTTLE_FREQ_STEP;
        if (new_freq < SAFETY_MIN_THROTTLE_FREQ) new_freq = SAFETY_MIN_THROTTLE_FREQ;
        state.current_frequency = new_freq;
        state.throttle_count++;
        state.last_throttle_time = (uint32_t)(esp_timer_get_time() / 1000000ULL);

        ESP_LOGW(TAG, "Auto-throttle: temp %.1fC, reducing frequency %.0f -> %.0f MHz",
                 chip_temp, current_freq, new_freq);
        nvs_config_set_float(NVS_CONFIG_ASIC_FREQUENCY, new_freq);
    } else if (chip_temp >= SAFETY_THROTTLE_TEMP && state.throttled) {
        // Already throttled but still hot — throttle further if possible
        if (current_freq > SAFETY_MIN_THROTTLE_FREQ) {
            float new_freq = current_freq - SAFETY_THROTTLE_FREQ_STEP;
            if (new_freq < SAFETY_MIN_THROTTLE_FREQ) new_freq = SAFETY_MIN_THROTTLE_FREQ;
            state.current_frequency = new_freq;
            ESP_LOGW(TAG, "Still hot (%.1fC), further throttle to %.0f MHz", chip_temp, new_freq);
            nvs_config_set_float(NVS_CONFIG_ASIC_FREQUENCY, new_freq);
        }
    } else if (chip_temp <= SAFETY_THROTTLE_RECOVERY && state.throttled) {
        ESP_LOGI(TAG, "Temp recovered to %.1fC, restoring frequency to %.0f MHz",
                 chip_temp, state.original_frequency);
        nvs_config_set_float(NVS_CONFIG_ASIC_FREQUENCY, state.original_frequency);
        state.current_frequency = state.original_frequency;
        state.throttled = false;
    }
}

bool safety_is_throttled(void)
{
    return state.throttled;
}

const SafetyState *safety_get_state(void)
{
    return &state;
}

bool safety_validate_settings(float frequency, uint16_t voltage)
{
    const TuningLimits *lim = tuning_presets_get_limits();
    if (!tuning_presets_validate_frequency(frequency)) {
        ESP_LOGW(TAG, "Rejected frequency %.0f MHz (range: %u-%u for %s)",
                 frequency, lim->freq_min, lim->freq_max, lim->asic_name);
        return false;
    }
    if (!tuning_presets_validate_voltage(voltage)) {
        ESP_LOGW(TAG, "Rejected voltage %d mV (range: %u-%u for %s)",
                 voltage, lim->volt_min, lim->volt_max, lim->asic_name);
        return false;
    }
    return true;
}
