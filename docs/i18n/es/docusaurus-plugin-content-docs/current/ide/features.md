---
slug: /ide/features
id: features
title: Entorno de trabajo de Studio
sidebar_label: Entorno de trabajo
description: El editor, el panel inferior, la simulación y el flujo de pruebas de ZPLC Studio 2.0.
tags: [ide, user-guide]
---

# Entorno de trabajo de Studio

El entorno de trabajo mantiene la edición en el centro y reúne Explorer,
Inspector, Output, Problems, Tests, Lab, Learn, Changes, Agent, Trace, Watch y
Terminal en un solo panel inferior.

## Flujo diario

1. Trabaje en una carpeta de proyecto que usted elija.
2. Compile y resuelva los diagnósticos.
3. Ejecute una prueba temporal o un escenario POSIX nativo y revise su trace.
4. Verifique el origen de los resultados antes de sacar una conclusión.

## Proyectos recientes y restauración de sesión

La pantalla de bienvenida lista, en **Recent**, hasta diez carpetas que usted abrió antes, la más reciente primero, cada una con su nombre y la fecha de su última apertura. Al elegir una, se reabre sin diálogo de carpeta. Una carpeta que se movió, se borró o se reemplazó por un enlace aparece como no encontrada, con un botón **Forget** que la quita de la lista. Solo se recuerda una carpeta que usted eligió con el diálogo de carpetas del sistema.

Para cada proyecto, Studio recuerda además las pestañas abiertas, la pestaña activa, la posición del cursor y del desplazamiento de cada archivo, y el tamaño de los paneles del editor y del panel inferior (y si el panel inferior estaba contraído). Los vuelve a poner la próxima vez que se abre esa carpeta, desde **Recent** o con **Open project**. Solo se guardan rutas y posiciones: las ediciones sin guardar no se restauran, y una pestaña cuyo archivo ya no existe se descarta sin avisar. La lista y las sesiones se guardan en el directorio privado de datos de usuario de Studio, nunca en la carpeta del proyecto, y la sesión de un proyecto que sale de la lista se borra la próxima vez que arranca Studio.

Nivel de evidencia: host. Las pruebas unitarias del requisito IDE-008 (`packages/zplc-ide/electron/recentProjects.test.ts`, `sessionStore.test.ts`, `packages/zplc-ide/src/utils/sessionState.test.ts` y `packages/zplc-ide/src/store/sessionPersistence.test.ts`) cubren la lista y el formato de la sesión, y el recorrido 12 (restaurar la sesión) y el recorrido 14 (un proyecto reciente que ya no está) de `bun run test:journeys` manejan la aplicación real en una pantalla.

## Preferencias

Las preferencias son suyas, no de un proyecto: se aplican a todos los proyectos y se guardan para su cuenta de usuario, de modo que sobreviven a un reinicio. Se abren desde el desplegable **Preferences** de la pantalla de bienvenida, o al principio de la pestaña Project Settings dentro de un proyecto.

| Preferencia | Opciones | Valor inicial |
|---|---|---|
| Theme | Light, Dark, High contrast | Sistema |
| Editor font size | De 10 a 32 px | 14 px |
| Tab size | 2, 3, 4 u 8 espacios | 4; la sangría propia de un archivo no la reemplaza |
| Density | Comfortable, Compact | Comfortable; compact reduce el espaciado de toda la ventana |
| Language | English, Español | El idioma del sistema; hoy fija el de las lecciones de Learn y el resto de la interfaz está en inglés |
| Autosave | Desactivado, o tras 5, 15, 30 o 60 segundos sin escribir | Desactivado |
| Check for a newer release when Studio starts | Activada o desactivada, y un botón **Check now** | Desactivada |

El autoguardado escribe los archivos modificados con el mismo guardado que **Save all**, sin una línea en Output por cada guardado; un archivo que no se puede escribir sigue modificado y se informa. Junto con las copias de recuperación, un fallo cuesta como máximo lo escrito en el último segundo.

La comprobación de actualizaciones consulta las versiones publicadas de este proyecto en GitHub y dice si la última es más nueva que la compilación en ejecución. No envía nada sobre usted, no descarga nada ni instala nada; la respuesta es una versión y un enlace. No se ejecuta hasta que usted la activa o pulsa **Check now**.

Nivel de evidencia: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `src/store/useAppSettings.test.ts`, `src/store/autosave.test.ts`, `electron/updateCheck.test.ts` y `electron/updateCheckIpc.test.ts` cubren las preferencias, el autoguardado y la comprobación de actualizaciones (requisitos IDE-007 e IDE-010), y el recorrido 21 (las preferencias se aplican y persisten por usuario) de `bun run test:journeys` las cambia en la aplicación real y la reinicia.

## Recuperar trabajo sin guardar

Studio guarda una copia de cada archivo modificado en su directorio privado de datos de usuario un segundo después de que usted deja de escribir (y como mínimo cada pocos segundos mientras sigue escribiendo). Guardar un archivo, descartarlo, cerrarlo con **Discard**, o cerrar el proyecto o la ventana y responder **Save** o **Discard** elimina la copia, de modo que una salida normal no deja nada.

Si Studio se cerró de golpe o falló, abra el proyecto otra vez: un diálogo **Recover unsaved changes** lista cada archivo que tenía texto modificado, con su nombre y la hora en que se guardó la copia. **Restore** devuelve el texto al editor, todavía sin guardar; **Discard** elimina la copia. Cerrar el diálogo no decide nada y las copias se ofrecen de nuevo la próxima vez. Una copia igual al archivo en disco, o cuyo archivo ya no existe, se elimina sin preguntar. Las copias de los proyectos que salen de la lista Recent se borran cuando arranca Studio.

