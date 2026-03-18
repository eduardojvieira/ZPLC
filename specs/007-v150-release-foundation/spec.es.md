# Especificacion de Funcionalidad: Base de Release ZPLC v1.5.0

**Feature Branch**: `007-v150-release-foundation`
**Created**: 2026-03-12
**Status**: Draft
**Input**: Pedido del usuario para preparar una v1.5.0 seria que mejore la salud del repositorio, complete el alcance previsto de lenguajes IEC y protocolos de comunicacion, verifique el IDE en plataformas desktop, valide simulacion/debugging, alinee las placas soportadas con la realidad y rehaga la documentacion y GitHub Pages en ingles y espanol.

## Aclaraciones

### Sesion 2026-03-12

- P: Que tipo de release es v1.5.0? -> R: Una release de estabilizacion y completitud basada en la verdad, no un paraguas de marketing para trabajo inconcluso.
- P: Los lenguajes no-ST pueden seguir implementados mediante transpilation a ST? -> R: Si, siempre que la arquitectura quede documentada explicitamente y la paridad de comportamiento quede probada con tests y ejemplos.
- P: Los agentes de AI pueden hacer toda la validacion? -> R: No. Los agentes de AI pueden hacer codigo, docs, cleanup, CI y verificacion automatizada, pero la validacion operada por humanos es obligatoria para comportamiento desktop multiplataforma, workflows visuales de debugging y aceptacion sobre hardware fisico.
- P: Que pasa con los claims que no esten totalmente verificados al momento de release? -> R: Deben salir del conjunto de claims de v1.5.0 o quedar marcados como experimentales; no se arrastran en silencio a las release notes.

## Posicionamiento de la Release

Esta especificacion define que significa una `v1.5.0` seria para ZPLC.

La release no se considera terminada cuando el codigo simplemente existe. La release se considera terminada cuando:

1. El repositorio esta limpio, es determinista y confiable.
2. Las capacidades declaradas del producto coinciden con evidencia verificada.
3. El soporte de lenguajes IEC es conductualmente completo y esta documentado.
4. Modbus TCP/RTU y MQTT estan completos en runtime, compilador, IDE y documentacion.
5. El IDE se compila y valida en macOS, Linux y Windows.
6. La simulacion, el debugging y los claims de placas soportadas se verifican, no se asumen.
7. La documentacion en ingles y espanol se convierte en una fuente de verdad real.

## Foto del Estado Actual

- El repositorio hoy contiene output generado de build y artefactos temporales trackeados que no deberian formar parte de una baseline de release.
- El bookkeeping de specs esta desactualizado: hay trabajo completado todavia sin marcar, mientras siguen existiendo specs placeholder abandonados.
- ST es el camino de lenguaje mas fuerte; LD, FBD, SFC e IL dependen principalmente de transpilation a ST.
- Existe plumbing de comunicacion por VM, pero el comportamiento de los FB de MQTT y Modbus no esta completamente terminado ni completamente verificado.
- Los perfiles de placas del IDE hoy afirman mas placas de las que soportan los overlays de firmware y la matriz de verificacion.
- La estructura de documentacion mejoro, pero navegacion, duplicacion, contenido obsoleto y paridad ingles/espanol todavia no estan a nivel release.

---

## Escenarios de Usuario y Testing _(mandatory)_

### Historia de Usuario 1 - El Ingeniero de Release Confia en el Repositorio (Priority: P1)

Un maintainer necesita cortar `v1.5.0` desde un repositorio limpio, determinista y libre de artefactos engañosos.

**Por que esta prioridad**: Ninguna release seria puede ser confiable si siguen existiendo output generado de build, archivos duplicados, specs placeholder y claims obsoletos dentro del source tree.

**Prueba Independiente**: Un checkout limpio de la rama de release no contiene artefactos temporales trackeados, ni directorios de build trackeados usados como dependencias ocultas, ni specs placeholder activos fingiendo trabajo real.

**Escenarios de Aceptacion**:

1. **Dado** un checkout limpio de la rama de release, **Cuando** un maintainer inspecciona los archivos trackeados, **Entonces** output generado de build, artefactos temporales de debug, archivos fuente duplicados y outputs de scratch obsoletos DEBERAN estar ausentes de la fuente de verdad trackeada.
2. **Dado** que la app de firmware se configura desde source, **Cuando** el build genera protobufs o assets derivados requeridos, **Entonces** DEBERA hacerlo desde inputs fuente canonicos, no desde un fallback apoyado en un directorio de build commiteado.
3. **Dado** que `specs/` forma parte de la revision de release, **Cuando** un maintainer revisa las especificaciones activas, **Entonces** los specs placeholder DEBERAN archivarse, salir del alcance activo o completarse, y los specs restantes DEBERAN reflejar con precision el estado real de release.

---

### Historia de Usuario 2 - El Ingeniero de Control Usa Cualquier Lenguaje IEC Soportado Sin Huecos Ocultos (Priority: P1)

Un ingeniero PLC quiere escribir logica en ST, IL, LD, FBD o SFC y obtener un comportamiento consistente de compilacion, runtime, debugging y documentacion.

**Por que esta prioridad**: El objetivo del usuario para v1.5.0 exige cobertura completa de lenguajes IEC tanto en runtime como en IDE, sin cabos sueltos.

**Prueba Independiente**: Una suite canonica de lenguajes compila y ejecuta programas equivalentes en ST, IL, LD, FBD y SFC, incluyendo timers, matematica, logica booleana, tareas y uso de FB de comunicacion donde corresponda.

**Escenarios de Aceptacion**:

1. **Dado** que existe un programa de muestra canonico en cada lenguaje soportado, **Cuando** se compila para el mismo target de runtime, **Entonces** el comportamiento resultante DEBERA ser equivalente a nivel bytecode/runtime.
2. **Dado** que LD, FBD, SFC o IL estan implementados mediante transpilation a ST, **Cuando** la documentacion de release describe la arquitectura de lenguajes, **Entonces** el camino de transpilation DEBERA documentarse explicitamente como arquitectura soportada en lugar de quedar insinuado.
3. **Dado** que un usuario edita un programa en cualquier lenguaje soportado, **Cuando** lo compila, simula y depura en el IDE, **Entonces** el workflow DEBERA funcionar de punta a punta o quedar documentado explicitamente como fuera de alcance para ese lenguaje en v1.5.0.
4. **Dado** que un lenguaje tiene una limitacion real en v1.5.0, **Cuando** se cierra el alcance de release, **Entonces** la limitacion DEBERA documentarse y el claim de marketing DEBERA reducirse en consecuencia.

---

### Historia de Usuario 3 - El Ingeniero de Automatizacion Usa Modbus TCP/RTU y MQTT Como Features Reales de Producto (Priority: P1)

Un ingeniero de automatizacion necesita que Modbus TCP, Modbus RTU y MQTT se comporten como features completas de producto a traves de runtime, compilador, configuracion de IDE y lenguajes IEC.

**Por que esta prioridad**: Este es un objetivo central de v1.5.0 y uno de los mayores gaps entre los claims actuales y la realidad verificada.

**Prueba Independiente**: Los proyectos de ejemplo de protocolos compilan desde cada camino de lenguaje soportado, ejecutan sin bloquear el scan cycle y pasan tests host especificos de protocolo mas verificacion con hardware cuando corresponda.

**Escenarios de Aceptacion**:

1. **Dado** que un usuario configura Modbus RTU o TCP en el IDE, **Cuando** despliega el proyecto, **Entonces** la configuracion de runtime generada DEBERA coincidir con las capacidades de placa/red/serie seleccionadas.
2. **Dado** que se usa un FB `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL` o `MB_WRITE_COIL`, **Cuando** `COUNT` es mayor que uno o se setea un parametro de protocolo, **Entonces** el runtime DEBERA respetar el contrato completo o la feature no podra salir como completa en v1.5.0.
3. **Dado** que un usuario llama `MQTT_CONNECT`, `MQTT_PUBLISH` o `MQTT_SUBSCRIBE`, **Cuando** las operaciones del broker tienen exito o fallan, **Entonces** el handshake del FB (`BUSY`, `DONE`, `ERROR`, `STATUS`) DEBERA seguir siendo determinista y no bloqueante.
4. **Dado** que un bloque de protocolo esta disponible en ST, **Cuando** se usa el mismo bloque en IL, LD, FBD o SFC-derivado-a-ST, **Entonces** el compilador y el IDE DEBERAN exponer un contrato equivalente y soportado.
5. **Dado** que las features de protocolo estan documentadas, **Cuando** un usuario lee la documentacion, **Entonces** DEBERA encontrar pasos de configuracion, ejemplos, limites, semantica de status y guia de troubleshooting en ingles y espanol.

---

### Historia de Usuario 4 - Los Builds Desktop del IDE y los Workflows de Debug Estan Verificados en Plataformas Reales (Priority: P1)

Un maintainer necesita compilar y validar el IDE en macOS, Linux y Windows, y confirmar que las features de simulacion y debugging funcionan en la practica.

**Por que esta prioridad**: El soporte desktop multiplataforma y la credibilidad del debugging son objetivos explicitos de release, y no se pueden afirmar honestamente solo leyendo el source.

**Prueba Independiente**: El IDE se compila para las tres plataformas desktop y un operador humano corre un checklist comun de smoke test que cubre compile, open project, simulate, deploy, debug, breakpoints, watch table, visual inspection y force value.

**Escenarios de Aceptacion**:

1. **Dado** que el workflow de release construye artefactos desktop para macOS, Linux y Windows, **Cuando** los artefactos se producen, **Entonces** DEBERAN poder instalarse y lanzar correctamente en cada plataforma.
2. **Dado** que se abre un proyecto de ejemplo en el IDE en cada plataforma, **Cuando** el operador lo compila y ejecuta en simulacion, **Entonces** el estado esperado del runtime DEBERA ser visible a traves de la UI.
3. **Dado** que existe una sesion de debug conectada a hardware, **Cuando** el operador setea breakpoints, hace step, fuerza valores y usa la watch table, **Entonces** esos workflows DEBERAN comportarse correctamente o el problema DEBERA bloquear el sign-off de release.
4. **Dado** que un paso de validacion es sensible al entorno, **Cuando** la automatizacion por AI no puede probarlo de punta a punta, **Entonces** se DEBERA requerir un registro de evidencia propiedad de un humano antes de marcar completa la release gate.

---

### Historia de Usuario 5 - Los Claims de Placas Soportadas Coinciden con Overlays, Builds y Tests Reales (Priority: P1)

Un ingeniero de firmware necesita confianza en que cada placa declarada como soportada esta realmente representada por overlays/configs mantenidos y builds verificados.

**Por que esta prioridad**: El drift del soporte de placas hace perder tiempo de ingenieria y destruye la confianza en release notes y configuracion del IDE.

**Prueba Independiente**: La matriz de placas soportadas en firmware, IDE, README y docs resuelve a la misma lista, y cada placa listada compila correctamente o queda clasificada explicitamente como experimental.

**Escenarios de Aceptacion**:

1. **Dado** que una placa aparece en el IDE, README o docs como soportada, **Cuando** ocurre la revision de release, **Entonces** DEBERA existir un config/overlay de firmware mantenido y un build path correspondiente.
2. **Dado** que una placa carece de overlay, build proof o validacion de runtime, **Cuando** se finaliza la matriz de soporte de v1.5.0, **Entonces** la placa DEBERA salir de la lista de soportadas o bajar a experimental.
3. **Dado** que la release de runtime incluye multiples placas, **Cuando** corren CI y la validacion de release, **Entonces** la matriz de soporte documentada DEBERA ser igual a la matriz realmente verificada.

---

### Historia de Usuario 6 - La Documentacion y GitHub Pages Se Convierten en un Activo Real del Producto (Priority: P1)

