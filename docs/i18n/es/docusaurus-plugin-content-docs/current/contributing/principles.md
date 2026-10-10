---
slug: /contributing/principles
id: principles
title: Principios de ingeniería
sidebar_label: Principios
description: Las nueve reglas que todo cambio en ZPLC debe respetar, en lenguaje llano, y qué le exige cada una.
tags: [contributing, principles]
---

# Principios de ingeniería

ZPLC controla máquinas, de modo que un cambio se juzga por algo más que por si
funciona. El proyecto mantiene nueve reglas en su
[constitución de ingeniería](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md),
que es el texto normativo. Esta página dice qué le exige cada regla cuando usted
cambia algo y dónde la verifica el repositorio. Si esta página y la constitución
discrepan, prevalece la constitución, y la discrepancia es un error que conviene
reportar.

## Las reglas

### 1. El núcleo es C99 portable y pasa por la HAL

El núcleo del runtime, en `firmware/lib/zplc_core/src/core/`, es ANSI C99 estricto
y nunca llama a un driver, a un registro ni a una función del sistema operativo.
Todo pasa por las funciones `zplc_hal_*`. Las herramientas de escritorio y el
front end del lenguaje siguen la misma regla: ninguno llega al hardware esquivando
la HAL. El núcleo se compila con `-std=c99 -pedantic -Werror`, y el código de
plataforma vive en `src/hal/`.

### 2. Un cambio de comportamiento trae una prueba que puede fallar

Antes de cambiar un comportamiento riesgoso, agregue o refuerce una prueba
focalizada y luego ejecute las verificaciones de host, de destino o de banco que
correspondan. Una prueba afirma comportamiento: ejecuta un programa en la VM o
renderiza una pantalla. No lee texto fuente. CI ejecuta cada capa, y la lista de
fallos esperados mantiene visibles los fallos conocidos en lugar de ocultarlos.

### 3. Todo lo que cruza un límite no es de confianza

La carga de bytecode, la persistencia, el IPC, el acceso al sistema de archivos,
el control de dispositivos y la entrada externa son límites de confianza. Valide
antes de cambiar cualquier estado y conserve el diagnóstico. El cargador verifica
un programa antes de ejecutarlo, y el proceso principal de Electron valida el
emisor y el esquema de las solicitudes que acepta.

### 4. Las salidas fallan en estado seguro

Cada salida tiene un estado seguro documentado, normalmente apagado, y ese estado
es el predeterminado. Un reinicio, un tiempo de espera agotado, una falla, la
falla de un watchdog, la pérdida de comunicación o un programa inválido nunca
deben llevar a una reanudación automática insegura del control.

### 5. Compilar, flashear, desplegar y ejecutar son pasos separados, y una persona inicia cada uno

Construir el firmware, flashearlo, desplegar un programa PLC y ejecutar o depurar
son cuatro operaciones con cuatro evidencias. Cada operación física requiere una
autorización humana explícita.

### 6. Electron niega por defecto

El renderer corre en un sandbox y llega al proceso principal solo mediante una API
de preload estrecha. Cada solicitud IPC tiene un emisor y un esquema validados. No
hay shell genérico ni acceso genérico al sistema de archivos.

### 7. Las afirmaciones se gradúan por evidencia

Los resultados de host, QEMU, compilación para el destino, banco
(hardware-in-the-loop) y manuales son niveles distintos, y un nivel inferior
nunca prueba uno superior. Indique qué nivel respalda cada afirmación en la
documentación, en un mensaje de commit y en un pull request. Véase
[Capacidades y niveles de evidencia](../reference/capabilities-evidence.md).

### 8. Inglés y español avanzan juntos, y una dependencia necesita una razón

La documentación pública existe en ambos idiomas y cambia en ambos a la vez. Una
dependencia nueva necesita una necesidad concreta y una justificación
arquitectónica registrada.

### 9. La IA y MCP ayudan dentro del espacio de trabajo y nunca actúan sobre el hardware

Un asistente de IA o un cliente MCP puede inspeccionar, planificar, compilar,
probar y simular dentro del espacio de trabajo aprobado. No debe flashear,
desplegar en hardware, forzar E/S, cambiar RUN o STOP, abrir un puerto serie en
bruto ni ejecutar un shell. Studio funciona por completo sin IA.

## Cómo usar las reglas

- **Al escribir un cambio,** use las reglas para decidir dónde va el código y cómo
  se prueba. La [arquitectura](https://github.com/eduardojvieira/ZPLC/blob/master/ARCHITECTURE.md)
  muestra las capas a las que se refieren.
- **Al revisar uno,** la plantilla de pull request hace las preguntas que estas
  reglas plantean.
- **Cuando una regla estorba,** abra un issue que nombre la regla y el motivo. Un
  cambio a la constitución es un pull request propio.
