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

Studio tiene diez lecciones en un curso, en español y en inglés. En la pantalla de
bienvenida, elija **Learn**: se abre el inicio de Learn, sin proyecto y sin red, y
enumera los módulos en orden con su nivel, lo que requiere cada uno y cuánto
dura. Elija **Comenzar el curso**: Studio copia la primera lección en una carpeta
que usted elige y la abre.

Cada lección recorre seis etapas: Objective, Predict, Edit, Run, Observe y
Reflect. Usted edita el proyecto copiado, lo guarda y presiona **Check**. Studio
ejecuta su programa guardado contra el escenario de la lección y enumera cada
aserción que falló, con el instante, el valor esperado y el valor observado. Una
lección está completa cuando todas las aserciones de su escenario pasaron.

Una lección está bloqueada hasta que se aprueban las lecciones que requiere, y el
inicio dice cuáles. Si prefiere tomarlas en cualquier orden, active
**Desbloquear todas las lecciones** en el inicio. La
descripción completa de lo que hace Learn y de lo que guarda está en
[Banco de trabajo de Studio](../ide/features.md#learn).

## Abra un proyecto de ejemplo

Studio incluye proyectos de ejemplo en la pantalla de bienvenida, agrupados desde
los primeros pasos hasta motores, control de procesos, los cinco lenguajes y
placas. Están en `packages/zplc-ide/projects/`. Para copiar uno a una carpeta
propia, elíjalo en **Examples**.

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

Una vía para una placa de aprendizaje y las lecciones de seis módulos que todavía
están vacíos son trabajo futuro. Las
lecciones y los ejemplos son ejercicios de host y de simulación: no muestran cómo
se comporta un programa en una placa física.
