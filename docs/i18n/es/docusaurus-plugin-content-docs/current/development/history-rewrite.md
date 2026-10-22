---
slug: /development/history-rewrite
title: Reescritura única del historial
sidebar_label: Reescritura del historial
description: Qué elimina la única reescritura del historial de la decisión D-05, por qué, dónde vive el espejo del historial anterior y cómo un colaborador restablece o vuelve a clonar un clon existente.
---

# Reescritura única del historial

La decisión D-05 (requisito DOC-027) reescribe el historial de Git una sola
vez, para eliminar un esquemático de placa de terceros y varios árboles de
compilación que se confirmaron por error. Esta página explica qué se elimina,
por qué, dónde se conserva el historial anterior y qué debe hacer usted con un
clon existente.

:::caution Estado
El repositorio del mantenedor se reescribió el 2026-10-22: el commit de la
línea base `b379d82` ahora es `6b73a0c`, y se reescribieron 1688 commits, uno
por uno. El espejo del historial anterior y su bundle se guardan en la máquina
del mantenedor hasta que se publiquen como repositorio de solo lectura. El
force-push a GitHub todavía no se hizo; mientras no se haga, los comandos para
colaboradores de más abajo no aplican.
:::

## Qué se elimina y por qué

La lista está en `tools/history/removed-paths.txt`, una ruta por línea con su
motivo. Solo se elimina contenido de dos tipos.

| Ruta                                                                                                                                  | Tipo                                                              | Tamaño en el historial         | Motivo                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `Screenshots/mb1940-n657x0q-c02-schematic.pdf`                                                                                        | Esquemático de terceros                                           | 34 MB                          | El archivo no es nuestro para redistribuirlo.                                                                                  |
| Cuatro directorios de compilación de Zephyr bajo `firmware/app`: `build_esp32s3`, `build_verify_esp32s3`, `build_disco`, `build_giga` | Árboles de compilación de Zephyr (ELF, map, bibliotecas, objetos) | unos 390 MB antes de comprimir | Las salidas de compilación nunca son código fuente. Se confirmaron una vez y siguen en el historial de las etiquetas `v1.5.0`. |
| El directorio `build_tests` bajo `firmware/app`                                                                                       | Salida de configuración de CMake                                  | 8 KB                           | Es un directorio de compilación; todavía está versionado en algunas ramas.                                                     |

Todo lo demás permanece, incluidas las imágenes de la documentación, los
archivos de prueba que leen los tests, las capturas de `Screenshots/` y el
sitio generado de la rama `gh-pages`. Después de la reescritura el repositorio
pesa alrededor de una cuarta parte (un ensayo sobre una copia completa pasó de
213 MiB a 53 MiB en disco).

La reescritura conserva todos los commits: la misma cantidad en cada rama, los
mismos mensajes y autores, los mismos árboles menos las rutas anteriores. Solo
cambian los SHA de los commits.

## Dónde está el historial anterior

Antes de la reescritura, la herramienta crea un espejo completo
(`git clone --mirror`) y un bundle (`git bundle create --all`) fuera del
repositorio, verifica que cada punta de rama y la línea base anterior `b379d82`
se resuelvan en ambos, y guarda junto a ellos la tabla que asocia cada SHA
antiguo con su SHA nuevo (`commit-map`). Un SHA antiguo citado en una
incidencia, un registro o la especificación sigue siendo resoluble:

```bash
git clone --mirror <ubicacion-del-espejo> zplc-pre-rewrite.git
git -C zplc-pre-rewrite.git show b379d82
grep ^b379d82 zplc-pre-rewrite.meta/commit-map   # SHA antiguo y luego SHA nuevo
```

El espejo es historial de solo lectura. No haga push desde él.

## Restablecer o volver a clonar un clon existente

Lo más simple y seguro es un clon nuevo:

```bash
git clone https://github.com/eduardojvieira/ZPLC.git ZPLC-new
```

Para conservar un clon que ya tiene, sin trabajo local que no esté publicado:

```bash
git fetch --all --tags --force --prune
git checkout master
git reset --hard origin/master
git reflog expire --expire=now --all && git gc --prune=now
```

Si tiene ramas locales con trabajo que nunca se publicó, pase cada una al
historial nuevo antes de limpiar. `<base-antigua>` es el SHA antiguo del commit
desde el que partió su rama, que su clon todavía tiene:

```bash
git rebase --onto origin/master <base-antigua> mi-rama
```

Un worktree no necesita un paso especial: después del fetch, ejecute
`git reset` (mixto) en él si `git status` muestra archivos modificados que
usted no tocó. Los archivos de las rutas eliminadas quedan en disco como
archivos sin seguimiento; bórrelos si no los necesita.

## Para el mantenedor

Ejecute la herramienta desde la raíz del repositorio, en la copia de trabajo principal,
cuando todas las demás ramas estén integradas y todos los worktrees estén
limpios (el único cambio tolerado es `.atl/skill-registry.md` en la copia de
trabajo principal):

```bash
tools/history/rewrite-history.sh --rehearse ~/.cache/zplc-history/rehearsal   # una copia; no cambia nada real
tools/history/rewrite-history.sh --apply                                      # la reescritura real
```

`--apply` comprueba la versión fijada de `git-filter-repo`, rechaza un
worktree sucio, un merge o rebase sin terminar y un stash, crea el espejo y el
bundle en `~/Backups/zplc-pre-rewrite-<fecha>`, respalda los archivos locales
del checkout principal, reescribe todas las ramas y etiquetas sin descartar
ningún commit, actualiza cada worktree, verifica el resultado e imprime los
comandos de push. Nunca hace push: el force-push y la publicación del espejo
son decisión del propietario.

Envíe solo las ramas que ya existen en `origin`, desde sus ramas de seguimiento
remoto reescritas, más la rama 2.0 y las etiquetas. No use
`git push --force --all`: publica todas las ramas locales, y este repositorio
tiene muchas más ramas locales que `origin`. El bucle siguiente funciona en
cualquier shell POSIX; en zsh, `$b:r` es un modificador, por eso la variable se
escribe `"${b}"`.

```sh
git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin | while read -r b; do
  [ "${b}" = HEAD ] || git push --force origin "refs/remotes/origin/${b}:refs/heads/${b}"
done
git push --force origin refs/heads/zplc-2.0-candidate:refs/heads/zplc-2.0-candidate
git push --force --tags origin
```

`git-filter-repo` elimina por defecto el remoto `origin`. La herramienta lo
ejecuta con `--partial` para que el remoto y las ramas de seguimiento remoto
queden como estaban.

Entre la reescritura y el force-push, no ejecute `git fetch` ni `git pull`
desde `origin` en el repositorio reescrito: el remoto todavía tiene el historial
anterior, y un fetch lo vuelve a traer a las ramas de seguimiento remoto y un
pull lo fusiona en una rama local. Primero haga el force-push y después el fetch.
