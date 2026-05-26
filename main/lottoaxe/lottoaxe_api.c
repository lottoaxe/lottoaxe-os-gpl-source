#include "lottoaxe_api.h"
#include "pool_profiles.h"
#include "tuning_presets.h"
#include "config_backup.h"
#include "safety.h"
#include "global_state.h"
#include "esp_log.h"
#include "esp_system.h"
#include "cJSON.h"
#include <string.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "lottoaxe_api";

#define LOTTOAXE_SCRATCH_SIZE 4096

static esp_err_t send_json_response(httpd_req_t *req, cJSON *json)
{
    httpd_resp_set_type(req, "application/json");
    const char *str = cJSON_PrintUnformatted(json);
    if (!str) {
        cJSON_Delete(json);
        return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Out of memory");
    }
    esp_err_t ret = httpd_resp_send(req, str, strlen(str));
    free((void *)str);
    cJSON_Delete(json);
    return ret;
}

static char *read_request_body(httpd_req_t *req)
{
    int total_len = req->content_len;
    if (total_len <= 0 || total_len > 8192) return NULL;

    char *buf = malloc(total_len + 1);
    if (!buf) return NULL;

    int received = 0;
    while (received < total_len) {
        int ret = httpd_req_recv(req, buf + received, total_len - received);
        if (ret <= 0) {
            free(buf);
            return NULL;
        }
        received += ret;
    }
    buf[total_len] = '\0';
    return buf;
}

// GET /api/lottoaxe/profiles
static esp_err_t GET_pool_profiles(httpd_req_t *req)
{
    cJSON *json = pool_profiles_to_json();
    return send_json_response(req, json);
}

// POST /api/lottoaxe/profiles — add new profile
static esp_err_t POST_pool_profile(httpd_req_t *req)
{
    char *body = read_request_body(req);
    if (!body) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing body");

    cJSON *json = cJSON_Parse(body);
    free(body);
    if (!json) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");

    PoolProfile profile = {0};
    cJSON *item;

    item = cJSON_GetObjectItem(json, "name");
    if (cJSON_IsString(item)) strncpy(profile.name, item->valuestring, POOL_PROFILE_NAME_MAX - 1);

    item = cJSON_GetObjectItem(json, "url");
    if (cJSON_IsString(item)) strncpy(profile.url, item->valuestring, POOL_PROFILE_URL_MAX - 1);

    item = cJSON_GetObjectItem(json, "port");
    if (cJSON_IsNumber(item)) profile.port = (uint16_t)item->valuedouble;

    item = cJSON_GetObjectItem(json, "user");
    if (cJSON_IsString(item)) strncpy(profile.user, item->valuestring, POOL_PROFILE_USER_MAX - 1);

    item = cJSON_GetObjectItem(json, "pass");
    if (cJSON_IsString(item)) strncpy(profile.pass, item->valuestring, POOL_PROFILE_PASS_MAX - 1);

    item = cJSON_GetObjectItem(json, "difficulty");
    if (cJSON_IsNumber(item)) profile.difficulty = (uint16_t)item->valuedouble;

    item = cJSON_GetObjectItem(json, "extranonceSubscribe");
    if (cJSON_IsBool(item)) profile.extranonce_subscribe = cJSON_IsTrue(item);

    item = cJSON_GetObjectItem(json, "tls");
    if (cJSON_IsNumber(item)) profile.tls = (uint16_t)item->valuedouble;

    cJSON_Delete(json);

    if (strlen(profile.name) == 0 || strlen(profile.url) == 0) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "name and url are required");
    }

    esp_err_t err = pool_profiles_add(&profile);
    if (err == ESP_ERR_NO_MEM) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Maximum profiles reached");
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Profile added");
    return send_json_response(req, resp);
}

