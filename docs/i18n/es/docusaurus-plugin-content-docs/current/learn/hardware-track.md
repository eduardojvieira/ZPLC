---
slug: /learn/hardware-track
id: hardware-track
title: Ruta de hardware
sidebar_label: Ruta de hardware
description: 'La ruta de hardware de Aprender, para una Raspberry Pi Pico o una ESP32-S3-DevKitC-1 propia: cómo elegir la placa, qué muestra una lección para ella, quién inicia cada operación física y cómo se hace y se identifica una comprobación en la placa. Ninguna placa tiene todavía un registro de hardware.'
tags: [learn, lessons, hardware]
---

# Ruta de hardware

Todas las lecciones se pueden aprobar en simulación, sin hardware. La ruta de hardware lleva
las mismas lecciones a una placa sobre su mesa, una de las dos placas de aprendizaje:
una Raspberry Pi Pico (RP2040) o una ESP32-S3-DevKitC-1.
Todavía no se registró ninguna comprobación en ninguna de las dos placas: vea el final de esta página.

## Elija su placa

Al pie del inicio de Aprender, la franja **Ruta de hardware** tiene un grupo **Su placa** con
las dos placas, y cada lección de hardware repite ese grupo al principio de su sección **En su
placa**. Elija la que tiene. Con el teclado, llegue al grupo con Tab, pase de una placa a otra
con las flechas y pulse Intro o Espacio. ZPLC dice qué placa eligió y la guarda en esta
computadora.

## Qué muestra una lección para su placa

En el panel de la lección, **En su placa** muestra, para la placa que eligió:

- el cableado de la lección como diagrama, y el mismo cableado como lista numerada;
- el mapa de pines de la lección: cada pieza, su canal, el pin y dónde está el pin;
- el límite de tensión, al que lleva un botón encima del diagrama;
- la lista de materiales de todo el curso;
- la imagen de firmware de la placa con su SHA-256, y los pasos de grabación que usted sigue:
  ZPLC no graba una placa;
- **Comprobar en la placa**.

## Usted inicia cada operación física

Aprender nunca se conecta a una placa, carga un programa, ejecuta, detiene, fuerza un valor ni
graba firmware por sí mismo. Usted hace cada una de estas cosas con los controles habituales de
ZPLC. **Comprobar en la placa** permanece desactivado, y dice qué falta, hasta que:

1. usted eligió una placa;
2. ZPLC está conectado a ella;
3. el programa de la lección está compilado y cargado en la placa, y está detenido o en marcha;
4. la placa indica qué placa es, y es la placa que usted eligió. Una placa que indica otra placa,
   o ninguna, se nombra como el problema.

La comprobación solo lee la placa: se detiene cuando la placa se detiene y nunca la vuelve a
poner en marcha.

## Comprobar una ejecución en su placa

Pulse **Comprobar en la placa**. El panel enumera los pasos: cada cambio de entrada del escenario
de referencia de la lección, en la pieza y el canal que nombra el cableado, por ejemplo "mantenga
pulsado Pulsador de prueba (DI0) ahora". Muestra el paso en el que está, pasa al siguiente cuando
la placa muestra que usted lo hizo, sigue leyendo durante el resto del escenario y luego califica
la ejecución. **Cancelar la comprobación** la detiene, y no se registra nada.

### Preparar y luego pulsar Ejecutar

Si el programa está detenido cuando usted pulsa **Comprobar en la placa**, la comprobación queda
lista para registrar y le pide que pulse **Ejecutar** en la barra de herramientas. Usted pone en
marcha el programa; la comprobación nunca lo hace. El primer escaneo después de que usted pulsa
**Ejecutar** es el tiempo 0 del escenario, como en simulación, así que un parpadeo o un
temporizador que empieza con el programa queda alineado con el escenario. Las entradas que el
escenario fija en el tiempo 0 son las entradas de ese primer escaneo.

Si el programa ya está en marcha, la comprobación empieza a registrar de inmediato, y su tiempo 0
es la primera muestra que lee. Una lección que comprueba algo del programa antes de su primera
acción, fuera del tiempo 0, no se puede comprobar así: su resultado depende de cuándo arrancó el
programa. Para una lección así el panel le pide que primero detenga el programa y luego pulse
**Comprobar en la placa** y **Ejecutar**. blinky-ladder-timer-feedback y verify-my-board son
lecciones así.

La comprobación usa el escenario de referencia de la lección, el mismo archivo y el mismo hash de
contenido que la comprobación en simulación. Una comprobación fallida dice qué aserción falló, en
qué tiempo de la traza registrada, los valores esperados y observados, y qué muestra de la traza
leyó.

### Cómo se lee la placa, y la tolerancia de tiempo

Una placa grabada con el firmware de aprendizaje guarda una traza de sus propios escaneos
(`zplc dbg trace`, véanse los [comandos de la consola](../reference/shell-commands.md)): al final
de cada escaneo guarda el momento en que el escaneo leyó sus entradas, el número del escaneo desde
**Ejecutar** y los bytes de las imágenes de entradas y salidas que contienen las señales de la
lección, en un anillo de 2048 bytes. ZPLC lee el anillo cada 100 ms aproximadamente, no en cada
escaneo, y califica una muestra por escaneo. Guardar la traza nunca cambia el programa: no escribe memoria, no fuerza
un valor y no pone en marcha ni detiene nada.

