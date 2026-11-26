## Una forma de arrancar, muchas de detener

La mayoría de los motores de una máquina los arranca y los detiene una persona desde un tablero. El operador pulsa Start, suelta, y el motor sigue en marcha; más tarde el operador pulsa Stop y el motor se detiene. Entre los dos, otras cosas también pueden detenerlo: una parada de emergencia, o el relé de sobrecarga, que se dispara cuando el motor consume demasiada corriente durante demasiado tiempo, por ejemplo porque algo lo atasca.

Un programa de arranque y parada responde tres preguntas, y esta página las toma una por una:

- ¿Cómo sigue en marcha el motor después de soltar Start?
- ¿Qué señal gana cuando un arranque y una parada llegan juntos?
- ¿Qué debe pasar cuando una parada termina mientras Start sigue pulsado?

## La autorretención mantiene el motor encendido

Un pulsador está en TRUE solo mientras un dedo lo mantiene. Si la salida copiara Start, el motor se detendría en cuanto el operador suelta. Por eso el programa guarda una memoria BOOL propia, `Running`, que Start activa y que cualquier parada borra, y la salida sigue a la memoria. Una memoria que se mantiene encendida a sí misma de esta forma es una **autorretención**.

```st
IF Stop OR EStop OR Overload THEN
  Running := FALSE;
ELSIF Start THEN
  Running := TRUE;
END_IF;
```

Cuando ninguna de las condiciones es TRUE, no se ejecuta ninguna asignación, y `Running` conserva el valor que tenía: esa es la memoria.

## La parada siempre gana

El orden del IF decide qué señal gana cuando dos están en TRUE en el mismo ciclo. La primera condición que es TRUE ejecuta su rama, y las demás ni siquiera se miran. Comprobar primero las paradas significa que un Stop pulsado, una parada de emergencia o una sobrecarga disparada apagan el motor haga lo que haga Start.

Si Start fuera primero, el programa mantendría en marcha un motor atascado mientras alguien mantenga Start. Una parada nunca debe perder frente a un arranque.

## Una máquina no debe arrancar sola

La autorretención de arriba todavía tiene una falla. Suponga que el operador mantiene Start, o que un pulsador Start se atasca, mientras se pulsa la parada de emergencia. Cuando se libera la parada de emergencia, Start sigue en TRUE, así que en el ciclo siguiente el motor vuelve a arrancar sin que nadie lo pida. Lo mismo pasa cuando el programa empieza con Start ya pulsado.

Una máquina que arranca sola sorprende a la persona que está delante. La regla es: **después de cualquier parada, y cuando el programa empieza, un arranque necesita una pulsación nueva.** Start debe verse suelto antes de que una pulsación cuente.

El programa necesita una segunda memoria para eso, `Armed`, que dice "Start se soltó desde la última parada". Una parada la borra, un Start suelto la activa, y solo un Start habilitado puede activar `Running`. `Armed` empieza en FALSE, así que un Start que ya está pulsado cuando el programa empieza no es una pulsación nueva.

## Ejemplo resuelto

Un taller tiene un extractor de polvo con dos pulsadores, `FanStart` y `FanStop`, y un interruptor en la puerta de su filtro, `FilterDoorOpen`, que está en TRUE mientras la puerta está abierta. Abrir la puerta debe detener el extractor, y cerrarla otra vez no debe volver a arrancarlo hasta que alguien pulse `FanStart` de nuevo.

```st
PROGRAM Extractor
VAR_INPUT FanStart : BOOL; FanStop : BOOL; FilterDoorOpen : BOOL; END_VAR
VAR_OUTPUT Fan : BOOL; END_VAR
VAR
  Running : BOOL;
  Armed : BOOL;
END_VAR
IF FanStop OR FilterDoorOpen THEN
  Running := FALSE;
  Armed := FALSE;
ELSIF NOT FanStart THEN
  Armed := TRUE;
ELSIF Armed THEN
  Running := TRUE;
END_IF;
Fan := Running;
END_PROGRAM
```

