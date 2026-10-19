---
slug: /tutorials/blink-without-hardware
id: blink-without-hardware
title: Blink sin hardware
sidebar_label: Blink sin hardware
description: "Desde un Studio descargado hasta una salida simulada que conmuta y una prueba de escenario que pasa, sin ninguna placa."
tags: [tutorial, simulation, structured-text]
---

# Blink sin hardware

En este tutorial copia un programa pequeño en Structured Text, lo compila, lo
ejecuta en el simulador y observa una salida que se enciende y se apaga cada medio
segundo. Después ejecuta la prueba de escenario que lo acompaña. No necesita un PLC
ni una placa: todo ocurre en su equipo.

:::note Antes de empezar
Necesita ZPLC Studio. Si todavía no lo instaló, siga primero
[Instalar ZPLC Studio](../getting-started/install.md). Este tutorial se escribió
para la versión preliminar 2.0.
:::

## Qué va a hacer

1. Iniciar Studio y mirar la pantalla de bienvenida.
2. Copiar el ejemplo **Blinky (Structured Text)** en una carpeta vacía.
3. Leer el programa.
4. Compilarlo.
5. Conectarse al simulador y ejecutar el programa.
6. Observar cómo cambia la salida `LED_Output`.
7. Ejecutar la prueba de escenario del proyecto.

## 1. Inicie Studio

Abra ZPLC Studio. La pantalla de bienvenida ofrece **Abrir proyecto**, **Nuevo proyecto**
y **Aprender**, y bajo **Ejemplos** una lista de proyectos de ejemplo, agrupados por lo
que enseñan.

![La pantalla de bienvenida de ZPLC Studio, desplazada hasta el grupo Language tour, que contiene Blinky (Structured Text)](/img/tutorials/blink-1-welcome.png)

## 2. Copie el ejemplo

1. Bajo **Ejemplos**, en el grupo **Recorrido por los lenguajes**, elija **Blinky (Structured Text)**.
2. Elija una carpeta vacía como destino. Studio copia el ejemplo allí y lo abre. Si
   ya hay un archivo con el mismo nombre en la carpeta, la copia se detiene y no
   escribe nada.

La carpeta contiene tres cosas: `zplc.json`, el proyecto (su destino, su tarea y su
programa), `src/main.st`, el programa, y `tests/blinky-st.scenario.json`, la prueba
de escenario.

## 3. Lea el programa

Abra `src/main.st` desde el árbol del proyecto, en la pestaña **Explorer** del panel
inferior. Se abre en el editor:

![El programa Blinky abierto en el editor de Studio](/img/tutorials/blink-2-program.png)

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

Un temporizador de tipo `TON` cuenta 500 ms mientras su entrada `IN` es TRUE. Cuando
termina, `BlinkTimer.Q` es TRUE durante un ciclo: el programa invierte `LedState` y
reinicia el temporizador. `LED_Output` es la variable ubicada en la dirección de
salida `%Q0.0`, y sigue a `LedState`. La verificación de la documentación compila
este programa y lo ejecuta con el reloj virtual del simulador: después de 75 ciclos
de 10 ms, 750 ms, `LED_Output` es TRUE.

## 4. Compílelo

1. Abra el menú **Compilación** de la barra de herramientas y elija **Compilar** (Ctrl+B, o Cmd+B en macOS).
2. Abra la pestaña **Salida**. Dice `Built saved workspace locally`, con el tamaño
   del programa. La pestaña **Problemas** dice `0 errors`.

![La pestaña Output después de la compilación, con el tamaño del programa y la notificación Build succeeded](/img/tutorials/blink-3-built.png)

Si la compilación falla, **Problemas** enumera cada error con su línea y su columna.

## 5. Ejecútelo en el simulador

1. En la barra de herramientas, compruebe que **Simular** esté seleccionado y
   presione **Conectar**. Studio inicia el simulador que viene con la aplicación.
2. Presione **Ejecutar** (F5).

La línea de estado muestra **En marcha** y el contador de ciclos sube. El simulador es
el runtime de ZPLC construido para su equipo. Ejecuta su programa con un
temporizador. No modela el lado eléctrico de una placa ni sus tiempos reales.

