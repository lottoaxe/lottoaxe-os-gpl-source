#include "pool_profiles.h"
#include "nvs_config.h"
#include "esp_log.h"
#include <nvs_flash.h>
#include <nvs.h>
#include <string.h>

static const char *TAG = "pool_profiles";
static const char *NVS_NAMESPACE = "lottoaxe";
static const char *NVS_KEY_PROFILES = "profiles";
static const char *NVS_KEY_ACTIVE = "active_pool";

static PoolProfileStore store = {0};
static bool initialized = false;

static const PoolProfile PRESET_PROFILES[] = {
    {
        .name = "DGB Solo (Low Diff)",
        .url = "solo-ca.solohash.co.uk",
        .port = 3341,
        .user = "DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E.bitaxe",
        .pass = "x",
        .difficulty = 1,
        .extranonce_subscribe = false,
        .tls = 0,
    },
    {
        .name = "DGB Solo (High Diff)",
        .url = "solo-ca.solohash.co.uk",
        .port = 3342,
        .user = "DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E.bitaxe",
        .pass = "x",
        .difficulty = 64,
        .extranonce_subscribe = false,
        .tls = 0,
    },
    {
        .name = "BTC Solo (Public Pool)",
        .url = "public-pool.io",
        .port = 21496,
        .user = "YOUR_BTC_ADDRESS.bitaxe",
        .pass = "x",
        .difficulty = 1000,
        .extranonce_subscribe = false,
        .tls = 0,
    },
    {
        .name = "Zpool SHA256",
        .url = "sha256.na.mine.zpool.ca",
        .port = 3333,
        .user = "DT5wURD7xTpzCumiU79EhVbB4GP6tQcb2E",
        .pass = "c=DGB",
        .difficulty = 8,
        .extranonce_subscribe = true,
        .tls = 0,
    },
};
#define PRESET_COUNT (sizeof(PRESET_PROFILES) / sizeof(PRESET_PROFILES[0]))

esp_err_t pool_profiles_init(void)
{
    if (initialized) return ESP_OK;

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS namespace: %s", esp_err_to_name(err));
        return err;
    }

    size_t required_size = 0;
    err = nvs_get_blob(handle, NVS_KEY_PROFILES, NULL, &required_size);
    if (err == ESP_OK && required_size == sizeof(PoolProfileStore)) {
        nvs_get_blob(handle, NVS_KEY_PROFILES, &store, &required_size);
        ESP_LOGI(TAG, "Loaded %d pool profiles from NVS", store.count);
    } else {
        // First boot: load preset profiles
        memset(&store, 0, sizeof(store));
        for (uint8_t i = 0; i < PRESET_COUNT && i < POOL_PROFILES_MAX; i++) {
            memcpy(&store.profiles[i], &PRESET_PROFILES[i], sizeof(PoolProfile));
            store.count++;
        }
        store.active_index = 0;
        ESP_LOGI(TAG, "Initialized with %d preset pool profiles", store.count);
        pool_profiles_save();
    }

    uint8_t active = 0;
    if (nvs_get_u8(handle, NVS_KEY_ACTIVE, &active) == ESP_OK) {
        store.active_index = (active < store.count) ? active : 0;
    }

    nvs_close(handle);
    initialized = true;
    return ESP_OK;
}

esp_err_t pool_profiles_save(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_blob(handle, NVS_KEY_PROFILES, &store, sizeof(PoolProfileStore));
    if (err == ESP_OK) {
        err = nvs_set_u8(handle, NVS_KEY_ACTIVE, store.active_index);
    }
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }

    nvs_close(handle);
    return err;
}

uint8_t pool_profiles_get_count(void)
{
    return store.count;
}

uint8_t pool_profiles_get_active(void)
{
    return store.active_index;
}

esp_err_t pool_profiles_set_active(uint8_t index)
{
    if (index >= store.count) return ESP_ERR_INVALID_ARG;
    store.active_index = index;
    return pool_profiles_save();
}

esp_err_t pool_profiles_add(const PoolProfile *profile)
{
    if (store.count >= POOL_PROFILES_MAX) return ESP_ERR_NO_MEM;
    memcpy(&store.profiles[store.count], profile, sizeof(PoolProfile));
    store.count++;
    return pool_profiles_save();
}

esp_err_t pool_profiles_update(uint8_t index, const PoolProfile *profile)
{
    if (index >= store.count) return ESP_ERR_INVALID_ARG;
    memcpy(&store.profiles[index], profile, sizeof(PoolProfile));
    return pool_profiles_save();
}

esp_err_t pool_profiles_delete(uint8_t index)
{
    if (index >= store.count) return ESP_ERR_INVALID_ARG;
    // Shift remaining profiles down
    for (uint8_t i = index; i < store.count - 1; i++) {
        memcpy(&store.profiles[i], &store.profiles[i + 1], sizeof(PoolProfile));
    }
    store.count--;
    if (store.active_index >= store.count && store.count > 0) {
        store.active_index = store.count - 1;
    }
    return pool_profiles_save();
}