Lea las tres ramas en orden. Una parada borra las dos memorias. Sin parada, un `FanStart` suelto habilita la pulsación siguiente. Sin parada y con `FanStart` pulsado, la pulsación cuenta solo si está habilitada. Sígalo en el diagrama: la primera pulsación arranca el extractor. Después el operador mantiene `FanStart` mientras alguien pulsa `FanStop`; el extractor se detiene y sigue detenido después de soltar `FanStop`, porque `FanStart` nunca se soltó. Solo después de soltar `FanStart` y pulsarlo otra vez el extractor funciona.

```timing
span: 5000
signals:
  - { name: FanStart, edges: [500, 800, 2000, 3200, 3800, 4100] }
  - { name: FanStop, edges: [2400, 2700] }
  - { name: Fan, edges: [500, 2400, 3800] }
caption: Un FanStart mantenido durante una parada no vuelve a arrancar el extractor; una pulsación nueva sí
```

## Errores comunes

- Accionar la salida directamente desde Start. El motor funciona solo mientras se mantiene el pulsador.
- Comprobar Start antes que las paradas. Un arranque gana entonces frente a una parada que llega en el mismo ciclo.
- Olvidar una de las paradas. Cada señal que debe detener el motor aparece en la condición de parada, la sobrecarga tanto como el pulsador.
- Dejar que un Start mantenido vuelva a arrancar el motor cuando termina una parada, o cuando el programa empieza. Un arranque necesita una pulsación nueva después de cada parada.
- Activar la salida en una rama y no borrarla nunca. La salida se escribe desde la memoria en cada ciclo, así que sigue cada cambio.

> [!WARNING]
> Un programa que detiene un motor con sus entradas de parada es una buena práctica, pero no es lo que protege a las personas. En una máquina real un pulsador de parada y una parada de emergencia se cablean normalmente cerrados, para que un cable cortado se lea como una parada, y la parada de emergencia corta la alimentación del motor en hardware, haga lo que haga el programa.

## Compruébelo usted

```quiz
question: El motor está en marcha. El operador sigue manteniendo Start mientras alguien pulsa EStop; después se libera EStop y Start sigue pulsado. ¿Qué debe hacer Forward?
options:
  - { text: 'Seguir en OFF hasta que se suelte Start y se pulse otra vez', correct: true, feedback: 'Sí. Después de una parada, un arranque necesita una pulsación nueva, así que un Start mantenido no debe volver a arrancar el motor.' }
  - { text: 'Pasar a ON en cuanto se libera EStop', feedback: 'Eso es el motor arrancando solo, sin que nadie lo pida. Un arranque cuenta solo después de que Start se vio suelto.' }
  - { text: 'Seguir en ON todo el tiempo, porque Start está pulsado', feedback: 'EStop es una parada, y una parada siempre gana frente a un arranque.' }
```

```quiz
question: Un programa escribe IF Start THEN Running := TRUE; ELSIF Stop THEN Running := FALSE; END_IF; y en un ciclo Start y Stop están los dos en TRUE. ¿Cuánto vale Running al terminar el ciclo?
options:
  - { text: 'TRUE, porque se ejecuta la primera rama que es TRUE y la otra no se mira', correct: true, feedback: 'Correcto. Aquí gana Start, que es al revés de lo que se busca: compruebe primero las paradas.' }
  - { text: 'FALSE, porque Stop está escrito al final', feedback: 'En un IF ... ELSIF solo se ejecuta la primera rama que es TRUE. En este ciclo Stop nunca se mira.' }
  - { text: 'Conserva el valor del ciclo anterior', feedback: 'Start está en TRUE, así que se ejecuta la primera rama y escribe Running.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start, Stop, EStop y Overload y las salidas Forward y Reverse, y copia Start a Forward. Usted hará que Forward siga en ON después de una pulsación de Start, pase a OFF con EStop a los {{t:40}} ms, con Overload a los {{t:90}} ms y con Stop a los {{t:140}} ms, y vuelva solo después de una pulsación nueva, nunca mientras Start siga pulsado, ni siquiera a los {{t:0}} ms, cuando el programa empieza con Start pulsado. Reverse sigue en FALSE. Declare en `VAR` las memorias que necesite y después pulse {{ui:learn.check}}.
