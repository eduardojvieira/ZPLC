#ifndef ZPLC_PLATFORM_ATTRS_H
#define ZPLC_PLATFORM_ATTRS_H

#if defined(CONFIG_SOC_FAMILY_ESPRESSIF_ESP32)
#include <esp_attr.h>
#else
#ifndef EXT_RAM_BSS_ATTR
#define EXT_RAM_BSS_ATTR
#endif
#endif

#endif /* ZPLC_PLATFORM_ATTRS_H */