Un usuario que evalua, construye, integra u opera ZPLC necesita documentacion bilingue, completa y actual, en lugar de contenido disperso o contradictorio dentro del repositorio.

**Por que esta prioridad**: El usuario quiere explicitamente rehacer la documentacion y el sitio de GitHub Pages como una base seria para el proyecto.

**Prueba Independiente**: Un usuario nuevo puede ir desde la landing page hasta build, run, simulate, deploy, debug y uso de protocolos usando solo el sitio de documentacion en ingles o espanol.

**Escenarios de Aceptacion**:

1. **Dado** que un usuario visita el sitio de docs por primera vez, **Cuando** sigue la guia de quickstart, **Entonces** DEBERA encontrar un camino coherente para setup, build, run y primera ejecucion de programa.
2. **Dado** que un usuario necesita guia sobre protocolos, **Cuando** navega docs de runtime, IDE o lenguajes, **Entonces** DEBERA encontrar setup de protocolos, ejemplos, referencia de FB, semantica de status y mapeos por lenguaje soportado.
3. **Dado** que el sitio de docs sale con contenido en ingles y espanol, **Cuando** ocurre la revision de release, **Entonces** DEBERAN existir paginas canonicas en ambos idiomas con alcance equivalente.
4. **Dado** que una pagina esta obsoleta, duplicada o huerfana de la navegacion, **Cuando** se finaliza el cleanup de docs, **Entonces** DEBERA eliminarse, redirigirse o fusionarse dentro del conjunto de paginas canonicas.

---

### Historia de Usuario 7 - Los Maintainers Pueden Separar el Trabajo de AI del Trabajo de Validacion Humana (Priority: P2)

Un lider del proyecto necesita un plan de release que distinga explicitamente que puede hacer un agente de AI y que debe validar una persona sobre maquinas y hardware reales.

**Por que esta prioridad**: El usuario pidio explicitamente un spec que tenga en cuenta tanto el trabajo de agentes de AI como el trabajo exclusivo del owner.

**Prueba Independiente**: La matriz de aceptacion de release asigna cada gate a `AI`, `Human` o `Shared`, y ningun gate sensible al entorno se marca como completo sin la evidencia requerida del owner.

**Escenarios de Aceptacion**:

1. **Dado** que una tarea es de codigo, documentacion, cleanup o verificacion automatizada, **Cuando** se crea la planificacion de implementacion, **Entonces** PUEDE asignarse a un agente de AI.
2. **Dado** que una tarea requiere observacion de UX desktop, interaccion con dispositivo fisico, comportamiento de instalacion especifico de OS o acceso al laboratorio de placas, **Cuando** se asigna ownership, **Entonces** DEBERA incluir un owner humano.
3. **Dado** que se usa codigo generado por AI para corregir un problema de plataforma o hardware, **Cuando** el fix se mergea, **Entonces** el paso de validacion propiedad del humano DEBERA correrse otra vez antes del sign-off.

---

### Casos Limite

- **Assets generados trackeados se vuelven parte accidental del contrato de build**: La release debe eliminar dependencias ocultas hacia directorios de build commiteados.
- **La paridad de lenguajes existe solo en el papel**: Si los lenguajes no-ST dependen de transpilation a ST, la paridad debe probarse, no asumirse.
- **Una placa aparece en el IDE pero no tiene soporte de firmware**: La placa debe degradarse o completarse antes de la release.
- **Una feature existe en codigo pero no tiene prueba operativa**: No puede declararse como completa en las release notes.
- **La documentacion dice una cosa y el codigo otra**: La documentacion debe corregirse antes de release; comentarios de codigo y docs obsoletas no pueden convivir como verdades en competencia.
- **La simulacion pasa pero el debugging sobre hardware falla**: La gate de release sigue abierta hasta que se achique el supported scope o se corrija el bug y se revalide.
- **El contenido en ingles esta completo pero el espanol viene atras**: Las docs de v1.5.0 no estan terminadas hasta alcanzar paridad en las paginas canonicas.

