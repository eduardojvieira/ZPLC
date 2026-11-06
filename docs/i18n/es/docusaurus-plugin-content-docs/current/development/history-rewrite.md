---
slug: /development/history-rewrite
title: Reescritura única del historial
sidebar_label: Reescritura del historial
description: Qué elimina la única reescritura del historial de la decisión D-05, por qué, dónde vive el espejo del historial anterior y cómo un colaborador restablece o vuelve a clonar un clon existente.
---

# Reescritura única del historial

Lea esta página si tiene un clon del repositorio de ZPLC, o si lo mantiene. La decisión D-05 (requisito DOC-027) reescribe el historial de Git una sola vez, para eliminar el esquema de una placa de terceros y varios árboles de compilación que se confirmaron por error. La página dice qué se elimina, por qué, dónde se conserva el historial anterior y qué hacer con un clon existente.

:::caution Estado
El repositorio del mantenedor se reescribió el 2026-10-22: el commit de la línea base `b379d82` ahora es `6b73a0c`, y se reescribieron 1688 commits, uno por uno. El espejo del historial anterior y su bundle se guardan en la máquina del mantenedor hasta que se publiquen como repositorio de solo lectura. A esa fecha el force-push a GitHub todavía no se había hecho, y los comandos para colaboradores de más abajo se aplican solo después de hacerlo.

Para saber qué historial tiene su clon, ejecute `git cat-file -t b379d82`. Si imprime `commit`, su clon aún tiene el historial anterior. Si imprime un error "Not a valid object name", tiene el reescrito.
:::

## Qué se elimina y por qué

La lista está en `tools/history/removed-paths.txt`, una ruta por línea con su motivo. Solo se eliminan dos clases de contenido: un esquema que no podemos redistribuir y salidas de compilación.

| Ruta                                                                                                                     | Clase                                                  | Tamaño en el historial | Por qué                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- |
| `Screenshots/mb1940-n657x0q-c02-schematic.pdf`                                                                           | Esquema de terceros                                    | 34 MB                  | No podemos redistribuir el archivo.                                     |
| Cuatro directorios de compilación de Zephyr en `firmware/app`: `build_esp32s3`, `build_verify_esp32s3`, `build_disco`, `build_giga` | Árboles de compilación de Zephyr (ELF, map, bibliotecas, objetos) | unos 390 MB            | Las salidas de compilación nunca son código fuente. Se confirmaron por error. |
| El directorio `build_tests` en `firmware/app`                                                                            | Salida de configuración de CMake                       | 8 KB                   | Es un directorio de compilación; en algunas ramas sigue versionado.     |

Todo lo demás se queda, incluidas las imágenes de la documentación, los fixtures que leen las pruebas, las capturas de `Screenshots/` y el sitio generado en la rama `gh-pages`.

La reescritura conserva todos los commits: el mismo número de commits en cada rama, los mismos mensajes y autores, y los mismos árboles menos las rutas anteriores. Solo cambian los SHA de los commits.

## Dónde está el historial anterior

Antes de reescribir nada, la herramienta hace un espejo completo (`git clone --mirror`) y un bundle (`git bundle create --all`) fuera del repositorio. Comprueba que la punta de cada rama y la línea base anterior `b379d82` se resuelvan en ambos, y guarda junto a ellos la tabla que asigna cada SHA de commit anterior a su SHA nuevo (`commit-map`). Así, un SHA anterior citado en una incidencia, un registro o la especificación sigue siendo resoluble:

```bash
git clone --mirror <ubicación-del-espejo> zplc-pre-rewrite.git
git -C zplc-pre-rewrite.git show b379d82
grep '^b379d82' zplc-pre-rewrite.meta/commit-map   # SHA anterior y luego SHA nuevo
```

El espejo es historial de solo lectura. No haga push desde él.

## Actualizar un clon existente

La forma más simple y segura es un clon nuevo:

```bash
git clone https://github.com/eduardojvieira/ZPLC.git ZPLC-new
```

Para conservar un clon que ya tiene, cuando no tiene trabajo local sin publicar:

```bash
git fetch --all --tags --force --prune
git checkout master
git reset --hard origin/master
git reflog expire --expire=now --all && git gc --prune=now
```

Si tiene ramas locales con trabajo que nunca se publicó, traslade cada una al historial nuevo antes de limpiar. `<base-anterior>` es el SHA anterior del commit desde el que partió su rama, que su clon todavía tiene:

```bash
git rebase --onto origin/master <base-anterior> mi-rama
```

Un worktree no necesita ningún paso especial. Después del fetch, ejecute `git reset` (mixed) en él si `git status` muestra archivos modificados que usted no tocó. Los archivos de las rutas eliminadas quedan en disco como archivos sin seguimiento; bórrelos si no los necesita.

## Para quien mantiene el proyecto

Ejecute la herramienta desde la raíz del repositorio, en la copia de trabajo principal, después de que todas las demás ramas estén integradas y todos los worktrees estén limpios. El único cambio tolerado es `.atl/skill-registry.md` en la copia principal.

```bash
tools/history/rewrite-history.sh --rehearse ~/.cache/zplc-history/rehearsal   # una copia; no cambia nada real
tools/history/rewrite-history.sh --apply                                      # la reescritura real
```

`--print-args` muestra los argumentos de ruta que recibirá `git-filter-repo`. `--apply` acepta `--repo` y `--backup-prefix`. Hace estas cosas, en orden:

1. comprueba el `git-filter-repo` fijado (2.47.0) y rechaza un worktree sucio, un merge o rebase sin terminar, y cualquier referencia fuera de heads, tags y remotes (un stash es una);
2. hace el espejo y el bundle en `~/Backups/zplc-pre-rewrite-<fecha>` y respalda los archivos modificados, sin seguimiento y excluidos de git de la copia principal;
3. reescribe cada rama y etiqueta sin descartar ningún commit, y actualiza cada worktree;
4. verifica el resultado e imprime los comandos de push.

Nunca hace push. El force-push y la publicación del espejo son decisión del dueño del proyecto.

Haga push solo de las ramas que ya existen en `origin`, desde sus referencias remotas reescritas, más la rama 2.0 y las etiquetas. No use `git push --force --all`: publica todas las ramas locales, y este repositorio tiene muchas más ramas locales que `origin`. El bucle de abajo es seguro en shell POSIX. En zsh, `$b:r` es un modificador, por eso la variable se escribe `"${b}"`.

```sh
git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin | while read -r b; do
  [ "${b}" = HEAD ] || git push --force origin "refs/remotes/origin/${b}:refs/heads/${b}"
done
git push --force origin refs/heads/zplc-2.0-candidate:refs/heads/zplc-2.0-candidate
git push --force --tags origin
```

`git-filter-repo` elimina por omisión el remoto `origin`. La herramienta lo ejecuta con `--partial`, de modo que el remoto y las ramas de seguimiento remoto quedan como estaban.

:::warning No haga fetch antes del force-push
Entre la reescritura y el force-push, no ejecute `git fetch` ni `git pull` desde `origin` en el repositorio reescrito. El remoto todavía tiene el historial anterior: un fetch lo trae de vuelta a las ramas de seguimiento remoto, y un pull lo integra en una rama local. Haga primero el force-push y después el fetch.
:::
