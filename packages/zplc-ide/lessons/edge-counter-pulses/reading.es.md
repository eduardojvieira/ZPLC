## Contar lo que pasa

Las máquinas cuentan todo el tiempo: bandejas en una pila, botellas en una caja, golpes de una prensa desde su último engrase. Cada uno de estos es un suceso, algo que ocurre y termina: llega una bandeja, pasa una botella, la prensa baja una vez.

Un PLC no ve sucesos. Ve entradas, una vez por ciclo. Una bandeja que se detiene debajo de un sensor mantiene esa entrada en TRUE durante cientos de ciclos, y sigue siendo una sola bandeja. Contar significa sumar uno por cada llegada, no por cada ciclo en que la entrada está en TRUE.

## Un flanco es un cambio entre dos ciclos

Lo que marca una llegada es el momento en que la entrada cambia. El programa compara el valor de una entrada en este ciclo con su valor en el ciclo anterior.

- Un **flanco ascendente** es un cambio de FALSE a TRUE: la bandeja acaba de llegar. Dura exactamente un ciclo.
- Un **flanco descendente** es un cambio de TRUE a FALSE: la bandeja acaba de irse.

El nivel de la entrada, TRUE o FALSE, dice si algo está ahí ahora. El flanco ascendente dice que algo acaba de llegar. El diagrama muestra una entrada con dos llegadas, una corta y una larga; cada una tiene un flanco ascendente, así que cada una cuenta una vez.

```timing
span: 4000
signals:
  - { name: TrayHere, edges: [500, 900, 2000, 3500] }
marks:
  - { from: 500, to: 900, label: '1' }
  - { from: 2000, to: 3500, label: '2' }
caption: Una llegada corta y una larga; cada una empieza con un flanco ascendente
```

## Un contador es una instancia que se llama

Usted no tiene que comparar los ciclos. El **CTU**, el contador ascendente, es un bloque de función que lo hace: guarda el valor de su entrada del ciclo anterior y suma uno solo en un flanco ascendente. Como con todo bloque de función, se declara una instancia en `VAR`, con un nombre propio:

```st
VAR
  Strokes : CTU;
END_VAR
```

Después se la llama una vez en cada ciclo, nombrando sus entradas con `:=`, y se leen sus salidas después de la llamada. Un CTU tiene tres entradas y dos salidas.

- **CU**, contar hacia arriba, un BOOL. Cada flanco ascendente de CU suma uno.
- **R**, puesta a cero, un BOOL. Mientras R está en TRUE, la cuenta es cero.
- **PV**, el valor preestablecido, un INT: el número hasta el que se cuenta.
- **Q**, un BOOL, en TRUE mientras la cuenta está en PV o por encima. Se lee como `Strokes.Q`.
- **CV**, el valor actual, un INT: la cuenta hasta ahora. Se lee como `Strokes.CV`.

Una llamada se escribe `Strokes(CU := PressDown, R := Oiled, PV := 500);`. La cuenta no se detiene en PV: CV sigue subiendo con cada flanco, y Q sigue en TRUE hasta una puesta a cero. Mientras R está en TRUE el contador sigue vigilando CU, así que un flanco que llega mientras R se mantiene no se cuenta, ni entonces ni después.

## Ejemplo resuelto

Una dosificadora de comprimidos llena frascos. Cada frasco recibe cinco comprimidos, y cada comprimido cae frente a una barrera, `TabletEye`, que queda en TRUE un momento mientras el comprimido pasa. Cuando hay un frasco nuevo en su lugar la máquina pulsa `NewBottle`, y un visor muestra cuántos comprimidos le faltan todavía al frasco. La lámpara `BottleDone` se enciende cuando el frasco tiene los cinco.

Aquí la cuenta natural va al revés, de cinco a cero, y la biblioteca estándar tiene un contador para eso: el **CTD**, contador descendente. Sus entradas son **CD**, cada uno de cuyos flancos ascendentes resta uno, **LD**, que carga PV en la cuenta mientras es TRUE, y **PV**. Sus salidas son **CV**, la cuenta, y **Q**, que es TRUE mientras CV está en cero o por debajo.

```st
PROGRAM Dispenser
VAR_INPUT TabletEye : BOOL; NewBottle : BOOL; END_VAR
VAR_OUTPUT BottleDone : BOOL; TabletsLeft : INT; END_VAR
VAR
  Doses : CTD;
END_VAR
Doses(CD := TabletEye, LD := NewBottle, PV := 5);
BottleDone := Doses.Q;
TabletsLeft := Doses.CV;
END_PROGRAM
```

