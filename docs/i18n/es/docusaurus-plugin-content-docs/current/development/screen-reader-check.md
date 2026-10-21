---
slug: /development/screen-reader-check
title: Verificación con lector de pantalla
sidebar_label: Verificación con lector de pantalla
description: La verificación registrada del camino principal de ZPLC con el teclado y el árbol de accesibilidad de Chromium en Linux, sus resultados en inglés y en español, y el guion para una persona con NVDA, Narrator o VoiceOver. No se ha ejecutado ningún lector de pantalla.
---

# Verificación con lector de pantalla

Esta página registra la verificación del camino principal de ZPLC para los
requisitos UX-028 y LRN-037, y conserva el guion para una persona con un lector de
pantalla. El registro se hizo el **2026-10-20** en un equipo con Linux; el guion es para quien
quiera repetirlo con NVDA, Narrator o VoiceOver.

:::warning Qué es este registro y qué no es
El propietario decidió el 2026-10-20 que esta verificación registrada en Linux se acepta
en lugar de una persona con NVDA o JAWS en Windows y VoiceOver en macOS. **No** es la
ejecución de un lector de pantalla. No se inició ningún lector: lo que se registró es lo
que Chromium entrega a un lector de pantalla, el rol, el nombre accesible, la descripción
y el estado del elemento con foco, leídos de su propio árbol de accesibilidad, y el texto
de las regiones dinámicas. No se probó cómo NVDA, JAWS o VoiceOver convierten eso en voz,
ni un sistema Windows o macOS.
:::

## La verificación registrada, 2026-10-20

**Método.** El script `packages/zplc-ide/scripts/screen-reader-capture.ts` inicia la
aplicación Electron real de esta copia (Electron 43.4.1, simulador nativo POSIX, sin
dispositivo) en una pantalla privada, con el ejemplo **Blinky (Structured Text)**, y recorre
los ocho pasos de abajo solo con pulsaciones de teclas, una vez en inglés y otra con el
idioma de la aplicación en español. En cada parada guarda una captura de pantalla y el
registro de accesibilidad del elemento con foco, y guarda todo lo que dijeron las regiones
dinámicas. El paso se aprueba cuando todo control alcanzado tiene nombre, el foco nunca se
pierde hacia la página, nada atrapa el teclado y cada cambio de estado que provoca el paso
se anuncia. Vuelva a ejecutarlo con
`bun run packages/zplc-ide/scripts/screen-reader-capture.ts` en una pantalla Linux; necesita
la aplicación compilada y el runtime nativo, como `bun run smoke:journeys`. Los resultados
están en `docs/static/img/screen-reader-check/2026-10-20/results.json`, con una captura por paso.

**Fila para copiar en la lista de control de la versión:** Linux, árbol de accesibilidad de
Chromium, registrado el 2026-10-20; la decisión del propietario del 2026-10-20 lo acepta en lugar de
NVDA/JAWS en Windows y VoiceOver en macOS.

