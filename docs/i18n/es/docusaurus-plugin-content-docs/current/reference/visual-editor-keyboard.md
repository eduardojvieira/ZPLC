---
title: "Referencia de teclado de los editores visuales"
sidebar_label: "Teclas de los editores visuales"
description: "Todas las teclas de los editores de Escalera, Bloques de Función y Diagrama Funcional Secuencial, generadas de la tabla que leen los editores."
tags: [reference, generated]
---

# Referencia de teclado de los editores visuales

{/* >>> GENERATED (tools/docs/generate_keyboard_reference.ts): reference/visual-editor-keyboard. Do not edit. >>> */}

Todas las acciones de edición de los tres editores gráficos se pueden hacer con el teclado: mover un cursor, insertar un elemento, enlazar una variable entre los símbolos declarados, conectar y borrar. Las paletas se alcanzan con Tab y admiten búsqueda, y cada editor lista sus propios comandos con F1.

`Ctrl` es `Cmd` en macOS. Una pregunta que hace una tecla (el elemento que se inserta, la variable que se enlaza, el cable que se dibuja) es una lista con búsqueda: se escribe para buscar, Arriba y Abajo eligen, Enter toma la elección y Escape sale. Donde la lista lo permite, escribir un nombre que no está en la lista lo ofrece tal como se escribió. Un comando que cambia el documento es un paso del historial de deshacer, y la selección vuelve con deshacer y rehacer.

## Editor de Diagrama de Escalera

El cursor es una celda de un peldaño, dibujada como un marco azul. Hacer clic en una celda lo pone allí. Insertar, enlazar y borrar actúan sobre la celda que tiene debajo.

### Mover el cursor

| Teclas | Qué hace |
| --- | --- |
| `ArrowLeft` | Mueve el cursor una celda a la izquierda |
| `ArrowRight` | Mueve el cursor una celda a la derecha |
| `ArrowUp` | Mueve el cursor una fila arriba, al peldaño anterior si está en la primera fila |
| `ArrowDown` | Mueve el cursor una fila abajo, al peldaño siguiente si está en la última fila |
| `Home` | Mueve el cursor a la primera celda de la fila |
| `End` | Mueve el cursor a la última celda de la fila |
| `PageUp` | Mueve el cursor al peldaño anterior |
| `PageDown` | Mueve el cursor al peldaño siguiente |
| `Ctrl+Home` | Mueve el cursor a la primera celda del primer peldaño |
| `Ctrl+End` | Mueve el cursor a la última celda del último peldaño |

### Insertar elementos

| Teclas | Qué hace |
| --- | --- |
| `C` | Inserta un contacto normalmente abierto en el cursor y pregunta qué variable lee |
| `N` | Inserta un contacto normalmente cerrado en el cursor |
| `P` | Inserta un contacto de flanco positivo en el cursor |
| `O` | Inserta una bobina en el cursor y pregunta qué variable escribe |
| `S` | Inserta una bobina de activación (set) en el cursor |
| `R` | Inserta una bobina de desactivación (reset) en el cursor |
| `B` | Inicia una rama paralela en el cursor |
| `Insert` o `I` | Abre la paleta de elementos: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar |
| `Enter` | En una celda vacía abre la paleta de elementos; en un elemento lo selecciona y muestra sus propiedades |

### Enlazar variables

| Teclas | Qué hace |
| --- | --- |
| `F2` | Enlaza el elemento bajo el cursor a una variable elegida entre los símbolos declarados |

### Editar

| Teclas | Qué hace |
| --- | --- |
| `Shift+F2` | Edita el comentario del peldaño del cursor |

### Estructura

