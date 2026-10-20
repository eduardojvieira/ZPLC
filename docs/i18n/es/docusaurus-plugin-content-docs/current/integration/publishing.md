---
id: publishing
title: Publicación de la documentación
sidebar_label: Publicación
description: Cómo se comprueba, se construye y se despliega la documentación de ZPLC en GitHub Pages, y cómo guardar una instantánea de una versión.
tags: [operations, docs, github-pages]
---

# Publicación de la documentación

La documentación de ZPLC se construye con Docusaurus y GitHub Actions la despliega en GitHub Pages.
Un cambio en una página se comprueba en dos flujos de trabajo antes de desplegarse.

## Las comprobaciones y el despliegue

### Cada pull request y cada push: el trabajo `docs-and-truth` de CI

El trabajo de `.github/workflows/ci.yml` ejecuta el validador de páginas y sus pruebas, las
comprobaciones de las referencias generadas, las de afirmaciones de la documentación y de
ejemplos ejecutables, y la construcción del sitio:

1. `python3 tools/docs/validate_docs_pages.py` rechaza una página que termina a media
   frase, una página que no está en la barra lateral y una página en inglés que no tiene
   su gemela en español con la misma estructura (o al revés).
2. `bun tools/docs/check_doc_claims.ts` comprueba que existan los archivos, los comandos y
   las opciones que nombra una página.
3. `bun tools/docs/check-docs-samples.ts` compila cada ejemplo `runnable` y ejecuta los que
   declaran un resultado.
4. `bun run docs:generate` y `git diff --exit-code -- docs/docs docs/i18n` fallan cuando una
   página generada difiere de lo que escribe su generador.
5. `bun run docs:build` construye el sitio. Docusaurus está configurado con
   `onBrokenLinks`, `onBrokenAnchors` y `onBrokenMarkdownLinks` en `throw`, así que un
   enlace interno roto o un enlace a un encabezado que ya no existe hace fallar la
   construcción.

Las pruebas de `tools/docs` (`bun test ./tools/docs`) también se ejecutan en CI: sostienen
los fragmentos de configuración, el manifiesto de capturas y las afirmaciones sobre capacidades.

### Pull requests que tocan la documentación: **Deploy Documentation**

`.github/workflows/deploy-docs.yml` se ejecuta en un pull request o en un push a `main` (o
`master`) que cambia `docs/`, `tools/docs/`, `tools/hil/validate_docs_parity.py`, las
cabeceras del núcleo o `firmware/app/boards/boards.json`. Instala las dependencias, genera y
valida las referencias (`bun run generate:docs` y `bun run validate:docs` en `docs/`),
construye el sitio y sube `docs/build` como artefacto.

### Pushes a `main`: despliegue

En un push a `main` (o `master`), o cuando se inicia a mano, un segundo trabajo despliega
ese artefacto en el entorno `github-pages`. Un pull request nunca despliega.

## Procedimiento de publicación

Para publicar documentación nueva:

1. Haga sus cambios en una rama de funcionalidad.
2. Ejecute `bun run check:docs` desde la raíz del repositorio. Ejecuta las comprobaciones
   anteriores y construye el sitio, de modo que un defecto aparece antes que en el pull request.
3. Abra un pull request.
4. Espere a que pasen el trabajo `docs-and-truth` de CI y el trabajo `build` de
   **Deploy Documentation**.
5. Fusione el pull request. GitHub Actions despliega `docs/build` en GitHub Pages.

## Versionar una versión

Cuando el proyecto ZPLC llega a un hito de versión (por ejemplo, `v2.0.0`), guarde una
instantánea de la documentación. El sitio publica una sola versión, sin selector de
versión, hasta que existe la primera instantánea (`docs/versions.json` está vacío).

1. Cree una rama para la versión.
2. Ejecute `cd docs && bun run docusaurus docs:version 2.0.0`. Escribe la versión en inglés
   y la versión en español.
3. Confirme lo que escribió el comando: `docs/versions.json`, las carpetas `versioned_docs` y
   `versioned_sidebars` de `docs/` y la carpeta `version-2.0.0` de
   `docs/i18n/es/docusaurus-plugin-content-docs/`.
4. Vuelva a agregar el selector de versión (`type: 'docsVersionDropdown'`) a los elementos de
   la barra de navegación de `docs/docusaurus.config.js`, ejecute `bun run check:docs` y abra
   el pull request.

## Procedimiento de reversión

Si un despliegue defectuoso llega a producción:

1. Identifique el commit del último estado correcto de la documentación en la rama `main`.
2. Use `git revert <hash-del-commit-defectuoso>` para deshacer el cambio.
3. Haga push de la reversión a `main` (o abra un pull request rápido). La canalización
   reconstruye y despliega el último estado que funcionaba.
