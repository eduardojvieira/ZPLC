---
slug: /tutorials/blink-without-hardware
id: blink-without-hardware
title: Blink sin hardware
sidebar_label: Blink sin hardware
description: 'Desde una instalación nueva de ZPLC hasta una salida simulada que conmuta y una prueba de escenario que pasa, sin ninguna placa.'
tags: [tutorial, simulation, structured-text]
---

# Blink sin hardware

En unos diez minutos copiará un programa pequeño en texto estructurado, lo compilará, lo ejecutará en el simulador y
observará una salida que se enciende y se apaga cada medio segundo. Después ejecutará la prueba de escenario que lo
acompaña, romperá el programa a propósito y verá fallar la prueba. No necesita un PLC ni una placa: todo ocurre en su
equipo.

:::note Antes de empezar
Necesita ZPLC instalado. Si todavía no lo hizo, siga primero [Instalar ZPLC](../getting-started/install.md).
:::

## Qué va a hacer

1. Iniciar ZPLC y encontrar el ejemplo.
2. Copiar el ejemplo en una carpeta vacía.
3. Leer el programa.
4. Compilarlo.
5. Conectarse al simulador y ejecutar el programa.
6. Observar cómo cambia la salida `LED_Output`.
7. Ejecutar la prueba de escenario del proyecto.

## 1. Inicie ZPLC

Abra ZPLC. La pantalla de bienvenida ofrece **Abrir proyecto**, **Nuevo proyecto** y **Aprender**, y bajo **Ejemplos** una
lista de proyectos de ejemplo agrupados por lo que enseñan. **Blinky (texto estructurado)** está en el grupo **Recorrido
por los lenguajes**.

![La pantalla de bienvenida de ZPLC, desplazada hasta el grupo Recorrido por los lenguajes, que contiene Blinky (texto estructurado)](/img/tutorials/blink-1-welcome-es.png)

## 2. Copie el ejemplo

1. Bajo **Ejemplos**, en el grupo **Recorrido por los lenguajes**, elija **Blinky (texto estructurado)**.
2. Elija una carpeta vacía como destino. ZPLC copia allí el ejemplo y lo abre. Si ya hay un archivo con el mismo nombre en
   la carpeta, la copia se detiene y no escribe nada.

La carpeta contiene tres cosas: `zplc.json`, el proyecto (su destino, su tarea y su programa); `src/main.st`, el programa;
y `tests/blinky-st.scenario.json`, la prueba de escenario.

![El proyecto Blinky recién copiado: sus objetos en la vista Proyecto](/img/tutorials/blink-copied-es.png)

## 3. Lea el programa

Abra `src/main.st` desde la lista **Archivos** de la vista **Proyecto**. Se abre en el editor.

![El programa Blinky abierto en el editor de ZPLC](/img/tutorials/blink-2-program-es.png)

Sin sus comentarios, el programa es este:

```st runnable expect="LED_Output=TRUE" scans=75 scan_ms=10
PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

BlinkTimer(IN := TRUE, PT := T#500ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE, PT := T#500ms);
END_IF;

LED_Output := LedState;
END_PROGRAM
```

Un temporizador de tipo `TON` cuenta 500 ms mientras su entrada `IN` es TRUE. Cuando termina, `BlinkTimer.Q` es TRUE durante
un ciclo: el programa invierte `LedState` y reinicia el temporizador. `LED_Output` es la variable ubicada en la dirección de
salida `%Q0.0`, y sigue a `LedState`. La verificación de la documentación compila este programa y lo ejecuta con el reloj
virtual del simulador: después de 75 ciclos de 10 ms, 750 ms, `LED_Output` es TRUE.

## 4. Compílelo

1. Abra el menú **Compilación** de la barra de herramientas y elija **Compilar** (Ctrl+B, o Cmd+B en macOS).
2. Mire la pestaña **Salida** del panel inferior. Dice `Espacio de trabajo guardado compilado de forma local`, con el tamaño
   del programa, y una notificación dice **Compilación correcta**. La pestaña **Problemas** no enumera nada.

![La pestaña Salida después de la compilación, con el tamaño del programa y la notificación Compilación correcta](/img/tutorials/blink-3-built-es.png)

Si la compilación falla, **Problemas** enumera cada error con su línea y su columna.

## 5. Ejecútelo en el simulador

1. En la barra de herramientas, compruebe que **Simular** esté seleccionado y pulse **Conectar**. ZPLC inicia el simulador
   que viene con la aplicación.
2. Pulse **Ejecutar** (F5).

La línea de estado muestra **En marcha** y el contador de ciclos sube. El simulador es el runtime de ZPLC construido para su
equipo. Ejecuta su programa con un temporizador, y no modela el lado eléctrico de una placa ni sus tiempos reales.

