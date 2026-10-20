---
title: "MQTT: publicar un mensaje y recibirlo"
sidebar_label: "mqtt-publish-subscribe"
description: "La lección mqtt-publish-subscribe: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# MQTT: publicar un mensaje y recibirlo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/mqtt-publish-subscribe. Do not edit. >>> */}

Únase al broker de la simulación, suscríbase a un tema, publique un mensaje en él y conserve el registro del mensaje cuando vuelve durante un solo ciclo.

## Datos

- Módulo: [10](../modules/module-10.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [modbus-register-round-trip](./modbus-register-round-trip.md)

## Objetivos

- Distinguir un bloque de servicio (MQTT_CONNECT, MQTT_SUBSCRIBE), que informa su estado en cada ciclo, de un bloque de solicitud (MQTT_PUBLISH), que envía una vez por cada flanco ascendente de EN.
- Publicar solo cuando la suscripción ya se mantiene, porque un mensaje enviado antes no se le entrega.
- Conservar un mensaje que VALID informa durante un solo ciclo y comparar su PAYLOAD.
- Decir qué muestra un broker de loopback y qué no muestra.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

El broker MQTT de esta lección es un doble de loopback que Studio inicia dentro de la sesión de simulación, en este equipo. El escenario muestra cómo se comportan los bloques y su protocolo de intercambio frente a ese doble; no muestra que un broker, un servicio en la nube o un dispositivo reales acepten la misma sesión, los mismos temas o la misma calidad de servicio, y no dice nada sobre los tiempos de una red, HIL ni certificación.

## En una placa

La lección se comunica con el broker MQTT que Studio inicia en este equipo. La Raspberry Pi Pico no tiene interfaz de red, y la ESP32-S3 necesitaría credenciales de Wi-Fi y la dirección de un broker en su firmware, que el firmware del curso no configura. Complétela en Simulación: su calificación es la misma cada vez y no necesita broker ni red.

{/* <<< END GENERATED: learn/lessons/mqtt-publish-subscribe <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
