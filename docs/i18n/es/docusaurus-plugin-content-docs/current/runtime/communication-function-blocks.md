# Bloques de Función de Comunicación

Esta página describe el contrato público de FBs de comunicación visible hoy en el repo.

## Tres capas definen la superficie

1. definiciones stdlib del compilador en `packages/zplc-compiler/src/compiler/stdlib/communication.ts`
2. opcodes ISA en `firmware/lib/zplc_core/include/zplc_isa.h`
3. kinds y status codes del dispatch runtime en `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

## Handshake común

La stdlib del compilador define un encabezado compartido con estos campos:

- `EN`
- `BUSY`
- `DONE`
- `ERROR`
- `STATUS`

Ese es el modelo correcto: interacciones runtime asíncronas/estado-dependientes, no llamadas bloqueantes ingenuas.

## Modelo de dispatch

A nivel ISA, el repo expone hoy:

- `OP_COMM_EXEC`
- `OP_COMM_STATUS`
- `OP_COMM_RESET`

A nivel runtime dispatch, el repo expone kinds como:

- `ZPLC_COMM_FB_MB_READ_HREG`
- `ZPLC_COMM_FB_MB_WRITE_HREG`
- `ZPLC_COMM_FB_MB_READ_COIL`
- `ZPLC_COMM_FB_MB_WRITE_COIL`
- `ZPLC_COMM_FB_MQTT_CONNECT`
- `ZPLC_COMM_FB_MQTT_PUBLISH`
- `ZPLC_COMM_FB_MQTT_SUBSCRIBE`
- wrappers cloud para Azure, AWS y Sparkplug

## Set visible desde el compilador

### Modbus

- `MB_READ_HREG`
- `MB_WRITE_HREG`
- `MB_READ_COIL`
- `MB_WRITE_COIL`

### MQTT

- `MQTT_CONNECT`
- `MQTT_PUBLISH`
- `MQTT_SUBSCRIBE`

### Wrappers cloud

- `AZURE_C2D_RECV`
- `AZURE_DPS_PROV`
- `AZURE_EG_PUB`
- `AWS_FLEET_PROV`
- `SPB_REBIRTH`

## Expectativa de paridad entre lenguajes

Estos bloques no deberían describirse como features exclusivas de ST.

El contrato release-facing es que las superficies de lenguaje convergen al mismo backend, así que los claims de comunicación tienen que mantenerse consistentes en `ST`, `IL`, `LD`, `FBD` y `SFC`.

## Guía de release

Para v1.5.0, los bloques de comunicación solo son claims honestos cuando coinciden:

1. comportamiento runtime
2. contrato del compilador
3. workflow/configuración del IDE
4. documentación y troubleshooting bilingües

Si un nombre de bloque existe en config o codegen pero todavía no tiene comportamiento runtime confiable o evidencia de release, documentalo como pendiente o in-progress, no como feature cerrada.
