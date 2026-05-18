#ifndef LOTTOAXE_CONFIG_BACKUP_H
#define LOTTOAXE_CONFIG_BACKUP_H

#include "esp_err.h"
#include "cJSON.h"

cJSON *config_backup_export(void);
esp_err_t config_backup_import(const cJSON *json);
esp_err_t config_backup_factory_reset(void);

#endif
