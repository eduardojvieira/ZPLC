---
slug: /ide
id: index
title: La aplicación ZPLC
sidebar_label: Aplicación ZPLC
description: Qué hace la aplicación de escritorio ZPLC, cómo está construida y dónde están sus límites.
tags: [ide, tooling]
---

# La aplicación ZPLC

ZPLC es la aplicación de escritorio para escribir, compilar, probar, simular y revisar proyectos PLC. Un proyecto es una carpeta que usted elige, y la aplicación lee y escribe los archivos que contiene. Esta página da la visión general y explica cómo está construida la aplicación; las demás páginas de esta sección cubren el [entorno de trabajo](./features.md), los [editores](./editors.md), el [compilador](./compiler.md) y la [migración desde la versión 1](./migration-v1-to-v2.md).

## Camino rápido

1. Abra una carpeta de proyecto, o cree una con **Nuevo proyecto**. También puede copiar un ejemplo incluido a una carpeta.
2. Edite un archivo de texto estructurado, lista de instrucciones, escalera, diagrama de bloques de función o diagrama funcional secuencial, y compile el proyecto.
3. Ejecute las pruebas de escenario y la simulación nativa, y lea el resultado en el panel que está bajo el editor.
4. Para una placa, compile el firmware, grábelo, carga el programa y ejecútelo. Una persona inicia cada uno de estos pasos; vea [Cargar un programa](./deployment.md).

## Qué gestiona la aplicación

| Área | Qué hace |
| --- | --- |
| Proyecto | Lee y escribe los archivos de la carpeta, `zplc.json` incluido, y exporta un proyecto de la versión 2 revisado. |
| Editores | Un editor de texto para texto estructurado y lista de instrucciones, y un editor de modelos para cada lenguaje gráfico. |
| Validación | Diagnósticos del compilador, pruebas de escenario, comprobaciones de seguridad, trazas y la simulación nativa. |
| Evidencia | Registra cada resultado con su alcance, y nunca presenta un resultado de host como un resultado de hardware. |
| Hardware | Conectar y cargar son acciones explícitas de una persona, después de una comprobación de compatibilidad. |

## Límites

La simulación nativa valida el comportamiento en la computadora anfitriona. No muestra el tiempo de un destino, la E/S eléctrica, el comportamiento con hardware en el lazo ni la calificación de producción. Los perfiles de placa llevan solo evidencia de compilación cruzada; vea la [evidencia de hardware](../reference/capabilities-evidence.md).

Un asistente de IA puede preparar un cambio candidato aislado, pero solo una persona puede guardarlo o iniciar una operación física. Lea [IA y privacidad](./ai-privacy.md) antes de activar un proveedor de IA.

## Cómo está construida la aplicación

La aplicación mantiene el acceso privilegiado fuera de la ventana. Los editores y los paneles ven un proyecto respaldado por una carpeta a través de una interfaz estrecha, y el trabajo del sistema operativo ocurre en otro lugar.

| Capa | Responsabilidad |
| --- | --- |
| Renderizador | El entorno de trabajo, los modelos visuales, los diagnósticos y las vistas de evidencia. No tiene por sí mismo acceso al sistema de archivos, al shell ni a dispositivos. |
| Preload y proceso principal | Operaciones validadas y estrechas de sistema de archivos y del runtime supervisado. |
| Compilador | Compila el código fuente y los modelos visuales a `.zplc`. |
| Adaptadores del runtime | La simulación nativa, o un runtime compatible conectado. |

### Cómo se comunican las capas

El renderizador llega al proceso principal solo a través del preload, y solo por los canales que nombra `packages/zplc-ide/electron/ipcContract.ts`. Ese módulo es la definición única: el proceso principal, el preload y el renderizador toman de él los nombres de sus canales.

- **Un manejador por canal.** El proceso principal se niega a arrancar si un canal no tiene manejador o un manejador no tiene canal.
- **Primero el remitente y el mensaje.** Cada llamada se comprueba antes de que se ejecute su manejador: el remitente debe ser el documento ZPLC de confianza de la ventana, y los argumentos deben ajustarse al esquema del canal. Cualquier otra cosa se deniega con un único mensaje fijo.
- **Un preload estrecho.** Expone un método por operación y nada genérico: ningún `send`, ningún acceso a canales sin procesar y ninguna ruta de la máquina.
- **Procesos fijos.** Los procesos que se inician para compilar, probar y compilar el firmware salen de una lista cerrada de vectores de argumentos fijos, se inician sin shell y nunca toman un comando ni un argumento del renderizador.