---

## Requisitos _(mandatory)_

### Requisitos Funcionales

#### Higiene del Repositorio y Veracidad

- **FR-001**: El repositorio MUST remover output generado de build trackeado, artefactos temporales, archivos scratch duplicados y outputs de debug obsoletos de la rama de release.
- **FR-002**: El build de firmware MUST generar assets derivados desde inputs fuente canonicos o desde una ubicacion canonica de generated source claramente mantenida; MUST NOT depender de un fallback apoyado en un directorio de build commiteado.
- **FR-003**: Los specs activos de release MUST reflejar la realidad. Los specs placeholder o abandonados dentro del alcance activo de release MUST completarse, archivarse o marcarse explicitamente como inactivos antes del sign-off de v1.5.0.
- **FR-004**: README, configuracion del IDE, docs, specs y release notes MUST describir solo features y placas realmente verificadas para v1.5.0.
- **FR-005**: La rama de release MUST ser reproducible desde un checkout limpio usando comandos documentados y prerequisitos documentados.

#### Cobertura de Lenguajes IEC 61131-3

- **FR-006**: v1.5.0 MUST definir y documentar el pipeline canonico de lenguajes para ST, IL, LD, FBD y SFC desde authoring hasta bytecode/ejecucion en runtime.
- **FR-007**: El soporte de lenguajes para v1.5.0 MUST medirse por equivalencia de comportamiento y completitud del workflow de usuario, no por si cada lenguaje tiene un backend separado.
- **FR-008**: Si IL, LD, FBD o SFC se compilan mediante transpilation a ST, esa arquitectura MUST documentarse como un diseno intencional y soportado para v1.5.0.
- **FR-009**: Cada lenguaje soportado MUST tener ejemplos a nivel release, cobertura de compilacion y documentacion, incluyendo uso de comunicacion cuando aplique.
- **FR-010**: El IDE MUST proveer un camino soportado de authoring y compilacion para cada lenguaje declarado. El soporte basado en texto es aceptable cuando la edicion visual no forma parte de la promesa de producto para ese lenguaje.
- **FR-011**: Cualquier limitacion de lenguaje que permanezca en v1.5.0 MUST documentarse explicitamente y reflejarse en los claims de release.

#### Completitud de Modbus TCP/RTU y MQTT

- **FR-012**: El soporte de cliente Modbus RTU y Modbus TCP MUST estar completo a traves de runtime, compilador, configuracion del IDE y documentacion para el alcance soportado de v1.5.0.
- **FR-013**: Las implementaciones de FB de Modbus MUST respetar sus inputs y outputs documentados, incluyendo address, modo de protocolo, comportamiento de host/port y semantica multi-valor o `COUNT` donde se afirme.
- **FR-014**: El soporte MQTT MUST incluir comportamiento completo y determinista para `MQTT_CONNECT`, `MQTT_PUBLISH` y `MQTT_SUBSCRIBE`, incluyendo scan no bloqueante y manejo significativo de status/error.
- **FR-015**: Los FB de protocolo MUST estar disponibles por los caminos de lenguajes soportados para ST, IL, LD, FBD y SFC-derivado-a-ST.
- **FR-016**: El IDE MUST exponer flujos de configuracion orientados al usuario para Modbus RTU, Modbus TCP y MQTT que correspondan a capacidades reales del runtime.
- **FR-017**: La documentacion de protocolos MUST incluir setup, ejemplos, semantica de status, limites, manejo de errores, troubleshooting y guia de uso por lenguaje en ingles y espanol.
- **FR-018**: Los wrappers cloud mas alla de MQTT generico MAY salir solo si se verifican por separado con el mismo estandar de release; de lo contrario SHALL quedar fuera del conjunto de claims de feature completa de v1.5.0.

#### Build Desktop del IDE, Simulacion y Debugging

