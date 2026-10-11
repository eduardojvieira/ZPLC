---
title: "Referencia de bloques de función"
sidebar_label: "Bloques de función"
description: "Todos los bloques de función del registro del compilador ZPLC: tabla de pines, comportamiento y un ejemplo que CI ejecuta."
tags: [reference, generated]
---

# Referencia de bloques de función

{/* >>> GENERATED (tools/docs/generate_function_reference.ts): reference/function-blocks. Do not edit. >>> */}

Todos los bloques de función del registro del compilador, con su tabla de pines y un ejemplo. El registro tiene 34 bloques. Un bloque se declara como variable (`Delay : TON;`) y se llama con sus entradas (`Delay(IN := Start, PT := T#2s);`); sus salidas se leen como miembros (`Delay.Q`). Una instancia nueva empieza con cada pin en el cero de su tipo, como indica la columna Inicial. Las funciones sin estado están en la [referencia de funciones](./functions.md).

Cada ejemplo es un programa completo. CI lo compila y lo ejecuta en el runtime POSIX nativo, y el resultado indicado debajo es el valor que la ejecución comprueba.

## Temporizadores

### TON

Temporizador con retardo a la conexión: Q pasa a TRUE después de que IN permanece en TRUE durante PT, y pasa a FALSE en cuanto IN lo hace.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `BOOL` | `FALSE` | Entrada: el retardo corre mientras es TRUE. |
| `PT` | Entrada | `TIME` | `T#0ms` | Tiempo preseleccionado. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE cuando IN estuvo en TRUE durante PT. |
| `ET` | Salida | `TIME` | `T#0ms` | Tiempo transcurrido desde que IN subió; se detiene en PT y vale 0 mientras IN es FALSE. |

```pascal runnable expect="Done=TRUE Elapsed=100" scans=15
PROGRAM Example
VAR
    Delay : TON;
    Done : BOOL;
    Elapsed : UDINT;
END_VAR

Delay(IN := TRUE, PT := T#100ms);
Done := Delay.Q;
Elapsed := TIME_TO_UDINT(Delay.ET);
END_PROGRAM
```

Resultado tras 15 scans de 10 ms: `Done` = `TRUE`, `Elapsed` = `100`.

### TOF

Temporizador con retardo a la desconexión: Q pasa a TRUE con IN y pasa a FALSE PT después de que IN bajó.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `BOOL` | `FALSE` | Entrada: Q la sigue al subir y se mantiene PT después de que baja. |
| `PT` | Entrada | `TIME` | `T#0ms` | Tiempo preseleccionado. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE mientras IN es TRUE y durante PT después de que IN baja. |
| `ET` | Salida | `TIME` | `T#0ms` | Tiempo transcurrido desde que IN bajó; se detiene en PT y vale 0 mientras IN es TRUE. |

```pascal runnable expect="Hold=TRUE" scans=8
PROGRAM Example
VAR
    Delay : TOF;
    Scan : INT;
    Hold : BOOL;
END_VAR

Scan := Scan + 1;
Delay(IN := Scan < 3, PT := T#100ms);
Hold := Delay.Q;
END_PROGRAM
```

Resultado tras 8 scans de 10 ms: `Hold` = `TRUE`.

### TP

Temporizador de pulso: un flanco ascendente de IN da un pulso de exactamente PT que IN no puede redisparar ni acortar.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `BOOL` | `FALSE` | Entrada: un flanco ascendente inicia el pulso. |
| `PT` | Entrada | `TIME` | `T#0ms` | Tiempo preseleccionado. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE durante exactamente PT después de un flanco ascendente de IN. |
| `ET` | Salida | `TIME` | `T#0ms` | Tiempo transcurrido desde que inició el pulso; se detiene en PT. |

```pascal runnable expect="Out=FALSE" scans=20
PROGRAM Example
VAR
    Shot : TP;
    Out : BOOL;
END_VAR

Shot(IN := TRUE, PT := T#100ms);
Out := Shot.Q;
END_PROGRAM
```

Resultado tras 20 scans de 10 ms: `Out` = `FALSE`.

## Contadores

### CTU

