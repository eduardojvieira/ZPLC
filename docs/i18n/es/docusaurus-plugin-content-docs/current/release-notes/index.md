---
slug: /release-notes
id: index
title: Registro de Lanzamientos 
sidebar_label: Notas de Versión
description: Funcionalidades históricas y lista maestra de cambios operativos y nuevas capacidades por versionado sobre Zephyr ZPLC base.
tags: [releases, changelog]
---

# Registro de Publicaciones de Versiones Oficial

Presentamos la actualización y el hito maestro global ZPLC `v1.5.0` consolidando oficialmente una mutación arquitectónica e integral masiva dejando un arquetipo puramente demostrativo orientando ZPLC a volverse una base RTOS productiva estricta embebida hacia su control multi-núcleos.  

## Qué introduce la Nueva Estructura v1.5.0

La gran reestructuración impacta enteramente el bloque compilador lógico como las matrices gráficas que sostienen al producto:

### 1. Nuevo Interprete o Núcleo Duro Base (C99 Determinista)
- Excluyendo antiguos formatos experimentales WASM interinos, reescribiendo de cero al RTOS con su máquina virtual puramente abstracta ejecutiva en **Código C Puntero estricto `libzplc_core`**.
- Incorporación asimilada internamente sobre planificador general o motor *Hard Real-Time Scheduler* que interactúa nativa en librerías Zephyr RTOS base eliminando los parates drásticos de rendimiento (Garbage Collector Penalties). 
- Instaurando por reglamento límites precisos inamovibles matemáticos fijos en la Memoria Física Estática delineada asolada para lectura entradas (IPI/OPI) y retenidos en ciclo encendido `Retain`.

### 2. Liberación o Suite Multi-lenguaje IEC Pleno Integrado
Se expone a producción todas las variables visuales interlineadas en transpilador central base para generar Bytecodes .zplc consolidados a la vez:
- **Textos de Lógica Avanzada Puntera**: Creados Structured Text (ST) / Matrices de código por Instruction List (IL).
- **Eléctricas en base o Disrupción Visual Relay**: Ladder Logic Visual Model (`LD`). 
- **Conectividades Asíncronas**: Ruteos gráficos posicionales (Bloques/Compuerta) de Function Block Diagram (`FBD`).
- **Estados Infinitos Puros Programables (SFC)**: Autómatas para enclavamientos lógicos en interfaces.

### 3. Simulador Integrado Asertivo OS POSIX de Plataforma
- Integra la ejecución sobre PC base bajo proceso virtual host permitiendo transiciones nativas o test del 90% in situ probando algoritmia antes de encender un solo procesador quemador externo minimizando flasheo innecesario, bajo soporte de OS POSIX, Windows nativos base Node Native/Electron Engine. 
- Dispositivo integrado de Depuración 1 a 1 de Breackpoints o Puntos asíncronos y Lectura online por salto (Stepping).

### 4. Nuevos Módulos Protocolos Conexión o IOT Global: 
- Activado compatibilidad por sockets nativos de HW hacia protocolos robustos Ethernet RTU Base Modbus. 
- Telemetrías nube asíncronamente conllevan conectores directos a librerías de RTOS nativas mediante bloques o FB intrínsecos al IDE por ZPLC `MQTT_PUBLISH` encapsulando comunicaciones industriales. 

## Cambios Severos (Breaking) o Migraciones con Bases V1.4
- Exoneración profunda del bloque binario para compiladores `WASM` obsoleto siendo inaceptable, transicionando su generación al purísimo compilador .zplc targetizado.
- Al emplear las nuevas metodologías y diagramas LD o compilaciones ST, ZPLC asume firmemente forzar migrar IDE software hacia releases iguales (Ej >= 1.5) garantizando integrarse en sincronía pura evitando desajustes abstractos entre compilador Desktop al Firmware Flasheado MCU Base Zephyr. 

## Placas Homologadas 
Bilateral a sus liberaciones de repositorios estandarizados ZPLC oficializó compilados nativos `.bin /.uff2` pre-creados base para las empresas de microcontroladores predominantes listos al hardware `STMicroelectronics M7/M4` Core Base, `Raspy-Pico RP2040` y variantes dual-core `ESP32-S3 Espressif`.

## Mejoras de Rendimiento General

- El simulador nativo ahora carga proyectos 5 veces más rápido al erradicar los adaptadores de bytecode antiguos.
- Las "Watch Tables" refrescan a 100ms logrando monitoreo casi exacto en lugar de intervalos rígidos de medio segundo.
- Ahora los diagramas lógicos LD se despliegan empleando rendering HTML5 que reduce consumos GPU en el IDE Host.
- Transpilador ST mejorado y estricto limitando fugas a hardware inexistente.

## Correcciones a Firmware Zephyr Core

- `zplc_hal.h` ha sido rediseñado escindiendo por fin control de pines standard con moduladores UART.
- Reducción colosal en el peso o huella del Kernel ZPLC. Pesa actualmente debajo 64KB en el STM32.
- Agregados comprobadores matemáticos que resuelven falsos fallos en conversiones LREAL a DINT.
