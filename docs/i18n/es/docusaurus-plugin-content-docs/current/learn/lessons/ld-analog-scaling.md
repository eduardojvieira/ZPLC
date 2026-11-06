---
title: "Escalado analógico en escalera: de cuentas a porcentaje con MUL, DIV y LIMIT"
sidebar_label: "ld-analog-scaling"
description: "La lección ld-analog-scaling: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escalado analógico en escalera: de cuentas a porcentaje con MUL, DIV y LIMIT

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-analog-scaling. Do not edit. >>> */}

Escale las cuentas crudas de una entrada analógica a un nivel en porcentaje con una caja MUL y luego una caja DIV, mantenga el resultado en rango con LIMIT y gobierne dos lámparas de nivel con cajas de comparación.

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

- Escale cuentas analógicas crudas a unidades de ingeniería multiplicando por el rango de las unidades y luego dividiendo entre el rango de las cuentas, en un tipo donde quepa el producto.
- Mantenga un valor dentro de su rango con una caja LIMIT y compare el valor escalado, no las cuentas crudas, con los umbrales de las alarmas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms, con bloques que reemplazan al sensor; no demuestran la precisión, el ruido ni la calibración de una entrada analógica real, el cableado, HIL ni certificación.

## En una placa

La lección reemplaza la entrada analógica con bloques del programa y las lámparas se califican en el simulador nativo, y no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/ld-analog-scaling <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