// PUT /api/lottoaxe/profiles/activate?index=N
static esp_err_t PUT_activate_profile(httpd_req_t *req)
{
    char param[8] = {0};
    if (httpd_req_get_url_query_str(req, param, sizeof(param)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing index parameter");
    }

    char val[4] = {0};
    if (httpd_query_key_value(param, "index", val, sizeof(val)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing index");
    }

    int index = atoi(val);
    esp_err_t err = pool_profiles_set_active(index);
    if (err != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid index");
    }

    // Apply the profile to the active stratum config
    pool_profiles_apply_active();

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Profile activated. Restart to connect.");
    return send_json_response(req, resp);
}

// DELETE /api/lottoaxe/profiles?index=N
static esp_err_t DELETE_pool_profile(httpd_req_t *req)
{
    char query[16] = {0};
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing query");
    }

    char val[4] = {0};
    if (httpd_query_key_value(query, "index", val, sizeof(val)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing index");
    }

    int index = atoi(val);
    esp_err_t err = pool_profiles_delete(index);
    if (err != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid index");
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Profile deleted");
    return send_json_response(req, resp);
}

// GET /api/lottoaxe/presets
static esp_err_t GET_tuning_presets(httpd_req_t *req)
{
    cJSON *json = tuning_presets_to_json();
    cJSON *root = cJSON_CreateObject();
    cJSON_AddItemToObject(root, "presets", json);

    const SafetyState *safety = safety_get_state();
    cJSON *safety_json = cJSON_CreateObject();
    cJSON_AddBoolToObject(safety_json, "throttled", safety->throttled);
    cJSON_AddNumberToObject(safety_json, "throttleCount", safety->throttle_count);
    cJSON_AddNumberToObject(safety_json, "originalFrequency", safety->original_frequency);
    cJSON_AddNumberToObject(safety_json, "currentFrequency", safety->current_frequency);
    cJSON_AddItemToObject(root, "safety", safety_json);

    return send_json_response(req, root);
}

// POST /api/lottoaxe/presets/apply?id=N
static esp_err_t POST_apply_preset(httpd_req_t *req)
{
    char query[16] = {0};
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing query");
    }

    char val[4] = {0};
    if (httpd_query_key_value(query, "id", val, sizeof(val)) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing id");
    }

    int id = atoi(val);
    esp_err_t err = tuning_presets_apply((TuningPresetId)id);
    if (err != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid preset or out of range");
    }

    const TuningPreset *preset = tuning_presets_get((TuningPresetId)id);
    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Preset applied. Restart required.");
    cJSON_AddStringToObject(resp, "preset", preset ? preset->name : "unknown");
    return send_json_response(req, resp);
}

// GET /api/lottoaxe/config/export
static esp_err_t GET_config_export(httpd_req_t *req)
{
    cJSON *json = config_backup_export();
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Content-Disposition", "attachment; filename=\"lottoaxe-config.json\"");
    const char *str = cJSON_Print(json);
    esp_err_t ret = httpd_resp_send(req, str, strlen(str));
    free((void *)str);
    cJSON_Delete(json);
    return ret;
}

// POST /api/lottoaxe/config/import
static esp_err_t POST_config_import(httpd_req_t *req)
{
    char *body = read_request_body(req);
    if (!body) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing body");

    cJSON *json = cJSON_Parse(body);
    free(body);
    if (!json) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");

    esp_err_t err = config_backup_import(json);
    cJSON_Delete(json);

    if (err != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Import failed — invalid config format");
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Config imported. Restart to apply.");
    return send_json_response(req, resp);
}

// POST /api/lottoaxe/config/factory-reset
static esp_err_t POST_factory_reset(httpd_req_t *req)
{
    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "message", "Factory reset complete. Rebooting...");
    send_json_response(req, resp);

    config_backup_factory_reset();

    // Delay briefly to let the response flush, then reboot
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
    return ESP_OK;
}

// GET /api/lottoaxe/safety
static esp_err_t GET_safety_status(httpd_req_t *req)
{
    const SafetyState *s = safety_get_state();
    cJSON *json = cJSON_CreateObject();
    cJSON_AddBoolToObject(json, "throttled", s->throttled);
    cJSON_AddNumberToObject(json, "originalFrequency", s->original_frequency);
    cJSON_AddNumberToObject(json, "currentFrequency", s->current_frequency);
    cJSON_AddNumberToObject(json, "throttleCount", s->throttle_count);
    cJSON_AddNumberToObject(json, "lastThrottleTime", s->last_throttle_time);

    const TuningLimits *tl = tuning_presets_get_limits();
    cJSON *limits = cJSON_CreateObject();
    cJSON_AddNumberToObject(limits, "freqMin", tl->freq_min);
    cJSON_AddNumberToObject(limits, "freqMax", tl->freq_max);
    cJSON_AddNumberToObject(limits, "voltMin", tl->volt_min);
    cJSON_AddNumberToObject(limits, "voltMax", tl->volt_max);
    cJSON_AddStringToObject(limits, "asicName", tl->asic_name);
    cJSON_AddNumberToObject(limits, "tempThrottle", SAFETY_THROTTLE_TEMP);
    cJSON_AddNumberToObject(limits, "tempShutdown", SAFETY_SHUTDOWN_TEMP);
    cJSON_AddItemToObject(json, "limits", limits);

    return send_json_response(req, json);
}

esp_err_t lottoaxe_api_init(GlobalState *state)
{
    pool_profiles_init();
    safety_init();

    // Initialize tuning presets with the detected ASIC config
    if (state) {
        tuning_presets_init(&state->DEVICE_CONFIG.family.asic);
    }

    ESP_LOGI(TAG, "LottoAxe OS modules initialized");
    return ESP_OK;
}

esp_err_t lottoaxe_api_register(httpd_handle_t server)
{
    // Pool profiles
    httpd_uri_t get_profiles = { .uri = "/api/lottoaxe/profiles", .method = HTTP_GET, .handler = GET_pool_profiles };
    httpd_uri_t post_profile = { .uri = "/api/lottoaxe/profiles", .method = HTTP_POST, .handler = POST_pool_profile };
    httpd_uri_t put_activate = { .uri = "/api/lottoaxe/profiles/activate", .method = HTTP_PUT, .handler = PUT_activate_profile };
    httpd_uri_t del_profile = { .uri = "/api/lottoaxe/profiles", .method = HTTP_DELETE, .handler = DELETE_pool_profile };

    // Tuning presets
    httpd_uri_t get_presets = { .uri = "/api/lottoaxe/presets", .method = HTTP_GET, .handler = GET_tuning_presets };
    httpd_uri_t post_preset = { .uri = "/api/lottoaxe/presets/apply", .method = HTTP_POST, .handler = POST_apply_preset };

    // Config backup
    httpd_uri_t get_export = { .uri = "/api/lottoaxe/config/export", .method = HTTP_GET, .handler = GET_config_export };
    httpd_uri_t post_import = { .uri = "/api/lottoaxe/config/import", .method = HTTP_POST, .handler = POST_config_import };
    httpd_uri_t post_reset = { .uri = "/api/lottoaxe/config/factory-reset", .method = HTTP_POST, .handler = POST_factory_reset };

    // Safety
    httpd_uri_t get_safety = { .uri = "/api/lottoaxe/safety", .method = HTTP_GET, .handler = GET_safety_status };

    httpd_register_uri_handler(server, &get_profiles);
    httpd_register_uri_handler(server, &post_profile);
    httpd_register_uri_handler(server, &put_activate);
    httpd_register_uri_handler(server, &del_profile);
    httpd_register_uri_handler(server, &get_presets);
    httpd_register_uri_handler(server, &post_preset);
    httpd_register_uri_handler(server, &get_export);
    httpd_register_uri_handler(server, &post_import);
    httpd_register_uri_handler(server, &post_reset);
    httpd_register_uri_handler(server, &get_safety);

    ESP_LOGI(TAG, "LottoAxe API endpoints registered");
    return ESP_OK;
}
