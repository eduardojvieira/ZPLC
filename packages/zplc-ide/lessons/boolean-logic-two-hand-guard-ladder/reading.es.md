## Por qué una prensa necesita dos manos

Una prensa metálica puede aplastar una mano. Una protección clásica es el **mando a dos manos**: la prensa se mueve solo mientras el operador mantiene dos pulsadores, uno en cada mano, colocados tan separados que ninguna mano puede quedar bajo la herramienta. Una **protección** (guarda) añade una segunda defensa: si la tapa está abierta, la prensa no debe moverse en absoluto.

Las reglas de esa máquina son simples de decir: "ambos pulsadores pulsados, **y** la protección cerrada". También son un lugar perfecto para practicar los tres bloques de la lógica booleana: AND, NOT y OR exclusivo. Usted ya conoció AND y OR como serie y paralelo. Esta página añade los otros dos y muestra cómo se combinan.

## AND: todas las condiciones juntas

Los contactos en serie dejan pasar la energía solo si todos conducen. Una licuadora es un ejemplo amable. Debe funcionar solo cuando la tapa está cerrada y usted pulsa el pulsador, así que el contacto de la tapa y el contacto del pulsador van en serie.

## NOT: lo contrario

Un **NOT** convierte TRUE en FALSE y FALSE en TRUE. En el diagrama de escalera no hace falta un símbolo nuevo: un **contacto normalmente cerrado** es un NOT. Deja pasar la energía cuando su variable es FALSE. Una lámpara que avisa de una tapa abierta lee la señal de la tapa con un contacto normalmente cerrado: cuando la tapa no está cerrada, la lámpara se enciende.

## OR exclusivo: una o la otra, pero no ambas

Un **OR exclusivo** (XOR) es TRUE cuando exactamente una de dos condiciones es TRUE. El mejor ejemplo es la luz de una escalera con un interruptor abajo y otro arriba. Cambie cualquiera de los dos y la luz cambia. Ninguno arriba: apagada. Uno arriba: encendida. Ambos arriba: apagada de nuevo. La luz está encendida justo cuando los dos interruptores no coinciden.

Se construye con dos caminos en paralelo. El primero dice "A está arriba y B no". El segundo dice "A no está arriba y B sí". Cada camino es una serie de dos contactos, uno normalmente abierto y otro normalmente cerrado, y los dos caminos van en paralelo.

## Tabla de verdad de la escalera

| SwitchA | SwitchB | StairLight |
| :------ | :------ | :--------- |
| FALSE   | FALSE   | FALSE      |
| FALSE   | TRUE    | TRUE       |
| TRUE    | FALSE   | TRUE       |
| TRUE    | TRUE    | FALSE      |

Puede comprobar cualquier lógica nueva escribiendo primero una tabla así y probando después cada fila. La práctica de esta lección hace exactamente eso con un escenario.

Cualquier regla booleana se puede escribir solo con AND, OR y NOT. El XOR es apenas un atajo útil para "no coinciden".

## Ejemplo resuelto

Una cinta clasificadora lleva cajas frente a una compuerta que empuja las cajas altas hacia un carril lateral. La compuerta se abre para una caja alta (TallBox) mientras el carril lateral no está lleno (LaneFull): un AND en el que una condición es un NOT. Un interruptor de posición, FlapIsOut, indica dónde está realmente la compuerta, y mientras la cinta funciona (BeltRunning) una lámpara de falla se enciende cuando la orden y la posición no coinciden: un XOR, en serie con un contacto más.

```ld-figure
src: reading/diverter-flap.ld.json
caption: AND con un NOT para la compuerta, un XOR en serie con la cinta para la lámpara de falla
```

El peldaño 1 es el AND: TallBox con un contacto normalmente abierto, y LaneFull con uno normalmente cerrado, porque la compuerta puede moverse mientras LaneFull es FALSE. El peldaño 2 empieza con el XOR, con sus dos caminos en paralelo dibujados uno encima del otro, y los caminos se unen antes del contacto de BeltRunning, así que la diferencia solo cuenta mientras la cinta funciona. Los contactos sobre Flap leen la bobina del peldaño 1.