- **FR-019**: El proceso de release MUST construir artefactos del IDE para macOS, Linux y Windows.
- **FR-020**: Se MUST ejecutar un smoke test operado por un humano en cada plataforma desktop target, cubriendo install/launch, open project, compile, simulation, deployment y debugging.
- **FR-021**: La validacion de simulacion y debugging para v1.5.0 MUST cubrir breakpoints, step/continue, visual inspection, force value, comportamiento de watch table y feedback de status/error.
- **FR-022**: Los agentes de AI MAY implementar automatizacion, tests, CI, fixes y documentacion para workflows del IDE, pero MUST NOT afirmar validacion multiplataforma sin evidencia corrida por humanos.
- **FR-023**: Cualquier limitacion de seguridad conocida en los flujos de deployment o debugging MUST documentarse claramente, y MUST NOT aparecer claims de seguridad de produccion no soportados en materiales de release.

#### Placas Soportadas y Verificacion del Runtime

- **FR-024**: La matriz de placas soportadas en firmware, IDE, README, docs y release notes MUST resolver a una unica fuente de verdad consistente para v1.5.0.
- **FR-025**: Cada placa declarada como soportada MUST tener archivos de configuracion u overlay de firmware mantenidos y un build path documentado.
- **FR-026**: Cada placa soportada MUST compilar correctamente bajo el proceso de validacion de release, o SHALL salir de la lista de soportadas.
- **FR-027**: La release MUST incluir validacion HIL humana sobre hardware representativo cubriendo al menos una placa orientada a serial y una placa con capacidad de red, salvo que la matriz final soportada sea mas chica.
- **FR-028**: Las placas presentes en selectores del IDE sin soporte correspondiente en firmware MUST completarse, reclasificarse como experimentales o eliminarse antes de release.

#### Documentacion y GitHub Pages

- **FR-029**: El sitio de documentacion MUST convertirse en la fuente canonica de verdad para la guia de producto orientada al usuario.
- **FR-030**: Las docs MUST incluir quickstart, build, run, deployment, debugging, ejemplos, placas soportadas, arquitectura, runtime, IDE, configuracion de protocolos y cobertura de referencia de function blocks.
- **FR-031**: Cada bloque de comunicacion soportado y cada bloque relevante de biblioteca/stdlib incluido en v1.5.0 MUST documentarse con mapeo por lenguaje y ejemplos de uso.
- **FR-032**: Las docs en ingles y espanol MUST salir con paridad para todas las paginas canonicas requeridas por v1.5.0.
- **FR-033**: Sidebars/navegacion MUST exponer todas las paginas canonicas; paginas huerfanas y variantes duplicadas de un mismo tema MUST eliminarse, redirigirse o fusionarse.
- **FR-034**: README.md MUST seguir siendo la entrada corta del repositorio para humanos, mientras AGENTS.md permanece como punto de entrada para AI/contribuidores.
- **FR-035**: El deployment a GitHub Pages MUST seguir siendo reproducible y alineado con la estructura final de docs y el enfoque final de versionado.

#### Gobernanza de Release y Ownership

- **FR-036**: v1.5.0 MUST mantener una matriz de aceptacion de release que asigne cada gate a ownership `AI`, `Human` o `Shared`.
- **FR-037**: Una gate marcada como `Human` MUST incluir evidencia explicita del owner antes del sign-off de release.
- **FR-038**: Una gate marcada como `Shared` MUST identificar que parte es automatizada o asistida por AI y que parte es validacion humana.
- **FR-039**: v1.5.0 MUST preferir reducir claims no soportados antes que enviar alcance ambiguo o parcialmente verificado.

### Entidades Clave

- **Matriz de Evidencia de Release**: La tabla de release gates, ownership, metodo de validacion y estado usada para decidir si v1.5.0 es real.
- **Camino de Lenguaje Soportado**: La ruta completa desde authoring hasta runtime para un lenguaje, incluyendo modelo de editor, transpilation o compilacion, generacion de bytecode, debugging y documentacion.
- **Matriz de Placas Soportadas**: La lista canonica de placas que tienen overlays/configs, prueba de compilacion y clasificacion de soporte documentada.
- **Contrato de Feature de Protocolo**: La definicion combinada de comportamiento de Modbus RTU, Modbus TCP y MQTT a traves de runtime/compilador/IDE/documentacion.
- **Conjunto Canonico de Docs**: El conjunto de paginas en ingles y espanol que forma la unica fuente de verdad para la documentacion del producto.

