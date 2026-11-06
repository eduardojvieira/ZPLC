## Para qué sirve

Algunas acciones nunca deben ocurrir juntas, y otras nunca deben ocurrir a menos que se cumpla una condición. La puerta de un horno industrial debe estar cerrada antes de que se encienda el calefactor. Una cinta transportadora no debe arrancar con una guarda abierta. Un motor no debe girar hacia adelante y hacia atrás al mismo tiempo.

Una regla así, incorporada al programa para que una cosa bloquee a otra, se llama **enclavamiento**. Esta página explica los enclavamientos y los **permisivos** desde cero, con un motor con tapa, y luego los une con el motor reversible de la práctica.

## Dos clases de "ahora no"

Hay dos reglas comunes, y conviene darles nombre.

- Un **permisivo** es una condición que debe cumplirse para que algo esté permitido. "La tapa debe estar cerrada para que funcione el mezclador." Si falta el permisivo, la salida no puede estar en ON. Si desaparece mientras la salida está en ON, la salida pasa a OFF.
- Un **bloqueo mutuo** es una regla entre dos salidas: cuando una está en ON, la otra no está permitida. "El contactor de avance y el contactor de retroceso nunca están en ON a la vez."

Ambos se hacen en escalera con la misma herramienta: un contacto colocado **en serie** con la salida. Los contactos en serie funcionan como una cadena de puertas, y la energía pasa solo si todas están abiertas. Por eso cada condición adicional en serie es una cosa más que puede bloquear la salida.

## Por qué un motor reversible lo necesita

Un motor trifásico gira en sentido contrario cuando dos de sus tres cables intercambian lugar. Un **arrancador reversible** tiene dos **contactores**, que son relés grandes que conmutan la potencia del motor: el contactor de avance conecta los cables de una forma y el de retroceso los conecta de la otra.

Si ambos contactores se cierran a la vez, las dos conexiones intercambiadas se encuentran y producen un cortocircuito entre fases. El resultado puede ser un fusible quemado, un contactor dañado o algo peor. Por eso el programa debe hacer imposible que ambas salidas estén en ON, incluso si el operador pulsa los dos botones juntos. Eso es un bloqueo mutuo.

## Cómo se ve en escalera

Aquí hay un mezclador con tapa. El motor se mantiene en ON una vez arrancado. Necesita dos cosas en serie para funcionar: la tapa cerrada y el botón de paro sin pulsar.

```ld-figure
src: reading/mixer-lid.ld.json
caption: Un peldaño con autorretención y dos condiciones en serie. La tapa es un permisivo, y el botón de paro es un contacto normalmente cerrado en el peldaño.
```

Lea el peldaño de izquierda a derecha. La energía parte del riel izquierdo. Puede pasar por `StartButton`, o por el contacto del propio `Motor` en la rama inferior, que es la autorretención que mantiene el motor en ON. Después debe pasar por `LidClosed` y por el botón de paro antes de llegar a la bobina.

En este laboratorio, `StopButton` está en `TRUE` mientras el botón se pulsa, así que el peldaño usa un contacto **normalmente cerrado** (NC) sobre él. Ese contacto conduce mientras su bit está en OFF, es decir, mientras nadie pulsa el botón. Al pulsar el botón, el contacto se abre y corta la energía.

## Pruébelo

Cierre la tapa con su interruptor y luego pulse y suelte el botón de arranque. El motor sigue funcionando. Ahora abra la tapa. El motor se detiene y sigue detenido aunque vuelva a cerrar la tapa, hasta que pulse arranque otra vez.

```ld-try
src: reading/mixer-lid.ld.json
inputs:
  - { name: StartButton, kind: push }
  - { name: StopButton, kind: push }
  - { name: LidClosed, kind: switch }
outputs: [Motor]
timing: [StartButton, LidClosed, Motor]
caption: Pulse LidClosed para cerrar la tapa y luego pulse StartButton. Pulse LidClosed otra vez para abrirla.
```

Pruebe también a pulsar el botón de arranque con la tapa abierta. No pasa nada, porque falta el permisivo.

## Qué pasa con el tiempo

El diagrama siguiente muestra el motor manteniéndose en ON después de soltar el botón de arranque, y cayendo cuando se abre la tapa.

```timing
span: 6000
signals:
  - { name: LidClosed, edges: [200, 3000] }
  - { name: StartButton, edges: [500, 1000] }
  - { name: Motor, edges: [500, 3000] }
marks:
  - { from: 500, to: 3000, label: Motor }
caption: El motor arranca con StartButton, se mantiene en ON y cae cuando se abre la tapa.
```

## Por qué un botón de paro real se cablea normalmente cerrado

En un tablero real, el botón de paro es un interruptor cerrado en reposo. Su entrada del PLC lee `TRUE` mientras nadie lo pulsa, y un peldaño que se detiene con él usa un contacto normalmente abierto sobre esa entrada. La razón es lo que ocurre cuando se rompe un cable. Si se rompe un cable de un botón de paro normalmente abierto, el botón nunca puede leerse como pulsado, y nadie nota que el motor ya no se puede detener. Si se rompe un cable de un botón de paro normalmente cerrado, el programa lo lee como pulsado y el motor se detiene. La falla deja la máquina en estado seguro. Esto se llama cableado de **falla segura**.

## Errores frecuentes

> [!WARNING]
> Un enclavamiento en el programa no es un dispositivo de seguridad. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad. Un arrancador reversible real también tiene un bloqueo mecánico o eléctrico en los propios contactores.

- Poner el bloqueo solo en una de las dos salidas. Cada salida debe ver a la otra.
- Usar un contacto normalmente abierto donde hace falta uno normalmente cerrado, o al revés. Compruebe qué estado permite la salida.
- Olvidar que una autorretención mantiene una salida en ON. Un permisivo debe estar en serie con todo el peldaño, incluida la autorretención, o la salida seguirá en ON después de que desaparezca el permisivo.

## Compruebe lo aprendido

```quiz
question: Un contacto permisivo se coloca solo en la rama de autorretención, no en serie con todo el peldaño. El motor está funcionando y se pierde el permisivo. ¿Qué ocurre?
options:
  - { text: 'El motor sigue funcionando.', correct: true, feedback: Correcto. El resto del peldaño sigue conduciendo, así que el permisivo perdido no bloquea nada. }
  - { text: 'El motor se detiene de inmediato.', feedback: Solo si el permisivo está en serie con todo el camino hasta la bobina. }
```

```quiz
question: ¿Por qué el programa debe impedir que ambos contactores se cierren juntos?
options:
  - { text: 'Juntos pondrían en cortocircuito dos fases de la alimentación del motor.', correct: true, feedback: Correcto. Cada contactor conecta los cables en un orden distinto. }
  - { text: 'Juntos descargarían la batería del PLC.', feedback: Los contactores los manejan las salidas, no una batería. }
```

## Lo que hará en la práctica

En la práctica recibe un motor reversible con un peldaño de avance y uno de retroceso, cada uno con autorretención, botón de paro y un permisivo de lubricación. Las dos direcciones todavía no se conocen entre sí. Usted agregará el bloqueo mutuo a cada peldaño y comprobará que los dos contactores nunca están en ON a la vez, y que perder el permisivo de lubricación detiene cualquiera de las dos direcciones.
