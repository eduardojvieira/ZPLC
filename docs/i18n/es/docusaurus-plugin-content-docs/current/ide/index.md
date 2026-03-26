---
slug: /ide
id: index
title: Entorno de Desarrollo y Herramientas
sidebar_label: Generalidades del IDE
description: Visión general del ZPLC IDE, modelo de proyecto, simulación y flujos de depuración.
tags: [ide, tooling, debugging]
---

# ZPLC IDE

El Entorno de Desarrollo Integrado (IDE) de ZPLC provee un flujo de trabajo de ingeniería completo para crear, simular y desplegar lógica de automatización IEC 61131-3.

## Capacidades Principales

El IDE sirve como la capa central de orquestación para todos tus proyectos de automatización. Sus principales responsabilidades incluyen:

- **Gestión de Proyecto**: Edición de configuraciones `zplc.json`, organización de archivos fuente y gestión de ruteo de tareas.
- **Flujos Multi-Lenguaje**: Edición perfecta en Texto Estructurado (ST), Lista de Instrucciones (IL), Diagrama de Contactos / Ladder (LD), Diagramas de Bloques Funcionales (FBD) y Diagramas Secuenciales y Gráficos (SFC).
- **Compilación**: Transpilación de los modelos visuales a ST, validación sintáctica estricta y compilación a código binario ultracompacto `.zplc`.
- **Simulación**: Prueba nativa de lógica directamente en la PC anfitriona sin requerimiento de hardware físico.
- **Despliegue y Depuración (Debug)**: Flasheo y traspaso de memoria binaria directa a las placas MCU mediante Serial. Soporta utilidades asíncronas de lectura como Breakpoints, forzado de variables y monitorización de RTOS.

## Flujo de Trabajo Extremo a Extremo

```mermaid
flowchart LR
  Author[Autor de lógica IEC] --> Config[Setup de proyecto y target]
  Config --> Compile[Construcción/Compilación a .zplc]
  Compile --> Sim[Simular en runtime nativo POSIX]
  Sim --> Deploy[Despliegue a plataforma de hardware]
  Deploy --> Debug[Monitor & Depuración Online]
```

## Arquitectura de Proyecto

El modelo de proyecto ZPLC está basado puramente en un árbol de directorios y es transparente.
Todas las configuraciones requeridas —como objetivos de CPU en hardware, configuración Wi-Fi, mapeo atómico de IO físicos, transacciones de comunicación en MQTT o Modbus y priorizaciones de carga por cada Tarea— se guardan limpiamente en el manifiesto principal `zplc.json`.

Esto hace que los proyectos de ZPLC estén profundamente preparados para control de versiones (Git), uso en línea de comandos o ser migrados fácilmente entre computadoras.

## Entornos de Ejecución

Al iniciar un estado de la depuración, el IDE enruta transparentemente toda tu lógica y el canal binario hacia la instancia de validación que escojas:

| Vía de Ejecución | Uso | Comportamiento |
|---|---|---|
| **Simulación Nativa (Desktop)** | Vía predeterminada | Levanta en el sistema anfitrión u OS bajo SoftPLC nativo. Dispone del 100% de la tabla de depuración. |
| **Ejecución de Hardware real** | Entorno físico real | Ejecución oficial embebida nativa en Zephyr RTOS sobre las conexiones TTY o COM física de la placa. El IDE funciona como monitor e inspector de estados remotos. |

## Diagnósticos y Depuración

Se dispone de una vasta caja de herramientas online a través del flujo productivo, tanto desde pruebas virtuales en mesa hasta implementaciones complejas sobre Hardware montado:
- **Watch Tables (Tabla de Diagnósticos)**: Supervisa estados continuos nominales o analógicos en directo.
- **Breakpoints (Pausas)**: Interrumpe el RTOS justo a la medida que el programa llega a tu nodo marcado.
- **Stepping (Pasos)**: Inspección de bloque y progreso meticulosos a velocidad manual.
- **Variables Forzadas (Forces)**: Inyección cruda de lógicas no presentes para puentear sensores averiados y recuperar control manual del flujo al rescate.
