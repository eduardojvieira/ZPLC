---
title: "Modbus en diagrama de bloques de función: escribir una bobina y volver a leerla"
sidebar_label: "modbus-coil-fbd"
description: "La lección modbus-coil-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Modbus en diagrama de bloques de función: escribir una bobina y volver a leerla

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/modbus-coil-fbd. Do not edit. >>> */}

Edite un diagrama de bloques de función para que MB_READ_COIL vuelva a leer la bobina 4 una vez que MB_WRITE_COIL la haya escrito, y Echo informe la bobina leída.

## Datos

- Módulo: [10](../modules/module-10.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: FBD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [modbus-register-round-trip](./modbus-register-round-trip.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objetivos

- Llame a un bloque cliente Modbus en un diagrama de bloques de función, con sus entradas alimentadas desde constantes que comparten los dos bloques, para que la escritura y la lectura nombren el mismo servidor y la misma bobina.
- Encadene dos solicitudes con un cable desde la salida DONE del primer bloque hasta la entrada EN del segundo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

El servidor Modbus de esta lección es un doble de loopback que Studio inicia dentro de la sesión de simulación, en este equipo. El escenario muestra cómo se comportan los bloques y su protocolo de intercambio frente a ese doble; no muestra que un controlador, un variador o una pasarela reales acepten la misma solicitud, y no dice nada sobre el cableado, los tiempos de una red, un dispositivo real, HIL ni certificación.

## En una placa

La lección escribe y lee una bobina del servidor Modbus TCP que Studio inicia en este equipo. La Raspberry Pi Pico no tiene interfaz de red, y la ESP32-S3 necesitaría credenciales de Wi-Fi y la dirección de un servidor en su firmware, que el firmware del curso no configura. Complétela en Simulación: su calificación es la misma cada vez y no necesita dispositivo ni red.

{/* <<< END GENERATED: learn/lessons/modbus-coil-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
