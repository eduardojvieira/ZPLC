---
slug: /languages
id: index
title: Lenguajes y Modelo de Programación
sidebar_label: Generalidades
description: Descripción de los lenguajes IEC 61131-3 compatibles con ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y Modelo de Programación

ZPLC proporciona un soporte de primer nivel para los cinco lenguajes de programación definidos en el estándar industrial IEC 61131-3. Esto permite que ingenieros mecánicos, eléctricos y de software puedan crear lógica de control de forma nativa en el paradigma con el que se sientan más cómodos.

Los lenguajes compatibles en la plataforma son:

1. **Texto Estructurado (ST)** - Lenguaje textual de alto nivel similar a Pascal o C abstracto.
2. **Lista de Instrucciones (IL)** - Lenguaje textual de bajo nivel asemejado al ensamblador.
3. **Diagrama de Contactos Ladder (LD)** - Entorno visual lógico enfocado en circuitos y transmisión de relevadores magnéticos electromecánicos.
4. **Diagrama de Bloques Funcionales (FBD)** - Mapeo de flujos continuos sobre procesamientos bloque a bloque.
5. **Plano Secuencial Gráfico (SFC)** - Un motor o máquina de estados visual para dominar control secuencial o multi-bifurcaciones.

## El Modelo de Compilación Híbrida ZPLC

Al contrario de varios PLC de legados antiguos que separan memorias diferentes al ejecutar distintos lenguajes o penalizan saltos de ejecución de lenguajes visuales por sobre los de texto, en la arquitectura de ZPLC se emplea **solo una ruta de ejecución consolidada única**.

El popular "Texto Estructurado (ST)" oficia de fundición base. Todos y el resto de lenguajes — visuales (LD, FBD, SFC) y literales (IL)— son automáticamente transpilados a ST bajo capó antes de ser integrados dentro del bytecode optimizado ejecutable `.zplc`.

### ¿Por qué esto es vital?

Dado que toda tu aplicación asume eventualmente un backend idéntico estricto:
- ZPLC te asegura paridad de funcionamiento y rendimiento del 100% al obrar sobre cualquiera de las 5 opciones de lenguajes. 
- Puedes diseñar bloques visuales complejos en `FBD` o secuencias mecánicas en `SFC` e invocarlos y cruzarlos o referirlos globalmente sin retrasos desde tus scripts `ST`. 
- Disfrutarás la completitud de las funciones estándar (Librería Math STD Lib, Conteo e Hilos Timers) enteramente distribuidas sin restricciones cruzadas. 

## Paridad en Depuración (Debug)

La depuración tampoco es discriminatoria; gracias al ruteo común base, puedes hacer:
- Pruebas en software de los lenguajes virtuales localmente en su misma computadora en el entorno Nativo del SoftPLC.
- Flashear y cargar hacia HW serial (Hardware con Zephyr RTOS base).
- Mantener y observar el avance usando breakpoints o la Tabla de Variables de inspección en paralelo sin comprometer ningún lenguaje subyacente.

## Biblioteca Estándar (Stdlib)

Biológicamente adjunto al framework ZPLC, te garantizas aceleración nativa usando Zephyr C RTOS sobre todos los pilares primordiales industriales:
- **Relojes y Tiempos**: `TON`, `TOF`, `TP`
- **Contadores de Stock**: `CTU`, `CTD`, `CTUD`
- **Detectores Lineales o Cambios Físicos de Ciclo**: `R_TRIG` (Flanco de Subida), `F_TRIG` (Bajada), `RS`, `SR`
- **Cadena de Datos O Manipuladores HMI**: Longitud `LEN`, `CONCAT`, Extracción de Datos en Arrays.
- **Trigonométricas Escalares Avanzadas**.
- **Comunicaciones Asíncronas Base Ethernet o Serie**: Lectura de registros vía Bloques como (`MB_READ_HREG` de Modbus) o mensajería de nube (`MQTT_PUBLISH`).

Revisa directamente la [Referencia de Bibliotecas Estándar (Stdlib)](./stdlib.md) buscando mayores pormenores y diagramas del mismo bloque base.

## Lecturas Sugeridas

Aprenda interactuando con las secciones específicas por perfil literales:
- [Texto Estructurado (ST)](./st.md)
- [Listas de Instrucciones (IL)](./il.md)
- [Plano Estándar Completo de Base ZPLC V1.5](./examples/v1-5-language-suite.md)
