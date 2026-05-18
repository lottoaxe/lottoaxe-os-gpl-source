#ifndef LOTTOAXE_POOL_PROFILES_H
#define LOTTOAXE_POOL_PROFILES_H

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "cJSON.h"

#define POOL_PROFILES_MAX 8
#define POOL_PROFILE_NAME_MAX 32
#define POOL_PROFILE_URL_MAX 128
#define POOL_PROFILE_USER_MAX 256
#define POOL_PROFILE_PASS_MAX 64

typedef struct {
    char name[POOL_PROFILE_NAME_MAX];
    char url[POOL_PROFILE_URL_MAX];
    uint16_t port;
    char user[POOL_PROFILE_USER_MAX];
    char pass[POOL_PROFILE_PASS_MAX];
    uint16_t difficulty;
    bool extranonce_subscribe;
    uint16_t tls;
} PoolProfile;

typedef struct {
    PoolProfile profiles[POOL_PROFILES_MAX];
    uint8_t count;
    uint8_t active_index;
} PoolProfileStore;

esp_err_t pool_profiles_init(void);
esp_err_t pool_profiles_save(void);
uint8_t pool_profiles_get_count(void);
uint8_t pool_profiles_get_active(void);
esp_err_t pool_profiles_set_active(uint8_t index);
esp_err_t pool_profiles_add(const PoolProfile *profile);
esp_err_t pool_profiles_update(uint8_t index, const PoolProfile *profile);
esp_err_t pool_profiles_delete(uint8_t index);
const PoolProfile *pool_profiles_get(uint8_t index);
cJSON *pool_profiles_to_json(void);
esp_err_t pool_profiles_from_json(const cJSON *json);
esp_err_t pool_profiles_apply_active(void);

#endif
