---
id: publishing
title: Publicación de la documentación
sidebar_label: Publicación
description: Cómo se comprueba, se construye y se publica la documentación de ZPLC en GitHub Pages, y cómo guardar una instantánea de una versión.
tags: [operations, docs, github-pages]
---

# Publicación de la documentación

La documentación se construye con Docusaurus y GitHub Actions la publica en GitHub Pages. Esta página indica qué verificaciones debe pasar el cambio de una página, cómo llega al sitio, cómo guardar una instantánea de una versión y cómo deshacer una publicación defectuosa.

## Verifique un cambio antes de abrir el pull request

Ejecute esto una vez desde la raíz del repositorio:

```bash
bun run check:docs
```

Es la cadena completa que CI reparte en dos flujos de trabajo: los generadores en modo `--check`, las verificaciones de afirmaciones, el validador de páginas, los ejemplos ejecutables, los fragmentos de configuración, el manifiesto de capturas, la compilación del sitio y el índice de búsqueda. Un defecto aparece aquí antes de aparecer en la revisión.

## Qué ejecuta CI

### Cada pull request y cada push: CI

- **`bun test ./tools/docs`** contiene las pruebas de los generadores y de las verificaciones, entre ellas los fragmentos de configuración, el manifiesto de capturas y las afirmaciones sobre capacidades (`check_capability_claims.ts`).
- **El trabajo `docs-and-truth`** de `.github/workflows/ci.yml` ejecuta, en orden:
  1. `python3 tools/docs/validate_docs_pages.py` rechaza una página que termina a mitad de frase, una página que no está en la barra lateral y una página en inglés cuya gemela en español tiene otra estructura (o al revés).
  2. El modo `--check` de los generadores de límites conocidos, referencia de funciones, referencias de código fuente y referencia de lenguajes: una página generada que difiere de lo que escribe su generador falla.
  3. `bun tools/docs/check_doc_claims.ts` verifica que existan los archivos, comandos y opciones que nombra una página.
  4. `bun tools/docs/check-docs-samples.ts` compila cada ejemplo `runnable` y ejecuta los que declaran un resultado.
  5. `bun run docs:generate`, `bun run docs:validate` y `git diff --exit-code -- docs/docs docs/i18n` regeneran cada referencia y fallan si algo cambió.
  6. `bun run docs:build` construye el sitio. Docusaurus tiene `onBrokenLinks`, `onBrokenAnchors` y `onBrokenMarkdownLinks` en `throw`, así que un enlace interno roto, o un enlace a un encabezado que ya no existe, hace fallar la compilación.

### Cambios bajo `docs/`: Deploy Documentation

`.github/workflows/deploy-docs.yml` se ejecuta en un pull request, un push o un inicio manual cuando el cambio toca `docs/`, `tools/docs/`, `tools/hil/validate_docs_parity.py`, los encabezados del núcleo o `firmware/app/boards/boards.json`. Regenera y valida las referencias, construye el sitio y sube `docs/build` como artefacto.

### Pushes a las ramas principales: publicación

En un push a `master`, `main` o `zplc-2.0-candidate`, o al iniciarlo a mano, un segundo trabajo publica ese artefacto en el entorno `github-pages`, en `https://eduardojvieira.github.io/ZPLC/`. Un pull request nunca publica.

## Publicar documentación nueva

1. Haga su cambio en una rama de funcionalidad, en inglés y en español a la vez.
2. Ejecute `bun run check:docs`.
3. Abra un pull request y espere a que pasen el trabajo `docs-and-truth` de CI y el trabajo de compilación de Deploy Documentation.
4. Fusiónelo. El trabajo de publicación sube el sitio.

## Retirar o renombrar una página

Una página ya publicada conserva su dirección. Cuando fusione o elimine una, agregue una entrada a la lista `redirects` de `@docusaurus/plugin-client-redirects` en `docs/docusaurus.config.js`. El complemento se ejecuta una vez por idioma, así que una entrada cubre ambos. La lista contiene las siete páginas que la reescritura de 2.0 fusionó o retiró.

## Guardar una instantánea de una versión

El sitio publica una sola versión, sin selector de versión, hasta que exista la primera instantánea (`docs/versions.json` está vacío). Para tomar la instantánea de una versión como `2.0.0`:

1. Cree una rama para la versión.
2. Ejecute `cd docs && bun run docusaurus docs:version 2.0.0`. Escribe la versión en inglés y en español.
3. Confirme lo que escribió el comando: `docs/versions.json`, las carpetas `versioned_docs` y `versioned_sidebars` de `docs/`, y la carpeta `version-2.0.0` de `docs/i18n/es/docusaurus-plugin-content-docs/`.
4. Agregue el selector de versión (`type: 'docsVersionDropdown'`) a los elementos de la barra de navegación de `docs/docusaurus.config.js`, ejecute `bun run check:docs` y abra el pull request.

## Deshacer una publicación defectuosa

1. Busque el commit de la última documentación correcta en la rama publicada.
2. Ejecute `git revert <hash-del-commit-defectuoso>`.
3. Suba la reversión o abra un pull request rápido. La canalización reconstruye y publica el estado anterior.
