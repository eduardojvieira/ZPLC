---
sidebar_position: 2
---

# Lista de instrucciones (IL)

Instruction List (IL) es un flujo textual de bajo nivel con estilo IEC 61131-3 en ZPLC. Usa un modelo de acumulador implícito y sigue la ruta de parser/transpilador IL del repositorio.

## Ruta de compilación

El IDE parsea IL y lo transpila a Structured Text (ST); después envía ese ST generado al compilador para producir bytecode `.zplc`.

```mermaid
flowchart LR
  IL[Fuente IL] --> Parse[parseIL]
  Parse --> ToST[transpileILToST]
  ToST --> Compile[Compilador ZPLC]
  Compile --> ZPLC[.zplc]
```

Es un flujo de fuente a ST generado. Validá el resultado generado, los diagnósticos y el perfil de capacidades de destino; no establece un round trip arbitrario IL/ST ni cobertura de funciones idéntica a ST.

## Límites de runtime y depuración

IL usa el destino común del compilador, pero el costo de ejecución, la disponibilidad de la biblioteca estándar, los pasos, watches, breakpoints y el comportamiento de hardware dependen del runtime y perfil activos. La simulación POSIX es evidencia lógica de host únicamente. Usá evidencia target o HIL para afirmar comportamiento de un dispositivo físico.

## Ejemplo: temporización en IL

Este ejemplo evalúa `Start`, llama a `TON` y escribe una bandera de salida:

```iecst
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

## Páginas relacionadas

- [Generalidades de lenguajes](./index.md)
- [Structured Text (ST)](./st.md)
- [Biblioteca estándar](./stdlib.md)
- [Suites y ejemplos de lenguajes](./examples/v1-5-language-suite.md)
