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
2. **Revisión Infracción Computacional (Bucle Infinito / Jittering)**: Operar desde misma shell terminal listando `zplc sched tasks`. En los modelos en los cuales erróneamente hallare condicionales o bucles interminables mal proyectados como `WHILE TRUE END_WHILE` por ejemplo, Zephyr atrapará su task errático, listándolo al log sin corromper el hardware físicamente. 
3. **Revisión de Direcciones y Mapeos**: Toma instrumentos y puntas lógicas y sondea directamente en tarjeta base evaluando con multímetro. Si su Interface Virtual en línea o Monitor Watch reporta señal `Activa (1)` bajo variables Out en el software de su computadora en la solapa debug, pero evalúa visualmente un Output LED base o terminal del chip a pin con `0 Voltios` apagando salidas; posiblemente estés vinculando lógicamente de mala forma en el registro del manifiesto `zplc.json` I/O.
4. **Reseteo Estructural Completo**: Cundo logres perder control absoluto bloqueando o deteniendo al RTOS tras una programación errante que persista tras apagado por memorizarse o retener lógicas a boot (Non-Volatile Storage (NVS)); acude nuevamente a las shells seriales indicando `zplc stop` congelando lecturas, instanciando posterior o seguido a la ejecución total por `zplc persist clear`. 

## Herramientas Diagnósticas Embebidas (Online Observability ZPLC)

Mediante la conexión al motor subyacente interactuando con ZPLC desde interface central de trabajo en tu host PC de la red obtienes de inmediato utilidades activas online:

- **Mirilla (Watch Tables)**: Interroga mediante ventanas o bloques visuales a valores y bits variables transitoriamente.  
- **Estadísticas De Uso General**: Inspeccione frecuentemente para cada máquina configurada que latencia media / jitter reportan en campo o ejecución plena en el dashboard de UI de IDE; ciclos saturados cerca de 100% causan pausas irrecuperables por software.
- **Sobreescritura Virtual Mapeada (Forzados / Forces)**: Interrumpe localizaciones lógicas en variables por medio del teclado para asumir posturas manual base y by-pasear sistemas quemados de planta.

## Diagnósticos de Red

Si tu bloque de `MQTT` se estanca o el cliente Modbus TCP no contesta:
- Verifica que Zephyr obtuvo satisfactoriamente una IP vía DHCP (Se revisa en la serial con `zplc status`).
- Asegúrate que tu computadora host corriendo el IDE ZPLC esté exactamente en la misma máscara de sub-red que el hardware embebido.
- Confirma que la placa compilada tenga un chip Wi-Fi o Ethernet plenamente soportado.

## Recomendaciones Actualización (Upgrades OS Framework y Toolchain)

Flashear un binario Core para saltar a sistemas con base kernel Linux Zephyr renovadas: 

- Utilice comando `west flash`. 
- ZPLC aloja los espacios físicos lógicos de variables retentivas o configuraciones compiladoras `zplc bytecodes` en esquemas físicos apartados lógicamente (Flash NVS Offset).
- Es factible flashear sin riesgos de que lógicas cargadas a memoria anterior por personal productivo sean sobreescritas o corrompidas.

## Lista de Control Operativo

Revise antes de dejar produciendo a la máquina:
- Los periodos asignados en `zplc.json` disponen de márgenes operativos sobredimensionados.
- Las memorias `Retain` no colman la EEPROM de la unidad seleccionada.
- Todos los enchufes físicos coinciden con lo trazado nativamente.
- La terminal UART responde satisfactoriamente a 115200 sin arrojar mensajes extraños por log.
