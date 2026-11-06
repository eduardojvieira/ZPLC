---
slug: /release-notes
id: index
title: Notas de versión
sidebar_label: Notas de versión
description: Qué hay de nuevo en ZPLC 2.0.0, qué se rompe al pasar desde 1.x, cómo migrar y qué no está verificado.
tags: [releases, changelog]
---

# Notas de la versión ZPLC 2.0.0

ZPLC 2.0 es una versión mayor nueva de la aplicación, el compilador y el runtime. Esta página dice qué puede hacer ahora,
qué deja de funcionar, los pasos para pasar desde 1.x y qué no se ha verificado. El registro técnico completo está en
[`CHANGELOG.md`](https://github.com/eduardojvieira/ZPLC/blob/master/CHANGELOG.md).

:::warning Versión de evaluación
ZPLC 2.0.0 es para evaluación. Ninguna placa se ha grabado, arrancado ni ejecutado, así que todas están en el nivel
`cross-build`. Los instaladores no están firmados, y ZPLC no es un PLC de seguridad y no debe controlar maquinaria:
[Seguridad y limitaciones](../safety-and-limitations.md).
:::

## Lo más destacado

- **Un curso dentro de la aplicación.** Aprender tiene 68 lecciones en español e inglés, una ruta de escalera que parte de
  cero y una ruta de hardware para la Raspberry Pi Pico y la ESP32-S3-DevKitC-1.
- **Páginas de lectura con un laboratorio dentro.** Las lecciones de escalera abren una página a pantalla completa que
  puede probar sin salir de ella.
- **Cajas de función en escalera.** Las comparaciones, las operaciones matemáticas y otras funciones van en un peldaño con
  cables EN y ENO.
- **Un simulador que sigue al destino.** El mismo núcleo de planificación corre en su equipo y en el firmware.
- **Cinco lenguajes, un solo bytecode.** Texto estructurado, lista de instrucciones, escalera, diagrama de bloques de
  función y diagrama funcional de secuencias se compilan a un único formato.
- **Documentación en la que puede confiar.** Cada número, comando y afirmación del sitio se comprueba contra el
  repositorio, en español y en inglés.

## Qué cambió para usted

### Modo de lectura de Aprender y la ruta de escalera

Aprender ahora enseña en dos pasos. Una lección que tiene una **página de lectura** la abre primero, a pantalla completa
sobre el banco de trabajo: una explicación breve, dibujos de peldaños de escalera y un **laboratorio de prueba**.
**Practicar** cierra la página y abre la lección junto al editor, **Volver al curso** regresa al inicio de Aprender, y
**Volver a leer** en el panel de la lección trae la página de nuevo.

![La ruta de escalera del inicio de Aprender, con su primera lección lista para iniciar](/img/screens/learn-path-es.png)

La **ruta de escalera**, llamada _Diagrama de escalera desde cero_, es la primera ruta del inicio de Aprender. Es un curso
completo para quien nunca programó un PLC: qué es un PLC, el ciclo de escaneo, contactos y bobinas, serie y paralelo, set y
reset, temporizadores, flancos y contadores, secuencias, bloques de función, diagnóstico en el simulador y un proyecto
final, una estación de empaque. Cada lección de la ruta tiene una página de lectura.

![La página de lectura de la primera lección: una explicación, con el laboratorio más abajo](/img/screens/learn-reading-es.png)

El laboratorio es una simulación pequeña dentro de la página. No hace nada por sí solo: usted pulsa **Ejecutar**, luego
mantiene pulsado un botón o mueve un interruptor, y ve el flujo de energía por los peldaños, las lámparas y un diagrama de
tiempos. Corre con la compilación WebAssembly del mismo runtime que el simulador, así que es un resultado de host.

![El laboratorio de prueba de la primera lección, en marcha, con la luz del pórtico encendida](/img/screens/learn-lab-es.png)

Usted sigue practicando y se califica en el editor: **Comprobar** ejecuta su programa guardado con el escenario de la
lección. Vea [Aprender](../learn/index.md) y el [esquema del curso](../learn/course-outline.md).

### Cajas de función en escalera

Un peldaño de escalera ahora puede contener funciones IEC como cajas con **EN** y **ENO**: comparaciones, operaciones
matemáticas y escalado, entre otras. EN es la energía que llega a la caja y ENO es la energía que sale de ella. Usted elige
una caja del grupo **Funciones** de la paleta, enlaza sus operandos a variables y ve cada operando, la salida y ambos cables
en vivo mientras monitorea. Varias cajas pueden escribir una misma variable. La [referencia de escalera](../reference/language-ld.md#cajas-de-función)
tiene la lista y las reglas.

![Un peldaño del proyecto de la lección de comparar y calcular, con cajas de función ADD y MOVE en el editor](/img/screens/ld-function-box-es.png)

### La aplicación

- **ZPLC guarda su trabajo y le dice qué pasó.** Conserva una copia de cada archivo modificado y se la ofrece de vuelta
  después de una falla, muestra cada resultado de compilación, guardado, carga y prueba como una notificación que abre sus
  detalles, puede cancelar una operación larga y recuerda las preferencias que usted fijó. Un proyecto se exporta a un único
  archivo y se importa de vuelta byte por byte.
- **El árbol del proyecto hace más.** Nueva carpeta, renombrar, mover y duplicar conservan las pestañas y los puntos de
  interrupción abiertos, un cambio hecho fuera de ZPLC se detecta, y una carpeta de bloques de biblioteca se ofrece a todos
  los editores.
- **Las placas se describen una sola vez.** `firmware/app/boards/boards.json` contiene los canales, las direcciones y los
  valores seguros de cada placa. El editor de asignación de E/S lo lee, y una variable en una dirección que la placa no tiene
  es un error de compilación.
- **Un asistente que propone y una persona que decide.** El asistente de IA opcional y el servidor MCP pueden leer su
  proyecto y proponer cambios en un conjunto de cambios candidato, que usted revisa y guarda. No pueden grabar, cargar,
  forzar un valor, iniciar ni detener un programa, abrir un puerto serie ni ejecutar una consola ([IA y MCP](../guides/ai-and-mcp.md)).
- **ZPLC le avisa de una versión más reciente.** Con la comprobación opcional activada, un aviso descartable nombra la
  versión. No se descarga ni se instala nada.

### El lenguaje y la simulación

- **El lenguaje es más correcto.** `LREAL` y los enteros de 64 bits funcionan, las estructuras, las enumeraciones y los
  arreglos conservan su ancho declarado, las cadenas ya no modifican sus argumentos, los temporizadores y contadores siguen
  IEC 61131-3, y una compilación indica a qué elemento de un archivo IL, de escalera, FBD o SFC se refiere un mensaje.
- **La simulación se acerca más al destino.** Corren tareas de intervalos distintos, cada una liberada en su propio
  intervalo, se cuenta un plazo incumplido, cualquier entrada del programa en ejecución puede fijarse o forzarse, y los
  valores `VAR RETAIN` se conservan de una ejecución a la siguiente.
- **La simulación recurre al motor del navegador.** Cuando el runtime nativo no puede iniciar, ZPLC ejecuta el mismo núcleo
  compilado a WebAssembly. La barra de estado dice **WASM fallback · degraded** y enumera lo que le falta.
- **Las pruebas de escenario dan la misma respuesta en todas partes.** La aplicación, la línea de comandos y el servidor MCP
  las ejecutan igual, y la pestaña **Enclavamientos** enumera qué pares de salidas se afirma que nunca están activas a la vez.
- **Un proyecto declara el valor seguro de una salida**, y la compilación lo lleva junto con el programa.

### Placas y versiones

- **Un controlador es seguro por defecto en una red de planta.** MQTT está desactivado hasta que un operador nombra un
  broker, TLS verifica el certificado, ningún comando imprime una credencial, y ningún mensaje de Modbus, MQTT o un servicio
  de nube puede iniciar ni detener el programa, fijar un forzado ni cargar un programa.
- **Una versión incluye el firmware de cada placa**, con su suma de verificación y el nivel de evidencia de su placa. En
  **Configuración del proyecto**, **Destino**, ZPLC muestra la imagen de su placa y los pasos para grabarla. ZPLC no graba:
  lo hace usted.
- **Los paquetes de Linux le permiten abrir el puerto serie de una placa**, mediante una regla udev para las placas cuyo
  identificador USB está registrado.
- **Las versiones las hace un canal que usted puede leer.** Un ensayo ejecuta todo y no publica nada, las notas dicen qué
  comprobación pasó cada archivo, y cada archivo tiene una suma de verificación y una atestación de compilación.
- **La documentación se reescribió.** Una página para cada tarea, un tutorial con una captura real de cada paso, guías de
  Modbus, MQTT y Sparkplug B, los bloques de nube, asignación de E/S, forzado de valores, valores retentivos, pruebas de
  escenario, archivos de proyecto, la línea de comandos, depuración, IA y MCP, y portado. Las páginas de referencia se
  generan a partir del código fuente.

## Cambios incompatibles

- **Recompile todos los programas y vuelva a grabar todas las placas.** El contrato binario tiene un contador de borrador, y
  el cargador, el runtime, la consola del firmware y la aplicación rechazan un programa o una imagen de firmware de otro
  borrador, indicando ambos números.
- **Un `VAR_IN_OUT` de un bloque de función se pasa por referencia.** Un bloque llamado sin enlazarlo falla; recompile los
  programas que lo declaran.
- **Las tareas de evento e interrupción hacen fallar la compilación.** Una tarea con `trigger` `event` o `interrupt` es un
  error en su definición en `zplc.json`; use `cyclic`.
- **El broker MQTT predeterminado ya no existe.** Un controlador que dependía de `test.mosquitto.org` tiene MQTT
  desactivado hasta que su operador nombre un broker, y el transporte predeterminado es TLS en el puerto 8883 con el
  certificado verificado.
- **El archivo de placas se movió.** `supported-boards.v1.5.0.json` se reemplaza por `firmware/app/boards/boards.json`.
- **Un texto ya no se convierte en un número, un `BOOL` ni un tiempo**, y un índice constante de arreglo fuera de los
  límites es un error de compilación. Los programas que dependían de alguno de los dos ahora no compilan, indicando la línea.
- **Recompilar descarta los valores retentivos**, porque un programa que difiere en un byte tiene otra identidad.
- **No hay una versión alojada para navegador.** ZPLC es la aplicación de escritorio. El recurso de WebAssembly del
  simulador se mantiene.
- **Los plazos incumplidos consecutivos que bloquean una falla son 3 en lugar de 1** en todos los runtimes
  (`CONFIG_ZPLC_DEADLINE_MISS_LIMIT`; fíjelo en 1 para el comportamiento anterior).

## Migración desde 1.x

1. Recompile todos los programas con esta versión y vuelva a grabar todas las placas con firmware de la misma versión.
2. Ejecute `zplc-cli migrate-preview` en un proyecto de versión 1 y lea la diferencia antes de aceptarla:
   [Migrar un proyecto v1](../ide/migration-v1-to-v2.md).
3. Nombre el broker MQTT de cada controlador que usaba el valor predeterminado anterior e instale su certificado de CA, o
   fije el transporte que necesite.
4. Cambie una tarea que usaba `event` o `interrupt` por una tarea cíclica.
5. Lea el archivo de placas desde `firmware/app/boards/boards.json` en cualquier herramienta suya que leía el archivo con
   versión.
6. El producto se llama ZPLC, y la aplicación guarda sus datos en una carpeta llamada `ZPLC`. En el primer inicio copia una
   sola vez la carpeta de las versiones candidatas (`ZPLC IDE`) y deja la carpeta antigua en su lugar. Quizá deba volver a
   escribir la clave guardada de un asistente de IA.
7. Los archivos de instalación se llaman `zplc-<versión>-<so>-<arquitectura>`: [Instalar ZPLC](../getting-started/install.md).

## Problemas conocidos

- **Ninguna placa se ha grabado, arrancado ni ejecutado.** Todas las placas están en el nivel `cross-build`, y nada está
  verificado en un dispositivo físico ([Compatibilidad de hardware](../reference/capabilities-evidence.md)). Los pasos de
  [Su primera placa](../tutorials/first-board.md) no se han ejecutado.
- **Ningún intercambio de comunicación se probó con un dispositivo, un broker o un servicio reales.** Los bloques Modbus,
  MQTT, Sparkplug B y de nube se probaron contra sustitutos y servidores de loopback, y ningún bloque de nube se verificó
  contra un servicio. El protocolo de enlace de los bloques de comunicación y la separación de las cuatro áreas de datos de
  Modbus no son definitivos.
- **Los valores retentivos** están demostrados solo en el host y el simulador, y están desactivados de forma predeterminada
  en el firmware.
- **TLS está desactivado en la Nucleo-H743ZI y en la Arduino Opta** hasta que su generador de números aleatorios se verifique
  en la placa, así que allí MQTT corre sobre TCP sin cifrar.
- **El runtime del navegador está degradado.** Se ejecutó en un solo motor, su temporización es la del navegador, sus
  bloques de comunicación responden `STATUS` 10 y no tiene puerto serie ni pines ([Runtime del navegador](../runtime/browser-runtime.md)).
- **Los instaladores no están firmados.** Windows le pide confirmar el primer inicio y macOS necesita **Open Anyway**
  ([Instalar ZPLC](../getting-started/install.md)).
- **No se midieron los tiempos en ninguna placa**, y ZPLC no es un PLC de seguridad.

## Límites de la evidencia

- La evidencia de host, de simulación, de compilación cruzada y de flujos de trabajo no establece resultados de banco,
  tiempos del destino, comportamiento eléctrico, calificación de placas ni certificación de seguridad.
- Los artefactos de Linux tienen suma de verificación y atestación; no están firmados.
- La IA y MCP no inician acciones de grabar, cargar, forzar, RUN/STOP, recuperación, puerto serie en bruto ni consola.
- Una afirmación de hardware necesita una prueba física trazable de la placa y del commit exacto: compilación, grabado,
  identidad y hash, carga, un escenario de referencia, reinicio y persistencia, salidas seguras y tiempos. Vea
  [Hardware en el bucle](../development/hardware-in-the-loop.md).

No deduzca equivalencia de funciones, rendimiento de tiempos ni seguridad física a partir de esta página ni de la presencia
de código fuente.
