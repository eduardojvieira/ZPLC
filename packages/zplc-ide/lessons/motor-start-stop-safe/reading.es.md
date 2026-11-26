## Una forma de arrancar, muchas de detener

La mayoría de los motores de una máquina los arranca y los detiene una persona desde un tablero. El operador pulsa Start, suelta, y el motor sigue en marcha; más tarde el operador pulsa Stop y el motor se detiene. Entre los dos, otras cosas también pueden detenerlo: una parada de emergencia, o el relé de sobrecarga, que se dispara cuando el motor consume demasiada corriente durante demasiado tiempo, por ejemplo porque algo lo atasca.

Un programa de arranque y parada responde tres preguntas, y esta página las toma una por una:

- ¿Cómo sigue en marcha el motor después de soltar Start?
- ¿Qué señal gana cuando un arranque y una parada llegan juntos?
- ¿Qué debe pasar cuando una parada termina mientras Start sigue pulsado?

## La autorretención mantiene el motor encendido

Un pulsador está en TRUE solo mientras un dedo lo mantiene. Si la salida copiara el pulsador de arranque, el motor se detendría en cuanto el operador suelta. Por eso la salida debe mantenerse encendida a sí misma: está en ON cuando se pulsa el pulsador de arranque, o cuando ya estaba en ON, y mientras ninguna parada esté en TRUE. Una salida escrita así aparece en su propia condición, y eso es lo que la mantiene encendida cuando el dedo ya se fue. Esta forma es una **autorretención**.

## La parada siempre gana

Cuando un arranque y una parada están en TRUE en el mismo ciclo, debe ganar la parada. En una autorretención cada parada se une con AND NOT, así que un pulsador de parada pulsado, una parada de emergencia o una sobrecarga disparada ponen toda la condición en FALSE, haga lo que haga el pulsador de arranque. Escrita con sentencias IF, la misma regla significa comprobar primero las paradas: la primera condición que es TRUE ejecuta su rama, y las demás ni siquiera se miran.

Un programa en el que gana el arranque mantendría en marcha un motor atascado mientras alguien mantenga el pulsador de arranque. Una parada nunca debe perder frente a un arranque.

## Una máquina no debe arrancar sola

Suponga que el operador mantiene el pulsador de arranque, o que el pulsador se atasca, mientras se pulsa la parada de emergencia. Cuando se libera la parada de emergencia, el pulsador de arranque sigue en TRUE, y una autorretención simple vuelve a encender el motor en el ciclo siguiente, sin que nadie lo pida. Lo mismo pasa cuando el programa empieza con el pulsador de arranque ya pulsado.

Una máquina que arranca sola sorprende a la persona que está delante. La regla es: **después de cualquier parada, y cuando el programa empieza, un arranque necesita una pulsación nueva.** El pulsador de arranque debe verse suelto antes de que una pulsación cuente.

## Ejemplo resuelto

Un taller tiene un extractor de polvo con dos pulsadores, `FanStart` y `FanStop`, y un interruptor en la puerta de su filtro, `FilterDoorOpen`, que está en TRUE mientras la puerta está abierta. Abrir la puerta debe detener el extractor. La autorretención clásica hace en una línea los dos primeros trabajos de esta página:

```st
PROGRAM Extractor
VAR_INPUT FanStart : BOOL; FanStop : BOOL; FilterDoorOpen : BOOL; END_VAR
VAR_OUTPUT Fan : BOOL; END_VAR
VAR FanOn : BOOL; END_VAR
FanOn := (FanStart OR FanOn) AND NOT FanStop AND NOT FilterDoorOpen;
Fan := FanOn;
END_PROGRAM
```

Lea la asignación desde la izquierda. `FanStart OR FanOn` sigue en TRUE después de soltar el pulsador, porque FanOn se mantiene a sí misma. Cada `AND NOT` corta esa retención en cuanto su parada está en TRUE, y gana cuando un arranque llega en el mismo ciclo.

Ahora siga el diagrama, en el que el operador mantiene `FanStart` mientras alguien pulsa `FanStop`. El extractor se detiene, pero en cuanto se suelta `FanStop`, `FanStart` sigue en TRUE y la autorretención vuelve a encender el extractor sola.

```timing
span: 5000
signals:
  - { name: FanStart, edges: [500, 800, 2000, 3200, 3800, 4100] }
  - { name: FanStop, edges: [2400, 2700] }
  - { name: Fan, edges: [500, 2400, 2700] }
caption: La autorretención simple vuelve a arrancar el extractor cuando termina la parada con FanStart todavía pulsado
```

Eso es lo único que una autorretención sola no puede hacer: no sabe si el pulsador de arranque se soltó desde la última parada. Un programa que cumple la regla de la pulsación nueva necesita una segunda memoria BOOL que recuerde exactamente eso, borrada por cada parada y al empezar, para que una pulsación cuente solo cuando el pulsador ya se soltó, es decir, cuando el arranque está armado. La práctica pide esta regla.

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
question: Un programa escribe IF FanStart THEN FanOn := TRUE; ELSIF FanStop THEN FanOn := FALSE; END_IF; y en un ciclo FanStart y FanStop están los dos en TRUE. ¿Cuánto vale FanOn al terminar el ciclo?
options:
  - { text: 'TRUE, porque se ejecuta la primera rama que es TRUE y la otra no se mira', correct: true, feedback: 'Correcto. Aquí gana FanStart, que es al revés de lo que se busca: compruebe primero las paradas.' }
  - { text: 'FALSE, porque FanStop está escrito al final', feedback: 'En un IF ... ELSIF solo se ejecuta la primera rama que es TRUE. En este ciclo FanStop nunca se mira.' }
  - { text: 'Conserva el valor del ciclo anterior', feedback: 'FanStart está en TRUE, así que se ejecuta la primera rama y escribe FanOn.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start, Stop, EStop y Overload y las salidas Forward y Reverse, y copia Start a Forward. Usted hará que Forward siga en ON después de una pulsación de Start, pase a OFF con EStop a los {{t:40}} ms, con Overload a los {{t:90}} ms y con Stop a los {{t:140}} ms, y vuelva solo después de una pulsación nueva, nunca mientras Start siga pulsado, ni siquiera a los {{t:0}} ms, cuando el programa empieza con Start pulsado. Reverse sigue en FALSE. Declare en `VAR` las memorias que necesite y después pulse {{ui:learn.check}}.
