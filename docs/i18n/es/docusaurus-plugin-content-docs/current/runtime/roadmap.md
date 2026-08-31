# Roadmap de desarrollo

ZPLC 2.0 es el RFC de implementación activo y aprobado. Se ejecuta por gates y
no tiene una fecha pública de entrega. Esta página aporta contexto histórico,
no un claim de release.

## Dirección actual

ZPLC 2.0 reescribe Studio y la orquestación en forma incremental alrededor del
core/HAL C99, ISA, compilador, runtimes POSIX y Zephyr, protocolo nativo y
editores existentes. El primer recorrido de calidad pública es: programar →
compilar → probar → simular → evidencia → flujo humano de hardware.

| Gate | Foco |
|---|---|
| G0 | Verdad, gobernanza, reproducibilidad y claims precisos |
| G1 | Verifier del runtime, scheduler, estado seguro y persistencia |
| G2 | Modelo de proyecto, compilador canónico, Tool API, CLI y Slice 0 |
| G3 | Studio Preview con workbench de ingeniería accesible |
| G4 | Flujo humano de hardware para dos placas calificadas con evidencia |
| G5 | Edits aislados de IA, MCP local y escenarios Lab deterministas |
| G6 | Learn, fiabilidad de lenguajes, localización y recuperación |
| G7 | Release GA firmado, reproducible y respaldado por evidencia |

Leé el [RFC completo de ZPLC 2.0 Foundation](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md)
para criterios de aceptación y exclusiones.

## Nota histórica

Entradas previas describían ambiciones amplias como cloud, marketplace, OTA
general y un diseñador HMI. No son compromisos de 2.0. El RFC activo las excluye
hasta probar los límites comunes de confianza y evidencia.
