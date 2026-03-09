# ZPLC Phase 1.5 - Industrial Connectivity Core

## Objetivo Principal
Estabilizar la conectividad MQTT v5 + Sparkplug B y soportar Modbus TCP/RTU sobre Zephyr 4.3.0 en ESP32-S3 (T-Display S3, Wi-Fi).

## Reglas de Oro para este Módulo
1. **No Malloc**: Toda estructura generada por `nanopb` debe tener límites definidos en `.options` para evitar allocación dinámica de memoria en tiempo real.
2. **Uso de Interfaces Nativas**: Modbus RTU (Serie) debe usar el subsistema nativo `CONFIG_MODBUS_SERIAL` de Zephyr. No hay bit-banging manual.
3. **Type Safety Fuerte**: Tipos del payload de Sparkplug deben mapear exactamente con la ISA de ZPLC (`BOOL`, `REAL`, `UDINT`, etc).

## Diagnóstico y Audit (Zephyr 4.3.0)
- **MQTT v5**: La implementación manual del cliente (`mqtt_disconnect_param.reason_code = MQTT_DISCONNECT_NORMAL`) es 100% correcta y matchea la API nativa de Zephyr v4.3.0. 
- **Modbus TCP**: Parser custom está OK porque la especificación dice que el TCP nativo no es más que unos helper sockets. Dejamos como está.
- **Sparkplug B**: Requiere integración manual de la gramática `.proto` y configuración estática `.options` usando `zephyr_nanopb_sources()`. No hay paquete "listo para usar" en Zephyr.
- **DNS**: Necesitamos habilitar `CONFIG_DNS_RESOLVER=y` en Kconfig, de lo contrario `zsock_getaddrinfo` fallará al resolver el broker en la STM32.

## Contexto de Pruebas: Ethernet Mac-To-Board
Para probar la fase final con conexión directa (cross-over Ethernet sin router) entre la placa y la Mac:
- **Mac**: Configurar IP fija a `192.168.1.100` / `255.255.255.0`
- **ZPLC**: Si falla el DHCP, el código ya tiene un fallback manual a `192.168.1.100` como broker, pero **es preferible setear una IP estática en la placa usando `zplc_config` o el Shell**.

## Roadmap de Implementación Inmediata
1. Escribir archivo `sparkplug_b.proto` oficial reducido (limitado a las `Metrics` reales que usamos).
2. Crear `sparkplug_b.options` para fijar arrays (ej: `max_count:20` metrics por Payload, `max_size:64` strings).
3. Integrar `zephyr_nanopb_sources()` en `CMakeLists.txt` para disparar protoc en la compilación.
4. Migrar el payload mockeado `"true"` de MQTT a `pb_encode()` con el `org_eclipse_tahu_protobuf_Payload`.
5. Ejecutar la compilación para la STM32F746-Disco y resolver dependencias/warnings (Warning Zero policy).
