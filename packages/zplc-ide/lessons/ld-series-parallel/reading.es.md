## Condiciones que deben darse juntas y condiciones que bastan por sí solas

Las máquinas están llenas de reglas como estas: "el soldador funciona solo si la llave está girada y la protección está cerrada", o "la luz del cruce se enciende si un peatón pulsó el pulsador norte o el pulsador sur". La primera regla necesita **ambas** condiciones. La segunda necesita **al menos una**. En lógica, la primera se llama **AND** y la segunda **OR**. En diagrama de escalera se dibujan solo con la posición de los contactos.

## Serie: AND

Los contactos colocados uno tras otro en la misma línea están **en serie**. La energía debe pasar por todos para llegar a la bobina, así que la bobina se enciende solo cuando **todos** los contactos conducen.

Una imagen útil es una hilera de llaves de paso de una manguera. El agua llega al final solo si todas las llaves están abiertas. Si cierra una, el flujo se detiene.

## Paralelo: OR

Cuando un peldaño se divide en dos caminos que vuelven a unirse antes de la bobina, los contactos de caminos distintos están **en paralelo**. A la energía le basta un camino para llegar a la bobina, así que la bobina se enciende cuando **cualquier** camino conduce.

Una imagen para este caso son dos puertas hacia la misma habitación. Se puede entrar por cualquiera, y basta con que una esté abierta.

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

La serie y el paralelo se pueden combinar en el mismo peldaño. Entonces la energía debe pasar por una cadena de grupos, y cada grupo puede ofrecer varios caminos. Por ejemplo, "el motor funciona si la protección está cerrada y el pulsador manual o la señal automática están activos" pone GuardClosed en serie con un grupo de dos caminos en paralelo. Al leer un peldaño, léalo de izquierda a derecha y pregunte en cada punto: ¿la energía necesita este contacto, o basta con cualquiera de estos?

## Ejemplo resuelto

Un compresor de aire llena un tanque. Funciona mientras su RunSwitch está activo y el presostato HighPressure no se disparó: las dos condiciones, así que los dos contactos van en serie, y HighPressure lleva un contacto normalmente cerrado porque el compresor debe funcionar mientras es FALSE. Una lámpara de alarma se enciende cuando la presión es demasiado alta o cuando el interruptor de nivel de aceite OilOK indica aceite bajo: basta con cualquiera, así que los dos contactos van en paralelo. OilOK es TRUE mientras hay aceite suficiente, así que el camino de la alarma hace la pregunta contraria con un contacto normalmente cerrado.

```ld-figure
src: reading/compressor.ld.json
caption: El peldaño 1 es una serie (AND), el peldaño 2 es un paralelo (OR), cada uno con un contacto normalmente cerrado
```

El peldaño 1 pone RunSwitch y HighPressure en serie antes de la bobina Compressor. El peldaño 2 pone HighPressure y OilOK en dos caminos que se unen antes de la bobina AlarmLamp. La misma variable, HighPressure, aparece en los dos peldaños con contactos opuestos.

```ld-try
src: reading/compressor.ld.json
inputs:
  - { name: RunSwitch, kind: switch }
  - { name: HighPressure, kind: switch }
  - { name: OilOK, kind: switch }
outputs: [Compressor, AlarmLamp]
caption: Pruebe todas las combinaciones de los tres interruptores
```

Pulse Ejecutar y recorra las tablas de verdad. Al principio OilOK es FALSE, así que la lámpara de alarma está encendida: active OilOK y se apaga. Active RunSwitch: el compresor funciona. Active HighPressure: el compresor se detiene y la lámpara de alarma se enciende. Luego desactive HighPressure y OilOK: el compresor vuelve a funcionar, y la lámpara se enciende por el aceite.

## Errores comunes

- Poner dos contactos en serie cuando quería decir "cualquiera de los dos". El resultado parece razonable en una prueba y falla en las demás, así que compruebe siempre todas las filas de la tabla.
- Dibujar los dos caminos pero no unirlos antes de la bobina. Un camino que no se une no es una rama paralela.
- Confundir el tipo de contacto. Un contacto normalmente cerrado en una serie deja pasar la energía cuando su variable es FALSE, así que lea el contacto y no solo el nombre.

> [!WARNING]
> Una bocina o una lámpara que reacciona a condiciones ayuda a las personas a notar un problema, pero no es una función de seguridad. La protección contra el sobrecalentamiento o una puerta abierta debe estar incorporada en el propio hardware de la máquina, y nunca depende de este programa.

## Compruébelo usted

```quiz
question: Una bobina debe encenderse solo cuando una llave está girada y una protección está cerrada. ¿Cómo dibuja los dos contactos?
options:
  - { text: 'En serie, en la misma línea', correct: true, feedback: 'Correcto. La energía pasa solo si los dos contactos conducen, lo que es AND.' }
  - { text: 'En paralelo, en dos caminos', feedback: 'En paralelo basta con cualquiera de los contactos, lo que es OR.' }
  - { text: 'En dos peldaños distintos', feedback: 'Dos peldaños accionarían la bobina por separado, y eso no combina las condiciones.' }
```

```quiz
question: Un paralelo de A y B acciona una bobina; A es FALSE y B es TRUE. ¿Qué hace la bobina?
options:
  - { text: 'Se enciende, porque un camino conduce', correct: true, feedback: 'Correcto. Para OR basta con que conduzca un camino.' }
  - { text: 'Queda apagada, porque A es FALSE', feedback: 'Eso pasaría en una serie. En un paralelo, B solo ya da un camino a la energía hasta la bobina.' }
  - { text: 'Se enciende solo cuando A también pasa a TRUE', feedback: 'Eso es AND. Un paralelo es OR: basta con un camino en TRUE.' }
```

## Qué hará en la práctica

El programa inicial tiene una lámpara de marcha que necesita dos condiciones juntas, ya dibujada, y un peldaño de bocina que lee solo la puerta, así que la bocina calla cuando la máquina se sobrecalienta. Usted hará que la bocina suene cuando la puerta está abierta, cuando la máquina se sobrecalienta o en los dos casos. Luego pulsará {{ui:learn.check}}, y ZPLC ejecutará las combinaciones de la tabla de verdad, una en cada paso.