---

## Modelo de Ejecucion y Ownership

### Trabajo Elegible para Agentes de AI

- Planificacion e implementacion de cleanup del repositorio.
- Fixes de codigo en runtime, compilador, IDE, CI y documentacion.
- Tests automatizados, scripts de smoke, fixtures de protocolo y actualizaciones de pipelines de build.
- Redaccion de matrices de aceptacion, checklists de release y mantenimiento del spec.
- Authoring de documentacion y scaffolding de traducciones.

### Trabajo Obligatoriamente Humano

- Validacion desktop sobre entornos reales de macOS, Linux y Windows.
- Validacion manual de UI para simulacion y workflows de debugging.
- Flasheo de placas fisicas, ejecucion HIL y troubleshooting de hardware/red.
- Aprobacion final de la matriz de placas soportadas y del conjunto de claims de release.
- Sign-off final de release basado en evidencia observada.

### Trabajo Compartido

- El humano captura evidencia de fallas de plataforma o hardware.
- La AI analiza logs, propone fixes y actualiza codigo/tests/docs.
- El humano vuelve a correr la validacion sensible al entorno para cerrar la gate.

---

## Fuera de Alcance para v1.5.0 Salvo Re-scope Explicito

- Nuevas familias de protocolos mas alla de Modbus TCP, Modbus RTU y MQTT generico.
- Endurecimiento de seguridad/autenticacion mas alla de documentar honestamente las limitaciones actuales de debug/deploy, salvo que se agregue explicitamente al alcance.
- Agrandar los claims de placas sin overlays, builds y validacion correspondientes.
- Sacar como completo functionality cloud wrapper solo porque existe codigo parcial.

---

## Criterios de Exito _(mandatory)_

### Resultados Medibles

- **SC-001**: Un checkout limpio de release no contiene ningun directorio de build generado trackeado, ningun artefacto temporal de debug y ningun archivo fuente scratch duplicado.
- **SC-002**: Los programas canonicos de ejemplo para ST, IL, LD, FBD y SFC compilan correctamente y demuestran comportamiento equivalente esperado para el alcance soportado de v1.5.0.
- **SC-003**: Modbus RTU, Modbus TCP y MQTT pasan tests automatizados a nivel release y ningun FB de protocolo listado como completo devuelve `not supported` en runtime.
- **SC-004**: Se construyen artefactos del IDE para macOS, Linux y Windows, y cada plataforma tiene un smoke test validado por un humano para install, launch, compile, simulate y debug.
- **SC-005**: La matriz de placas soportadas publicada en docs y en el IDE coincide exactamente con las placas que tienen overlays/configs mantenidos y validacion exitosa de release.
- **SC-006**: Las docs en ingles y espanol cubren todas las paginas canonicas de v1.5.0 sin navegacion huerfana, sin paginas duplicadas en conflicto y sin claims arquitectonicos obsoletos.
- **SC-007**: Las release notes y los claims visibles al producto describen solo capacidades verificadas y separan explicitamente el alcance soportado del experimental o futuro.
- **SC-008**: El plan de release v1.5.0 puede ejecutarse sin adivinanzas porque cada gate importante tiene owner, metodo de validacion y requisitos de evidencia.

### Supuestos

- El runtime de ZPLC sigue siendo una VM de bytecode con un modelo de ejecucion agnostico al lenguaje.
- Los lenguajes no-ST pueden seguir implementados mediante caminos de transpilation documentados y validados en v1.5.0.
- Parte de la validacion desktop y hardware no puede probarse completamente con ejecucion solo-AI en el entorno actual.
- La release debe priorizar credibilidad y completitud antes que maximizar el conjunto de claims.
