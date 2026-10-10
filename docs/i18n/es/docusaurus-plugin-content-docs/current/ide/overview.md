# Arquitectura de Studio y modelo de proyecto

Studio presenta a los editores y a las herramientas un proyecto guardado en una
carpeta; el renderer no tiene acceso privilegiado al sistema de archivos, a la
shell ni a los dispositivos.

## Camino rápido

Abra una carpeta de proyecto, revise su destino y sus tareas, edite un archivo
fuente y compile con la Tool API. Exporte una carpeta v2 ya revisada, en lugar de
depender de una reescritura implícita del proyecto antiguo.

## Límites

| Capa | Responsabilidad |
| --- | --- |
| Renderer | Entorno de trabajo, modelos visuales, diagnósticos y presentación de resultados. |
| Preload/main | Operaciones acotadas y validadas sobre archivos, y ejecución supervisada del runtime. |
| Compilador | Compilación canónica de fuentes y modelos visuales a `.zplc`. |
| Adaptadores de runtime | Simulación POSIX nativa o un runtime compatible conectado. |

## Cómo se comunican las capas

El renderer llega al proceso principal solo a través del preload, y solo por los
canales que nombra `packages/zplc-ide/electron/ipcContract.ts`. Ese módulo es la
única definición: el proceso principal, el preload y el renderer toman de él los
nombres de canal, de modo que no hay una segunda copia que se desalinee.

- **Un manejador por canal.** El proceso principal responde a cada canal del
  contrato con exactamente un manejador, y se niega a arrancar si a un canal le
  falta o si un manejador no tiene canal.
- **Primero el emisor y el mensaje.** Cada llamada se comprueba antes de que corra
  su manejador: el emisor debe ser el documento de confianza de Studio de la
  ventana y los argumentos deben ajustarse al esquema de ese canal. Cualquier otra
  cosa se deniega con un mensaje fijo.
- **Un preload estrecho.** El preload expone un método por operación y nada
  genérico (ni `send`, ni acceso a un canal arbitrario, ni una ruta de la
  máquina). Se construye como un solo script que no requiere nada salvo `electron`.
- **Procesos fijos.** Los procesos que se lanzan para compilar, probar y construir
  firmware (el runtime nativo, `west build`, las sondas de la cadena de
  herramientas) salen de una lista cerrada de vectores de argumentos fijos, se
  lanzan sin shell y nunca toman un comando ni un argumento del renderer.

Nivel de evidencia: host. `electron/ipcRegistry.test.ts` ejecuta la tabla real de
manejadores y el registro real contra sustitutos de Electron y de los almacenes,
`electron/preload.test.ts` ejecuta el preload real contra un sustituto y compara lo
que invoca con el contrato, y `electron/spawnAllowList.test.ts` muestra los
vectores de argumentos (requisito IDE-017). No es evidencia de la aplicación
empaquetada.

## Trabajo que no bloquea la ventana

Compilar, la comprobación de seguridad, las pruebas de escenarios y la revisión de
candidatos se ejecutan en un proceso propio, que se lanza para cada petición desde
una lista fija y se detiene cuando la petición termina. El proceso principal solo
envía la petición y espera, de modo que una compilación o una ejecución larga no
puede dejar la ventana sin respuesta. **Cancel scenarios**, en el panel de pruebas,
pide al proceso que se detenga; un proceso ocupado en una compilación que no
responde se mata tras un breve periodo de gracia, y un plazo mata al que nunca
termina. Matar el proceso también termina el runtime nativo que había lanzado. Una
ejecución cancelada se muestra como cancelada y se registra como cancelada en el
registro de ejecuciones; nada de ella se conserva como compilación.

Nivel de evidencia: host. `electron/toolWorkerHost.test.ts` ejecuta procesos hijo
reales: un proceso atascado en un bucle se mata y desaparece de verdad mientras el
llamador sigue funcionando, y el proceso real compila un proyecto y cancela una
ejecución de escenarios sobre el runtime nativo. El recorrido 35 de
`bun run test:journeys` cancela una ejecución larga en la aplicación real, ve que
la ventana responde todo el tiempo y no encuentra ningún proceso de la ejecución
(requisito IDE-012). Las pruebas empaquetadas de más abajo también compilan el
proyecto y ejecutan sus escenarios en la aplicación empaquetada, que arranca el
proceso desde su archivo y el runtime nativo desde sus recursos.

