---
slug: /development/screen-reader-check
title: Verificación con lector de pantalla
sidebar_label: Verificación con lector de pantalla
description: El guion manual para comprobar el camino principal de ZPLC Studio con NVDA, Narrator y VoiceOver antes de una versión, con lo que hay que escuchar y una tabla para registrar el resultado. Ningún agente lo ha ejecutado.
---

# Verificación con lector de pantalla

Este es el guion del requisito UX-028: antes de la disponibilidad general, una
persona comprueba el camino principal de Studio con un lector de pantalla en
Windows y en macOS, y registra el resultado.

:::warning Una verificación manual que ningún agente ha ejecutado
Esta página es un guion para una persona con un lector de pantalla. Se escribió a
partir del código fuente de Studio y **nadie la ha ejecutado todavía**: no se inició
ningún lector de pantalla para escribirla, de modo que las frases de «Qué escuchar»
son lo que el código está hecho para decir, no algo que alguien haya oído. Mientras
una persona no complete la tabla de resultados y la conserve con la lista de control
de la versión, el camino principal no tiene evidencia con lector de pantalla. No lo
declare verificado.
:::

## Qué necesita

| | Windows | macOS |
| --- | --- | --- |
| Lector de pantalla | NVDA (versión actual) y Narrator | VoiceOver |
| Iniciar y detener | NVDA: Ctrl+Alt+N. Narrator: Win+Ctrl+Intro | Cmd+F5 |
| Studio | La compilación del instalador que se evalúa, no el servidor de desarrollo | La compilación del instalador que se evalúa |
| Proyecto | El ejemplo **Blinky** copiado a una carpeta vacía | El mismo |
| Dispositivo | Ninguno: use **Simular**. Esta verificación no necesita una placa | Ninguno |

Use el mismo ejemplo y los mismos pasos en ambos sistemas. Hágalo una vez por cada
lector de pantalla: NVDA y Narrator en Windows, VoiceOver en macOS. Cierre las demás
aplicaciones que hablen o reproduzcan sonido.

## Cómo habla Studio

Studio tiene dos regiones dinámicas, montadas una sola vez para la ventana y
presentes antes del primer mensaje (`packages/zplc-ide/src/ui/LiveRegions.tsx`):

- una región de estado **cortés** (polite), para resultados: una compilación
  terminada, una conexión, ejecutar y detener, una variable forzada o liberada, una
  lección restaurada;
- una región de alerta **asertiva** (assertive), para fallos: una compilación o una
  carga que falló, y un forzado que ya no está confirmado.

Los mensajes provienen de `announce()` en `packages/zplc-ide/src/utils/announce.ts` y
del almacén de notificaciones, que dice el título y el detalle de cada notificación,
de forma asertiva cuando es un error. Si llegan dos mensajes de la misma urgencia
antes de que se lea el primero, gana el último; si nota que se perdió un mensaje,
anote cuáles dos y cuándo. Esa es la evidencia que decide si hace falta una cola.

Todo diálogo debe llevar el foco a su interior al abrirse, mantenerlo dentro mientras
está abierto y devolverlo al control que lo abrió al cerrarse. Compruébelo en cada
diálogo de abajo.

## El guion

En cada paso, haga la acción, escuche y anote en la tabla lo que oyó y si coincide.
Un paso se aprueba solo cuando una persona que no ve la pantalla habría podido
hacerlo y conocer su resultado.

### 1. Abrir

1. Inicie Studio. Escuche el título de la ventana y dónde cae el foco.
2. Recorra la pantalla de bienvenida con Tab. Cada botón (**Abrir proyecto**,
   **Nuevo proyecto**, **Aprender**, un ejemplo) debe anunciarse con su nombre y su rol.
3. Active **Ejemplos**, **Blinky** y elija una carpeta vacía.

Qué escuchar: el nombre de cada control al llegar a él, nunca solo «botón» ni «sin
etiqueta». Cuando el proyecto se abre, el foco queda dentro del entorno de trabajo.

### 2. Editar

1. Abra el archivo del programa desde el árbol de archivos. Escuche el nombre del
   archivo y que es un editor.
2. Cambie un número en el código y guarde con Ctrl+S (Cmd+S en macOS).

Qué escuchar: el editor anunciado como un área de texto donde se puede escribir, y la
pestaña como seleccionada. Studio no anuncia un guardado simple; anote cómo pudo
saber que el archivo se guardó, o que no pudo.

### 3. Compilar

