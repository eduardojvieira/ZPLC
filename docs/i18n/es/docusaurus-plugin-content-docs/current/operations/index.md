---
slug: /operations
id: index
title: Guía Operativa
sidebar_label: Diagnósticos de Operación
description: Métodos de recuperación controlada, monitorización activa profunda y testeo para máquinas desplegadas.
tags: [operations]
---

# Operación de la Plataforma

Asumir la instalación en planta bajo sistemas de control ZPLC de misión crítica requerirá familiarizarse fundamentalmente interactuando o respondiendo fallos al interior del Zephyr Base ante la presencia inminente o esporádica de comportamientos inesperados, cuellos lógicos industriales de comunicación entre terminales ajenos y reinicios en microcontrolador abruptos no deseados. 

Para consultar el listado total de comandos en cadena, visita la documentación completa de [Consola ZPLC Shell](./shell.md).

Esta sección lista reglas operativas rutinarias sobre cómo manejar diagnósticamente tu producto embebido en la base V1.5.0 de ZPLC.  

## Flujo de Trabajo en Recuperaciones Físicas y Analítica de Hardware Base

Cuando notes detenciones temporales graves en tu modelo programado asincrónicamente o reportes de comportamientos ilógicos:

1. **Intrusión Terminal**: Realizar ping inverso acudiendo hacia un programa de shell terminal como `Putty` o `Minicom` usando interface clásica Serial `115200 Bauds`. El sistema nativo levantará consola sobre RTOS Zephyr. Introducir comando `zplc status` reportará el vigor o salud lógica de los búfer internos del sistema operativo RTOS.
2. **Revisión de violaciones de tarea**: Ejecutá `zplc sched tasks`. Un fallo de ejecución acotada de VM se reporta como fault lógico controlado; verificá la respuesta física de seguridad en el target exacto antes de commissioning.
3. **Revisión de Direcciones y Mapeos**: Toma instrumentos y puntas lógicas y sondea directamente en tarjeta base evaluando con multímetro. Si su Interface Virtual en línea o Monitor Watch reporta señal `Activa (1)` bajo variables Out en el software de su computadora en la solapa debug, pero evalúa visualmente un Output LED base o terminal del chip a pin con `0 Voltios` apagando salidas; posiblemente estés vinculando lógicamente de mala forma en el registro del manifiesto `zplc.json` I/O.
4. **Detener y limpiar**: Un programa restaurado queda cargado y detenido. Usá `zplc stop` para solicitar salidas lógicas seguras, inspeccioná el fallo y usá el procedimiento de recovery soportado por el perfil si necesitás eliminar deliberadamente un artefacto guardado antes de una carga limpia.

## Herramientas Diagnósticas Embebidas (Online Observability ZPLC)

Mediante la conexión al motor subyacente interactuando con ZPLC desde interface central de trabajo en tu host PC de la red obtienes de inmediato utilidades activas online:

- **Mirilla (Watch Tables)**: Interroga mediante ventanas o bloques visuales a valores y bits variables transitoriamente.  
- **Estadísticas De Uso General**: Tratá el timing host/native_sim como evidencia diagnóstica, no como calificación temporal de target. Validalo en el target exacto antes de commissioning.
- **Sobreescritura Virtual Mapeada (Forzados / Forces)**: Interrumpe localizaciones lógicas en variables por medio del teclado para asumir posturas manual base y by-pasear sistemas quemados de planta.

## Diagnósticos de Red

Si tu bloque de `MQTT` se estanca o el cliente Modbus TCP no contesta:
- Verifica que Zephyr obtuvo satisfactoriamente una IP vía DHCP (Se revisa en la serial con `zplc status`).
- Asegúrate que tu computadora host corriendo el IDE ZPLC esté exactamente en la misma máscara de sub-red que el hardware embebido.
- Confirma que la placa compilada tenga un chip Wi-Fi o Ethernet plenamente soportado.

## Recomendaciones Actualización (Upgrades OS Framework y Toolchain)

Flashear un binario Core para saltar a sistemas con base kernel Linux Zephyr renovadas: 

- Build de firmware, flash de firmware, deploy de programa y RUN son operaciones separadas. Verificá el procedimiento de recovery para la placa/perfil antes de actualizar firmware.
- Un artefacto persistido válido se verifica y restaura detenido al arrancar; una persona debe ejecutar `zplc start` tras inspeccionarlo.

## Lista de Control Operativo

Revise antes de dejar produciendo a la máquina:
- Los periodos asignados en `zplc.json` disponen de márgenes operativos sobredimensionados.
- Las declaraciones `RETAIN` a nivel de fuente hoy se rechazan. No dependas de una futura recuperación `RETAIN` hasta contar con evidencia end-to-end target/HIL para el perfil exacto de placa.
- Todos los enchufes físicos coinciden con lo trazado nativamente.
- La terminal UART responde satisfactoriamente a 115200 sin arrojar mensajes extraños por log.
