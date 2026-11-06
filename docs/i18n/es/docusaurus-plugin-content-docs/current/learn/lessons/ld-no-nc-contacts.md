---
title: "Contactos NA y NC: un botón de parada que falla en modo seguro"
sidebar_label: "ld-no-nc-contacts"
description: "La lección ld-no-nc-contacts: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Contactos NA y NC: un botón de parada que falla en modo seguro

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-no-nc-contacts. Do not edit. >>> */}

Aprenda los contactos normalmente abierto y normalmente cerrado, por qué un botón de parada se cablea normalmente cerrado, y lea correctamente una señal de parada de campo en un programa que además enciende una lámpara cuando el circuito de parada está abierto.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Explique por qué un botón de parada se cablea normalmente cerrado, y cómo ve el programa un botón NC de campo: TRUE en reposo, FALSE al pulsarlo o si se rompe el cable.
- Elija el tipo correcto de contacto en un peldaño: un contacto normalmente abierto deja pasar la energía cuando su variable es TRUE, y uno normalmente cerrado cuando es FALSE.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia determinista del host con el runtime nativo POSIX, solo en su computadora. El escenario ajusta la señal de parada; no demuestran una función de parada segura, el cableado, los tiempos del hardware, HIL ni certificación.

## En una placa

La lección necesita un botón de parada cableado normalmente cerrado y un cable roto, que la simulación aplica como una señal y las placas del estudiante no ofrecen. Complétela en Simulación, donde un cable roto no cuesta nada y se puede repetir.

{/* <<< END GENERATED: learn/lessons/ld-no-nc-contacts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