## 6. Observe cómo cambia la salida

1. Abra la pestaña **Observación**. Si la tabla no tiene ninguna fila, presione **+** e
   ingrese `LED_Output`.
2. Mire la columna **Value**. Cambia entre `TRUE` y `FALSE` aproximadamente cada
   medio segundo.

![La pestaña Watch con LED_Output en TRUE mientras el programa se ejecuta](/img/tutorials/blink-4-output-true.png)

![La misma tabla medio segundo después, con LED_Output en FALSE](/img/tutorials/blink-5-output-false.png)

Si la tabla Watch queda cortada, arrastre hacia arriba el divisor que está sobre el
panel inferior.

Presione **Detener** (Shift+F5) cuando la haya visto cambiar.

## 7. Ejecute la prueba de escenario

Un escenario es un guion corto que fija entradas, deja correr el programa durante
un tiempo definido y verifica las salidas. Este no fija ninguna entrada: comprueba
que la salida esté apagada durante los primeros 490 ms, encendida hasta los 1000 ms,
apagada otra vez, y así durante 2,1 segundos de tiempo simulado. El
[formato del archivo de escenario](../reference/scenario-file.md) enumera cada
campo, y su ejemplo es el escenario de este proyecto.

1. Abra la pestaña **Pruebas**. Studio vincula por sí mismo el `zplc.json` del proyecto abierto.
2. Presione **Ejecutar escenarios en el host**.

La pestaña dice **Host POSIX scenarios passed.** y `1 scenario passed.` Esto ejecutó
su programa guardado en el simulador, sin interfaz y con un reloj virtual, así que
tarda un momento y no espera 2,1 segundos.

![La pestaña Tests informando Host POSIX scenarios passed](/img/tutorials/blink-6-scenario.png)

Puede ejecutar la misma prueba sin Studio, desde una terminal en la raíz de una copia
del repositorio, una vez que `bun run setup` haya construido el runtime:

```bash
bun run simulate packages/zplc-ide/projects/blinky_st
```

## Cambie el programa y vea fallar la prueba

Edite `src/main.st`: cambie los dos `T#500ms` por `T#250ms`, guarde y compile de
nuevo. La salida ahora conmuta el doble de seguido. La verificación de la
documentación también ejecuta esta versión: después de 30 ciclos, 300 ms, la salida
ya es TRUE.

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

Ejecute el escenario de nuevo. Ahora falla, con **One or more scenario assertions
failed.**, porque el escenario todavía espera que la salida esté apagada a los
250 ms. Para eso sirve un escenario: dice qué debe hacer el programa y avisa cuando
un cambio lo rompe. Devuelva los tiempos a `T#500ms`, o edite el escenario, y vuelve
a pasar.

## Qué demuestra esto y qué no

| Afirmación | Evidencia | Nivel |
| --- | --- | --- |
| El programa compila, se ejecuta en el simulador y su salida conmuta | La verificación de la documentación ejecuta el código de la página | Host |
| Los siete pasos funcionan en la aplicación real | El recorrido de extremo a extremo `Blink without hardware (the tutorial)` de `bun run test:journeys` los realiza, de modo que esta página no puede separarse del producto | Host |
| El escenario pasa y falla como se describe | Studio ejecuta `tests/blinky-visual.scenario.json` con el reloj virtual del simulador | Host |
| Cualquier cosa sobre una placa | Nada en esta página | Aún no verificado en hardware: vea [Soporte de hardware](../reference/capabilities-evidence.md) |

Un resultado aprobado aquí es un resultado de host con el reloj virtual del simulador.

## Siguientes pasos

- [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md): escriba un escenario propio.
- [Banco de trabajo de Studio](../ide/features.md): los editores, la tabla Watch, los forzados y los puntos de interrupción.
- [Referencia de Structured Text](../reference/language-st.md): qué admite hoy el lenguaje.
- [Aprender](../learn/index.md): lecciones que califican su programa contra un escenario.
- [Seguridad y limitaciones](../safety-and-limitations.md): antes de confiar en ZPLC para algo real.
