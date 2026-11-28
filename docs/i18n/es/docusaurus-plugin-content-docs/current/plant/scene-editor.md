---
title: 'El editor de escenas'
sidebar_label: 'El editor de escenas'
description: 'Construya o cambie una escena de la planta en ZPLC: añada piezas, colóquelas, lea las señales, enlácelas a su programa, deshaga, guarde y ejecute.'
tags: [plant, scenes, editor]
---

# El editor de escenas

El editor de escenas sirve para construir una escena propia, o cambiar una de las que incluye ZPLC, sin escribir el archivo de escena a mano. Esta página sigue el editor tal como está hoy en ZPLC. Todo lo que se puede hacer con el puntero se puede hacer también con el teclado.

## Abrir el editor

1. Abra la planta con **Mostrar la planta** en la paleta de comandos.
2. En **Escena**, elija **Suelo vacío** para empezar de cero, una escena incluida o una escena guardada en su proyecto.
3. Pulse **Editar escena** en la barra **Herramientas de la planta**.

El editor necesita que la planta esté detenida. Mientras la planta corre, **Editar escena** está desactivado y el editor lo dice. Mientras edita, **Terminar de editar** cierra la edición. **Editar la planta** y **Terminar de editar la planta** del menú Editar y de la paleta de comandos hacen lo mismo que **Editar escena** y **Terminar de editar**.

## Añadir una pieza

1. Escriba en **Filtrar piezas** para dejar solo las piezas cuyo nombre contiene el texto.
2. Elija la pieza en **Pieza que añadir**. La lista está agrupada por familia: elementos, fuentes, transportadores, flujo, sensores, panel, proceso, manipuladores y estaciones. Bajo la lista se lee una descripción de una línea de la pieza elegida.
3. Pulse **Añadir pieza**. La pieza aparece en el origen del suelo, sobre la cuadrícula o unida a un punto de enganche cercano, y queda seleccionada.

Cada pieza tiene un nombre por defecto, como `Belt1`. El nombre es la primera mitad de sus señales, así que `Belt1` da `Belt1.run`. En la lista de piezas, cada fila tiene un botón para seleccionar la pieza, **Duplicar** y **Eliminar**. Un duplicado queda a 0.25 m del original.

## Colocar y configurar una pieza

Con una pieza seleccionada, **Ajustes de la pieza** muestra sus campos:

- **Nombre**, **Posición X (m)**, **Posición Z (m)** y **Rotación (grados)**.
- Un campo por cada ajuste de la pieza, con su unidad, como el largo o la velocidad de una cinta. Un número debe quedar en el rango que da la [referencia de piezas](./parts.md) para ese ajuste.

Un campo se aplica al pulsar Enter o al salir del campo, así que escribir nunca aplica medio número. Un valor fuera de rango se rechaza y el mensaje aparece en el campo.

Las posiciones siguen una cuadrícula de 0.25 m, y una pieza que se suelta a menos de 0.15 m de un punto de enganche de otra pieza se une a él. Las rotaciones van en pasos de 15 grados. Las mismas reglas valen si escribe la posición o arrastra la pieza.

Para arrastrar, pulse con el puntero en el suelo cerca de una pieza, muévala y suelte; Escape cancela el arrastre. Un arrastre es un solo paso para deshacer.

## Leer las señales y los problemas

La tabla **Señales** lista cada señal que ofrecen las piezas de la escena, con su tipo, su dirección (Sensor: de la planta al programa; Orden: del programa a la planta) y el punto del programa al que está enlazada. Consulte [señales numéricas](./numeric-signals.md) para `INT` y `REAL`.

Un problema se muestra en la pieza que lo causa, en la lista de piezas o en el campo: un nombre repetido o un ajuste fuera de rango. Un valor rechazado no se aplica, así que la escena conserva su último valor correcto.

## Enlazar las señales a su programa