| Teclas | Qué hace |
| --- | --- |
| `Ctrl+ArrowLeft` | Mueve el elemento bajo el cursor una celda a la izquierda |
| `Ctrl+ArrowRight` | Mueve el elemento bajo el cursor una celda a la derecha |
| `Ctrl+ArrowUp` | Mueve el elemento bajo el cursor una fila arriba |
| `Ctrl+ArrowDown` | Mueve el elemento bajo el cursor una fila abajo |
| `Ctrl+Enter` | Agrega un peldaño después del peldaño del cursor |
| `Ctrl+Shift+Enter` | Agrega una fila vacía al peldaño del cursor |
| `Alt+ArrowUp` | Mueve el peldaño del cursor hacia arriba |
| `Alt+ArrowDown` | Mueve el peldaño del cursor hacia abajo |
| `Alt+ArrowRight` | Ensancha la rama más interna en el cursor una columna |
| `Alt+ArrowLeft` | Estrecha la rama más interna en el cursor una columna |
| `Shift+B` | Quita la rama más interna en el cursor |

### Borrar

| Teclas | Qué hace |
| --- | --- |
| `Delete` o `Backspace` | Borra el elemento bajo el cursor |
| `Shift+Delete` | Borra el peldaño del cursor |

### Portapapeles, puntos de parada y ayuda

| Teclas | Qué hace |
| --- | --- |
| `Ctrl+C` | Copia el peldaño seleccionado |
| `Ctrl+V` | Pega el peldaño copiado después del peldaño seleccionado |
| `F9` | Pone o quita el punto de parada del peldaño seleccionado |
| `Ctrl+Alt+0` | Muestra cada peldaño desde su borde izquierdo |
| `F1` | Lista todos los comandos del editor con sus teclas, con búsqueda |
| `Escape` | Quita la selección y cierra las propiedades |

## Editor de Diagrama de Bloques de Función

El cursor es el bloque seleccionado. Las flechas sin modificador desplazan el bloque seleccionado en el lienzo, como hace el lienzo; Tab pasa de un bloque a otro en el orden del archivo.

### Mover el cursor

| Teclas | Qué hace |
| --- | --- |
| `Alt+ArrowLeft` | Selecciona el bloque más cercano a la izquierda del bloque seleccionado |
| `Alt+ArrowRight` | Selecciona el bloque más cercano a la derecha |
| `Alt+ArrowUp` | Selecciona el bloque más cercano por encima |
| `Alt+ArrowDown` | Selecciona el bloque más cercano por debajo |
| `Home` | Selecciona el primer bloque, el de arriba a la izquierda |

### Insertar elementos

| Teclas | Qué hace |
| --- | --- |
| `V` | Inserta un bloque de variable junto al bloque seleccionado y pregunta qué variable representa |
| `K` | Inserta un bloque de constante junto al bloque seleccionado y pregunta su valor |
| `Insert` o `I` | Abre la paleta de bloques: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar junto al bloque seleccionado |

### Enlazar variables

| Teclas | Qué hace |
| --- | --- |
| `F2` o `Enter` | Enlaza el bloque de variable seleccionado, o nombra la instancia del bloque de función seleccionado, entre los símbolos declarados; fija el valor de una constante |

### Conectar

| Teclas | Qué hace |
| --- | --- |
| `C` | Lista los cables que el bloque seleccionado puede tener y dibuja el elegido |
| `Shift+C` | Lista los cables del bloque seleccionado y quita el elegido |

### Editar

| Teclas | Qué hace |
| --- | --- |
| `Shift+F2` | Edita el comentario del bloque seleccionado |

### Estructura

| Teclas | Qué hace |
| --- | --- |
| `Alt+Shift+ArrowLeft` | Alinea los elementos seleccionados con el más a la izquierda |
| `Alt+Shift+ArrowRight` | Alinea los elementos seleccionados con el más a la derecha |
| `Alt+Shift+ArrowUp` | Alinea los elementos seleccionados con el más alto |
| `Alt+Shift+ArrowDown` | Alinea los elementos seleccionados con el más bajo |
| `Alt+Shift+H` | Centra los elementos seleccionados sobre una misma línea vertical |
| `Alt+Shift+V` | Centra los elementos seleccionados sobre una misma línea horizontal |
| `Ctrl+Alt+Shift+H` | Reparte tres o más elementos seleccionados con el mismo espacio de izquierda a derecha |
| `Ctrl+Alt+Shift+V` | Reparte tres o más elementos seleccionados con el mismo espacio de arriba abajo |

