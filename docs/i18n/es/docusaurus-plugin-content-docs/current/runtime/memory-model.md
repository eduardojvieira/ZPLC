# Modelo de Memoria

ZPLC mantiene un modelo de memoria acotado para preservar determinismo industrial.

## Principios

- Sin `malloc` en el core del VM.
- Memoria de trabajo aislada por tarea.
- Variables globales y retain compartidas solo a traves de contratos explicitos.
- Las caracteristicas de depuracion deben respetar el mismo limite de memoria.