Contador ascendente: cuenta los flancos ascendentes de CU.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `CU` | Entrada | `BOOL` | `FALSE` | Entrada de conteo ascendente: un flanco ascendente suma 1. |
| `R` | Entrada | `BOOL` | `FALSE` | Reinicio: mientras es TRUE, CV vale 0 y no se cuenta. |
| `PV` | Entrada | `INT` | `0` | Valor preseleccionado. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE cuando CV es PV o más. |
| `CV` | Salida | `INT` | `0` | Valor actual; se detiene en 32767. |

```pascal runnable expect="Count=3 Reached=TRUE" scans=6
PROGRAM Example
VAR
    Counter : CTU;
    Scan : INT;
    Pulse : BOOL;
    Count : INT;
    Reached : BOOL;
END_VAR

Scan := Scan + 1;
Pulse := (Scan MOD 2) = 0;
Counter(CU := Pulse, R := FALSE, PV := 3);
Count := Counter.CV;
Reached := Counter.Q;
END_PROGRAM
```

Resultado tras 6 scans de 10 ms: `Count` = `3`, `Reached` = `TRUE`.

### CTD

Contador descendente: cuenta hacia abajo los flancos ascendentes de CD desde el valor cargado por LD.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `CD` | Entrada | `BOOL` | `FALSE` | Entrada de conteo descendente: un flanco ascendente resta 1. |
| `LD` | Entrada | `BOOL` | `FALSE` | Carga: mientras es TRUE, CV vale PV y no se cuenta. |
| `PV` | Entrada | `INT` | `0` | Valor preseleccionado. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE cuando CV es 0 o menos. |
| `CV` | Salida | `INT` | `0` | Valor actual; se detiene en -32768. |

```pascal runnable expect="Count=0 Empty=TRUE" scans=7
PROGRAM Example
VAR
    Counter : CTD;
    Scan : INT;
    Pulse : BOOL;
    Count : INT;
    Empty : BOOL;
END_VAR

Scan := Scan + 1;
Pulse := (Scan MOD 2) = 0;
Counter(CD := Pulse, LD := Scan = 1, PV := 3);
Count := Counter.CV;
Empty := Counter.Q;
END_PROGRAM
```

Resultado tras 7 scans de 10 ms: `Count` = `0`, `Empty` = `TRUE`.

### CTUD

Contador ascendente y descendente: suma en los flancos ascendentes de CU y resta en los de CD.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `CU` | Entrada | `BOOL` | `FALSE` | Entrada de conteo ascendente: un flanco ascendente suma 1. |
| `CD` | Entrada | `BOOL` | `FALSE` | Entrada de conteo descendente: un flanco ascendente resta 1. |
| `R` | Entrada | `BOOL` | `FALSE` | Reinicio: mientras es TRUE, CV vale 0; gana sobre LD. |
| `LD` | Entrada | `BOOL` | `FALSE` | Carga: mientras es TRUE y R es FALSE, CV vale PV. |
| `PV` | Entrada | `INT` | `0` | Valor preseleccionado. |
| `QU` | Salida | `BOOL` | `FALSE` | TRUE cuando CV es PV o más. |
| `QD` | Salida | `BOOL` | `FALSE` | TRUE cuando CV es 0 o menos. |
| `CV` | Salida | `INT` | `0` | Valor actual; se detiene en 32767 y en -32768. |

```pascal runnable expect="Count=3 High=TRUE" scans=6
PROGRAM Example
VAR
    Counter : CTUD;
    Scan : INT;
    Up : BOOL;
    Count : INT;
    High : BOOL;
END_VAR

Scan := Scan + 1;
Up := (Scan MOD 2) = 0;
Counter(CU := Up, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
Count := Counter.CV;
High := Counter.QU;
END_PROGRAM
```

Resultado tras 6 scans de 10 ms: `Count` = `3`, `High` = `TRUE`.

## Biestables y detectores de flanco

### R_TRIG

Detector de flanco ascendente.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `CLK` | Entrada | `BOOL` | `FALSE` | Señal a vigilar. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE durante una llamada cuando CLK pasa de FALSE a TRUE. |

