# Compilador del IDE

El pipeline del IDE converge todas las rutas de lenguaje reclamadas hacia el contrato del
compilador de ZPLC.

## Regla de v1.5

- `ST` compila de forma directa.
- `IL`, `LD`, `FBD` y `SFC` se normalizan antes de emitir `.zplc`.
- La evidencia del release debe probar que el workflow completo sigue disponible.
