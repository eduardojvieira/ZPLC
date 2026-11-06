## Para qué sirve

Una máquina que tiene una falla no debería olvidarla. Piense en un horno que se sobrecalienta y apaga su calefactor. Si el horno se enfría durante un minuto y el calefactor vuelve a encenderse solo, el operador nunca se entera de que algo salió mal, y la causa sigue ahí. Una máquina mejor recuerda la falla, muestra una alarma y espera a que una persona la revise y pulse un botón de **reset**.

Esta página explica cómo hacer que un programa recuerde una falla, por qué el reset debe ser un acto deliberado y por qué importa el orden de los peldaños. La práctica lo aplica después a la bomba de un tanque.

## La idea: una falla que permanece

La lectura de un sensor es **momentánea**: es verdadera solo mientras dura la condición. Una falla que se quiere conservar necesita un poco de **memoria**, llamada **biestable**. Un biestable es un bit que la falla pone en ON y que sigue en ON cuando la falla desaparece.

La escalera tiene dos bobinas hechas para esto.

- Una bobina **set** pone su bit en ON cuando le llega energía, y lo deja así, incluso cuando la energía desaparece.
- Una bobina **reset** pone su bit en OFF cuando le llega energía, y lo deja así.

El patrón tiene entonces dos peldaños: uno activa el biestable cuando aparece la falla y otro lo desactiva cuando una persona lo pide.

```ld-figure
src: reading/oven-latch.ld.json
caption: Un biestable de sobrecalentamiento. El peldaño 1 lo activa, el peldaño 2 lo desactiva y el peldaño 3 lo muestra en una lámpara.
```

## Reiniciar solo cuando es seguro

Mire el peldaño 2. Desactiva `Locked` solo cuando se cumplen tres cosas: el biestable está en ON, el sobrecalentamiento terminó y el botón de reset está pulsado. La condición del medio es la importante. Sin ella, un reset pulsado mientras el sobrecalentamiento sigue presente borraría el biestable, y la alarma ocultaría una falla que todavía está ocurriendo.

Una buena regla: **un reset nunca debe borrar una falla que sigue ocurriendo**, y un reset debe ser una **acción** de una persona, no un estado. La práctica usa la misma idea para una bomba.

## Pruébelo

Ponga `Overheat` en ON. La alarma pasa a ON. Vuelva a poner `Overheat` en OFF: la alarma sigue en ON, porque el biestable recuerda. Ahora pulse `Reset`. La alarma pasa a OFF. Después pruebe a pulsar `Reset` mientras `Overheat` sigue en ON y vea que el biestable no se borra.

```ld-try
src: reading/oven-latch.ld.json
inputs:
  - { name: Overheat, kind: switch }
  - { name: Reset, kind: push }
outputs: [Alarm]
timing: [Overheat, Alarm, Reset]
caption: Ponga Overheat en ON y en OFF, y luego pulse Reset. Pruebe Reset con Overheat en ON.
```

## Qué pasa con el tiempo

```timing
span: 6000
signals:
  - { name: Overheat, edges: [1000, 2000] }
  - { name: Alarm, edges: [1000, 3000] }
  - { name: Reset, edges: [3000, 3500] }
marks:
  - { from: 2000, to: 3000, label: Latch }
caption: El sobrecalentamiento dura un segundo. La alarma dura hasta Reset.
```

Entre el momento en que desaparece el sobrecalentamiento y el momento en que se pulsa `Reset`, la alarma está en ON aunque la entrada esté en OFF. Ese intervalo es todo el sentido del biestable: es el tiempo en que una persona puede darse cuenta.

## El orden de los peldaños importa

Un PLC resuelve los peldaños de arriba hacia abajo, un ciclo a la vez, y una variable conserva el valor que le dio el último peldaño. Por eso, cuando dos peldaños escriben el mismo bit, **gana el de abajo**.

Imagine que el peldaño 1 activa `Locked` cuando la falla está presente y el peldaño 2 lo desactiva cuando se pulsa reset. Si ambas condiciones son verdaderas en el mismo ciclo, gana el peldaño posterior, el reset, y la falla se borra aunque siga ahí. Por eso el peldaño de reset necesita la condición "la falla terminó". También es la razón para colocar los peldaños en un orden sensato: primero los de set, después los de reset, y al final las salidas que leen el biestable.

Lo mismo vale para las salidas. Un peldaño que maneja una lámpara de alarma desde el biestable debe ir **después** de los peldaños que cambian el biestable. Si fuera antes, la lámpara mostraría el biestable del ciclo anterior, con un ciclo de retraso.

## Errores frecuentes

> [!WARNING]
> Una alarma retenida en pantalla no hace segura a una máquina. Una parada de emergencia se cablea en hardware y nunca depende del programa del PLC, y ZPLC no hace ninguna afirmación de seguridad. El biestable es una comodidad para el operador.

- Usar una bobina simple para una falla. La bobina sigue a la entrada, y la falla desaparece con ella.
- Dejar que el reset borre la falla mientras la causa sigue presente.
- Dejar que un botón de reset mantenido borre una falla nueva de inmediato. Un buen reset necesita una pulsación nueva después de que la falla terminó, es decir, el botón debe soltarse y volver a pulsarse.
- Poner un peldaño de salida antes de los peldaños del biestable, de modo que muestre valores viejos.

## Compruebe lo aprendido

```quiz
question: Overheat sigue en ON y el operador pulsa Reset. El peldaño de reset no comprueba Overheat. ¿Qué ocurre en el mismo ciclo?
options:
  - { text: 'El biestable se borra aunque la falla sigue ahí, así que la alarma oculta una falla real.', correct: true, feedback: Correcto. Un reset no debe actuar sobre una falla que sigue ocurriendo. }
  - { text: 'Nada, porque una bobina set siempre gana a una bobina reset.', feedback: No en un PLC. Decide el peldaño que se resuelve último. }
```

```quiz
question: Dos peldaños escriben el mismo bit en el mismo ciclo. ¿Qué valor tiene el bit al final?
options:
  - { text: 'El valor escrito por el peldaño más abajo en el programa.', correct: true, feedback: Correcto. Los peldaños se resuelven de arriba hacia abajo, así que gana el último. }
  - { text: 'El valor escrito por el peldaño más arriba en el programa.', feedback: El peldaño de arriba se ejecuta primero y es sobrescrito. }
  - { text: 'Uno al azar.', feedback: Un ciclo es determinista. Decide el orden de los peldaños. }
```

## Lo que hará en la práctica

En la práctica recibe la bomba de un tanque que sigue una planta de nivel. El peldaño de la bomba y el de la alarma están escritos. Usted agregará los peldaños que activan un biestable de falla desde la entrada de emergencia o la falla de la bomba, que arman el reset solo después de soltar el botón y que borran el biestable con una pulsación nueva, de modo que la alarma siga en ON después de que la entrada de falla desaparezca. Preste atención al orden de los peldaños.
