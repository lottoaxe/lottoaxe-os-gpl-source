#include "config_backup.h"
#include "nvs_config.h"
#include "pool_profiles.h"
#include "esp_log.h"
#include <nvs_flash.h>
#include <string.h>

static const char *TAG = "config_backup";

// Keys that are safe to export/import (no hardware-specific or dangerous keys)
static const NvsConfigKey EXPORTABLE_KEYS[] = {
    NVS_CONFIG_WIFI_SSID,
    NVS_CONFIG_WIFI_PASS,
    NVS_CONFIG_HOSTNAME,
    NVS_CONFIG_STRATUM_URL,
    NVS_CONFIG_STRATUM_PORT,
    NVS_CONFIG_STRATUM_USER,
    NVS_CONFIG_STRATUM_PASS,
    NVS_CONFIG_STRATUM_DIFFICULTY,
    NVS_CONFIG_STRATUM_EXTRANONCE_SUBSCRIBE,
    NVS_CONFIG_STRATUM_TLS,
    NVS_CONFIG_STRATUM_DECODE_COINBASE_TX,
    NVS_CONFIG_FALLBACK_STRATUM_URL,
    NVS_CONFIG_FALLBACK_STRATUM_PORT,
    NVS_CONFIG_FALLBACK_STRATUM_USER,
    NVS_CONFIG_FALLBACK_STRATUM_PASS,
    NVS_CONFIG_FALLBACK_STRATUM_DIFFICULTY,
    NVS_CONFIG_FALLBACK_STRATUM_EXTRANONCE_SUBSCRIBE,
    NVS_CONFIG_FALLBACK_STRATUM_TLS,
    NVS_CONFIG_FALLBACK_STRATUM_DECODE_COINBASE_TX,
    NVS_CONFIG_ASIC_FREQUENCY,
    NVS_CONFIG_ASIC_VOLTAGE,
    NVS_CONFIG_AUTO_FAN_SPEED,
    NVS_CONFIG_MANUAL_FAN_SPEED,
    NVS_CONFIG_MIN_FAN_SPEED,
    NVS_CONFIG_TEMP_TARGET,
    NVS_CONFIG_OVERHEAT_MODE,
    NVS_CONFIG_DISPLAY,
    NVS_CONFIG_ROTATION,
    NVS_CONFIG_INVERT_SCREEN,
    NVS_CONFIG_DISPLAY_TIMEOUT,
    NVS_CONFIG_THEME_SCHEME,
    NVS_CONFIG_THEME_COLORS,
};
#define EXPORTABLE_KEY_COUNT (sizeof(EXPORTABLE_KEYS) / sizeof(EXPORTABLE_KEYS[0]))

cJSON *config_backup_export(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "_firmware", "LottoAxe OS");
    cJSON_AddNumberToObject(root, "_version", 1);

    cJSON *settings = cJSON_CreateObject();

    for (int i = 0; i < EXPORTABLE_KEY_COUNT; i++) {
        NvsConfigKey key = EXPORTABLE_KEYS[i];
        Settings *s = nvs_config_get_settings(key);
        if (!s || !s->rest_name) continue;

        switch (s->type) {
            case TYPE_STR: {
                char *val = nvs_config_get_string(key);
                if (val) {
                    cJSON_AddStringToObject(settings, s->rest_name, val);
                    free(val);
                }
                break;
            }
            case TYPE_U16:
                cJSON_AddNumberToObject(settings, s->rest_name, nvs_config_get_u16(key));
                break;
            case TYPE_I32:
                cJSON_AddNumberToObject(settings, s->rest_name, nvs_config_get_i32(key));
                break;
            case TYPE_U64:
                cJSON_AddNumberToObject(settings, s->rest_name, (double)nvs_config_get_u64(key));
                break;
            case TYPE_FLOAT:
                cJSON_AddNumberToObject(settings, s->rest_name, nvs_config_get_float(key));
                break;
            case TYPE_BOOL:
                cJSON_AddBoolToObject(settings, s->rest_name, nvs_config_get_bool(key));
                break;
        }
    }

    cJSON_AddItemToObject(root, "settings", settings);

    // Include pool profiles
    cJSON *profiles = pool_profiles_to_json();
    if (profiles) {
        cJSON_AddItemToObject(root, "poolProfiles", profiles);
    }

    return root;
}

esp_err_t config_backup_import(const cJSON *json)
{
    if (!json) return ESP_ERR_INVALID_ARG;

    // Validate it's a LottoAxe config
    cJSON *firmware = cJSON_GetObjectItem(json, "_firmware");
    if (!cJSON_IsString(firmware) || strcmp(firmware->valuestring, "LottoAxe OS") != 0) {
        ESP_LOGE(TAG, "Invalid config file: missing or wrong _firmware field");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *settings = cJSON_GetObjectItem(json, "settings");
    if (!cJSON_IsObject(settings)) {
        ESP_LOGE(TAG, "Invalid config: missing settings object");
        return ESP_ERR_INVALID_ARG;
    }

    // Import each known setting
    for (int i = 0; i < EXPORTABLE_KEY_COUNT; i++) {
        NvsConfigKey key = EXPORTABLE_KEYS[i];
        Settings *s = nvs_config_get_settings(key);
        if (!s || !s->rest_name) continue;

        cJSON *item = cJSON_GetObjectItem(settings, s->rest_name);
        if (!item) continue;

        switch (s->type) {
            case TYPE_STR:
                if (cJSON_IsString(item)) {
                    nvs_config_set_string(key, item->valuestring);
                }
                break;
            case TYPE_U16:
                if (cJSON_IsNumber(item)) {
                    uint16_t val = (uint16_t)item->valuedouble;
                    if (val >= s->min && val <= s->max) {
                        nvs_config_set_u16(key, val);
                    }
                }
                break;
            case TYPE_I32:
                if (cJSON_IsNumber(item)) {
                    int32_t val = (int32_t)item->valuedouble;
                    nvs_config_set_i32(key, val);
                }
                break;
            case TYPE_U64:
                if (cJSON_IsNumber(item)) {
                    nvs_config_set_u64(key, (uint64_t)item->valuedouble);
                }
                break;
            case TYPE_FLOAT:
                if (cJSON_IsNumber(item)) {
                    nvs_config_set_float(key, (float)item->valuedouble);
                }
                break;
            case TYPE_BOOL:
                if (cJSON_IsBool(item)) {
                    nvs_config_set_bool(key, cJSON_IsTrue(item));
                }
                break;
        }
    }

    // Import pool profiles if present
    cJSON *profiles = cJSON_GetObjectItem(json, "poolProfiles");
    if (cJSON_IsObject(profiles)) {
        pool_profiles_from_json(profiles);
    }

    ESP_LOGI(TAG, "Config imported successfully");
    return ESP_OK;
}

esp_err_t config_backup_factory_reset(void)
{
    ESP_LOGW(TAG, "Factory reset requested — erasing NVS");
    esp_err_t err = nvs_flash_erase();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS erase failed: %s", esp_err_to_name(err));
        return err;
    }
    err = nvs_flash_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS re-init failed: %s", esp_err_to_name(err));
    }
    return err;
}