```pascal runnable expect="Seen=1" scans=8
PROGRAM Example
VAR
    Edge : R_TRIG;
    Scan : INT;
    Seen : INT;
END_VAR

Scan := Scan + 1;
Edge(CLK := Scan >= 3);
IF Edge.Q THEN
    Seen := Seen + 1;
END_IF;
END_PROGRAM
```

Resultado tras 8 scans de 10 ms: `Seen` = `1`.

### F_TRIG

Detector de flanco descendente.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `CLK` | Entrada | `BOOL` | `FALSE` | Señal a vigilar. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE durante una llamada cuando CLK pasa de TRUE a FALSE. |

```pascal runnable expect="Seen=1" scans=8
PROGRAM Example
VAR
    Edge : F_TRIG;
    Scan : INT;
    Seen : INT;
END_VAR

Scan := Scan + 1;
Edge(CLK := Scan < 3);
IF Edge.Q THEN
    Seen := Seen + 1;
END_IF;
END_PROGRAM
```

Resultado tras 8 scans de 10 ms: `Seen` = `1`.

### RS

Biestable con desactivación dominante: cuando S y R1 son TRUE, Q1 es FALSE.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `S` | Entrada | `BOOL` | `FALSE` | Activación. |
| `R1` | Entrada | `BOOL` | `FALSE` | Desactivación, dominante. |
| `Q1` | Salida | `BOOL` | `FALSE` | El valor almacenado. |

```pascal runnable expect="Out=FALSE"
PROGRAM Example
VAR
    Latch : RS;
    Out : BOOL;
END_VAR

Latch(S := TRUE, R1 := TRUE);
Out := Latch.Q1;
END_PROGRAM
```

Resultado tras un scan: `Out` = `FALSE`.

### SR

Biestable con activación dominante: cuando S1 y R son TRUE, Q1 es TRUE.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `S1` | Entrada | `BOOL` | `FALSE` | Activación, dominante. |
| `R` | Entrada | `BOOL` | `FALSE` | Desactivación. |
| `Q1` | Salida | `BOOL` | `FALSE` | El valor almacenado. |

```pascal runnable expect="Out=TRUE"
PROGRAM Example
VAR
    Latch : SR;
    Out : BOOL;
END_VAR

Latch(S1 := TRUE, R := TRUE);
Out := Latch.Q1;
END_PROGRAM
```

Resultado tras un scan: `Out` = `TRUE`.

## Generadores de pulsos

### BLINK

Tren de pulsos asimétrico: Q es TRUE durante T_ON y FALSE durante T_OFF, una y otra vez, mientras ENABLE es TRUE.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `ENABLE` | Entrada | `BOOL` | `FALSE` | Mientras es TRUE la salida parpadea; cuando baja, Q es FALSE de inmediato. |
| `T_ON` | Entrada | `TIME` | `T#0ms` | Duración de la fase en TRUE. |
| `T_OFF` | Entrada | `TIME` | `T#0ms` | Duración de la fase en FALSE. |
| `Q` | Salida | `BOOL` | `FALSE` | La salida intermitente; empieza con la fase en TRUE. |

```pascal runnable expect="Out=FALSE" scans=13
PROGRAM Example
VAR
    Flasher : BLINK;
    Out : BOOL;
END_VAR

Flasher(ENABLE := TRUE, T_ON := T#100ms, T_OFF := T#100ms);
Out := Flasher.Q;
END_PROGRAM
```

Resultado tras 13 scans de 10 ms: `Out` = `FALSE`.

### PWM

Modulación por ancho de pulso: Q es TRUE durante PERIOD * DUTY al comienzo de cada PERIOD.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `ENABLE` | Entrada | `BOOL` | `FALSE` | Mientras es TRUE la salida se modula. |
| `PERIOD` | Entrada | `TIME` | `T#0ms` | Duración de un ciclo. |
| `DUTY` | Entrada | `REAL` | `0.0` | Fracción del ciclo en que Q es TRUE, de 0.0 a 1.0. |
| `Q` | Salida | `BOOL` | `FALSE` | La salida modulada; TRUE al comienzo de cada ciclo. |

