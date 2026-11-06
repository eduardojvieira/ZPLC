## Por qué una prensa necesita dos manos

Una prensa metálica puede aplastar una mano. Una protección clásica es el **mando a dos manos**: la prensa se mueve solo mientras el operador mantiene dos botones, uno en cada mano, colocados tan separados que ninguna mano puede quedar bajo la herramienta. Una **protección** (guarda) añade una segunda defensa: si la tapa está abierta, la prensa no debe moverse en absoluto.

Las reglas de esa máquina son simples de decir: "ambos botones pulsados, **y** la protección cerrada". También son un lugar perfecto para practicar los tres bloques de la lógica booleana: AND, NOT y OR exclusivo. Usted ya conoció AND y OR como serie y paralelo. Esta página añade los otros dos y muestra cómo se combinan.

## AND: todas las condiciones juntas

Los contactos en serie dejan pasar la energía solo si todos conducen. Una licuadora es un ejemplo amable. Debe funcionar solo cuando la tapa está cerrada y usted pulsa el botón, así que el contacto de la tapa y el contacto del botón van en serie.

## NOT: lo contrario

Un **NOT** convierte TRUE en FALSE y FALSE en TRUE. En el diagrama de escalera no hace falta un símbolo nuevo: un **contacto normalmente cerrado** es un NOT. Deja pasar la energía cuando su variable es FALSE. Una lámpara que avisa de una tapa abierta lee la señal de la tapa con un contacto normalmente cerrado: cuando la tapa no está cerrada, la lámpara se enciende.

## OR exclusivo: una o la otra, pero no ambas

Un **OR exclusivo** (XOR) es TRUE cuando exactamente una de dos condiciones es TRUE. El mejor ejemplo es la luz de una escalera con un interruptor abajo y otro arriba. Cambie cualquiera de los dos y la luz cambia. Ninguno arriba: apagada. Uno arriba: encendida. Ambos arriba: apagada de nuevo. La luz está encendida justo cuando los dos interruptores no coinciden.

Se construye con dos caminos en paralelo. El primero dice "A está arriba y B no". El segundo dice "A no está arriba y B sí". Cada camino es una serie de dos contactos, uno normalmente abierto y otro normalmente cerrado, y los dos caminos van en paralelo.

```ld-figure
src: reading/lid-and-stairs.ld.json
caption: AND para la licuadora, NOT para el aviso de la tapa, XOR para la luz de la escalera
```

El peldaño 1 es el AND. El peldaño 2 es el NOT. El peldaño 3 es el XOR, con sus dos caminos paralelos dibujados uno sobre otro.

```ld-try
src: reading/lid-and-stairs.ld.json
inputs:
  - { name: LidClosed, kind: switch }
  - { name: BlendButton, kind: push }
  - { name: SwitchA, kind: switch }
  - { name: SwitchB, kind: switch }
outputs: [Blender, LidWarning, StairLight]
caption: Cierre la tapa y pulse el botón, luego cambie cada interruptor de la escalera por turno
```

Pulse Ejecutar. Empiece con la tapa abierta: la lámpara de aviso está encendida, y la licuadora no funciona aunque pulse el botón. Cierre la tapa y pulse el botón: la licuadora funciona y la lámpara de aviso se apaga. Ahora cambie SwitchA, luego SwitchB y luego SwitchA otra vez, y observe cómo la luz de la escalera sigue la regla XOR.

## Tabla de verdad de la escalera

| SwitchA | SwitchB | StairLight |
| :-- | :-- | :-- |
| FALSE | FALSE | FALSE |
| FALSE | TRUE | TRUE |
| TRUE | FALSE | TRUE |
| TRUE | TRUE | FALSE |

Puede comprobar cualquier lógica nueva escribiendo primero una tabla así y probando después cada fila. La práctica de esta lección hace exactamente eso con un escenario.

## Juntar las piezas

El mando a dos manos de la práctica combina lo que acaba de ver: la prensa se habilita cuando el botón izquierdo **y** el derecho **y** la protección son TRUE, una lámpara indica cuando la protección **no** está cerrada, y un aviso indica cuando **exactamente una** mano está en un botón. En esa última regla el XOR es útil: una mano sola es sospechosa, mientras que cero o dos manos son estados normales.

## Errores frecuentes

- Pensar que un contacto normalmente cerrado es un interruptor cerrado. Es un NOT: deja pasar la energía cuando la variable es FALSE.
- Construir el XOR con dos contactos normalmente abiertos en paralelo. Eso es un OR simple, y también es TRUE cuando ambos están activos.
- Poner la protección en paralelo con los botones. Un paralelo ofrece una segunda manera de habilitar la prensa, lo contrario de una protección. Una condición que siempre debe cumplirse va en **serie**.

> [!NOTE]
> Cualquier regla booleana se puede escribir solo con AND, OR y NOT. El XOR es apenas un atajo útil para "no coinciden".

> [!WARNING]
> Un mando a dos manos y una protección reales son funciones de seguridad con requisitos estrictos. Se construyen con relés de seguridad certificados o con controladores de seguridad, se cablean en hardware y nunca dependen solo de un programa normal de PLC. ZPLC no hace ninguna afirmación de seguridad, y esta lección solo enseña la lógica.

## Compruébelo usted

```quiz
question: Una lámpara debe encenderse cuando una protección no está cerrada. ¿Qué contacto lee la señal GuardClosed en ese peldaño?
options:
  - { text: 'Un contacto normalmente cerrado', correct: true, feedback: Correcto. Deja pasar la energía cuando GuardClosed es FALSE, que es el NOT. }
  - { text: 'Un contacto normalmente abierto', feedback: Ese contacto deja pasar la energía cuando GuardClosed es TRUE, así que la lámpara se encendería con la protección cerrada. }
```

```quiz
question: La luz de una escalera tiene dos interruptores. Ambos están arriba. ¿Cómo está la luz?
options:
  - { text: 'Apagada, porque exactamente un interruptor debe estar arriba para que se encienda', correct: true, feedback: Correcto. El XOR es TRUE solo cuando los interruptores no coinciden. }
  - { text: 'Encendida, porque al menos un interruptor está arriba', feedback: Eso es OR. En la luz de una escalera, subir el segundo interruptor vuelve a apagar la luz. }
```

## Qué hará en la práctica

En la práctica recibirá un mando a dos manos con tres peldaños. La habilitación de la prensa revisa las dos manos pero olvida la protección. Agregará el contacto de la protección en serie, para que la prensa se habilite solo con las dos manos en los botones y la protección cerrada. Luego pulsará Comprobar y mirará en la traza cómo se comportan la lámpara de la protección y el aviso de una mano.
