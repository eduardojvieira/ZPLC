## Condiciones que deben darse juntas y condiciones que bastan por sí solas

Las máquinas están llenas de reglas como estas: "el soldador funciona solo si la llave está girada y la protección está cerrada", o "la luz del cruce se enciende si un peatón pulsó el botón norte o el botón sur". La primera regla necesita **ambas** condiciones. La segunda necesita **al menos una**. En lógica, la primera se llama **AND** y la segunda **OR**. En diagrama de escalera se dibujan solo con la posición de los contactos.

## Serie: AND

Los contactos colocados uno tras otro en la misma línea están **en serie**. La energía debe pasar por todos para llegar a la bobina, así que la bobina se enciende solo cuando **todos** los contactos conducen.

Una imagen útil es una hilera de llaves de paso de una manguera. El agua llega al final solo si todas las llaves están abiertas. Si cierra una, el flujo se detiene.

## Paralelo: OR

Cuando un peldaño se divide en dos caminos que vuelven a unirse antes de la bobina, los contactos de caminos distintos están **en paralelo**. A la energía le basta un camino para llegar a la bobina, así que la bobina se enciende cuando **cualquier** camino conduce.

Una imagen para este caso son dos puertas hacia la misma habitación. Se puede entrar por cualquiera, y basta con que una esté abierta.

Aquí están las dos ideas en un programa pequeño.

```ld-figure
src: reading/welder-and-crossing.ld.json
caption: El peldaño 1 es una serie (AND), el peldaño 2 es un paralelo (OR)
```

El peldaño 1 pone KeyTurned y GuardClosed en serie. El peldaño 2 pone NorthButton y SouthButton en dos caminos que se unen antes de la bobina WalkRequest.

```ld-try
src: reading/welder-and-crossing.ld.json
inputs:
  - { name: KeyTurned, kind: switch }
  - { name: GuardClosed, kind: switch }
  - { name: NorthButton, kind: push }
  - { name: SouthButton, kind: push }
outputs: [Welder, WalkRequest]
caption: Pruebe todas las combinaciones de los interruptores y de los dos botones
```

Pulse Ejecutar. Active solo KeyTurned: el soldador sigue apagado. Active también GuardClosed: se enciende. Luego pulse solo NorthButton, solo SouthButton y los dos: la solicitud de cruce está en ON cada vez que al menos un botón está pulsado.

## Tablas de verdad

Una **tabla de verdad** enumera todas las combinaciones de las entradas y el resultado de cada una. Con dos entradas hay cuatro combinaciones, porque cada entrada puede ser FALSE o TRUE. Esta es la tabla de AND, que es una serie.

| A     | B     | A AND B |
| :---- | :---- | :------ |
| FALSE | FALSE | FALSE   |
| FALSE | TRUE  | FALSE   |
| TRUE  | FALSE | FALSE   |
| TRUE  | TRUE  | TRUE    |

Y esta es la de OR, que es un paralelo.

| A     | B     | A OR B |
| :---- | :---- | :----- |
| FALSE | FALSE | FALSE  |
| FALSE | TRUE  | TRUE   |
| TRUE  | FALSE | TRUE   |
| TRUE  | TRUE  | TRUE   |

Observe el patrón. AND tiene un único TRUE, abajo: las dos entradas deben ser TRUE. OR tiene un único FALSE, arriba: las dos entradas deben ser FALSE. Una buena prueba de su programa es recorrer cada fila de su tabla de verdad, y esto es exactamente lo que hace el escenario de la práctica.

## Mezclar ambos

La serie y el paralelo se pueden combinar en el mismo peldaño. Entonces la energía debe pasar por una cadena de grupos, y cada grupo puede ofrecer varios caminos. Por ejemplo, "el motor funciona si la protección está cerrada y el botón manual o la señal automática están activos" pone GuardClosed en serie con un grupo de dos caminos en paralelo. Al leer un peldaño, léalo de izquierda a derecha y pregunte en cada punto: ¿la energía necesita este contacto, o basta con cualquiera de estos?

## Errores frecuentes

- Poner dos contactos en serie cuando quería decir "cualquiera de los dos". El resultado parece razonable en una prueba y falla en las demás, así que compruebe siempre todas las filas de la tabla.
- Dibujar los dos caminos pero no unirlos antes de la bobina. Un camino que no se une no es una rama paralela.
- Confundir el tipo de contacto. Un contacto normalmente cerrado en una serie deja pasar la energía cuando su variable es FALSE, así que lea el contacto y no solo el nombre.

> [!NOTE]
> Las palabras AND y OR vienen de la lógica, y las mismas ideas aparecen en todos los lenguajes de programación. Más adelante en este curso escribirá la misma lógica como texto, y los peldaños le resultarán familiares.

> [!WARNING]
> Una bocina o una lámpara que reacciona a condiciones ayuda a las personas a notar un problema, pero no es una función de seguridad. La protección contra el sobrecalentamiento o una puerta abierta debe estar incorporada en el propio hardware de la máquina, y nunca depende de este programa. ZPLC no hace ninguna afirmación de seguridad.

## Compruébelo usted

```quiz
question: Una bobina debe encenderse solo cuando una llave está girada y una protección está cerrada. ¿Cómo dibuja los dos contactos?
options:
  - { text: 'En serie, en la misma línea', correct: true, feedback: Correcto. La energía pasa solo si los dos contactos conducen, lo que es AND. }
  - { text: 'En paralelo, en dos caminos', feedback: En paralelo basta con cualquiera de los contactos, lo que es OR. }
  - { text: 'En dos peldaños distintos', feedback: Dos peldaños accionarían la bobina por separado, y eso no combina las condiciones. }
```

```quiz
question: Un paralelo de A y B acciona una bobina; A es FALSE y B es TRUE. ¿Qué hace la bobina?
options:
  - { text: 'Se enciende, porque un camino conduce', correct: true, feedback: Correcto. Para OR basta con que conduzca un camino. }
  - { text: 'Queda apagada, porque A es FALSE', feedback: Eso pasaría en una serie. En un paralelo, B solo ya da un camino a la energía hasta la bobina. }
```

## Qué hará en la práctica

En la práctica un programa tiene una lámpara de marcha que necesita dos condiciones juntas, ya dibujada, y un peldaño de bocina que lee solo la puerta. Agregará el segundo camino para la señal de sobrecalentamiento, de modo que cualquiera de las dos condiciones haga sonar la bocina. Luego pulsará Comprobar, y ZPLC ejecutará las combinaciones de la tabla de verdad, una en cada paso.
