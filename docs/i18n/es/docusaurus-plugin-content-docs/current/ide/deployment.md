# Despliegue y sesiones de runtime

Build de firmware, flash de firmware, deploy de programa PLC y run/debug son
cuatro operaciones separadas. IA y MCP nunca las inician.

## Camino rápido

1. Compilá, testeá y simulá el programa esperado.
2. Elegí el profile de placa exacto y conectá el runtime correspondiente.
3. Inspeccioná handshake, ABI, board/profile, hash, tamaño y cantidad de tareas.
4. Una persona confirma el deploy; inspeccioná estado stopped antes de RUN.

## Operaciones

| Operación | Significado | Autoridad |
| --- | --- | --- |
| Build runtime firmware | Produce artefactos firmware Zephyr. | Flujo humano. |
| Flash runtime firmware | Escribe firmware/boot chain al dispositivo. | Flujo humano; requiere procedimiento del profile. |
| Deploy PLC program | Transfiere un artefacto `.zplc` verificado a runtime compatible. | Confirmación humana con evidencia del artefacto. |
| Run / debug | Observa o cambia estado operacional. | Flujo humano y procedimiento del sitio. |

## Límite de evidencia

El adaptador POSIX nativo es simulación host. Conexión serial y profile
cross-build no lo convierten en HIL. Los profiles catalogados actuales tienen
cero referencias HIL; usá el procedimiento Zephyr exacto y registrá un run HIL
antes de afirmar comportamiento target.

## Ante conexión o deploy fallido

No reintentes a ciegas. Volvé a inspeccionar board/profile y ABI del runtime y
usá [Límites de recuperación](../operations/recovery.md). El deploy de programa