| Paso | Inglés | Español | Lo que recibió una persona que no ve la pantalla |
| --- | --- | --- | --- |
| 1 Abrir | Aprobado | Aprobado | Título de la ventana «ZPLC». Tab recorre 46 paradas en la bienvenida sin trampa: Tema (cuadro combinado), **Abrir proyecto**, **Nuevo proyecto**, **Aprender**, **Importar**, y luego los ejemplos, cada uno con su nombre, su rol y una descripción breve. Después de **Abrir proyecto** el foco queda en la región del editor («Editor», punto de referencia principal). |
| 2 Editar | Aprobado | Aprobado | La fila del archivo dice «Blinky src/main.st, botón»; Intro lo abre y lleva el foco al editor, que se llama «Editor de código de src/main.st. Pulse Ctrl+M para que la tecla de tabulación saque el foco del editor.», un cuadro de texto de varias líneas; la pestaña dice «main.st, pestaña, seleccionada». Guardar dice «Se guardó main.st». Ctrl+M dice «Pressing Tab will now move focus to the next focusable element» (mensaje propio de Monaco, en inglés) y Tab sale del editor. |
| 3 Compilar | Aprobado | Aprobado | «Compilación correcta. Blinky (Structured Text): 302 bytes, 1 tarea» en la región cortés. Con un programa roto, «La compilación falló. src/main.st: Compilation of 'main.st' failed: …» en la región asertiva, y **Problemas** dice «Problemas, 6 errores · 0 advertencias, pestaña, seleccionada» con cada diagnóstico como «Error: … src/main.st:61:9». |
| 4 Simular | Aprobado | Aprobado | Tab llega a «Conectar, botón» en la barra de herramientas. Al conectar dice «Iniciando el simulador», «Simulación · runtime nativo», «Listo», «Simulador listo». F5 lleva el foco a «Pausar (F6), botón» y la región de la barra de estado dice «En ejecución». |
| 5 Observar | Aprobado | Aprobado | «Observación, pestaña, seleccionada»; «Agregar variable, botón»; el campo es un cuadro combinado llamado «Ruta de la variable…». Intro dice «LED_Output agregada a la tabla de observación.» y el foco vuelve a **Agregar variable**. La fila lee TRUE y FALSE alternadamente. Un valor que cambia no se anuncia, a propósito: se lee yendo a su fila. |
| 6 Forzar | Aprobado | Aprobado | «Forzar LED_Output, casilla»; Espacio dice «Forzado LED_Output» y la casilla queda marcada; al desmarcarla dice «Se liberó el forzado de LED_Output». Terminar la conexión con un forzado activo dice «Se liberó el forzado de LED_Output». |
| 7 Diálogo de carga | Aprobado, con un límite | Aprobado, con un límite | El diálogo es «¿Cargar en el dispositivo?», un diálogo de alerta. El foco empieza en **Cancelar**, Tab circula dentro, la tabla tiene el título «El proyecto comparado con el dispositivo» y Escape lo cierra y devuelve el foco a **Conectar**. Se abrió con el diálogo del propio producto y datos fijos de un dispositivo, no con una placa. |
| 8 Una lección de Aprender | Aprobado | Aprobado | Inicio de Aprender: «Aprender, encabezado», luego Cerrar, **Comenzar el curso**, los dos interruptores (activar uno dice «Todas las lecciones están desbloqueadas.»), Exportar, Importar. La lección tiene un encabezado y uno por etapa (Objetivo, Prediga, Edite, Ejecute, Observe, Reflexione) en una lista llamada «Pasos de la lección». Una pista dice «Pista 2, expandida». **Comprobar** dice «Escenario verificado. FirstBlink pasó 10 aserciones registradas.»; **Restaurar el proyecto inicial** abre un diálogo de alerta y luego dice «Se restauró el proyecto inicial.» |
| 9 Una lección con planta (LRN-037) | Aprobado | Aprobado | La planta es una imagen con el equivalente en texto de su estado, por ejemplo «Dibujo de la planta: Motor detenido. ○ ORDEN OFF, ○ A VELOCIDAD OFF, ○ ATASCO OFF». El interruptor del panel frontal se opera con Espacio y el cambio se anuncia: «Motor a velocidad, 1000 milésimas.» Pausar dice «Planta en pausa»; la acción de atasco dice «Atascar el motor, botón, presionado» y anuncia «Motor atascado a 0 milésimas: no gira, sea cual sea la orden.», y el dibujo dice «▲ ATASCO FAULT». |

**Qué no se ejecutó, y por qué.**

- El paso 7 con una placa conectada: nadie conectó una, de modo que el diálogo se comprobó con
  el diálogo del propio producto y datos fijos. Sigue sin probarse con un dispositivo real.
- El botón **Liberar todos los forzados** y la alerta «Un forzado no está confirmado» pertenecen a
  una sesión con dispositivo: el simulador borra sus forzados al terminar la conexión. Sus
  palabras están cubiertas por las pruebas unitarias de los anuncios de forzado, no por este registro.
- NVDA, JAWS, Narrator y VoiceOver, y Windows y macOS: no se ejecutaron (decisión del propietario, arriba).

**Defectos que encontró esta verificación, corregidos en el mismo cambio.**

| Defecto | Corrección |
| --- | --- |
| Después de **Abrir proyecto** el foco caía en el cuerpo de la página, y quien usa el teclado empezaba de nuevo desde arriba. | La región del editor recibe el foco al abrirse el entorno de trabajo. |
| El editor de código se llamaba «Editor content» y toma Tab como un carácter: nada decía cómo salir de él. | Su nombre ahora dice que Ctrl+M hace que Tab saque el foco. |
| Agregar una variable a la tabla de observación llevaba el foco al cuerpo de la página y no decía nada. | El foco vuelve a **Agregar variable** y la fila se anuncia. |
| Mientras **Comprobar** trabajaba, el botón se deshabilitaba y el foco caía en el cuerpo de la página. | El botón conserva el foco (se marca como no disponible, no como deshabilitado). |
| Después de **Restaurar el proyecto inicial** el foco caía en el cuerpo de la página. | El botón recupera el foco cuando termina la restauración. |
| Cada etapa de una lección tenía un desplegable llamado solo «Ver el punto de control esperado», seis veces. | Cada uno lleva su etapa: «Ver el punto de control esperado: Prediga». |
| En español el estado de ejecución decía «Running», «Ready» y «Paused» en inglés, y la barra de estado rechazaba cualquier texto con tilde. | Los estados están traducidos y la barra de estado acepta letras de cualquier idioma. |

