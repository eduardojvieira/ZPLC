---
title: Referencias y Modelos (Suite V1.5)
sidebar_label: Ejemplos Canónicos V1.5
description: Suite principal abarcando códigos demostrativos puramente lógicos compatibles entre modelos de Lenguajes ZPLC.
---

# Ejemplos y Pruebas Iniciales (Language Suite ZPLC)

Este módulo sirve como referencia pura, otorgando lógicas ejemplificadoras y estandarizadas demostrando el grado de soporte íntegro o interoperabilidad asegurada bajo IEC 61131-3 de ZPLC en sus cinco idiomas normados `ST`, `IL`, `LD`, `FBD`, y `SFC`.

## Propósito Algorítmico Integral Compartido

Absolutamente todo script en esta Suite concreta fielmente de manera equitativa la idéntica tarea o finalidad mecánica final:
1. El inicio contiguo activando un indicador (Condición booleana local `Start`).
2. Lanzamiento o anidación con un Retraso a Conexión de bloque temporizador (`TON` - Timer On Delay) prefijado por espacio de `250` mili-segundos justos iterativos.
3. Volcamiento del pin final afirmativo (`Timer.Q`) del relé atado o linkeado a una variable salida periférica designada por etiqueta remota global a pines I/O (%Q0.0). (`Out1`).

La meta pura de diseño en ZPLC se cumple: no importa qué método u hoja se apropie usted durante labores industriales; la generación subyacente hacia el kernel binario `.zplc` funcionará impolutamente y mantendrá su estado depurativo local al igual sobre conexiones serie por USB RTOS.

---

## 1. Texto Estructurado (Structured Text - ST)

Mecánica estructurizada, un esquema pulcro en asignaciones procedurales llamando temporización y asignando derivables intrínsecos.

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR

Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

---

## 2. Lista de Instrucción (Instruction List - IL)

Secuencia por sentenciado bajo nivel apilando en búfer interino: llamando con CAL e iniciando las direcciones lógicas hasta escribir salida final en el socket direccionado de Out1 como %Q0.0 del hardware exterior integrado por base:

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

---

## 3. Diagrama Escalera o Contactos (Ladder Diagram - LD)

Desarrollo virtual asincrónico por modelado: Al diagramarlo en la matriz base creas un rung interactivo y conectivo simple mediante flujos visuales horizontales continuos. 
Modelo de paradigma visual inyección: 
`Contacto Creado Start (Normal Abierto)` -> Hilo virtual energizado -> `Caja de Bloque Timer (TON Parametrizado: 250ms PT)` -> Transición Q a final `Bobina Final (Out1 Coil)`.

La transpilación visual base ZPLC fuerza al sistema hacia los mismos caminos binarios nativos del ejemplo puro ST al cruzar al núcleo, garantizando control impecable.

---

## 4. Diagrama de Bloques (Function Block Diagram - FBD)

Modelado topológico por fuentes hacia ruteos gráficos por cajetín. Asientas visualizadamente su entorno FBD de trabajo y sueltas una caja pura `TON`.
Del lado izquierdo (IN), anclas un switch o conexión Boolean variable virtualizada `Start`. Asignar constante gráfica Time de `T#250ms` hacia parámetro PT (Preset). 
Finalmente por derecha de salida Q tender un flujo/cable rojo en trazo hacia la caja o bloque periférico de variables llamado `Out1`. 

---

## 5. Diagrama de Flujo (Sequential Function Chart - SFC)

Anidación por estado finito superior operando lógica algorítmica y encapsulada bajo bloque:
1. Máquina principal que se enlaza bajo Estado 1 Cíclico Incial (`Initial Step`).
2. Esa "Caja o Step" posee propiedades secundarias `Action body`.
3. El Action rutea lógicamente hacia la programación donde marca finalmente Out1 tras que culmine su conteo lógico al validarlo por 250ms para generar o detonar en Transición la subsiguiente rama.
