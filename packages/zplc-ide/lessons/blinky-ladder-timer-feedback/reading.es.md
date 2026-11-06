## Un parpadeo necesita tiempo

Una lámpara que parpadea está encendida un rato, apagada un rato y otra vez encendida. Hasta ahora sus programas han reaccionado a botones, y un botón se puede pulsar en cualquier momento. Un parpadeo debe decidir por sí solo, a partir del tiempo. Para eso el PLC necesita dos herramientas nuevas: un **temporizador**, que mide el tiempo, y una manera de **recordar** un estado entre ciclos, que construirá con bobinas **SET** y **RESET**.

Parpadear no es solo decoración. Una baliza de advertencia en una grúa, una bomba que dosifica un químico con pulsos y una lámpara de latido que muestra que el controlador está vivo usan la misma idea.

## El temporizador con retardo a la conexión: TON

Un **TON** (temporizador con retardo a la conexión) es un bloque con tres conexiones principales.

- **IN** es la entrada. Mientras IN es TRUE, el temporizador cuenta el tiempo. Cuando IN pasa a FALSE, el temporizador vuelve a cero.
- **PT** es el **valor preestablecido**, cuánto hay que esperar. Se escribe como una duración, como `T#2s` (dos segundos) o `T#500ms` (medio segundo).
- **Q** es la salida. Permanece en FALSE hasta que IN ha sido TRUE durante todo el valor preestablecido, y entonces pasa a TRUE. Permanece en TRUE mientras IN siga en TRUE.

Piense en un teléfono que se apaga solo si usted mantiene pulsado el botón de encendido durante dos segundos. Si suelta antes, la cuenta empieza de nuevo. Solo una pulsación completa e ininterrumpida da la respuesta.

Este es un programa pequeño que hace exactamente eso: una lámpara que se enciende solo después de mantener el botón pulsado durante el valor preestablecido.

```ld-figure
src: reading/hold-to-confirm.ld.json
caption: El peldaño 1 alimenta el temporizador, el peldaño 2 enciende la lámpara con su salida Q
```

En el diagrama de escalera, el temporizador es una caja a la derecha de su peldaño, donde iría una bobina. Su IN recibe la energía que llega al peldaño. El nombre `HoldTimer` es la **instancia**: su programa guarda una memoria para cada temporizador, y `HoldTimer.Q` lee la salida de ese temporizador en otro peldaño.

```ld-try
src: reading/hold-to-confirm.ld.json
inputs:
  - { name: HoldButton, kind: push }
outputs: [ConfirmLamp]
timing: [HoldButton, ConfirmLamp]
caption: Mantenga el botón hasta que la lámpara se encienda y luego pruebe a soltarlo demasiado pronto
```

Pulse Ejecutar y mantenga el botón. No pasa nada durante el valor preestablecido, y luego la lámpara se enciende. Suelte el botón: la lámpara se apaga de inmediato y el temporizador queda listo para empezar de nuevo. Si lo suelta antes de que se cumpla el tiempo, la lámpara nunca se enciende.

```timing
span: 6000
signals:
  - { name: HoldButton, edges: [500, 3500] }
  - { name: ConfirmLamp, edges: [2500, 3500] }
marks:
  - { from: 500, to: 2500, label: PT }
caption: La lámpara se enciende cuando el botón lleva pulsado PT, y se apaga cuando se suelta el botón
```

## Recordar un estado: SET y RESET

Una bobina normal sigue a su peldaño: con energía, la salida está en ON; sin energía, en OFF. Una bobina **SET** funciona distinto. Cuando la energía la alcanza, pone la salida en ON, y la salida **queda encendida** aunque la energía desaparezca. Una bobina **RESET** pone la misma salida en OFF, y también queda así. Se comportan como los dos botones de una válvula: uno la abre, otro la cierra, y ella recuerda.

```ld-figure
src: reading/set-reset-valve.ld.json
caption: Una pulsación de OpenButton activa la válvula, una pulsación de CloseButton la desactiva
```

Las dos bobinas se usan sobre la misma variable. El programa se resuelve de arriba hacia abajo, así que cuando se pulsan los dos botones en el mismo ciclo, el peldaño RESET es el último y gana.

## Cómo funciona el parpadeador

El ejercicio combina las dos ideas. Una lámpara que está en OFF inicia un temporizador; cuando ese temporizador termina, una bobina SET pone la lámpara en ON. Una lámpara que está en ON inicia un segundo temporizador; cuando termina, una bobina RESET la pone en OFF. La propia lámpara es la memoria que decide qué temporizador corre. Esta idea se llama **realimentación**: la salida vuelve como entrada del mismo programa.

¿Por qué dos temporizadores y no uno? Con un solo temporizador alimentado por la lámpara, al encenderse la lámpara el temporizador se pondría a cero de inmediato y la lámpara destellaría durante un solo ciclo, no parpadearía. Dos temporizadores dan a cada mitad del parpadeo su propia cuenta.

## Errores frecuentes

- Olvidar que el temporizador necesita energía en IN todo el tiempo. Si la energía en IN parpadea, el temporizador reinicia desde cero.
- Usar una bobina SET sin una bobina RESET. La salida se enciende y nada puede apagarla.
- Confundir PT con la duración real. Agregue un pequeño margen por el ciclo: el tiempo real es el valor preestablecido más hasta un ciclo.
- Escribir los tiempos en la unidad equivocada. `T#500ms` es medio segundo y `T#5s` son cinco segundos.

> [!NOTE]
> Un TON es un bloque, no una bobina. En ZPLC aparece como una caja en el peldaño, con el nombre de su instancia encima.

> [!WARNING]
> Una lámpara que parpadea para señalar un peligro debe provenir de un diseño de hardware que muestre el peligro aunque el PLC se detenga. Un temporizador en un programa no es una función de seguridad. ZPLC no hace ninguna afirmación de seguridad, y una parada de emergencia se cablea en hardware.

## Compruébelo usted

```quiz
question: Un TON tiene el valor preestablecido `T#2s`. IN es TRUE durante un segundo y luego FALSE. ¿Cuánto vale Q al final?
options:
  - { text: 'FALSE, porque IN no fue TRUE durante todo el valor preestablecido', correct: true, feedback: Correcto. Cuando IN cae, el temporizador vuelve a cero y Q nunca llegó a ser TRUE. }
  - { text: 'TRUE, porque IN fue TRUE una vez', feedback: Q pasa a TRUE solo después de que IN permanece en TRUE durante todo el valor preestablecido. }
  - { text: 'TRUE durante un segundo', feedback: Un TON no copia IN. Primero espera el valor preestablecido. }
```

```quiz
question: Una bobina SET pone una salida en ON. Después la energía de la bobina desaparece. ¿Qué hace la salida?
options:
  - { text: 'Permanece encendida hasta que una bobina RESET la apaga', correct: true, feedback: Correcto. Una bobina SET recuerda su estado. }
  - { text: 'Se apaga de inmediato', feedback: Así se comporta una bobina normal. Una bobina SET conserva su valor. }
```

## Qué hará en la práctica

En la práctica recibirá un parpadeador cuyos dos temporizadores ya están dibujados. Cada uno corre mientras la lámpara está en un estado, y mide la mitad del parpadeo. Agregará las dos bobinas que cierran el lazo: una que activa (SET) la lámpara cuando termina el primer temporizador, y otra que la desactiva (RESET) cuando termina el segundo. Luego pulsará Comprobar y comparará los tiempos de encendido y apagado con el plan de la lección.
