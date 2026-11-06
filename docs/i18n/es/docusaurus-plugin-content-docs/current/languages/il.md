---
sidebar_position: 2
---

# Lista de instrucciones (IL)

La lista de instrucciones es un lenguaje textual de bajo nivel: una operación por línea, sobre un acumulador implícito. Úsela cuando mantenga lógica IL existente o quiera leer un programa como una secuencia plana de operaciones. Para lógica nueva, el texto estructurado es un mejor punto de partida. Qué funciona, operador por operador, y los casos ejecutados que lo respaldan, está en la [referencia generada de la lista de instrucciones](../reference/language-il.md).

## Cómo llega IL al compilador

ZPLC analiza el código fuente IL y lo traduce a texto estructurado; después compila ese texto a bytecode `.zplc`. Los tipos de datos, las funciones y los bloques de función son, por tanto, los del [texto estructurado](./st.md).

```mermaid
flowchart LR
  IL[Fuente IL] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[Compilador ZPLC]
  Compile --> ZPLC[.zplc]
```

La traducción es de un solo sentido. No ofrece un viaje de ida y vuelta entre IL y ST ni la misma cobertura de funciones que el texto estructurado, así que revise los diagnósticos y el perfil de capacidades del destino para su propio programa.

## Escribir un programa

Un programa declara sus variables y después lista instrucciones. El acumulador, llamado resultado actual, tiene tipo: un `REAL` sigue siendo un `REAL` y un `BOOL` sigue siendo un `BOOL`.

- **Carga y almacenamiento.** `LD` y `LDN` cargan un valor, o su negación, en el acumulador. `ST` y `STN` lo almacenan, o almacenan su negación, en una variable. `S` y `R` activan y desactivan una variable `BOOL`.
- **Operadores.** Los operadores aritméticos, lógicos, de comparación y de desplazamiento actúan sobre el acumulador en su lugar. `NOT` y `NEG` lo modifican. Una operación entre paréntesis, como `AND( ... )`, evalúa primero sus instrucciones internas.
- **Saltos y etiquetas.** `JMP`, `JMPC` y `JMPCN` saltan a una etiqueta, siempre o cuando el acumulador es verdadero o falso.
- **Llamadas y retornos.** `CAL`, `CALC` y `CALCN` llaman a un bloque de función con parámetros con nombre, siempre o según una condición. `RET`, `RETC` y `RETCN` regresan del programa.

Este programa evalúa `Start`, llama a un temporizador `TON` y escribe la salida en `%Q0.0`:

```iecst runnable language=il expect="%QX0.0=TRUE" scans=30 scan_ms=10
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR

    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
```

Después de 250 ms de ciclos, la salida en `%Q0.0` es `TRUE`. La integración continua ejecuta el ejemplo durante 30 ciclos de 10 ms y comprueba `%QX0.0`.

## Diagnósticos y puntos de parada

Un diagnóstico de un archivo IL nombra la línea IL a la que se refiere (`element: "line:12"`), también cuando el compilador encuentra el problema en el texto estructurado generado, y cada línea que no se traduce es un diagnóstico propio. Un mnemónico desconocido se rechaza con un mensaje que nombra su línea.

El mapa de depuración de un archivo IL indica líneas IL, así que usted pone un punto de parada en la línea IL, en el margen del editor, y el programa detenido se muestra en esa línea. Las líneas del código generado que no corresponden a ninguna línea IL no son lugares donde detenerse.

## Límites

IL comparte el destino del compilador con todos los lenguajes, pero el costo de ejecución, la disponibilidad de los bloques de la biblioteca, y el avance paso a paso, las observaciones, los puntos de parada y el comportamiento en una placa dependen del entorno de ejecución y de su perfil de capacidades. La simulación nativa es solo evidencia de host; una afirmación sobre un dispositivo físico necesita una ejecución en el destino o con hardware en el lazo.

## Páginas relacionadas

- [Generalidades de los lenguajes](./index.md)
- [Texto estructurado](./st.md)
- [Biblioteca estándar](../runtime/stdlib.md)
