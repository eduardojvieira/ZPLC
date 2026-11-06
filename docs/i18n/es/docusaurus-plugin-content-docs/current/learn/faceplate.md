---
slug: /learn/faceplate
id: faceplate
title: Panel de E/S en vivo
sidebar_label: Panel de E/S en vivo
description: 'El panel E/S en vivo de una simulación: qué enumera, cómo se operan las entradas del programa en ejecución y cuándo llega un cambio al programa.'
tags: [learn, simulation, faceplate]
unlisted: true
---

# Panel de E/S en vivo

El panel es una sección de la pestaña **Observación** que enumera todas las entradas y salidas del programa que se simula y permite operar las entradas con el puntero o con el teclado. Funciona con cualquier proyecto, no solo con una lección, y no necesita placa. Si el panel solo dice "Compile el proyecto e inicie la simulación para ver sus entradas y salidas.", compile el proyecto y luego elija **Conectar** y **Ejecutar** en la barra de herramientas.

## Qué muestra el panel

- **Entradas.** Una fila por cada entrada que declara el programa en ejecución, leída del mapa de E/S de la compilación y con el nombre que le da el programa. La fila indica el tipo, la dirección tal como la escribe el programa (`%IX0.1`, `%IW2`), el valor actual, un control para asignarlo, el estado del último cambio y una casilla para forzarla.
- **Salidas.** Una fila por cada salida que el programa asigna a la imagen de salidas, con su tipo, su dirección y su valor en vivo.
- **Valores.** Un `BOOL` se lee `TRUE` o `FALSE`, y un número se lee como tal. Una raya indica que el valor aún no se leyó. El estado nunca depende solo del color: lo acompañan un símbolo y una palabra, y un valor forzado lo indica.

El panel no depende de los nombres. Un programa cuyas entradas se llaman `Gate` y `Dial` recibe los mismos controles que uno cuyas entradas se llaman `Start` y `Speed`. Una planta de lección maneja las mismas entradas mediante la asignación de su lección; vea [Plantas de las lecciones](./plants.md).

## Operar una entrada

El control depende del tipo de la entrada.

| Tipo de la entrada                                           | Control                                                                                                                                                           | Con el teclado                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BOOL`                                                       | Un interruptor cuyo texto dice qué hace al pulsarlo, **Poner TRUE** o **Poner FALSE**; un lector de pantalla lee su nombre y su valor, por ejemplo `Gate: FALSE`. | Llegue a él con Tab y pulse Espacio.                                                                                       |
| `BOOL`                                                       | Un botón **Mantener**: `TRUE` mientras se mantiene pulsado, `FALSE` al soltarlo.                                                                                  | Mantenga pulsado Espacio o Intro.                                                                                          |
| Un número de 8 o 16 bits (`SINT`, `INT`, `BYTE`, `WORD` ...) | Un control deslizante sobre el rango del tipo y un cuadro numérico con **Aplicar**.                                                                               | Las flechas avanzan de uno en uno, Inicio y Fin van a los extremos del rango; escriba un valor en el cuadro y pulse Intro. |
| Un número más ancho (`DINT`, `REAL` ...)                     | Un cuadro numérico con **Aplicar**. Su tipo no da un rango para deslizar.                                                                                         | Escriba un valor y pulse Intro.                                                                                            |

La casilla **Forzar** mantiene una entrada en su valor hasta que se desmarca. Un forzado admite hasta 32 bits, así que una entrada más ancha puede asignarse pero no forzarse; la fila lo indica.

## Cuándo llega un cambio al programa

El cambio se envía al runtime de inmediato, y el runtime lo aplica entre dos ciclos: el programa lee el valor nuevo al inicio del ciclo siguiente, nunca a mitad de uno. Junto a la entrada, el panel muestra **Pendiente hasta el próximo ciclo** desde que se envía el cambio hasta que el runtime lo tiene, y luego **Aplicado** por un instante.

Una salida muestra el valor que el programa escribió en su último ciclo. Por eso una salida que sigue a una entrada cambia un ciclo después que ella.

## Cuándo las entradas están deshabilitadas

Los controles se deshabilitan, y el panel explica el motivo con palabras, en estos casos:

- La simulación no está conectada o no está en ejecución. Inícela.
- La simulación está en pausa. Reanúdela, o cambie un valor desde la tabla de observación.
- La simulación se detuvo por una falla. Reinicie la simulación.
- ZPLC está en modo hardware. El panel opera entradas solo en simulación; en una placa, fuerce una entrada desde la tabla de observación.
- El simulador no puede aplicar cambios entre ciclos. Entonces las entradas son de solo lectura.

## Evidencia

Nivel de evidencia: host. Dos ejecuciones guionadas de Studio, los recorridos 50 y 57 de `packages/zplc-ide/scripts/journeys.ts`, manejan el panel en Linux contra la simulación nativa. El recorrido 50 opera un interruptor, un botón **Mantener**, un control deslizante y un cuadro numérico con el puntero y solo con el teclado, y comprueba que cada salida sigue el cambio. El recorrido 57 comprueba que la salida de la primera lección se enciende y se apaga. Ninguno es evidencia de una placa.