### Borrar

| Teclas | Qué hace |
| --- | --- |
| `Delete` o `Backspace` | Borra los bloques y cables seleccionados |

### Portapapeles, puntos de parada y ayuda

| Teclas | Qué hace |
| --- | --- |
| `Ctrl+C` | Copia los bloques seleccionados y los cables entre ellos |
| `Ctrl+V` | Pega los bloques copiados |
| `F9` | Pone o quita el punto de parada de los bloques seleccionados |
| `Ctrl+Alt+0` | Ajusta todo el diagrama a la vista |
| `F1` | Lista todos los comandos del editor con sus teclas, con búsqueda |

## Editor de Diagrama Funcional Secuencial

El cursor es el paso o la transición seleccionados. Las flechas sin modificador desplazan el elemento seleccionado en el lienzo, como hace el lienzo; Tab pasa de un elemento a otro en el orden del archivo.

### Mover el cursor

| Teclas | Qué hace |
| --- | --- |
| `Alt+ArrowLeft` | Selecciona el paso o la transición más cercano a la izquierda del seleccionado |
| `Alt+ArrowRight` | Selecciona el paso o la transición más cercano a la derecha |
| `Alt+ArrowUp` | Selecciona el paso o la transición más cercano por encima |
| `Alt+ArrowDown` | Selecciona el paso o la transición más cercano por debajo |
| `Home` | Selecciona el primer elemento, el de arriba a la izquierda |

### Insertar elementos

| Teclas | Qué hace |
| --- | --- |
| `S` | Inserta un paso debajo del elemento seleccionado, conectado a él si es una transición |
| `Shift+S` | Inserta el paso inicial |
| `T` | Inserta una transición debajo del elemento seleccionado, conectada a él si es un paso |
| `Insert` o `I` | Abre la paleta de elementos: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar |

### Enlazar variables

| Teclas | Qué hace |
| --- | --- |
| `F2` o `Enter` | Nombra el paso seleccionado, o fija la condición de la transición seleccionada entre los símbolos declarados o escribiendo una expresión |

### Conectar

| Teclas | Qué hace |
| --- | --- |
| `C` | Lista los cables que el elemento seleccionado puede tener y dibuja el elegido |
| `Shift+C` | Lista los cables del elemento seleccionado y quita el elegido |

### Editar

| Teclas | Qué hace |
| --- | --- |
| `Shift+F2` | Edita el comentario del elemento seleccionado |

### Estructura

| Teclas | Qué hace |
| --- | --- |
| `Alt+Shift+ArrowLeft` | Alinea los elementos seleccionados con el más a la izquierda |
| `Alt+Shift+ArrowRight` | Alinea los elementos seleccionados con el más a la derecha |
| `Alt+Shift+ArrowUp` | Alinea los elementos seleccionados con el más alto |
| `Alt+Shift+ArrowDown` | Alinea los elementos seleccionados con el más bajo |
| `Alt+Shift+H` | Centra los elementos seleccionados sobre una misma línea vertical |
| `Alt+Shift+V` | Centra los elementos seleccionados sobre una misma línea horizontal |
| `Ctrl+Alt+Shift+H` | Reparte tres o más elementos seleccionados con el mismo espacio de izquierda a derecha |
| `Ctrl+Alt+Shift+V` | Reparte tres o más elementos seleccionados con el mismo espacio de arriba abajo |

### Borrar

| Teclas | Qué hace |
| --- | --- |
| `Delete` o `Backspace` | Borra los elementos y cables seleccionados |

### Portapapeles, puntos de parada y ayuda

| Teclas | Qué hace |
| --- | --- |
| `Ctrl+C` | Copia los pasos y transiciones seleccionados |
| `Ctrl+V` | Pega los pasos y transiciones copiados |
| `F9` | Pone o quita el punto de parada de los elementos seleccionados |
| `Ctrl+Alt+0` | Ajusta todo el diagrama a la vista |
| `F1` | Lista todos los comandos del editor con sus teclas, con búsqueda |

{/* <<< END GENERATED: reference/visual-editor-keyboard <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
