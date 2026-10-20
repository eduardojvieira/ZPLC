---
slug: /learn/hardware-track
id: hardware-track
title: Vía de hardware
sidebar_label: Vía de hardware
description: "La vía de hardware de Aprender, para una Raspberry Pi Pico o una ESP32-S3-DevKitC-1 propia: cómo elegir la placa, quién inicia cada operación física y cómo se hace y se identifica una comprobación en la placa. Ninguna placa tiene todavía un registro de hardware."
tags: [learn, lessons, hardware]
unlisted: true
---

# Vía de hardware

Todas las lecciones se pueden aprobar en simulación, sin hardware. La vía de hardware lleva
las mismas lecciones a una placa sobre su mesa, una de las dos placas de aprendizaje:
una Raspberry Pi Pico (RP2040) o una ESP32-S3-DevKitC-1.
Todavía no se registró ninguna comprobación en ninguna de las dos placas: vea el final de esta página.

## Elija su placa

Al pie del inicio de Aprender, la franja **Pista de hardware** tiene un grupo **Su placa** con
las dos placas. Elija la que tiene. Con el teclado, llegue al grupo con Tab, pase de una placa
a otra con las flechas y pulse Intro o Espacio. Studio dice qué placa eligió y la guarda en esta
computadora.

## Usted inicia cada operación física

Aprender nunca se conecta a una placa, carga un programa, ejecuta, detiene, fuerza un valor ni
graba firmware por sí mismo. Usted hace cada una de estas cosas con los controles habituales de
Studio. La comprobación en hardware solo lee una placa que usted conectó, en la que cargó el
programa y que puso en marcha; rechaza una placa que no está conectada o que no está en
ejecución, y se detiene cuando la placa se detiene.

## Cómo se comprueba una ejecución en la placa

La comprobación en hardware usa el escenario de referencia de la lección, el mismo archivo y el
mismo hash de contenido que la comprobación en simulación. Studio lee las entradas y salidas de
la lección en la placa a intervalos fijos, con la misma lectura que llena la tabla Watch, y las
registra como una traza. La lección declara dos tolerancias: `timeMs`, cuánto puede alejarse
una muestra, hacia uno u otro lado, del tiempo que nombra una aserción, y `analogPercent`, para
los valores analógicos.

En simulación, el escenario cambia las entradas en tiempos exactos. En una placa, usted las
cambia al pulsar botones, así que sus tiempos son humanos. Por eso la comprobación alinea el
escenario con lo que usted hizo:

1. Cada cambio de entrada del escenario, en orden de tiempo, se busca en la traza: es la primera
   muestra, posterior al cambio anterior, que tiene los valores que el cambio fija. Un cambio que
   usted nunca hizo deja sin hacer todos los cambios siguientes.
2. Un tiempo del escenario se traslada a la traza a través del cambio de entrada del que
   depende: el momento en que usted hizo ese cambio, más el tiempo que el escenario permite
   después de él.
3. Luego cada aserción se comprueba como en simulación, sobre los tiempos trasladados, con
   `timeMs` de margen: una ventana que debe contener una coincidencia crece `timeMs` en ambos
   extremos, y una ventana que debe cumplirse en todo momento se reduce `timeMs` en ambos
   extremos.
4. Una aserción que depende de un cambio de entrada que usted nunca hizo falla, sin nada
   observado.

Hoy los escenarios solo tienen condiciones de encendido y apagado, así que `analogPercent` todavía
no tiene nada que comparar.

Una comprobación fallida dice qué aserción falló, en qué tiempo de la traza registrada, los
valores esperados y observados, y qué muestra de la traza leyó.

## Una ejecución en la placa se identifica aparte

Una aprobación en la placa se muestra como **Aprobada en hardware**: en la franja Pista de
hardware, que enumera esas lecciones, y en la línea de progreso de la lección. No aprueba la
lección en el curso, que se califica en simulación, y una aprobación en simulación no es una
aprobación en hardware. Su progreso guarda la aprobación en hardware más reciente de cada lección
aparte de su calificación en simulación, y un archivo de progreso de una versión anterior se lee
y se convierte.

## Antes de cablear

- Los pines de entrada y salida trabajan solo con lógica de 3,3 V.
- Nunca conecte 5 V (incluidos los pines 5V, VBUS y VSYS), una batería de más de 3,3 V ni nada
  de la red eléctrica a un pin GPIO, ADC o 3V3.
- Alimente las piezas solo desde el pin 3V3 y una las masas.
- Mantenga cada salida por debajo de 10 mA: un LED con una resistencia de 330 Ω consume unos
  4 mA. En la Pico, mantenga el total por debajo de 50 mA.
- Cablee con el cable USB desconectado y revise dos veces antes de conectarlo.

## Lo que está probado y lo que todavía no está

- La comprobación está probada en el equipo de desarrollo con trazas sintéticas: trazas que las
  pruebas construyen para que se parezcan a lo que informa una placa. El registrador está probado
  con una sesión simulada. La elección de placa y las etiquetas están probadas en Studio en
  Linux.
- Esta evidencia no incluye ninguna traza de una placa real ni ninguna ejecución en una placa
  física. Las ejecuciones en las dos placas son evidencia de hardware en el lazo que todavía falta
  registrar.
- La tarjeta de cableado de cada lección y el botón que registra y comprueba una ejecución desde
  el panel de la lección todavía no están en Studio.
