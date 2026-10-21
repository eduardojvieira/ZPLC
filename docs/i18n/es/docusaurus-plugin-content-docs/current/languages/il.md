---
sidebar_position: 2
---

# Lista de instrucciones (IL)

La lista de instrucciones (IL) es un lenguaje textual de bajo nivel de IEC 61131-3 en ZPLC. Usa un modelo de acumulador implícito y sigue la ruta de parser/transpilador IL del repositorio.

Qué funciona hoy de la lista de instrucciones, leído de las pruebas de conformidad ejecutadas, está en la [referencia de lista de instrucciones](../reference/language-il.md) generada.

## Ruta de compilación

La aplicación ZPLC analiza IL y lo transpila a texto estructurado (ST); después envía ese ST generado al compilador para producir bytecode `.zplc`.

```mermaid
flowchart LR
  IL[Fuente IL] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[Compilador ZPLC]
  Compile --> ZPLC[.zplc]
```

Es un flujo de fuente a ST generado. Valide el resultado generado, los diagnósticos y el perfil de capacidades de destino; no establece una conversión de ida y vuelta arbitraria entre IL y ST ni cobertura de funciones idéntica a ST.

Un diagnóstico de un archivo IL nombra la línea IL de la que trata (`element: "line:12"`), también cuando el compilador lo encuentra en el texto estructurado generado, y cada línea que no se traduce es un diagnóstico propio. El mapa de depuración de un archivo IL indica líneas IL, de modo que un punto de parada se pone en la línea IL y el programa detenido se muestra en ella (LNG-004); las líneas del código generado que no corresponden a ninguna línea IL no son lugares donde detenerse.

## Límites de runtime y depuración

IL usa el destino común del compilador, pero el costo de ejecución, la disponibilidad de la biblioteca estándar, los pasos, las observaciones, los puntos de parada y el comportamiento de hardware dependen del runtime y perfil activos. La simulación POSIX es evidencia lógica del equipo anfitrión únicamente. Use evidencia en la placa o HIL para afirmar comportamiento de un dispositivo físico.

## Ejemplo: temporización en IL

Este ejemplo evalúa `Start`, llama a `TON` y escribe un indicador de salida:

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

Después de 250 ms de ciclos la salida en `%Q0.0` es `TRUE`: CI ejecuta este ejemplo durante 30 ciclos
de 10 ms y comprueba `%QX0.0`.

## Páginas relacionadas

- [Generalidades de lenguajes](./index.md)
- [Texto estructurado (ST)](./st.md)
- [Biblioteca estándar](./stdlib.md)
- [Suites y ejemplos de lenguajes](./examples/v1-5-language-suite.md)
