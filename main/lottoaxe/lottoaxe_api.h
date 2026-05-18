#ifndef LOTTOAXE_API_H
#define LOTTOAXE_API_H

#include "esp_http_server.h"
#include "esp_err.h"

esp_err_t lottoaxe_api_init(void);
esp_err_t lottoaxe_api_register(httpd_handle_t server);

#endif