Límites: un proyecto conserva copias de a lo sumo 64 archivos y unos 64 MB de texto. Los cambios en la configuración del proyecto (`zplc.json`) todavía no se copian.

Nivel de evidencia: host. Las pruebas unitarias del requisito IDE-006 (`packages/zplc-ide/electron/recoveryStore.test.ts`, `recoveryStoreIpc.test.ts`, `packages/zplc-ide/src/store/recoveryPersistence.test.ts`, `src/utils/recoveryOffer.test.ts` y `src/ipc/recoveryBridge.test.ts`) cubren el almacén, los mensajes y los tiempos, y el recorrido 19 (recuperar archivos modificados tras un fallo) de `bun run test:journeys` mata con SIGKILL el proceso de la aplicación real, la arranca de nuevo y restaura el archivo.

## Un fallo se queda en su región

Si el editor, el panel inferior o la barra de herramientas lanzan una excepción al dibujarse, esa región muestra qué se detuvo y un botón **Retry**, y el resto de la ventana sigue funcionando, así que todavía puede guardar sus archivos. **Retry** vuelve a dibujar solo esa región. Si el fallo está fuera de toda región, toda la ventana muestra el mismo mensaje con **Retry** y una forma de cerrar el proyecto; la ventana nunca queda en blanco.

Nivel de evidencia: host. El recorrido 20 (una región que falla no deja la ventana en blanco) de `bun run test:journeys` hace fallar cada una de las tres regiones en la aplicación real, comprueba que las otras dos siguen funcionando y que Retry devuelve la región caída; `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` cubre la lógica de la región.

## Editores

ST es la vía principal con servicio de lenguaje. LD, FBD y SFC abren, editan,
guardan, copian y deshacen sus modelos; el ST que generan es un artefacto, no una
fuente de la que se pueda volver al modelo. IL es una vía de compatibilidad, en
la medida en que el compilador la acepta.

## Simulación y hardware

La simulación POSIX nativa es la forma de ejecutar un programa en su equipo.
Requiere la aplicación de escritorio, que incluye el runtime nativo; en esta
versión no hay un simulador WebAssembly en el navegador. Las acciones de hardware
están separadas: compilar el firmware del runtime, grabarlo, desplegar un
programa compilado y, después, ejecutar o depurar. Una persona inicia cada una.

## Learn

Learn es una pestaña del panel inferior. La acción **Learn** de la pantalla de bienvenida copia la primera lección en una carpeta que usted elige y abre esa pestaña. Esto es lo que ofrece hoy:

- Diez lecciones, en español y en inglés (el selector está en el panel, y el español es el valor por defecto). Cada lección trae su propio proyecto de ejemplo: un archivo fuente en Structured Text y un archivo de escenario.
- Cada lección recorre seis etapas (en inglés Objective, Predict, Edit, Run, Observe y Reflect), y el punto de control esperado de cada etapa permanece oculto hasta que usted lo pide.
- Usted edita el proyecto copiado y ejecuta solo el escenario de esa lección desde **Tests**. El panel califica la ejecución registrada: una lección se da por completada cuando su escenario pasó con todas sus aserciones guardadas. Studio recuerda las lecciones completadas, y **Exportar progreso** e **Importar progreso** (**Export progress** e **Import progress** en inglés) las trasladan como un archivo pequeño.
- Todas las lecciones están desbloqueadas y se pueden tomar en cualquier orden. Learn nunca inicia una operación física: solo copia un proyecto y abre **Tests**.
- Un resultado es evidencia de host de la simulación nativa, no evidencia de hardware.

Un curso con niveles, prerrequisitos y un orden fijo, una superficie de lección que permanece junto al editor y una vía para una placa de aprendizaje son trabajo futuro (los requisitos LRN). Nada de esta página los promete.

Nivel de evidencia: host. `packages/zplc-ide/src/components/learnLesson.test.ts` y `LearnPanel.test.ts` cubren las lecciones y la calificación, y `packages/zplc-ide/src/learn/starterGrading.test.ts` ejecuta cada starter contra su escenario.

## Límite de la depuración

Los watches, los traces, los breakpoints y los forces solo muestran lo que el
adaptador conectado puede informar. Un trace en host no es evidencia de hardware
ni de HIL; forzar un valor o cambiar RUN/STOP en un sistema físico exige la
autorización expresa de una persona y un procedimiento de seguridad del sitio.
Las herramientas de IA y MCP no pueden forzar valores ni cambiar RUN/STOP;
consulte [IA y privacidad](./ai-privacy.md).

## Pausa, reanudación, paso y Stop

La pausa, la reanudación y el paso conservan donde está el estado lógico del programa, y Stop lo descarta. La tabla vale para la simulación nativa y para el scheduler de Zephyr de una placa conectada.

| Acción | Imagen de salidas | Forzados | El scan |
|---|---|---|---|
| Pausa | Se conserva | Se conservan | Pausa entre scans. |
| Paso | Se conserva y muestra el scan ejecutado | Se conservan | Ejecuta un scan completo, o termina el scan detenido en un breakpoint. |
| Reanudación | Se conserva | Se conservan | Un scan detenido en un breakpoint continúa desde ahí. |
| Stop | Se pone a cero | Se borran | Cada tarea vuelve a su punto de entrada, y se descarta un scan que un breakpoint interrumpió. |

Una falla borra la imagen y los forzados igual que Stop. En una placa, la pausa, el paso y Stop además llevan las salidas físicas a su estado seguro, apagadas. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada) tiene la tabla completa y las pruebas de Zephyr que la respaldan, ejecutadas en `native_sim` y QEMU sin medición en una placa. Para la simulación nativa, las verificaciones están en `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, donde Stop además pone a cero la imagen de entradas.
