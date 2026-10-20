---
title: "Modbus TCP: escribir un registro y volver a leerlo"
sidebar_label: "modbus-register-round-trip"
description: "La lección modbus-register-round-trip: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Modbus TCP: escribir un registro y volver a leerlo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/modbus-register-round-trip. Do not edit. >>> */}

Escriba un registro de retención con un bloque Modbus TCP, vuelva a leerlo cuando termine la escritura e informe si el valor recibido es el que usted envió.

## Datos

- Módulo: [10](../modules/module-10.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [structures-arrays-call-panel](./structures-arrays-call-panel.md)

## Objetivos

- Escriba un registro de retención con MB_WRITE_HREG y vuelva a leerlo con MB_READ_HREG, en ese orden, usando la salida DONE del primer bloque como disparo del segundo.
- Compare el valor leído con el valor escrito, e informe un ERROR de cualquiera de los dos bloques.
- Indique qué muestra un doble de loopback y qué no muestra.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

El servidor Modbus de esta lección es un doble de loopback que ZPLC inicia dentro de la sesión de simulación, en este equipo. El escenario muestra cómo se comportan los bloques y su protocolo de intercambio frente a ese doble; no muestra que un controlador, un variador o una pasarela reales acepten la misma solicitud, y no dice nada sobre el cableado, los tiempos de una red, un dispositivo real, HIL ni certificación.

## En una placa

La lección se comunica con el servidor Modbus TCP que ZPLC inicia en este equipo. La Raspberry Pi Pico no tiene interfaz de red, y la ESP32-S3 necesitaría credenciales de Wi-Fi y la dirección de un servidor en su firmware, que el firmware del curso no configura. Complétela en Simulación: su calificación es la misma cada vez y no necesita dispositivo ni red.

{/* <<< END GENERATED: learn/lessons/modbus-register-round-trip <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
