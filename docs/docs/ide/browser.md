---
title: "ZPLC in the browser"
sidebar_label: "In the browser"
description: "The hosted web build of ZPLC for Chrome and Edge: what works, where projects live, and the features that need the desktop app."
tags: [reference, generated]
---

# ZPLC in the browser

{/* >>> GENERATED (tools/docs/generate_web_capabilities.ts): ide/browser. Do not edit. >>> */}

ZPLC also runs in a browser at [https://eduardojvieira.github.io/ZPLC/app/](https://eduardojvieira.github.io/ZPLC/app/). It is the same application as the desktop app, built as a static site and deployed with this documentation. It needs no installation and no account, and it sends nothing anywhere: there is no server behind it.

It is made for trying ZPLC, for the examples and the Learn course, and for editing and simulating a small project on a computer where you cannot install anything. It is not the way to work on a real machine: for that, [install the desktop app](../getting-started/install.md).

## What works

- Editing programs in ST, IL, LD, FBD and SFC, with the same compiler as the desktop app.
- Building a project and seeing its diagnostics.
- Simulating on the WASM runtime, with the values of variables on screen. The runtime is the core of the firmware compiled to WebAssembly, and it says what it cannot do in the same capability profile as the desktop app: see [the browser runtime](../runtime/browser-runtime.md).
- The examples and the Learn course, which open as editable copies.

## Where your projects live

In Chrome and Edge, **Open project** opens a folder on your computer through the File System Access API, and saving writes to that folder. You choose the folder and the browser asks for permission.

In any current browser, an example, a lesson or a new project can be kept **in this browser**. The browser stores it in a folder you cannot see, and clearing the site data removes it. Download or copy anything you want to keep. Firefox and Safari have no folder access, so only the browser storage is available there.

## What is not available

These features need the desktop app. In the browser they are absent or disabled, and the page says why; none of them is left half working. The same list is shown inside the application.

| Feature | In the browser |
| --- | --- |
| **Native simulation** | The simulator runs on the WASM runtime: each scan gives the same result, but the timing is the browser's and there is no network or serial. The desktop app runs the native runtime. |
| **Device connection and deploy** | Connecting to a controller over serial or USB, deploying a program, and run, stop and force on a device are off. Use the desktop app. |
| **Firmware builds** | Building board firmware needs the toolchain on your computer. Use the desktop app. |
| **Host scenario tests** | Scenario tests run on the native runtime of the desktop app. |
| **MCP server and command line** | The MCP server and the zplc command line run on your computer, not in a page. |
| **Update check** | A page is always the current version, so there is nothing to update. |
| **Settings migration, crash recovery and session restore** | The desktop app keeps these in its user data folder. In the browser, a project lives in a folder you choose or in this browser's storage. |
| **AI assistant** | The assistant keeps its key in the desktop app and there is no server behind this page, so it is off. |

## Safety and privacy

- The browser build never connects to, flashes, deploys to, forces, or runs or stops a device. Device connection is off, not hidden behind a setting. For hardware, use the desktop app and its human-confirmed flows.
- There is no AI assistant, because its key and its requests belong to the desktop app and no server stands behind this page.
- The page is served with a content security policy that allows only its own scripts, styles and workers, WebAssembly compiled from its own bundle, and no network request to another origin.
- A simulation in a browser is not a controller. Its timing is the browser clock, which a background tab throttles. Do not use it to decide anything about a real machine: [Safety and limitations](../safety-and-limitations.md).

## What has been tried

The web build and its browser smoke test (load, an example, an edit, a save, a build, a simulation with a value that changes, and the refused device actions) have been run on Linux with Chromium. The workflow that publishes the build with this documentation is written, and has not run on GitHub yet. The build has not been tried on Windows or macOS, or in Firefox or Safari.

{/* <<< END GENERATED: ide/browser <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