const PoolProfile *pool_profiles_get(uint8_t index)
{
    if (index >= store.count) return NULL;
    return &store.profiles[index];
}

cJSON *pool_profiles_to_json(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON *profiles = cJSON_CreateArray();

    for (uint8_t i = 0; i < store.count; i++) {
        cJSON *p = cJSON_CreateObject();
        cJSON_AddStringToObject(p, "name", store.profiles[i].name);
        cJSON_AddStringToObject(p, "url", store.profiles[i].url);
        cJSON_AddNumberToObject(p, "port", store.profiles[i].port);
        cJSON_AddStringToObject(p, "user", store.profiles[i].user);
        cJSON_AddStringToObject(p, "pass", store.profiles[i].pass);
        cJSON_AddNumberToObject(p, "difficulty", store.profiles[i].difficulty);
        cJSON_AddBoolToObject(p, "extranonceSubscribe", store.profiles[i].extranonce_subscribe);
        cJSON_AddNumberToObject(p, "tls", store.profiles[i].tls);
        cJSON_AddItemToArray(profiles, p);
    }

    cJSON_AddItemToObject(root, "profiles", profiles);
    cJSON_AddNumberToObject(root, "activeIndex", store.active_index);
    return root;
}

esp_err_t pool_profiles_from_json(const cJSON *json)
{
    const cJSON *profiles = cJSON_GetObjectItem(json, "profiles");
    if (!cJSON_IsArray(profiles)) return ESP_ERR_INVALID_ARG;

    int count = cJSON_GetArraySize(profiles);
    if (count > POOL_PROFILES_MAX) count = POOL_PROFILES_MAX;

    memset(&store, 0, sizeof(store));
    store.count = 0;

    for (int i = 0; i < count; i++) {
        cJSON *p = cJSON_GetArrayItem(profiles, i);
        if (!cJSON_IsObject(p)) continue;

        PoolProfile *prof = &store.profiles[store.count];
        cJSON *item;

        item = cJSON_GetObjectItem(p, "name");
        if (cJSON_IsString(item)) strncpy(prof->name, item->valuestring, POOL_PROFILE_NAME_MAX - 1);

        item = cJSON_GetObjectItem(p, "url");
        if (cJSON_IsString(item)) strncpy(prof->url, item->valuestring, POOL_PROFILE_URL_MAX - 1);

        item = cJSON_GetObjectItem(p, "port");
        if (cJSON_IsNumber(item)) prof->port = (uint16_t)item->valuedouble;

        item = cJSON_GetObjectItem(p, "user");
        if (cJSON_IsString(item)) strncpy(prof->user, item->valuestring, POOL_PROFILE_USER_MAX - 1);

        item = cJSON_GetObjectItem(p, "pass");
        if (cJSON_IsString(item)) strncpy(prof->pass, item->valuestring, POOL_PROFILE_PASS_MAX - 1);

        item = cJSON_GetObjectItem(p, "difficulty");
        if (cJSON_IsNumber(item)) prof->difficulty = (uint16_t)item->valuedouble;

        item = cJSON_GetObjectItem(p, "extranonceSubscribe");
        if (cJSON_IsBool(item)) prof->extranonce_subscribe = cJSON_IsTrue(item);

        item = cJSON_GetObjectItem(p, "tls");
        if (cJSON_IsNumber(item)) prof->tls = (uint16_t)item->valuedouble;

        store.count++;
    }

    cJSON *active = cJSON_GetObjectItem(json, "activeIndex");
    if (cJSON_IsNumber(active)) {
        store.active_index = (uint8_t)active->valuedouble;
        if (store.active_index >= store.count) store.active_index = 0;
    }

    return pool_profiles_save();
}

esp_err_t pool_profiles_apply_active(void)
{
    if (store.active_index >= store.count) return ESP_ERR_INVALID_STATE;

    const PoolProfile *p = &store.profiles[store.active_index];
    nvs_config_set_string(NVS_CONFIG_STRATUM_URL, p->url);
    nvs_config_set_u16(NVS_CONFIG_STRATUM_PORT, p->port);
    nvs_config_set_string(NVS_CONFIG_STRATUM_USER, p->user);
    nvs_config_set_string(NVS_CONFIG_STRATUM_PASS, p->pass);
    nvs_config_set_u16(NVS_CONFIG_STRATUM_DIFFICULTY, p->difficulty);
    nvs_config_set_bool(NVS_CONFIG_STRATUM_EXTRANONCE_SUBSCRIBE, p->extranonce_subscribe);
    nvs_config_set_u16(NVS_CONFIG_STRATUM_TLS, p->tls);

    ESP_LOGI(TAG, "Applied pool profile '%s' -> %s:%d", p->name, p->url, p->port);
    return ESP_OK;
}
