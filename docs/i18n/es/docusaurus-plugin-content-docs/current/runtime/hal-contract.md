# Contrato HAL

La HAL define el limite obligatorio entre el core determinista de ZPLC y cualquier acceso
especifico de plataforma. El core no debe llamar APIs de Zephyr, POSIX o hardware de forma
directa.

## Reglas

- Todo acceso a E/S fisica pasa por `zplc_hal_*`.
- La asignacion dinamica no forma parte del contrato del core.
- Las extensiones de red, reloj y despliegue deben entrar por la HAL o por servicios del runtime.