```ld-try
src: reading/diverter-flap.ld.json
inputs:
  - { name: TallBox, kind: switch }
  - { name: LaneFull, kind: switch }
  - { name: FlapIsOut, kind: switch }
  - { name: BeltRunning, kind: switch }
outputs: [Flap, FlapFault]
caption: Ponga en marcha la cinta, envíe una caja alta y luego mueva usted el interruptor de posición
```

Pulse Ejecutar y active BeltRunning. Active TallBox: se ordena abrir la compuerta, y la lámpara de falla se enciende porque FlapIsOut todavía indica la compuerta adentro. Active FlapIsOut, como haría la compuerta real: la lámpara de falla se apaga. Ahora active LaneFull: la orden de la compuerta cae, y la lámpara de falla vuelve a encenderse hasta que desactive FlapIsOut. Desactive BeltRunning, y la lámpara de falla queda apagada haga lo que haga la compuerta.

## Errores comunes

- Pensar que un contacto normalmente cerrado es un interruptor cerrado. Es un NOT: deja pasar la energía cuando la variable es FALSE.
- Construir el XOR con dos contactos normalmente abiertos en paralelo. Eso es un OR simple, y también es TRUE cuando ambos están activos.
- Poner la protección en paralelo con los pulsadores. Un paralelo ofrece una segunda manera de habilitar la prensa, lo contrario de una protección. Una condición que siempre debe cumplirse va en **serie**.

> [!WARNING]
> Un mando a dos manos y una protección reales son funciones de seguridad con requisitos estrictos. Se construyen con relés de seguridad certificados o con controladores de seguridad, se cablean en hardware y nunca dependen solo de un programa normal de PLC. Esta lección solo enseña la lógica.

## Compruébelo usted

```quiz
question: Una lámpara debe encenderse cuando una protección no está cerrada. ¿Qué contacto lee la señal GuardClosed en ese peldaño?
options:
  - { text: 'Un contacto normalmente cerrado', correct: true, feedback: 'Correcto. Deja pasar la energía cuando GuardClosed es FALSE, que es el NOT.' }
  - { text: 'Un contacto normalmente abierto', feedback: 'Ese contacto deja pasar la energía cuando GuardClosed es TRUE, así que la lámpara se encendería con la protección cerrada.' }
  - { text: 'Ningún contacto: la bobina lee la protección por sí sola', feedback: 'Una bobina solo recibe energía a través de los contactos que tiene delante. Sin contacto, la lámpara está siempre encendida.' }
```

```quiz
question: La luz de una escalera tiene dos interruptores. Ambos están arriba. ¿Cómo está la luz?
options:
  - { text: 'Apagada, porque exactamente un interruptor debe estar arriba para que se encienda', correct: true, feedback: 'Correcto. El XOR es TRUE solo cuando los interruptores no coinciden.' }
  - { text: 'Encendida, porque al menos un interruptor está arriba', feedback: 'Eso es OR. En la luz de una escalera, subir el segundo interruptor vuelve a apagar la luz.' }
  - { text: 'Parpadea, porque los dos interruptores se pelean', feedback: 'Nada se pelea: el peldaño se resuelve una vez por ciclo y da una sola respuesta estable, FALSE.' }
```

## Qué hará en la práctica

El programa inicial es un mando a dos manos con tres peldaños: PressEnable, una GuardLamp que indica cuando la protección **no** está cerrada, y un OneHandWarning que indica cuando **exactamente una** mano está en un pulsador. En esa última regla el XOR es útil: una mano sola es sospechosa, mientras que cero o dos manos son estados normales. PressEnable revisa las dos manos pero olvida la protección, así que la prensa se habilita con la protección abierta. Usted hará que la prensa se habilite solo cuando el pulsador izquierdo **y** el derecho **y** la protección son TRUE, y después pulsará {{ui:learn.check}} y mirará en la traza cómo se comportan la lámpara de la protección y el aviso de una mano.
