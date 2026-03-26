---
slug: /ide/features
id: features
title: Guía de Usuario y Features del IDE
sidebar_label: Features del IDE
description: Una guía completa sobre la interfaz de usuario del ZPLC IDE, gestión de proyectos, compilación, simulación y herramientas de depuración.
tags: [ide, user-guide]
---

# Guía de Usuario y Features del ZPLC IDE

El ZPLC IDE es una aplicación de escritorio de grado industrial construida para escribir, simular y desplegar lógica IEC 61131-3 a microcontroladores basados en Zephyr.

En lugar de necesitar una configuración compleja de múltiples herramientas, el IDE de escritorio ZPLC incluye el compilador y un runtime de simulación nativa listos para usar. Solo necesitas las herramientas de Zephyr cuando estés listo para flashear hardware físico.

## Interfaz Principal

El área de trabajo del IDE está dividida en varios paneles:

- **Árbol del Proyecto (Panel Izquierdo)**: Muestra todos los archivos en tu proyecto `zplc.json`. Utiliza este panel para crear, renombrar y organizar tus archivos soportados (`.st`, `.il`, `.sfc`, etc.). 
- **Editor de Código (Panel Central)**: Un editor visual y de texto de alto rendimiento. Soporta resaltado de sintaxis y validación de errores en vivo para la sintaxis de ZPLC.
- **Terminal y Logs (Panel Inferior)**: Muestra la salida del compilador, errores de compilación y diagnósticos del runtime.
- **Paneles de Depuración (Panel Derecho)**: El centro de comando para la Ejecución en Simulación y Hardware.

## Lenguajes Soportados

ZPLC v1.5.0 soporta múltiples lenguajes de programación IEC 61131-3 a través de modelos textuales y visuales:

1. **Structured Text (ST)**: Lenguaje de alto nivel similar a Pascal. El estándar central para el desarrollo en ZPLC.
2. **Instruction List (IL)**: Lenguaje de bajo nivel estilo ensamblador.
3. **Sequential Function Chart (SFC)**: Lenguaje visual para el diseño de máquinas de estado y control de secuencias.
4. **Ladder Diagram (LD)**: Modelo visual de lógica de relés.
5. **Function Block Diagram (FBD)**: Modelado gráfico de flujo de señales.

*Nota: Los lenguajes visuales (LD, FBD, SFC) se transpilan internamente a ST antes de la compilación, asegurando una ejecución de bytecode idéntica.*

## Buid y Compilación

Una vez que programes tu lógica, debes compilarla a bytecode (`.zplc`) antes de que pueda ejecutarse.

- Haz click en el botón **Compile** en la barra de herramientas superior para validar la sintaxis y generar el payload del runtime.
- La **Terminal** reportará el éxito o presentará cualquier error de sintaxis, comprobación de tipos o asignación de recursos que deba resolverse.

## Simulación de Escritorio (SoftPLC)

El IDE incluye un runtime SoftPLC nativo POSIX listo para usar. Este ejecuta tu bytecode exactamente como correrá en el MCU, pero en el procesador de tu computadora host.

- Haz click en **Start Simulation**.
- El IDE lanzará el puente de ejecución nativa y comenzará a ejecutar tu lógica cíclicamente en segundo plano inmediatamente.
- Puedes usar las herramientas de depuración para interactuar con la lógica.

*(Nota: Versiones anteriores usaban una simulación WASM; la v1.5 confía puramente en la arquitectura nativa de escritorio estándar para una emulación robusta).*

## Ejecución en Hardware (Conectar y Subir)

Para saltar de Simulación a Hardware:

1. Asegúrate de que tu firmware Zephyr esté flasheado en una placa soportada (ej. ESP32-S3 o Raspberry Pi Pico).
2. Conecta la placa por USB.
3. En la barra de herramientas del IDE, presiona **Connect**. Un diálogo te pedirá que selecciones el puerto serial de tu placa.
4. Una vez conectado, haz presiona en **Upload** para enviar el bytecode actual (`.zplc`).
5. Presiona **Run** para ejecutar el runtime de hardware. El IDE ahora actúa como un monitor en línea.

## Herramientas de Depuración (Debugger)

Ya sea en Simulación Nativa o conectado al Hardware, el IDE proporciona las mismas capacidades de depuración:

### Tablas de Observación (Watch Tables)
Añade nombres de variables a la **Watch Table** en el panel derecho para monitorear valores en vivo. A medida que el PLC realiza el escaneo del ciclo de bus, la interfaz de usuario transmitirá y decodificará los valores en tiempo real.

### Breakpoints y Control de Ejecución
Puedes hacer click en el margen del editor de texto para establecer **Breakpoints**.
Cuando la ejecución golpee un breakpoint, la tarea se pausará. Puedes:
- Step Over
- Step Into
- Resume execution

### Valores Forzados (Forces)
Al depurar casos extremos, es posible que desees simular un sensor atascado o pulsar un botón manual:
1. En la tabla **Force Table**, añade una dirección de memoria o una variable taggeada (ej. `IX0.0`).
2. Escribe el valor forzado deseado (ej. `TRUE`).
3. Haz click en **Apply Force**.
El runtime sobrescribirá maliciosamente esa región de memoria antes de cada ciclo, asegurando que tu lógica lea el valor forzado en lugar del I/O real. ¡Usa con precaución en máquinas mecánicas reales!