```pascal runnable expect="Out=FALSE" scans=70
PROGRAM Example
VAR
    Modulator : PWM;
    Out : BOOL;
END_VAR

Modulator(ENABLE := TRUE, PERIOD := T#1000ms, DUTY := 0.5);
Out := Modulator.Q;
END_PROGRAM
```

Resultado tras 70 scans de 10 ms: `Out` = `FALSE`.

### PULSE

Pulso único: un pulso de PT por cada flanco ascendente de TRIG.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `TRIG` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia el pulso; un disparo durante el pulso se ignora. |
| `PT` | Entrada | `TIME` | `T#0ms` | Duración del pulso. |
| `Q` | Salida | `BOOL` | `FALSE` | TRUE mientras el pulso está en curso. |

```pascal runnable expect="Out=TRUE" scans=3
PROGRAM Example
VAR
    Shot : PULSE;
    Out : BOOL;
END_VAR

Shot(TRIG := TRUE, PT := T#100ms);
Out := Shot.Q;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Out` = `TRUE`.

## Control de proceso

### HYSTERESIS

Comparador con histéresis: Q pasa a TRUE sobre HIGH y a FALSE bajo LOW, y conserva su valor entre ambos.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | El valor medido. |
| `HIGH` | Entrada | `REAL` | `0.0` | Q pasa a TRUE cuando IN sube por encima de este valor. |
| `LOW` | Entrada | `REAL` | `0.0` | Q pasa a FALSE cuando IN baja por debajo de este valor. |
| `Q` | Salida | `BOOL` | `FALSE` | La salida conmutada. |

```pascal runnable expect="Out=TRUE"
PROGRAM Example
VAR
    Switch : HYSTERESIS;
    Out : BOOL;
END_VAR

Switch(IN := 80.0, HIGH := 75.0, LOW := 65.0);
Out := Switch.Q;
END_PROGRAM
```

Resultado tras un scan: `Out` = `TRUE`.

### DEADBAND

Banda muerta: ignora los cambios de IN menores que WIDTH.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | El valor de entrada. |
| `WIDTH` | Entrada | `REAL` | `0.0` | Semiancho de la banda alrededor de la última salida. |
| `OUT` | Salida | `REAL` | `0.0` | La salida: sigue a IN solo cuando IN sale de la banda. |

```pascal runnable expect="Result=10"
PROGRAM Example
VAR
    Filter : DEADBAND;
    Result : REAL;
END_VAR

Filter(IN := 10.0, WIDTH := 1.0);
Result := Filter.OUT;
END_PROGRAM
```

Resultado tras un scan: `Result` = `10`.

### LAG_FILTER

Filtro de primer orden: OUT := OUT + GAIN * (IN - OUT) en cada llamada.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | El valor de entrada. |
| `GAIN` | Entrada | `REAL` | `0.0` | Fracción de la diferencia que se toma en cada llamada, de 0.0 a 1.0. |
| `OUT` | Salida | `REAL` | `0.0` | El valor filtrado. |

```pascal runnable expect="Result=50"
PROGRAM Example
VAR
    Filter : LAG_FILTER;
    Result : REAL;
END_VAR

Filter(IN := 100.0, GAIN := 0.5);
Result := Filter.OUT;
END_PROGRAM
```

Resultado tras un scan: `Result` = `50`.

### RAMP_REAL

Limitador de pendiente: OUT se mueve hacia IN como máximo RATE en cada llamada.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | El valor objetivo. |
| `RATE` | Entrada | `REAL` | `0.0` | Mayor cambio de OUT por llamada. |
| `OUT` | Salida | `REAL` | `0.0` | El valor con rampa. |

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Ramp : RAMP_REAL;
    Result : REAL;
END_VAR

Ramp(IN := 10.0, RATE := 2.0);
Result := Ramp.OUT;
END_PROGRAM
```

Resultado tras un scan: `Result` = `2`.

### INTEGRAL

Integrador discreto: OUT := OUT + IN * DT en cada llamada.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | La tasa a integrar. |
| `DT` | Entrada | `REAL` | `0.0` | Paso de tiempo de una llamada, en segundos. |
| `RESET` | Entrada | `BOOL` | `FALSE` | Mientras es TRUE, OUT vale 0. |
| `OUT` | Salida | `REAL` | `0.0` | El valor acumulado. |

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Integrator : INTEGRAL;
    Result : REAL;
END_VAR

Integrator(IN := 2.0, DT := 0.5, RESET := FALSE);
Result := Integrator.OUT;
END_PROGRAM
```