Sígalo en el diagrama. Antes del primer frasco, CV es cero, así que Q ya es TRUE: un CTD dice "listo" hasta que se lo carga. `NewBottle` carga cinco, y la lámpara se apaga. Cada comprimido hace subir `TabletEye` una vez, tarde lo que tarde en pasar, y resta uno. En el quinto flanco ascendente CV llega a cero y `BottleDone` vuelve a encenderse.

```timing
span: 6000
signals:
  - { name: NewBottle, edges: [200, 400] }
  - { name: TabletEye, edges: [1000, 1300, 2000, 2300, 3000, 3300, 4000, 4300, 5000, 5300] }
  - { name: BottleDone, edges: [0, 200, 5000] }
marks:
  - { from: 200, to: 5000, label: 'CV 5 → 0' }
caption: NewBottle carga cinco; cinco comprimidos llevan la cuenta a cero y encienden BottleDone
```

La práctica cuenta al revés: desde nada hasta un número, con una puesta a cero que devuelve la cuenta a nada. Qué contador necesita para eso, y a qué entrada va cada señal, queda para usted.

## Errores comunes

- Contar con un IF, como en `IF TabletEye THEN Count := Count + 1; END_IF`. Eso suma uno en cada ciclo en que la entrada está en TRUE, cientos por un solo comprimido. Cuente flancos ascendentes con un bloque contador.
- Llamar al contador dentro de un IF. Cuando la instancia no se llama no ve CU, así que un flanco que llega y se va mientras tanto se pierde. Llámelo en cada ciclo.
- No darle a la cuenta un camino de vuelta a su inicio, o darle uno que está siempre abierto. La cuenta entonces nunca vuelve a empezar, o nunca se mueve.
- Esperar que Q caiga cuando la cuenta pasa de PV. Q está en TRUE mientras CV está en PV o por encima, y solo una puesta a cero la apaga.
- Elegir un valor preestablecido uno de más o uno de menos. PV es el número de llegadas con el que Q debe pasar a ON.
- Leer Q antes de la llamada. Una instrucción que está arriba de la llamada ve la Q del ciclo anterior.

> [!WARNING]
> Una cuenta en un programa vale lo que vale su sensor: un contacto que rebota suma cuentas falsas, y un pulso más corto que un ciclo se puede perder. Nunca deje que una cuenta sea lo único que detiene una máquina antes de que lastime a alguien.

## Compruébelo usted

```quiz
question: Un programa cuenta con IF Sensor THEN Count := Count + 1; END_IF. Una pieza permanece frente a Sensor durante 40 ciclos. ¿Cuánto sube Count?
options:
  - { text: 'Sube 40', correct: true, feedback: 'Sí. El IF suma uno en cada ciclo en que Sensor está en TRUE. Un CTU sumaría uno, en el flanco ascendente.' }
  - { text: 'Sube uno', feedback: 'Eso es lo que hace un CTU. Este IF mira el nivel de Sensor, no su cambio.' }
  - { text: 'No sube', feedback: 'Sensor está en TRUE en cada uno de esos ciclos, así que el IF ejecuta su instrucción cada vez.' }
```

```quiz
question: Un CTU tiene PV := 3 y R se mantiene en FALSE. Llegan cinco flancos ascendentes a CU. ¿Cuánto valen Q y CV?
options:
  - { text: 'Q está en TRUE y CV vale 5', correct: true, feedback: 'Correcto. El contador sigue contando después de PV, y Q sigue en TRUE mientras CV está en PV o por encima.' }
  - { text: 'Q está en TRUE y CV vale 3', feedback: 'Un CTU no se detiene en su valor preestablecido. CV sigue subiendo con cada flanco.' }
  - { text: 'Q está en FALSE y CV vale 0', feedback: 'Nada puso el contador a cero: R se mantuvo en FALSE.' }
```

## Qué hará en la práctica

El programa inicial escribe FALSE en CountReached y no tiene contador. Usted declarará un contador propio y hará que CountReached pase a ON en el tercer flanco ascendente de PulseInput, a los {{t:50}} ms, y pase a OFF cuando se pulsa Reset a los {{t:70}} ms. Después pulse {{ui:learn.check}}.
