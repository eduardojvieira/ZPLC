---
slug: /learn
id: index
title: Aprender
sidebar_label: Aprender
description: "Dónde practicar programación de PLC con ZPLC hoy: las lecciones de Studio, los proyectos de ejemplo incluidos y las pruebas de escenario."
tags: [learn, lessons, examples]
---

# Aprender

Esta sección es para quien quiere practicar. No necesita ninguna placa: todos los
ejercicios se ejecutan en el simulador de su equipo y ninguno inicia una
operación física.

## Empiece con las lecciones de Studio

Studio tiene 28 lecciones en un curso, en español y en inglés. El [esquema del curso](course-outline.md) enumera cada módulo, las lecciones que existen y las que están planeadas. En la pantalla de
bienvenida, elija **Aprender**: se abre el inicio de Learn, sin proyecto y sin red, y
enumera los módulos en orden con su nivel, lo que requiere cada uno y cuánto
dura. Elija **Comenzar el curso**: Studio crea el espacio de trabajo de la primera lección en su propia carpeta y lo abre; no hay carpeta que elegir ni paso de copia. La lección sigue visible junto al editor, también cuando usted cambia a la vista Proyecto.

Cada lección recorre seis etapas: Objective, Predict, Edit, Run, Observe y
Reflect. Usted edita el espacio de trabajo, lo guarda y presiona **Check**. Studio
ejecuta su programa guardado contra el escenario de la lección y enumera cada
aserción que falló, con el instante, el valor esperado y el valor observado. Una
lección está completa cuando todas las aserciones de su escenario pasaron.

Cada lección ofrece dos niveles de pista, y Studio registra cada nivel que usted abre. La solución de referencia se abre solo a pedido, y el progreso registra que la vio. Un docente puede ocultar las soluciones: vea [Docentes](./educators.md).

Una lección está bloqueada hasta que se aprueban las lecciones que requiere, y el
inicio dice cuáles. Si prefiere tomarlas en cualquier orden, active
**Desbloquear todas las lecciones** en el inicio. La
descripción completa de lo que hace Learn y de lo que guarda está en
[Banco de trabajo de Studio](../ide/features.md#learn).

## Abra un proyecto de ejemplo

Studio incluye proyectos de ejemplo en la pantalla de bienvenida, agrupados por tema (primeros pasos, motores, control de procesos, los cinco lenguajes y placas) y por nivel, y cada uno muestra su lenguaje y, si es de hardware, su placa. Un ejemplo de hardware trae un escenario o dice por qué no lo tiene. Están en `packages/zplc-ide/projects/`. Para copiar uno a una carpeta
propia, elíjalo en **Ejemplos**.

El tutorial [Blink sin hardware](../tutorials/blink-without-hardware.md) recorre
uno de ellos.

## Practique con pruebas de escenario

Un escenario es un guion corto que fija entradas, deja correr el programa durante
un tiempo definido y verifica las salidas. Escribir uno es la mejor manera de
descubrir lo que su programa hace realmente. [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md)
muestra cómo, el [formato del archivo de escenario](../reference/scenario-file.md)
enumera cada campo, y la [línea de comandos](../reference/cli.md) los ejecuta sin
Studio.

## Lea los ejemplos de lenguajes

Los [ejemplos de lenguajes de compatibilidad](../languages/examples/v1-5-language-suite.md)
reúnen los mismos programas pequeños en los cinco lenguajes de IEC 61131-3, y la
[referencia de Structured Text](../reference/language-st.md) dice, elemento por
elemento, qué funciona hoy.

## Lo que todavía no está

Cada lección enumera las vías que admite y, para una vía que no admite, dice por qué y qué hacer en su lugar. Una vía para una placa de aprendizaje y las lecciones de cinco módulos que todavía
están vacíos son trabajo futuro. El [esquema del curso](course-outline.md) dice cuáles. Las
lecciones y los ejemplos son ejercicios de host y de simulación: no muestran cómo
se comporta un programa en una placa física.
