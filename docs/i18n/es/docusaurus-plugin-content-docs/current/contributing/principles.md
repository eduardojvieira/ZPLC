---
slug: /contributing/principles
id: principles
title: Principios de ingeniería
sidebar_label: Principios
description: Las nueve reglas que todo cambio en ZPLC debe respetar, en lenguaje llano, y qué le exige cada una.
tags: [contributing, principles]
---

# Principios de ingeniería

ZPLC controla máquinas, de modo que un cambio se juzga por algo más que por si funciona. Esta página traduce las nueve reglas del proyecto a lo que cada una le pide cuando cambia algo y a dónde las verifica el repositorio. Las reglas mismas están en la [constitución de ingeniería](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), que es el texto normativo: si esta página y la constitución discrepan, prevalece la constitución, y la discrepancia es un error que conviene informar.

## Las reglas

### 1. El núcleo es C99 portable y pasa por la HAL

El núcleo del runtime, `firmware/lib/zplc_core/src/core/`, es ANSI C99 estricto. Nunca llama a un controlador, a un registro ni a una función del sistema operativo; solo llega al exterior mediante las funciones `zplc_hal_*`. Las herramientas de escritorio y el front end del lenguaje obedecen la misma regla: ninguna alcanza el hardware sin pasar por la HAL. CMake compila el núcleo como C99 con `-pedantic` y `-Werror`, y el código de cada plataforma vive en `firmware/lib/zplc_core/src/hal/`.

### 2. Un cambio de comportamiento trae una prueba que puede fallar

Antes de cambiar un comportamiento riesgoso, agregue o refuerce una prueba específica y luego ejecute las verificaciones en el host, en el destino o en el banco que correspondan al cambio. Una prueba afirma comportamiento: ejecuta un programa en la VM o dibuja una pantalla, y no lee el texto del código fuente. El CI ejecuta todas las capas, y la lista de fallas esperadas mantiene visibles las fallas conocidas en lugar de ocultarlas.

### 3. Todo lo que cruza un límite no es de confianza

La carga de bytecode, la persistencia, el IPC, el acceso al sistema de archivos, el control de dispositivos y la entrada externa son límites de confianza. Valide antes de cambiar cualquier estado y conserve el diagnóstico. El cargador verifica un programa antes de ejecutarlo, y el proceso principal de Electron valida el emisor y el esquema de cada solicitud que acepta.

### 4. Las salidas fallan en estado seguro

Cada salida tiene un estado seguro documentado, normalmente apagado, y ese estado es el predeterminado. Un reinicio, un tiempo de espera agotado, una falla, el fallo de un watchdog, una conexión perdida o un programa inválido nunca deben llevar a una reanudación automática insegura del control.

### 5. Compilar, grabar, cargar y ejecutar son pasos separados, y una persona inicia cada uno

Compilar el firmware, grabarlo, desplegar un programa de PLC y ejecutarlo o depurarlo son cuatro operaciones con cuatro piezas de evidencia. Cada operación física requiere autorización humana explícita.

### 6. Electron niega por defecto

El renderizador está aislado en un sandbox y llega al proceso principal solo mediante una API de preload estrecha. Cada solicitud IPC tiene un emisor y un esquema validados. No hay shell genérica ni acceso genérico al sistema de archivos.

### 7. Las afirmaciones se gradúan por evidencia

Los resultados en el host, en QEMU, de compilación para el destino, en banco (hardware en el lazo) y manuales son niveles distintos, y un nivel inferior nunca demuestra uno superior. Nombre el nivel que respalda cada afirmación en la documentación, en un mensaje de commit y en un pull request. [Compatibilidad de hardware](../reference/capabilities-evidence.md) indica el nivel de cada capacidad.

### 8. Inglés y español avanzan juntos, y una dependencia necesita una razón

La documentación pública existe en ambos idiomas y cambia en ambos a la vez. Una dependencia nueva necesita una necesidad concreta y una justificación arquitectónica registrada.

### 9. La IA y MCP ayudan dentro del espacio de trabajo y nunca actúan sobre el hardware

Un asistente de IA o un cliente MCP puede inspeccionar, planificar, compilar, probar y simular dentro del espacio de trabajo aprobado. No debe grabar, desplegar en hardware, forzar E/S, cambiar RUN o STOP, abrir un puerto serie directo ni ejecutar una shell. ZPLC funciona por completo sin IA.

## Páginas en español

Las páginas en español se escriben a partir del texto en inglés, en español neutro con formas impersonales o de "usted" (decisión D-10). Las páginas en español se revisaron contra el texto en inglés. Las páginas de referencia generadas citan el texto fuente en inglés por diseño: los encabezados de C, la ayuda de Kconfig y las notas de una placa no se traducen.

## Cómo usar las reglas

- **Al escribir un cambio,** use las reglas para decidir dónde va el código y cómo se prueba. La [arquitectura](https://github.com/eduardojvieira/ZPLC/blob/master/ARCHITECTURE.md) muestra las capas a las que se refieren.
- **Al revisar uno,** la plantilla del pull request hace las preguntas que estas reglas plantean.
- **Cuando una regla estorba,** abra una incidencia que nombre la regla y el motivo. Un cambio a la constitución es un pull request aparte.
