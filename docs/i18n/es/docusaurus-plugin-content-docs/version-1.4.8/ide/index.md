---
slug: /ide
id: index
title: IDE y Herramientas
sidebar_label: Visión General del IDE
description: Capacidades del IDE web de ZPLC y herramientas de depuración.
tags: [ide, tooling, debugging]
---

# IDE y Herramientas

El Entorno de Desarrollo Integrado (IDE) de ZPLC es una aplicación web moderna diseñada para llevar las mejores prácticas de ingeniería de software a la programación de PLC.

## Capacidades

*   **Basado en Navegador**: Se ejecuta completamente en el navegador utilizando React y Vite, sin requerir instalación local para comenzar a escribir lógica.
*   **Edición Enriquecida**: Desarrollado con Monaco Editor, proporcionando resaltado de sintaxis, autocompletado y comprobación de errores para Texto Estructurado.
*   **Compilador Integrado**: El compilador está integrado en el IDE (a través de WebAssembly o un servicio backend), lo que permite una retroalimentación instantánea sobre los cambios de código.
*   **Gestión de Proyectos**: Organice sus programas de PLC, variables y tareas dentro de un formato de proyecto estructurado.

## Flujos de Trabajo Web y de Escritorio

ZPLC soporta dos flujos de trabajo principales:

1.  **Flujo de Trabajo Web**: Se puede acceder al IDE a través de una URL alojada. Los proyectos se pueden guardar localmente en el navegador o sincronizar con un backend en la nube.
2.  **Flujo de Trabajo de Escritorio**: Para desarrollo local y conexión directa al hardware a través de puertos serie, el IDE se puede ejecutar localmente (por ejemplo, usando Electron o un servidor Node.js local).

## Simulación y Depuración

Una característica principal del IDE es la capacidad de simular la lógica del PLC antes de desplegarla en el hardware físico.

*   **Simulación WASM**: La VM Core C99 real se compila en WebAssembly, lo que permite al IDE ejecutar el bytecode `.zplc` directamente en el navegador con un comportamiento exacto a nivel de ciclo.
*   **Monitorización de Variables en Vivo**: Vea el estado de las entradas, salidas y variables internas en tiempo real durante la simulación.

## Arquitectura para Colaboradores

El IDE está construido usando `packages/ide`. Depende en gran medida de `zustand` para la gestión del estado y se comunica con el hardware de destino o simulador a través de interfaces de servicio definidas. El compilador se encuentra en `packages/compiler`.