## Propiedades de seguridad, demostradas por comportamiento

El renderer no tiene privilegios, y esto es lo que hace la aplicación en
ejecución, no lo que dice su código fuente:

- un script en línea, y un manejador de evento en línea, que inyecta una página se
  bloquean por la política de seguridad de contenido (`script-src 'self'` en una
  compilación empaquetada), y una petición a otro origen la rechaza `connect-src`;
- un permiso distinto de serial (notificaciones, ubicación, cámara, micrófono,
  lectura del portapapeles, MIDI) se rechaza, mientras que serial sigue disponible
  para el documento de Studio;
- `window.open`, un enlace que abre una ventana nueva y la navegación a otro origen
  se rechazan, y la ventana conserva después su documento, su carpeta y su IPC;
- una operación de proyecto con una ruta con `..`, una ruta absoluta o de unidad,
  un enlace a un archivo o a una carpeta que sale del proyecto, una escritura de
  tamaño excesivo o el identificador de carpeta de otra ventana se rechaza, y nada
  fuera del proyecto cambia.

Nivel de evidencia: host. El recorrido 38 de `bun run test:journeys` hace estas
pruebas en el host de desarrollo (que sirve sus propios scripts en línea para la
recarga en caliente, así que allí no se hace la prueba del script en línea). Para
hacerlas todas sobre una aplicación empaquetada en Linux, construya un paquete
desempaquetado y ejecute las pruebas contra él:

```bash
bun run --cwd packages/zplc-ide build:assets
bun run --cwd packages/zplc-ide build
bun run --cwd packages/zplc-ide electron:compile
(cd packages/zplc-ide && bunx electron-builder --linux --dir)
ZPLC_PACKAGED_DIST="$PWD/packages/zplc-ide/dist-electron" bun run test:journeys
```

El archivo empaquetado no tiene diálogo de carpetas, así que las pruebas llegan al
proyecto mediante una lista de proyectos recientes escrita antes en el directorio
de datos de usuario de la aplicación. Cubren solo Linux: la aplicación empaquetada
en macOS y Windows no se prueba (el requisito IDE-016 pide las tres).

## Un solo proyecto de referencia

Build, Test, Simulate y la revisión de candidatos actúan sobre la carpeta que
muestra la ventana, y sobre ninguna otra. El proceso principal es el dueño de esa
carpeta: el diálogo nativo de carpetas le da a la ventana una carpeta y un
identificador opaco para ella. Una compilación, una comprobación de seguridad o
una ejecución de pruebas nombra el espacio de trabajo y ese identificador, y el
proceso principal rechaza la llamada cuando el identificador no es la carpeta
actual de la ventana, o cuando el espacio de trabajo pertenece a otra carpeta (un
espacio de trabajo hecho para un proyecto anterior, o un `zplc.json` elegido en
otro lugar). Abrir otra carpeta deja por tanto inservible todo espacio de trabajo
anterior, sin un paso de enlace de por medio.

Nivel de evidencia: host. `electron/workspaceTestGateway.test.ts`,
`electron/ipcRegistry.test.ts` y `electron/security.test.ts` cubren la regla, y el
recorrido 34 de `bun run test:journeys` envía por el puente de la aplicación real
mensajes de compilación, de comprobación de seguridad y de pruebas fabricados,
después de abrir otra carpeta, y comprueba que cada uno es rechazado (requisito
IDE-002).

## Configuración del proyecto

`zplc.json` define los metadatos del proyecto, el destino, las tareas y las
fuentes. La placa elegida se compara con el perfil del catálogo durante cada
operación; no importa por sí sola un modelo de capacidades ni certifica un
cableado.

Los ejemplos se copian a una carpeta de destino que usted elige. No existe un
modo de proyecto virtual o en memoria. Consulte la [migración](./migration-v1-to-v2.md)
para saber cómo llevar a una carpeta un proyecto de la versión 1.
