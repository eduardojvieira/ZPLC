---
title: "MQTT: publicar un mensaje y recibirlo"
sidebar_label: "mqtt-publish-subscribe"
description: "La lección mqtt-publish-subscribe: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# MQTT: publicar un mensaje y recibirlo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/mqtt-publish-subscribe. Do not edit. >>> */}

Conéctese al broker de la simulación, suscríbase a un tema, publique un mensaje en él y conserve constancia del mensaje, que llega de vuelta durante un solo ciclo.

## Datos

- Módulo: [10](../modules/module-10.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [modbus-register-round-trip](./modbus-register-round-trip.md)

## Objetivos

- Distinga un bloque de servicio (MQTT_CONNECT, MQTT_SUBSCRIBE), que informa su estado en cada ciclo, de un bloque de solicitud (MQTT_PUBLISH), que envía una vez por cada flanco ascendente de EN.
- Publique solo cuando la suscripción ya esté activa, porque un mensaje enviado antes no se le entrega.
- Conserve un mensaje que VALID indica durante un solo ciclo, y compare su PAYLOAD.
- Indique qué muestra un broker de loopback y qué no muestra.

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

La lección se califica contra un broker que Studio inicia dentro de la sesión de simulación, y no se ha registrado una traza de un broker o un dispositivo reales para ella. Complétela en Simulación: su calificación es la misma cada vez y no necesita broker ni red.

{/* <<< END GENERATED: learn/lessons/mqtt-publish-subscribe <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