Resultado tras un scan: `Result` = `1`.

### DERIVATIVE

Derivador discreto: OUT := (IN - IN anterior) / DT.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `IN` | Entrada | `REAL` | `0.0` | El valor de entrada. |
| `DT` | Entrada | `REAL` | `0.0` | Paso de tiempo de una llamada, en segundos; con 0 la salida es 0. |
| `OUT` | Salida | `REAL` | `0.0` | La tasa de cambio por segundo. |

```pascal runnable expect="Result=2" scans=3
PROGRAM Example
VAR
    Slope : DERIVATIVE;
    Scan : INT;
    Value : REAL;
    Result : REAL;
END_VAR

Scan := Scan + 1;
Value := INT_TO_REAL(Scan) * 4.0;
Slope(IN := Value, DT := 2.0);
Result := Slope.OUT;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Result` = `2`.

### PID_Compact

Controlador PID: OUT es KP * error + KI * integral del error + KD * variación del error por segundo, limitada a OUT_MIN y OUT_MAX. La integral no se restringe: sigue acumulándose mientras OUT está en un límite, por lo que no hay anti-windup.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `SP` | Entrada | `REAL` | `0.0` | Valor de consigna. |
| `PV` | Entrada | `REAL` | `0.0` | Variable de proceso. |
| `KP` | Entrada | `REAL` | `0.0` | Ganancia proporcional. |
| `KI` | Entrada | `REAL` | `0.0` | Ganancia integral. |
| `KD` | Entrada | `REAL` | `0.0` | Ganancia derivativa. |
| `DT` | Entrada | `REAL` | `0.0` | Tiempo de muestreo de una llamada, en segundos; con 0 no hay término derivativo. |
| `OUT_MIN` | Entrada | `REAL` | `0.0` | Límite inferior de OUT. |
| `OUT_MAX` | Entrada | `REAL` | `0.0` | Límite superior de OUT. |
| `OUT` | Salida | `REAL` | `0.0` | La salida del controlador. |

```pascal runnable expect="Result=20"
PROGRAM Example
VAR
    Loop : PID_Compact;
    Result : REAL;
END_VAR

Loop(SP := 100.0, PV := 90.0, KP := 2.0, KI := 0.0, KD := 0.0, DT := 0.1, OUT_MIN := 0.0, OUT_MAX := 100.0);
Result := Loop.OUT;
END_PROGRAM
```

Resultado tras un scan: `Result` = `20`.

## Memorias intermedias

### FIFO

Memoria intermedia primero en entrar, primero en salir, de hasta ocho valores DINT.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `PUSH` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente almacena DATA_IN. |
| `POP` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente retira el valor más antiguo hacia DATA_OUT. |
| `RST` | Entrada | `BOOL` | `FALSE` | Vacía la memoria intermedia. |
| `DATA_IN` | Entrada | `DINT` | `0` | El valor a almacenar. |
| `SIZE` | Entrada | `DINT` | `0, read as 8` | Capacidad, de 1 a 8; un valor fuera de ese rango se lee como 8. |
| `EMPTY` | Salida | `BOOL` | `FALSE` | TRUE cuando la memoria intermedia no tiene valores. |
| `FULL` | Salida | `BOOL` | `FALSE` | TRUE cuando la memoria intermedia tiene SIZE valores. |
| `DATA_OUT` | Salida | `DINT` | `0` | El último valor retirado. |
| `COUNT` | Salida | `DINT` | `0` | Cantidad de valores almacenados. |

```pascal runnable expect="First=10 Items=1" scans=6
PROGRAM Example
VAR
    Queue : FIFO;
    Scan : INT;
    First : DINT;
    Items : DINT;
END_VAR

Scan := Scan + 1;
Queue(PUSH := (Scan = 1) OR (Scan = 3), POP := Scan = 5, DATA_IN := Scan * 10);
First := Queue.DATA_OUT;
Items := Queue.COUNT;
END_PROGRAM
```

