---
title: 'La planta'
sidebar_label: 'La planta'
description: 'Qué es y qué no es la planta: un modelo de una máquina contra el que corre el programa, con un solo reloj compartido con el programa.'
tags: [plant, simulation]
---

# La planta

Una planta es un modelo de una máquina pequeña: cintas, cajas, sensores, pulsadores y pilotos. Su programa lee los sensores y los pulsadores como entradas y escribe las cintas y los pilotos como salidas. Una planta permite comprobar un programa antes de que exista la máquina.

## Qué es la planta

- **Un documento del área del editor.** El comando Planta lo abre junto al programa, de modo que usted ve ambos a la vez. La interfaz la llama "Planta".
- **Un modelo con una sola verdad.** El núcleo de la planta es un modelo sin interfaz. La ejecución en vivo, la ejecución calificada y las pruebas de escenario usan ese mismo núcleo y el mismo mapa de señales. Nada se califica a partir de píxeles.
- **Un modelo con reloj compartido.** La planta y el programa avanzan juntos. Consulte [El reloj de la planta](./clock.md).
- **Hecha de piezas.** Una escena lista piezas de un catálogo fijo. Consulte la [referencia de piezas](./parts.md), el [formato del archivo de escena](./scene-format.md) y las [escenas incluidas](./scenes.md).

## Qué no es la planta

- **La vista 3D es solo una vista.** Dibuja lo que calculó el núcleo de la planta. No decide nada, y una lección se puede completar y calificar sin ella.
- **No es un controlador.** La planta no tiene Ejecutar, Pausar, Paso ni Reiniciar propios. La barra de comandos es el único transporte y maneja la planta y el programa juntos.
- **No es evidencia de hardware.** La planta es un modelo. Un resultado en la planta no dice cómo se comporta una máquina, una placa o un enlace reales.

## La vista 3D y su cámara

La vista se abre con toda la escena en el panel, con cualquier tamaño de panel. Conserva la dirección de vista de la primera cámara de la escena, y elige el objetivo y la distancia según el tamaño de la escena y la forma del panel. Mientras usted no haya movido la cámara, cambiar el tamaño del panel vuelve a encuadrar la escena. Arrastrar, las flechas, más y menos, y W, A, S y D mueven la cámara por su cuenta, y desde entonces un cambio de tamaño la deja donde está. La lista **Cámara** elige otra cámara guardada, y esa conserva el encuadre que le dio su autor. **Encuadrar la escena** (también en la paleta de comandos, con ese nombre) vuelve a mostrar toda la escena desde la dirección en que usted mira. Solo mueve la cámara: no toca la planta ni el programa. Si no hay una vista 3D en pantalla, el comando no encuadra nada y explica el motivo en **Salida**.

## Qué dibuja la vista 3D

- **Estados, con una señal que no es el color.** Un sensor fotoeléctrico dibuja su haz: una línea fina y discontinua mientras no hay nada en él, una línea fina y continua con su lámpara de salida encendida mientras detecta. Una cinta en marcha muestra flechas que avanzan con la banda, y una cinta parada no muestra ninguna; con movimiento reducido las flechas quedan quietas. El cabezal de un pulsador presionado se hunde en su anillo.
- **Nombres.** Apunte a una pieza para ver su nombre y los nombres de sus señales, con un recuadro alrededor. Llevar el foco del teclado al control de una pieza bajo la vista (un pulsador, una lista de fallas) hace lo mismo.
- **Colores.** Un elemento que la lección llama rojo es rojo y uno que llama azul es azul, en los modos claro y oscuro. Un elemento sin color es de cartón. Una base y una tapa tienen colores propios, y cada pieza conserva su propio color. El alto contraste dibuja colores planos con contornos.
- **Calidad.** **Baja** dibuja colores lisos, sin texturas, sin luz de entorno y sin sombras, para mantener los cuadros por segundo en gráficos integrados. **Media** y **Alta** dibujan materiales con texturas (mapas de color base, normales, rugosidad y metalicidad), luz de un entorno que genera la aplicación, sombras suaves y una curva de tonos fílmica; Alta sube el detalle de sombras y texturas. Todas las texturas vienen dentro de la aplicación: no se descarga nada.

Por ahora la cinta, el sensor fotoeléctrico, el pulsador y el emisor se dibujan como modelos detallados: la banda de una cinta envuelve un tambor de acero en cada extremo, su bastidor y sus patas son perfiles de aluminio ranurados y cada pata se apoya en un nivelador, un sensor junto a una cinta va en un soporte atornillado al bastidor de la cinta, el pulsador es una caja de mando sobre un pedestal, y cuatro marcas de esquina muestran dónde el emisor hace aparecer los elementos. Las demás piezas conservan una sola caja o forma bajo la misma luz. En **Media** y **Alta** el piso es un piso satinado que termina en un horizonte.

## Qué está medido

La tasa de cuadros, la latencia del enlace y las placas compatibles son afirmaciones que necesitan evidencia registrada. Aún no se han medido en las máquinas de referencia, así que esta documentación no da ninguna cifra para ellas.

## Páginas de esta sección

- [El reloj de la planta](./clock.md): un solo reloj, y qué hace un punto de interrupción con la planta.
- [Formato del archivo de escena](./scene-format.md): los campos, los límites y `schemaVersion`.
- [Las escenas incluidas](./scenes.md): qué enseña cada escena y qué comprueba su escenario.
- [El editor de escenas](./scene-editor.md): construya o cambie una escena, enlace sus señales a su programa y guárdela.
- [Referencia de piezas de la planta](./parts.md): cada pieza, sus ajustes y sus señales.
- [Señales numéricas](./numeric-signals.md): cómo viaja un valor INT o REAL entre una pieza y el programa.
- [Manipuladores y agarre](./manipulators.md): los ejes, las reglas de agarre y el paletizador por capas.
- [Clasificar y desviar](./sorting.md): propiedades de la pieza, los sensores de clasificación, las piezas desviadoras y cómo califica un retirador.
- [Estaciones](./stations.md): el cajón, el elevador, el transelevador con su estante, el centro de mecanizado y las piezas de completado.
- [E/S de planta](./io-mode.md): alimentar una placa desde la planta, quién puede iniciarla y qué evidencia existe.
