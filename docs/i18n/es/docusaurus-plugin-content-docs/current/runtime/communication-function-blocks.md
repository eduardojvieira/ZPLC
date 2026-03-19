# Bloques de Funcion de Comunicacion

Los bloques de comunicacion de v1.5 deben comportarse como maquinas de estado no bloqueantes.

## Handshake esperado

- `BUSY` indica operacion en curso
- `DONE` pulsa un ciclo en exito
- `ERROR` pulsa un ciclo en fallo
- `STATUS` expone el codigo o estado resultante

Este contrato debe mantenerse igual en `ST`, `IL`, `LD`, `FBD` y `SFC` cuando el release
afirma soporte.

## Regla de release v1.5

Los bloques de comunicacion solo cuentan como funcionalidad completa cuando coinciden las
cuatro superficies:

1. comportamiento del runtime
2. contrato del compilador
3. flujo de configuracion en el IDE
4. documentacion y troubleshooting en ingles y espanol

Si un bloque sigue respondiendo `not supported` o no mantiene un handshake determinista,
no debe figurar como claim completo del release.