![La barra de herramientas y la línea de estado con el simulador conectado y el programa en marcha](/img/tutorials/blink-running-es.png)

## 6. Observe cómo cambia la salida

1. Abra la pestaña **Observación**. Si la tabla no tiene ninguna fila, pulse **+** y escriba `LED_Output`.
2. Mire la columna **Valor**. Cambia entre `TRUE` y `FALSE` aproximadamente cada medio segundo.

![La pestaña Observación con LED_Output en TRUE mientras el programa se ejecuta](/img/tutorials/blink-4-output-true-es.png)

![La misma tabla medio segundo después, con LED_Output en FALSE](/img/tutorials/blink-5-output-false-es.png)

Si la tabla queda cortada, arrastre hacia arriba el divisor que está sobre el panel inferior. Pulse **Detener** (Shift+F5)
cuando la haya visto cambiar.

## 7. Ejecute la prueba de escenario

Un escenario es un guion corto que fija entradas, deja correr el programa durante un tiempo definido y verifica las salidas.
Este no fija ninguna entrada: comprueba que la salida esté apagada durante los primeros 490 ms, encendida hasta los 1000 ms,
apagada otra vez, y así durante 2,1 segundos de tiempo simulado. El [formato del archivo de escenario](../reference/scenario-file.md)
enumera cada campo.

1. Abra la pestaña **Pruebas**. ZPLC vincula por sí mismo el `zplc.json` del proyecto abierto.
2. Pulse **Ejecutar escenarios en el host**.

La pestaña dice **Los escenarios POSIX del equipo pasaron.** y `1 escenario superado.` La prueba ejecutó su programa guardado
en el simulador, sin interfaz y con un reloj virtual, así que tarda un momento y no espera 2,1 segundos.

![La pestaña Pruebas informando que los escenarios POSIX del equipo pasaron](/img/tutorials/blink-6-scenario-es.png)

Puede ejecutar la misma prueba sin la aplicación, desde una terminal en la raíz de una copia del repositorio, una vez que
`bun run setup` haya construido el runtime:

```bash
bun run simulate packages/zplc-ide/projects/blinky_st
```

## Cambie el programa y vea fallar la prueba

Edite `src/main.st`: cambie los dos `T#500ms` por `T#250ms`, guarde y compile de nuevo. La salida ahora conmuta el doble de
seguido. La verificación de la documentación también ejecuta esta versión: después de 30 ciclos, 300 ms, la salida ya es
TRUE.

```st runnable expect="LED_Output=TRUE" scans=30 scan_ms=10
PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

BlinkTimer(IN := TRUE, PT := T#250ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE, PT := T#250ms);
END_IF;

LED_Output := LedState;
END_PROGRAM
```

Ejecute el escenario de nuevo. Ahora falla, con **Fallaron una o más aserciones de escenarios.**, porque el escenario todavía
espera que la salida esté apagada a los 250 ms. Para eso sirve un escenario: dice qué debe hacer el programa y avisa cuando
un cambio lo rompe. Devuelva los tiempos a `T#500ms`, o edite el escenario, y vuelve a pasar.

## Qué demuestra esto y qué no

| Afirmación                                                          | Evidencia                                                                                                                                            | Nivel                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| El programa compila, se ejecuta en el simulador y su salida conmuta | La verificación de la documentación ejecuta el código de esta página                                                                                 | Host                                                                                                   |
| Los siete pasos funcionan en la aplicación real                     | El recorrido de extremo a extremo `Blink without hardware (the tutorial)` de `bun run test:journeys` los realiza, y toma las capturas de esta página | Host                                                                                                   |
| El escenario pasa y falla como se describe                          | ZPLC ejecuta `tests/blinky-st.scenario.json` con el reloj virtual del simulador                                                                      | Host                                                                                                   |
| Cualquier cosa sobre una placa                                      | Nada en esta página                                                                                                                                  | Aún no verificado en hardware: vea [Compatibilidad de hardware](../reference/capabilities-evidence.md) |

Un resultado aprobado aquí es un resultado de host con el reloj virtual del simulador.

## Siguientes pasos

- [Su primera placa](./first-board.md): el mismo programa en una Raspberry Pi Pico o una ESP32-S3.
- [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md): escriba un escenario propio.
- [La aplicación ZPLC](../ide/index.md): los editores, la tabla Observación, los forzados y los puntos de interrupción.
- [Aprender](../learn/index.md): lecciones que califican su programa contra un escenario.
- [Seguridad y limitaciones](../safety-and-limitations.md): antes de confiar en ZPLC para algo real.