1. Ejecute **Compilación**, **Compilar** (Ctrl+B, Cmd+B en macOS).
2. Abra **Problemas** y **Salida** en el panel inferior.

Qué escuchar: el estado cortés «Build succeeded» (o «Build failed» en la región de
alerta si rompió el código a propósito) y, en **Problemas**, cada diagnóstico leído
con su archivo, su línea y su mensaje. Los mensajes citados son los de la
interfaz en inglés; en la interfaz en español se oyen sus equivalentes, por ejemplo
«Compilación correcta».

### 4. Simular

1. En la barra de herramientas elija **Simular** y pulse **Conectar**.
2. Pulse **Ejecutar** (F5).

Qué escuchar: «Simulator ready» y luego «Execution started» («Simulador listo» y
«Ejecución iniciada» en español). Ambos vienen de los mensajes de la barra de
herramientas y son corteses. Escuche que el estado de la barra de estado cambia a en
ejecución.

### 5. Observar

1. Abra **Observación**, pulse **+** y escriba `LED_Output`.
2. Espere unos segundos.

Qué escuchar: la fila nueva anunciada con su nombre y su valor, y el valor que cambia
entre TRUE y FALSE. La tabla no anuncia por sí sola cada cambio; vaya a la fila y
léala dos veces con un segundo de diferencia. Anote si puede saber que el valor
cambia.

### 6. Forzar

1. En **Observación**, marque **Forzar** en `LED_Output` y fije un valor.
2. Libérelo. Después fuércelo otra vez y use el comando para liberar todos.

Qué escuchar: «Forzado LED_Output», luego «Se liberó el forzado de LED_Output» y, si
se liberan varios a la vez, «Se liberaron todos los forzados». Si se pierde la
conexión mientras hay un forzado activo, la región de alerta dice «Un forzado no está
confirmado: verifique y vuelva a conectar antes de operar». Solo puede llegar a ese
último mensaje deteniendo el simulador con un forzado activo; hágalo una vez.

### 7. Diálogo de carga

El diálogo de carga se muestra para un dispositivo, no para el simulador. Sin una
placa no puede abrirse, de modo que este paso queda **no ejecutado** en una
verificación en un banco sin hardware. Anótelo y no lo marque como aprobado. Si una
persona conectó una placa en el banco:

1. Elija **Cargar**.
2. Escuche el título «¿Cargar en el dispositivo?», la descripción (dice que la carga
   deja el PLC detenido y que Ejecutar es una acción aparte) y la tabla de
   comparación con su título y sus encabezados de columna.
3. Cierre el diálogo con Escape.

Qué escuchar: el foco pasa al diálogo al abrirse, se queda dentro con Tab y vuelve al
botón **Cargar** al cerrarse.

### 8. Una lección de Aprender

1. En la pantalla de bienvenida elija **Aprender** y luego **Iniciar** en la primera
   lección.
2. Lea la lección, haga la edición que pide y ejecute la comprobación.
3. Use una vez la acción de restablecer.

Qué escuchar: el panel de la lección leído en orden, el resultado de la comprobación
y, tras restablecer, el mensaje «Se restauró el proyecto inicial.». Escuche el
equivalente en texto de cualquier imagen de la planta: un cambio de situación debe
decirse, no solo mostrarse.

## Resultados

Copie esta tabla en la lista de control de la versión, una fila por lector de
pantalla y por paso. Escriba con sus propias palabras lo que oyó. Marque un paso como
**Aprobado**, **Fallido** o **No ejecutado**, y explique por qué en los dos últimos.

| Fecha | Persona | Lector de pantalla y versión | Sistema | Versión de Studio | Paso | Lo que oyó | Foco correcto | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | 1 Abrir | | | | |
| | | | | | 2 Editar | | | | |
| | | | | | 3 Compilar | | | | |
| | | | | | 4 Simular | | | | |
| | | | | | 5 Observar | | | | |
| | | | | | 6 Forzar | | | | |
| | | | | | 7 Diálogo de carga | | | | |
| | | | | | 8 Lección de Aprender | | | | |

Un paso fallido es un defecto: regístrelo con el número del paso, lo que oyó y lo que
esperaba. La versión no declara compatibilidad con lectores de pantalla hasta que
todas las filas de ambos sistemas sean **Aprobado**, o una fila **No ejecutado** se
explique en las notas de la versión.

## Vea también

- [Referencia del teclado para los editores visuales](../reference/visual-editor-keyboard.md)
- [Banco de trabajo de Studio](../ide/features.md)
- [Hardware en el lazo](./hardware-in-the-loop.md)