Nivel de evidencia: host. `packages/zplc-ide/electron/ipcRegistry.test.ts` ejecuta la tabla real de manejadores contra sustitutos de Electron y de los almacenes, `packages/zplc-ide/electron/preload.test.ts` ejecuta el preload real y compara lo que invoca con el contrato, y `packages/zplc-ide/shared/spawnAllowList.test.ts` muestra los vectores de argumentos. No es evidencia de la aplicación empaquetada.

### Trabajo que no bloquea la ventana

La compilación, la comprobación de seguridad, las pruebas de escenario y la revisión del candidato se ejecutan cada una en un proceso propio, iniciado para la solicitud desde una lista fija y detenido cuando la solicitud termina, de modo que una compilación o una ejecución larga no puede congelar la ventana. **Cancelar escenarios** en el panel Pruebas pide al trabajador que se detenga; un trabajador ocupado que no responde se mata tras un breve plazo de gracia, y un plazo límite mata al que nunca termina. Matar al trabajador también termina el runtime nativo que inició. Una ejecución cancelada se muestra y se registra como cancelada, y nada de ella se conserva como una compilación.

Nivel de evidencia: host. `packages/zplc-ide/electron/toolWorkerHost.test.ts` ejecuta procesos hijo reales: un trabajador atascado en un bucle ocupado se mata mientras quien llama sigue ejecutándose, y el trabajador real compila un proyecto y cancela una ejecución de escenarios en el runtime nativo. El recorrido 35 de `bun run test:journeys` cancela una ejecución larga en la aplicación real.

### Un solo proyecto de referencia

Compilar, probar, simular y la revisión del candidato actúan sobre la carpeta que muestra la ventana, y sobre ninguna otra. El proceso principal es el propietario de esa carpeta: el diálogo nativo de carpetas entrega a la ventana una carpeta y un identificador opaco para ella. Una compilación, una comprobación de seguridad o una ejecución de pruebas nombra el espacio de trabajo y ese identificador, y el proceso principal rechaza la llamada cuando el identificador no es la carpeta actual de la ventana, o cuando el espacio de trabajo pertenece a otra carpeta. Abrir otra carpeta deja inservibles, por tanto, todos los espacios de trabajo anteriores, sin ningún paso de enlace intermedio.

Nivel de evidencia: host. `packages/zplc-ide/electron/workspaceTestGateway.test.ts` cubre la regla, y una ejecución guionada de la aplicación real envía mensajes manipulados por el puente de la aplicación real después de abrir otra carpeta y comprueba que cada uno se rechaza.

### Propiedades de seguridad

El renderizador no tiene privilegios. Esto es lo que hace la aplicación en ejecución, no lo que dice su código fuente:

- un script en línea o un manejador de eventos en línea que inyecta una página queda bloqueado por la política de seguridad de contenido (`script-src 'self'` en una compilación empaquetada), y una solicitud a otro origen es rechazada por `connect-src`;
- se rechaza un permiso distinto del serial (notificaciones, ubicación, cámara, micrófono, lectura del portapapeles, MIDI), mientras que el serial sigue disponible para el documento ZPLC;
- se rechazan `window.open`, un enlace que abre una ventana nueva y la navegación a otro origen, y la ventana conserva después su documento, su carpeta y su IPC;
- se rechaza una operación de proyecto con una ruta con `..`, una ruta absoluta o de unidad, un enlace que sale del proyecto, una escritura demasiado grande o el identificador de carpeta de otra ventana, y nada fuera del proyecto cambia.

Nivel de evidencia: host. Una ejecución guionada de la aplicación real hace estas pruebas en el host de desarrollo. Ese host sirve sus propios scripts en línea para la recarga en caliente, así que allí no se hace la prueba del script en línea, y las pruebas cubren solo Linux: la aplicación empaquetada en macOS y Windows no se prueba. Quienes contribuyen pueden ejecutar las pruebas contra una compilación empaquetada de Linux; vea [Probar una compilación empaquetada](../development/ide-internals.md#probar-una-compilación-empaquetada).

### Configuración del proyecto

`zplc.json` nombra los metadatos del proyecto, el destino, las tareas y los archivos fuente. Una elección de placa se comprueba contra el perfil catalogado durante una operación; no importa un modelo de capacidades ni certifica una configuración de cableado. Los ejemplos se copian a una carpeta que usted elige, y no existe un proyecto virtual ni solo en memoria. Para llevar un proyecto de la versión 1 a una carpeta, vea [Migrar un proyecto v1 a v2](./migration-v1-to-v2.md).