Resultado tras 6 scans de 10 ms: `First` = `10`, `Items` = `1`.

### LIFO

Memoria intermedia último en entrar, primero en salir (una pila), de hasta ocho valores DINT.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `PUSH` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente almacena DATA_IN. |
| `POP` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente retira el valor más reciente hacia DATA_OUT. |
| `RST` | Entrada | `BOOL` | `FALSE` | Vacía la memoria intermedia. |
| `DATA_IN` | Entrada | `DINT` | `0` | El valor a almacenar. |
| `SIZE` | Entrada | `DINT` | `0, read as 8` | Capacidad, de 1 a 8; un valor fuera de ese rango se lee como 8. |
| `EMPTY` | Salida | `BOOL` | `FALSE` | TRUE cuando la memoria intermedia no tiene valores. |
| `FULL` | Salida | `BOOL` | `FALSE` | TRUE cuando la memoria intermedia tiene SIZE valores. |
| `DATA_OUT` | Salida | `DINT` | `0` | El último valor retirado. |
| `COUNT` | Salida | `DINT` | `0` | Cantidad de valores almacenados. |

```pascal runnable expect="Top=30 Items=1" scans=6
PROGRAM Example
VAR
    Stack : LIFO;
    Scan : INT;
    Top : DINT;
    Items : DINT;
END_VAR

Scan := Scan + 1;
Stack(PUSH := (Scan = 1) OR (Scan = 3), POP := Scan = 5, DATA_IN := Scan * 10);
Top := Stack.DATA_OUT;
Items := Stack.COUNT;
END_PROGRAM
```

Resultado tras 6 scans de 10 ms: `Top` = `30`, `Items` = `1`.

## Modbus

Los ejemplos de estos bloques se ejecutan en el runtime nativo del host, que no tiene servidor Modbus, broker MQTT ni servicio en la nube con quien hablar: cada bloque termina con `ERROR` en TRUE y `STATUS` 3 (sin manejador). Prueban que el bloque compila, se ejecuta e informa su estado; el intercambio con un par se verifica por separado, contra dobles de protocolo.

### MB_READ_HREG

Lee registros de retención de un servidor Modbus.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `PROTO` | Entrada | `USINT` | `0` | Transporte: 0 para RTU, 1 para TCP. |
| `SLAVE_ID` | Entrada | `UINT` | `0` | Identificador de unidad Modbus del servidor. |
| `ADDR` | Entrada | `UINT` | `0` | Primera dirección a leer o escribir. |
| `COUNT` | Entrada | `UINT` | `0` | Cantidad de elementos solicitados. |
| `HOST` | Entrada | `STRING` | `''` | Nombre o dirección del servidor, para TCP. |
| `PORT` | Entrada | `UINT` | `0` | Puerto TCP del servidor. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `VALUE` | Salida | `UINT` | `0` | El primer registro leído. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_READ_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_WRITE_HREG

Escribe registros de retención de un servidor Modbus.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `PROTO` | Entrada | `USINT` | `0` | Transporte: 0 para RTU, 1 para TCP. |
| `SLAVE_ID` | Entrada | `UINT` | `0` | Identificador de unidad Modbus del servidor. |
| `ADDR` | Entrada | `UINT` | `0` | Primera dirección a leer o escribir. |
| `COUNT` | Entrada | `UINT` | `0` | Cantidad de elementos solicitados. |
| `VALUE` | Entrada | `UINT` | `0` | El primer registro a escribir. |
| `HOST` | Entrada | `STRING` | `''` | Nombre o dirección del servidor, para TCP. |
| `PORT` | Entrada | `UINT` | `0` | Puerto TCP del servidor. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_WRITE_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, VALUE := 100, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_READ_COIL

