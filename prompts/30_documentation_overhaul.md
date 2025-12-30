# Protocol: Professional Documentation & Website Overhaul

## 1. Objective
Transform the ZPLC documentation into a **Professional Industrial Grade** website.
The user expects high-quality visuals, clear guides, and a polished presentation comparable to commercial PLC vendors (e.g., Siemens, CODESYS).
**Target**: `docs/` folder, configured as a **Docusaurus** website, deployable to GitHub Pages.

## 2. Structure & Content Strategy

### 2.1 The Website (Docusaurus)
Set up a new Docusaurus project in `docs/`:
*   **Theme**: Dark/Industrial (clean, high contrast, technical font like Inter/JetBrains Mono).
*   **Homepage**:
    *   **Hero**: "One Execution Core, Any Runtime." with a diagram of the Unified Architecture.
    *   **Features**: "Native Zephyr", "IEC 61131-3 Compliant", "Web-Based IDE", "Cross-Platform".
    *   **Download**: Link to generic Releases page (or Electron installer when available).
*   **Sidebar Navigation**:
    1.  **Getting Started**: Quickstart for Users (IDE) vs Developers (C Runtime).
    2.  **User Manual**: How to use the IDE (LD, FBD, ST, SFC), Project Management, Debugging.
    3.  **Architecture**: Deep dive into VM, HAL, and Memory Model.
    4.  **API Reference**: 
        *   **Runtime (C)**: `zplc_core.h`, `zplc_hal.h`.
        *   **Standard Libs**: Reference for `ZPLC_Standard`, `ZPLC_Process` blocks.
    5.  **Community**: Contribution guides (`AGENTS.md` content adapted).

### 2.2 Content Updates (Detailed)
The current README is good but insufficient. The new docs MUST cover:
*   **Electron App**: How to install, WebSerial permissions.
*   **Hardware Setup**:
    *   *Pinouts*: Wiring diagrams (Mermaid or Images) for supported boards (Pico, ESP32, Nucleo).
    *   *Flashing*: West commands vs IDE "One-Click" upload.
*   **Advanced Features**:
    *   *Multitasking*: Explaining Priority, Interval, and Preemption (Phase 6 features).
    *   *Persistence*: How Variables/Programs are saved to NVS.
    *   *Debugging*: How to set breakpoints, watch variables (Phase 6 features).

## 3. Implementation Steps

### Step 1: Initialize Docusaurus
```bash
cd docs
npx create-docusaurus@latest . classic
# Configure docusaurus.config.ts for github pages (baseUrl: '/ZPLC/')
```

### Step 2: Content Migration
*   Migrate `TECHNICAL_SPEC.md` -> `docs/architecture/spec.md`.
*   Migrate `STDLIB.md` (if exists) -> `docs/reference/stdlib.md` (Use a nice table layout).
*   Rewrite `README.md` to be a "Landing Page" for the repo, pointing to the full site.

### Step 3: Diagrams (Mermaid)
Create professional diagrams using Mermaid in markdown:
*   **System Architecture**: IDE -> Compiler -> Bytecode -> Runtime -> HAL.
*   **Runtime Cycle**: Input Scan -> Task Execution -> Output Update.
*   **Memory Map**: Visualizing IPI, OPI, WORK, RETAIN areas.

### Step 4: GitHub Pages Integration
*   Ensure the repo settings allow deploying from `gh-pages` branch.
*   Add a GitHub Action workflow `.github/workflows/deploy.yml` to build and deploy Docusaurus on push to `main`.

## 4. Design Aesthetics
*   **Color Palette**: Dark Grey (#1a1a1a), Electric Blue (#007bff for actions), Industrial Orange (#ff9900 for warnings/safety).
*   **Typography**: Clean sans-serif headers, monospaced code blocks.

## 5. Verification
*   `npm run start` in `docs/` should launch the site locally.
*   Verify all links (especially between API docs and internal specs) work.
*   Verify Mermaid diagrams render correctly.
