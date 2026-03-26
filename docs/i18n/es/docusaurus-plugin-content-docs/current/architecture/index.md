---
slug: /architecture
id: index
title: Arquitectura del Sistema
sidebar_label: Arquitectura
description: Límites del sistema, fronteras e implementación interna en la arquitectura ZPLC.
tags: [architecture, integrator]
---

# Arquitectura del Sistema

ZPLC está fragmentado intencionalmente en zonas de ingeniería y fronteras de ejecución crudas.

Esta gran separación resguarda o protege el inmaculado determinismo necesario en una computadora o control industrial, permitiendo gozar de características modernas y complejas requeridas por desarrolladores actuales como validación por IDE, interfaces compuestas y modelos gráficos transpilados.

## Vistazo de Arquitectura

```mermaid
flowchart LR
  subgraph Engineering[Interfaces de Ingeniería]
    IDE[Interfaz Gráfica IDE]
    COMPILER[ZPLC - Tubería de Compilaciones]
  end

  subgraph Execution[Motores Ejecutivos (Runtime)]
    BYTECODE[Archivos Bytecode Binarios .zplc]
    VM[ZPLC Core de MV (Máquina Virtual)]
    HAL[Reglamentos y Contrato HAL]
    TARGETS[Simulación Host Windows/Mac / Zephyr Boards]
  end

  IDE --> COMPILER
  COMPILER --> BYTECODE
  BYTECODE --> VM
  VM --> HAL
  HAL --> TARGETS
```

## Fronteras Fundacionales

Dominar las funcionalidades y componentes del ZPLC moderno significa dominar 4 fronteras conceptuales que cortan de izquierda a derecha en la concepción del programa:

1. **Frontera de Autoría** — Ingenieros trabajan y diagraman en IDE sobre visuales modelo `.ld` o scripts de literales `.st`.
2. **Frontera de Compilado** — Distintos idiomas y autores convergen uniformemente, estandarizados bajo Texto Estructurado compartiendo en código un solo ensamblado binario resultante.
3. **Frontera de Ejecución** — El corazón ejecutor "Core escrito en C99" transita el bytecode por hilos controlando matemáticamente cada acción cíclica programada en su target local.
4. **Frontera de Plataforma** — Hardware de la MCU base, Relojes o Sockets TCP nunca tocan la VM principal, operan confinados e inmovilizados siempre detrás de un protocolo cruzado estricto HAL (Capa de Abstracción Estándar).

## Componentes Elementales

### 1. Sistema Base y Herramientas Gráficas (IDE)

El motor principal interactivo con usted. Opera los editores visuales amigables, orquesta las creaciones en tu proyecto sobre los FBD o SFC y despliega los enlaces de diagnóstico permitiendo inspecciones crudas.

### 2. Contrato de Traspaso (Compiler)

El compilador trasgrede todos las metodologías IEC diagramadas, absorbiéndolas hacia sí conformando opcodes que el RTOS asimile y entienda. Al arrojar salidas universalizadas como un único e indivisible `.zplc` certifica al integrador lograr "Un único motor y modelo interno sobre incontables y extensivas alternativas superficiales visuales sin inconsistencias". 

### 3. Nucleo C99 Principal (Runtime Core)

La Máquina Virtual de Zephyr escrita enteramente en ANSI C puro `libzplc_core` ejecuta fronteras de hardware y depende siempre de tres modelos rígidos de seguridad y eficiencia temporal:
- **Zonas seguras de memoria universalizada**: Fragmentos mapeado lógicamente para acomodar las patillas entradas y sensores (IPI), Salidas energizadas de actuadores (OPI), retención y memoria temporal asiladas.
- **Instancias Individuales**: Punteros estancos guardados por un proceso virtual protegiendo datos entre Multi-tareas.
- **Micro Programador Multihilo (Scheduler)**: Cicla los escaneos asíncronos y mide frecuencias de respuesta.

### 4. Capa Abstraccion Hardware (HAL Contract)

Constituyéndose obligadamente como único portal y compuerta al plano material de una computadora, El hardware a implementar define rigurosamente e implementa `zplc_hal.h`:
- Transcripción del pulso del CPU Base local (`zplc_hal_tick`, `zplc_hal_sleep`).
- Manejo analógico crudo o Modulación de Switches y Leds.
- Persistencia NVS o Chips NOR Externos.
- Comunicación local o LAN por sockets de nube.
- Arranques o Loggings.

Al reescribir esta franja el integrador o desarrollador podrá exportar las lógicas de ZPLC prácticamente sobre toda electrónica industrial construible.

## Operaciones de Confianza

1. **Destierro estricto del kernel desde zonas C Core**: No podrás jamás llamar directamente a registros nativos o interrupciones RTOS de capa física desde el nucleo programable ZPLC Core, mitigando inyecciones y cuellos sin importar plataforma.
2. **Determinismo real Inquebrantable**: Mapeos son 100% pre-escritos e inicializados en su boot. Las fugas por mala codificación y excepciones de Paginado/Memoria Heap son lógicamente inexistentes.
3. **Escalar Multi-Tarea Cíclica**: ZPLC orquesta unificados buffers aisládamente por hilo pero comparte datos públicos simultaneamos de lectura al mismo clock y frecuencia para el globalizado de etiquetas de todo proyecto.

## Temáticas Subyacentes

- [Mapas Genéricos de Plataforma](../platform-overview/index.md)
- [Componentes Centralizadas Internas](../runtime/index.md)
- [Implementación y Generación Zephyr](../integration/index.md)
