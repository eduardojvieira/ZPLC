---
slug: /learn/faceplate
id: faceplate
title: Panel de E/S en vivo
sidebar_label: Panel de E/S en vivo
description: "El panel E/S en vivo de una simulación: qué enumera, cómo se operan las entradas del programa en ejecución y cuándo llega un cambio al programa."
tags: [learn, simulation, faceplate]
unlisted: true
---

# Panel de E/S en vivo

Mientras un programa se ejecuta en el simulador, la pestaña **Observación** muestra
el panel **E/S en vivo**: todas las entradas y salidas del programa en ejecución,
con un control para cada entrada. Funciona con cualquier proyecto, no solo con una
lección, y no necesita placa. Si dice "Compile el proyecto e inicie la simulación
para ver sus entradas y salidas.", compile el proyecto y luego elija **Conectar** y
**Ejecutar** en la barra de herramientas.

## Qué enumera

- **Entradas**: cada entrada que declara el programa en ejecución, leída de su mapa
  de E/S, con el nombre que le da el programa. Cada fila muestra el tipo, la
  dirección tal como la escribe el programa (por ejemplo `%IX0.1` o `%IW2`), el
  valor, un control para asignarlo, el estado del último cambio y una casilla para
  forzarla.
- **Salidas**: cada salida que el programa asigna a la imagen de salidas, con su
  tipo, su dirección y su valor en vivo.
- Un `BOOL` se lee `TRUE` o `FALSE` y un número se lee como el número; una raya
  indica que el valor todavía no se leyó. Un estado se muestra con un símbolo y una
  palabra además de un color, y un valor forzado indica que está forzado.

El panel no depende de ningún nombre: un programa cuyas entradas se llaman `Gate`
y `Dial` recibe los mismos controles que uno cuyas entradas se llaman `Start` y
`Speed`. Una planta de lección maneja las mismas entradas mediante la asignación
de su lección; vea [Plantas de las lecciones](./plants.md).

## Cómo se opera una entrada

| Tipo de la entrada | Control | Con el teclado |
|---|---|---|
| `BOOL` | Un interruptor cuyo texto dice qué hace al pulsarlo, **Poner TRUE** o **Poner FALSE**; un lector de pantalla lee su nombre y su valor, por ejemplo `Gate: FALSE`. | Llegue a él con Tab y pulse Espacio. |
| `BOOL` | Un botón **Mantener**: `TRUE` mientras se mantiene pulsado, `FALSE` al soltarlo. | Mantenga pulsado Espacio o Intro. |
| Un número de 8 o 16 bits (`SINT`, `INT`, `BYTE`, `WORD` ...) | Un control deslizante sobre el rango del tipo y un cuadro numérico con **Aplicar**. | Las flechas avanzan de uno en uno, Inicio y Fin van a los extremos del rango; escriba un valor en el cuadro y pulse Intro. |
| Un número más ancho (`DINT`, `REAL` ...) | Un cuadro numérico con **Aplicar**. Su tipo no da un rango para deslizar. | Escriba un valor y pulse Intro. |

**Forzar** mantiene una entrada en su valor hasta que usted la libere. Un forzado
admite hasta 32 bits, así que una entrada más ancha se puede asignar pero no
forzar.

## Cuándo llega un cambio al programa

Un cambio se envía al runtime de inmediato, y el runtime lo aplica en un límite de
scan: el programa lo lee al inicio del scan siguiente, nunca en medio de uno. Junto
a la entrada, el panel muestra **Pendiente hasta el próximo scan** desde que se
envía el cambio hasta que el runtime lo tiene, y luego **Aplicado** por un momento.
Una salida muestra el valor que el programa escribió en su último scan, así que una
salida que sigue a una entrada cambia un scan después que la entrada.

## Cuándo no se pueden operar las entradas

Los controles se desactivan, y el panel dice por qué con palabras, cuando:

- la simulación no está conectada o no está en ejecución: iníciela;
- la simulación está en pausa: reanúdela o cambie un valor desde la tabla watch;
- la simulación se detuvo por una falla: reiníciela;
- Studio está en modo hardware: el panel opera entradas solo en simulación; en una
  placa, fuerce una entrada desde la tabla watch;
- el simulador no aplica los cambios en un límite de scan: entonces las entradas
  son de solo lectura.

## Evidencia

El recorrido 50 del entorno de desarrollo opera un interruptor, un botón
**Mantener**, un control deslizante y un cuadro numérico, con el puntero y solo con
el teclado, y ve seguir a cada salida. El recorrido 57 ve encenderse y apagarse la
salida de la primera lección. Ambos ejecutan la simulación nativa en Linux; no son
evidencia de una placa.
