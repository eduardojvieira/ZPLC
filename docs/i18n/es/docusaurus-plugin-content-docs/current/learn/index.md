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

Studio tiene diez lecciones en su pestaña **Learn**, en español y en inglés. En
la pantalla de bienvenida, elija **Learn**: Studio copia la primera lección en una
carpeta que usted elige y abre la pestaña.

Cada lección recorre seis etapas: Objective, Predict, Edit, Run, Observe y
Reflect. Usted edita el proyecto copiado, lo guarda y presiona **Check**. Studio
ejecuta su programa guardado contra el escenario de la lección y enumera cada
aserción que falló, con el instante, el valor esperado y el valor observado. Una
lección está completa cuando todas las aserciones de su escenario pasaron.

Todas las lecciones están desbloqueadas y se pueden tomar en cualquier orden. La
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
descubrir lo que su programa hace realmente. El [formato del archivo de escenario](../reference/scenario-file.md)
enumera cada campo, y la [línea de comandos](../reference/cli.md) los ejecuta sin
Studio.

## Lea los ejemplos de lenguajes

Los [ejemplos de lenguajes de compatibilidad](../languages/examples/v1-5-language-suite.md)
reúnen los mismos programas pequeños en los cinco lenguajes de IEC 61131-3, y la
[referencia de Structured Text](../reference/language-st.md) dice, elemento por
elemento, qué funciona hoy.

## Lo que todavía no está

Un curso con niveles, prerrequisitos y un orden fijo, una lección que permanece
junto al editor y una vía para una placa de aprendizaje son trabajo futuro. Las
lecciones y los ejemplos son ejercicios de host y de simulación: no muestran cómo
se comporta un programa en una placa física.