Una señal se enlaza a una variable de su programa solo cuando usted lo indica. ZPLC nunca adivina una variable por su nombre.

1. En la fila de la señal, escriba el punto del programa en **Punto del programa para** la señal, con la forma `Programa.Variable`, como `BeltToSensor.Run`.
2. Pulse **Enlazar** (o Enter). **Desenlazar** quita el enlace.
3. Para una señal `INT` o `REAL`, indique el rango bruto de la variable del programa y el rango escalado del valor de la planta. Cuando la pieza declara su propio rango escalado, se muestra y no se escribe.

Los enlaces son el mapa de la planta de la escena. Consulte el [formato del archivo de escena](./scene-format.md) para el archivo.

El editor tiene un módulo que escribe las declaraciones de variables de una escena en ST, IL, LD, FBD o SFC, y el control **Crear declaraciones** que lo llama. Ese control aún no está montado en el editor: mientras tanto, copie los nombres y los tipos de la tabla **Señales** a la tabla de variables de su programa.

## Deshacer, rehacer, guardar y ejecutar

- **Deshacer** y **Rehacer** del menú **Editar** recorren sus ediciones, un paso por cada edición o arrastre, y todas las vistas de la escena (la lista de piezas, el formulario de la pieza, las señales) muestran el resultado. Actúan sobre la escena mientras el documento de la planta es el documento activo y se edita una escena; en un editor de código son los del propio editor. Mientras la planta corre no cambian nada y lo dicen.
- Los problemas de la escena están en la pestaña **Problemas** bajo **Planta**, cada uno en su pieza: al activar uno se selecciona la pieza en la actividad Planta y en el Inspector. Las señales sin enlazar o con tipo distinto del mapa de la planta también se listan ahí y abren su fila.
- **Terminar de editar** cierra el editor y reconstruye la planta con la escena editada.
- **Guardar en el proyecto** (en la barra, después de **Terminar de editar**, cuando hay una carpeta de proyecto abierta y la escena no es ya una escena guardada) pide un nombre y guarda la escena y su mapa de la planta como `scenes/<nombre>.scene.json` en su proyecto, donde aparece en **Escena**. La escena propia del proyecto (el `scene.json` de la raíz del proyecto, como lo trae una lección de escena) se guarda en su lugar: **Guardar en el proyecto** no pide nombre y escribe `scene.json` y `plant-map.json` en la raíz, los archivos que califica el Check de una lección, sin crear la carpeta `scenes/`. Una escena editada, con su mapa de la planta, participa en **Guardar todo**, también cuando el editor no está a la vista.
- Para ejecutar, use **Ejecutar** en la barra de comandos. Inicia el programa y la planta juntos. Si las señales no están enlazadas, la planta se muestra pero ningún programa la maneja.

## Usar el teclado

Cada control del editor es un campo con etiqueta o un botón al que se llega con Tab. Puede construir una escena completa sin la vista 3D:

1. Con Tab vaya a **Filtrar piezas**, luego a **Pieza que añadir**, y pulse **Añadir pieza**.
2. En **Ajustes de la pieza**, escriba la posición, la rotación y los ajustes.
3. En **Señales**, escriba los puntos del programa y enlácelos.

La vista 3D también acepta el teclado: con la vista enfocada, las flechas orbitan, más y menos acercan y alejan, y W, A, S y D desplazan. **Encuadrar la escena** vuelve a mostrar toda la escena desde donde usted mira.

## Lo que no se afirma

El editor cambia el archivo de escena; no comprueba que su programa sea correcto, y una escena que pasa sus comprobaciones no es evidencia sobre una máquina real. Esta página no da tasa de cuadros ni latencia: aún no se han medido en las máquinas de referencia.

## Consulte también

- [Las escenas incluidas](./scenes.md)
- [Referencia de piezas de la planta](./parts.md)
- [Formato del archivo de escena](./scene-format.md)
- [E/S de planta](./io-mode.md)
