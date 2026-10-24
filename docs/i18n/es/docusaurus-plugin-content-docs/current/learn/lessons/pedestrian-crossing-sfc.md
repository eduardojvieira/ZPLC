---
title: "Cruce peatonal como diagrama funcional secuencial"
sidebar_label: "pedestrian-crossing-sfc"
description: "La lección pedestrian-crossing-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Cruce peatonal como diagrama funcional secuencial

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/pedestrian-crossing-sfc. Do not edit. >>> */}

Dibuje el cruce peatonal como un diagrama funcional secuencial con un paso por combinación de luces, y compruebe que WALK se muestra solo mientras los vehículos están en rojo.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: [`pedestrian-v1`](../plants.md)
- Requisitos previos: [pedestrian-crossing-states](./pedestrian-crossing-states.md), [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Convierta las fases de un cruce peatonal en los pasos de un diagrama, cada uno con una acción que escribe todas las luces.
- Salga del paso verde con una transición sobre la solicitud de la planta y recorra las demás fases con transiciones temporizadas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX, que no es evidencia de cruce físico, hardware, HIL ni certificación.

## En una placa

El diagrama maneja cinco lámparas y las placas del estudiante tienen cuatro salidas para LED; sus solicitudes de peatones provienen de la planta simulada del cruce. Complétela en Simulación, que modela el cruce y da el mismo resultado cada vez.

{/* <<< END GENERATED: learn/lessons/pedestrian-crossing-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