Lee bobinas de un servidor Modbus.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `PROTO` | Entrada | `USINT` | `0` | Transporte: 0 para RTU, 1 para TCP. |
| `SLAVE_ID` | Entrada | `UINT` | `0` | Identificador de unidad Modbus del servidor. |
| `ADDR` | Entrada | `UINT` | `0` | Primera dirección a leer o escribir. |
| `COUNT` | Entrada | `UINT` | `0` | Cantidad de elementos solicitados. |
| `HOST` | Entrada | `STRING` | `''` | Nombre o dirección del servidor, para TCP. |
| `PORT` | Entrada | `UINT` | `0` | Puerto TCP del servidor. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `VALUE` | Salida | `BOOL` | `FALSE` | La primera bobina leída. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_READ_COIL;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_WRITE_COIL

Escribe bobinas de un servidor Modbus.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `PROTO` | Entrada | `USINT` | `0` | Transporte: 0 para RTU, 1 para TCP. |
| `SLAVE_ID` | Entrada | `UINT` | `0` | Identificador de unidad Modbus del servidor. |
| `ADDR` | Entrada | `UINT` | `0` | Primera dirección a leer o escribir. |
| `COUNT` | Entrada | `UINT` | `0` | Cantidad de elementos solicitados. |
| `VALUE` | Entrada | `BOOL` | `FALSE` | La primera bobina a escribir. |
| `HOST` | Entrada | `STRING` | `''` | Nombre o dirección del servidor, para TCP. |
| `PORT` | Entrada | `UINT` | `0` | Puerto TCP del servidor. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_WRITE_COIL;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, VALUE := TRUE, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

## MQTT

Los ejemplos de estos bloques se ejecutan en el runtime nativo del host, que no tiene servidor Modbus, broker MQTT ni servicio en la nube con quien hablar: cada bloque termina con `ERROR` en TRUE y `STATUS` 3 (sin manejador). Prueban que el bloque compila, se ejecuta e informa su estado; el intercambio con un par se verifica por separado, contra dobles de protocolo.

### MQTT_CONNECT

Informa el estado de la sesión MQTT que abre la configuración del dispositivo; no abre la sesión por sí mismo.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Habilitación: el bloque informa su estado en cada ciclo mientras es TRUE; FALSE borra BUSY, DONE y ERROR. |
| `PROFILE` | Entrada | `USINT` | `0` | Selector del perfil de conexión. La sesión es la que define la configuración del dispositivo; este pin no la cambia. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE mientras el primer intento de conexión está en curso. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE mientras la sesión con el broker está activa. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE mientras no se puede alcanzar el estado (la sesión está caída o el servicio no está disponible); STATUS dice por qué. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `CONNECTED` | Salida | `BOOL` | `FALSE` | TRUE mientras la sesión con el broker está abierta. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_CONNECT;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROFILE := 0);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MQTT_PUBLISH

Publica un mensaje en un tema.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `QOS` | Entrada | `USINT` | `0` | Calidad de servicio: 0, 1 o 2. |
| `RETAIN` | Entrada | `BOOL` | `FALSE` | Pide al broker que retenga el mensaje. |
| `TOPIC` | Entrada | `STRING` | `''` | Tema donde se publica. |
| `PAYLOAD` | Entrada | `STRING` | `''` | Mensaje a publicar. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_PUBLISH;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, QOS := 0, RETAIN := FALSE, TOPIC := 'plant/a', PAYLOAD := '1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MQTT_SUBSCRIBE

Se suscribe a un tema y entrega sus mensajes.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Habilitación: el bloque informa su estado en cada ciclo mientras es TRUE; FALSE borra BUSY, DONE y ERROR. |
| `QOS` | Entrada | `USINT` | `0` | Calidad de servicio: 0, 1 o 2. |
| `TOPIC` | Entrada | `STRING` | `''` | Tema al que se suscribe. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE hasta que el broker confirmó la suscripción. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE mientras la suscripción se mantiene. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE mientras no se puede alcanzar el estado (la sesión está caída o el servicio no está disponible); STATUS dice por qué. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `VALID` | Salida | `BOOL` | `FALSE` | TRUE durante un ciclo cuando llegó un mensaje desde el ciclo anterior; PAYLOAD lo contiene. |
| `PAYLOAD` | Salida | `STRING` | `''` | El último mensaje recibido. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_SUBSCRIBE;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, QOS := 0, TOPIC := 'plant/cmd');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