Una lección declara `timeMs`, cuánto puede alejarse una muestra, hacia uno u otro lado, del tiempo
que nombra una aserción. Con la traza del dispositivo debe ser al menos un escaneo de la tarea más
lenta del proyecto inicial de la lección más un margen de fluctuación supuesto de 10 ms: una salida cambia
hasta un escaneo después de su entrada, y el margen cubre la resolución de 1 ms de las marcas de
tiempo de la traza, el tick del núcleo que libera un escaneo y el tiempo que tarda un escaneo
antes de escribir sus salidas. Todas las lecciones de hardware ejecutan una tarea de 10 ms, así
que cada una declara 20 ms, y ZPLC rechaza una lección que declare menos.

Una placa cuyo firmware no tiene traza del dispositivo se lee como antes: con la misma lectura que
llena la tabla Watch, cada 100 ms. Una lectura son a lo sumo dos comandos `zplc dbg peek` de unos
96 caracteres cada uno, 2 × 96 × 10 bits / 115200 bit/s, unos 17 ms, y la comprobación reserva
20 ms, así que una muestra sigue a la anterior en a lo sumo 120 ms. La comprobación amplía
entonces la tolerancia de la lección en ese periodo, menos el margen de fluctuación: 20 ms pasan a
ser 130 ms, no menos que un periodo de muestreo más un escaneo.

Estos números se derivan del firmware y de la configuración serie; no se midieron en una placa.
Todavía no existe un registro de fluctuación del escaneo del plan de hardware en el lazo
(HIL-010) que confirme o reemplace el margen de 10 ms. `analogPercent` es para los valores analógicos; hoy
los escenarios solo tienen condiciones de encendido y apagado, así que todavía no tiene nada que
comparar.

### Cómo se alinea el escenario con lo que usted hizo

En simulación, el escenario cambia las entradas en tiempos exactos. En una placa, usted las
cambia al pulsar botones, así que sus tiempos son humanos. Por eso la comprobación alinea el
escenario con lo que usted hizo:

1. Cada cambio de entrada del escenario, en orden de tiempo, se busca en la traza: es la primera
   muestra, posterior al cambio anterior, que tiene los valores que el cambio fija. Un cambio que
   usted nunca hizo deja sin hacer todos los cambios siguientes.
2. Un tiempo del escenario se traslada a la traza a través del cambio de entrada del que
   depende: el momento en que usted hizo ese cambio, más el tiempo que el escenario permite
   después de él. Antes de su primer cambio, un tiempo del escenario se lee donde el escenario lo
   pone, desde el tiempo 0.
3. Luego cada aserción se comprueba como en simulación, sobre los tiempos trasladados, con
   `timeMs` de margen: una ventana que debe contener una coincidencia crece `timeMs` en ambos
   extremos, y una ventana que debe cumplirse en todo momento se reduce `timeMs` en ambos
   extremos.
4. Una aserción que depende de un cambio de entrada que usted nunca hizo falla, sin nada
   observado.
5. Cuando la traza empieza en **Ejecutar**, los cambios de entrada del tiempo 0 se toman en el
   tiempo 0 y no se buscan: un botón que usted mantiene pulsado al pulsar **Ejecutar** no traslada
   el resto del escenario.

### Lo que una comprobación en la placa no puede distinguir

- Una comprobación registrada por sondeo tiene 130 ms de margen hacia cada lado, y todas las
  lecciones de hardware comprueban sus salidas en tiempos separados por uno o dos escaneos, 10 o
  20 ms. Esa comprobación no puede distinguir esas aserciones, así que es más débil que la
  comprobación en simulación. Con la traza del dispositivo el margen es de 20 ms, y la
  comprobación ve cada escaneo.
- Después de que usted pulsa o suelta un botón, el escenario traslada sus tiempos a su acción.
  Una aserción posterior que depende del propio temporizador del programa, y no de su acción, se
  cumple entonces solo si usted actuó cerca del tiempo que nombra el escenario. verify-my-board
  comprueba el parpadeo 100 ms y 230 ms después de que usted suelta su botón, así que su
  comprobación solo aprueba cuando usted suelta el botón unos 1,35 s después de **Ejecutar**, con la
  tolerancia hacia uno u otro lado.
- Las aserciones no se aflojan para la placa, y la comprobación en simulación sigue siendo la
  aprobación del curso.

## Una ejecución en la placa se identifica aparte

Una aprobación en la placa se muestra como **Aprobada en hardware**: en la franja Ruta de
hardware, que enumera esas lecciones, y en la línea de progreso de la lección. No aprueba una
lección que se puede calificar en simulación, y una aprobación en simulación no es una aprobación
en hardware. La única excepción es verify-my-board, que solo tiene la ruta de hardware: su
comprobación en la placa es su aprobación. Su progreso guarda la aprobación en hardware más
reciente de cada lección aparte de su calificación en simulación, con el hash del programa (el
SHA-256 del artefacto que ZPLC cargó en la placa en esta sesión, o el de su mapa de depuración
cuando ZPLC no lo cargó) y la versión de ZPLC que informó la placa. Un archivo de progreso de
una versión anterior se lee y se convierte.

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
  pruebas construyen para que se parezcan a lo que informa una placa. El registrador y los pasos
  de la comprobación están probados con sesiones simuladas. La elección de placa, el cableado de
  cada placa, las etiquetas y la comprobación desactivada con su motivo están probados en ZPLC
  en Linux.
- Esta evidencia no incluye ninguna traza de una placa real ni ninguna ejecución en una placa
  física. Las ejecuciones en las dos placas son evidencia de hardware en el lazo que todavía falta
  registrar.
