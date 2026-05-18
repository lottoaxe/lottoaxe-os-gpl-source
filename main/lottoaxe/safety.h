#ifndef LOTTOAXE_SAFETY_H
#define LOTTOAXE_SAFETY_H

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

// Auto-throttle: reduce frequency when temp exceeds threshold
// Recovers when temp drops below recovery threshold
#define SAFETY_THROTTLE_TEMP      65.0f
#define SAFETY_THROTTLE_RECOVERY  60.0f
#define SAFETY_SHUTDOWN_TEMP      72.0f
#define SAFETY_THROTTLE_FREQ_STEP 25.0f
#define SAFETY_MIN_THROTTLE_FREQ  400.0f

typedef struct {
    bool throttled;
    float original_frequency;
    float current_frequency;
    uint32_t throttle_count;
    uint32_t last_throttle_time;
} SafetyState;

void safety_init(void);
void safety_check_temperature(float chip_temp);
bool safety_is_throttled(void);
const SafetyState *safety_get_state(void);

// Validate user-requested settings before applying
bool safety_validate_settings(float frequency, uint16_t voltage);

#endif
