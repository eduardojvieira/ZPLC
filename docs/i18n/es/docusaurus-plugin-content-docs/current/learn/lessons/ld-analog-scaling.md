---
title: "Escalado analógico en escalera: de cuentas a porcentaje con MUL, DIV y LIMIT"
sidebar_label: "ld-analog-scaling"
description: "La lección ld-analog-scaling: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escalado analógico en escalera: de cuentas a porcentaje con MUL, DIV y LIMIT

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-analog-scaling. Do not edit. >>> */}

Escale las cuentas crudas de una entrada analógica a un nivel en porcentaje con un bloque MUL y luego un bloque DIV, mantenga el resultado en rango con LIMIT y gobierne dos lámparas de nivel con cajas de comparación.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [ld-compare-math](./ld-compare-math.md)

## Objetivos

- Escale cuentas analógicas crudas a unidades de ingeniería con números enteros, sin perder la parte pequeña del valor, en un tipo donde quepa el producto.
- Mantenga un valor dentro de su rango con un bloque LIMIT y compare el valor escalado, no las cuentas crudas, con los umbrales de las alarmas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad. El escenario solo fija entradas BOOL, así que la lección no lee una entrada analógica real, y no muestra cuán preciso, ruidoso o bien calibrado es un sensor real, ni cómo se cablea.

## En una placa

La lección reemplaza la entrada analógica con bloques del programa y las lámparas se califican en el simulador nativo, y no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/ld-analog-scaling <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