## Nube y Sparkplug B

Los ejemplos de estos bloques se ejecutan en el runtime nativo del host, que no tiene servidor Modbus, broker MQTT ni servicio en la nube con quien hablar: cada bloque termina con `ERROR` en TRUE y `STATUS` 3 (sin manejador). Prueban que el bloque compila, se ejecuta e informa su estado; el intercambio con un par se verifica por separado, contra dobles de protocolo.

### AZURE_C2D_RECV

Recibe un mensaje de la nube al dispositivo de Azure IoT Hub.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Habilitación: el bloque informa su estado en cada ciclo mientras es TRUE; FALSE borra BUSY, DONE y ERROR. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE mientras se establece la sesión con el hub. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE mientras la sesión está activa y pueden llegar mensajes de la nube al dispositivo. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE mientras no se puede alcanzar el estado (la sesión está caída o el servicio no está disponible); STATUS dice por qué. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `PAYLOAD` | Salida | `STRING` | `''` | El mensaje de la nube al dispositivo recibido. |
| `VALID` | Salida | `BOOL` | `FALSE` | TRUE durante un ciclo cuando llegó un mensaje desde el ciclo anterior; PAYLOAD lo contiene. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_C2D_RECV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AZURE_DPS_PROV

Registra el dispositivo en el servicio de aprovisionamiento de dispositivos de Azure.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `DEVICE_ID` | Entrada | `STRING` | `''` | Identificador de registro del dispositivo; cuando no está vacío es el que se usa en esta solicitud. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `ASSIGNED_HUB` | Salida | `STRING` | `''` | El hub que asignó el servicio. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_DPS_PROV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, DEVICE_ID := 'device-1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AZURE_EG_PUB

Publica un evento en un tema de Azure Event Grid.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `TOPIC` | Entrada | `STRING` | `''` | Tema de Event Grid donde se publica. |
| `EVENT_TYPE` | Entrada | `STRING` | `''` | Tipo del evento. |
| `PAYLOAD` | Entrada | `STRING` | `''` | Cuerpo del evento. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_EG_PUB;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, TOPIC := 'plant', EVENT_TYPE := 'alarm', PAYLOAD := '1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AWS_FLEET_PROV

Aprovisiona el dispositivo mediante el aprovisionamiento de flota de AWS IoT.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `TEMPLATE_NAME` | Entrada | `STRING` | `''` | Nombre de la plantilla de aprovisionamiento de flota; cuando no está vacío es el que se usa en esta solicitud. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |
| `THING_NAME` | Salida | `STRING` | `''` | El nombre del objeto que creó el servicio. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AWS_FLEET_PROV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, TEMPLATE_NAME := 'plant');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### SPB_REBIRTH

Pide a la sesión Sparkplug B que publique de nuevo sus certificados de nacimiento.

| Pin | Dirección | Tipo | Inicial | Descripción |
| --- | --- | --- | --- | --- |
| `EN` | Entrada | `BOOL` | `FALSE` | Un flanco ascendente inicia una solicitud. Mientras EN sigue en TRUE el resultado se mantiene y nada se repite; EN en FALSE borra DONE y ERROR. |
| `BUSY` | Salida | `BOOL` | `FALSE` | TRUE desde el flanco ascendente hasta que la solicitud termina; una solicitud en curso se completa aunque EN baje. |
| `DONE` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud terminó sin error; se mantiene mientras EN sigue en TRUE. |
| `ERROR` | Salida | `BOOL` | `FALSE` | TRUE cuando la solicitud falló; STATUS dice por qué; se mantiene mientras EN sigue en TRUE. |
| `STATUS` | Salida | `DINT` | `0` | Código de estado de la última solicitud: 0 correcto, 1 ocupado, 2 tiempo agotado, 3 sin manejador, 4 sin conexión, 5 cola llena, 6 dirección inválida, 7 desborde de cadena, 8 error de protocolo, 9 autenticación fallida, 10 servicio no disponible en este runtime. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : SPB_REBIRTH;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Resultado tras 3 scans de 10 ms: `Failed` = `TRUE`, `Code` = `3`.

{/* <<< END GENERATED: reference/function-blocks <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