**Se dejó como está, encontrado por la verificación.** El mensaje propio de Monaco sobre Tab
(«Pressing Tab will now move focus…»), los diagnósticos del compilador y la palabra «FAULT» del
dibujo de la planta están en inglés en una sesión en español. El editor muestra la línea fija de
Monaco como una parada de Tab adicional («PROGRAM Blinky, elemento de lista») cuando se desplaza
un programa. Un valor cambiante de Observación no se anuncia.

### Capturas

Cada imagen es la ventana al terminar el paso, tomada por el script.

![Bienvenida, con Abrir proyecto enfocado](/img/screen-reader-check/2026-10-20/es-1-welcome-open-project.png)

![El entorno de trabajo después de abrir el proyecto](/img/screen-reader-check/2026-10-20/es-1-workbench.png)

![El editor después de guardar](/img/screen-reader-check/2026-10-20/es-2-editor-saved.png)

![Una compilación fallida y el panel Problemas](/img/screen-reader-check/2026-10-20/es-3-build-failed-problems.png)

![El simulador en ejecución](/img/screen-reader-check/2026-10-20/es-4-simulating.png)

![La fila de LED_Output en Observación y Agregar variable enfocado](/img/screen-reader-check/2026-10-20/es-5-watch-row.png)

![El diálogo de carga](/img/screen-reader-check/2026-10-20/es-7-deploy-dialog.png)

![Una lección después de aprobar la comprobación](/img/screen-reader-check/2026-10-20/es-8-check-passed.png)

![La planta del motor atascada](/img/screen-reader-check/2026-10-20/es-9-plant-stalled.png)

## El guion para una persona con lector de pantalla

El resto de esta página es el guion que sigue la verificación registrada. Una persona con un
lector de pantalla puede ejecutarlo para agregar las filas que este registro no tiene: NVDA,
Narrator y VoiceOver. Donde una frase de «Qué escuchar» difiera del registro de arriba, el
registro es lo que la aplicación hizo el 2026-10-20.

## Qué necesita

| | Windows | macOS |
| --- | --- | --- |
| Lector de pantalla | NVDA (versión actual) y Narrator | VoiceOver |
| Iniciar y detener | NVDA: Ctrl+Alt+N. Narrator: Win+Ctrl+Intro | Cmd+F5 |
| ZPLC | La compilación del instalador que se evalúa, no el servidor de desarrollo | La compilación del instalador que se evalúa |
| Proyecto | El ejemplo **Blinky** copiado a una carpeta vacía | El mismo |
| Dispositivo | Ninguno: use **Simular**. Esta verificación no necesita una placa | Ninguno |

Use el mismo ejemplo y los mismos pasos en ambos sistemas. Hágalo una vez por cada
lector de pantalla: NVDA y Narrator en Windows, VoiceOver en macOS. Cierre las demás
aplicaciones que hablen o reproduzcan sonido.

## Cómo habla ZPLC

ZPLC tiene dos regiones dinámicas, montadas una sola vez para la ventana y
presentes antes del primer mensaje (`packages/zplc-ide/src/ui/LiveRegions.tsx`):

- una región de estado **cortés** (polite), para resultados: una compilación
  terminada, una conexión, ejecutar y detener, una variable forzada o liberada, una
  lección restaurada;
- una región de alerta **asertiva** (assertive), para fallas: una compilación o una
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

1. Inicie ZPLC. Escuche el título de la ventana y dónde cae el foco.
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
pestaña como seleccionada. Un guardado se anuncia como «Se guardó main.st» en la región
de estado. El editor toma Tab como un carácter: su nombre dice que Ctrl+M hace que Tab
saque el foco.

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

Qué escuchar: «Simulador listo» (cortés) y luego la barra de estado diciendo «En
ejecución». «Ejecución iniciada» se escribe solo en el panel Salida; lo que lo dice es
la barra de estado.

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

Qué escuchar: «Forzado LED_Output», luego «Se liberó el forzado de LED_Output». Con un
dispositivo, si se liberan varios a la vez, «Se liberaron todos los forzados»; si se
pierde la conexión con el dispositivo mientras hay un forzado activo, la región de alerta
dice «Un forzado no está confirmado: verifique y vuelva a conectar antes de operar». Nada
de eso se puede alcanzar en el simulador, que borra sus forzados al terminar la conexión.

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

| Fecha | Persona | Lector de pantalla y versión | Sistema | Versión de ZPLC | Paso | Lo que oyó | Foco correcto | Resultado | Notas |
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
- [Banco de trabajo de ZPLC](../ide/features.md)
- [Hardware en el lazo](./hardware-in-the-loop.md)
