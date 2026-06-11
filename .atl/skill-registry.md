# ZPLC Skill Registry

> Auto-generated from project and user skill scans.
> Project skills take precedence over user skills.

## Convention Files

- `AGENTS.md` — AI assistant entry point, architecture rules, agent personas.

## Project Skills

### arm-cortex-expert
- **Trigger**: ARM Cortex-M firmware/driver tasks, memory barriers, DMA, interrupt-driven I/O.
- **Path**: `.agents/skills/arm-cortex-expert/SKILL.md`
- **Compact Rules**:
  - Safety over performance; correctness first.
  - Use `__DMB()`/`__DSB()` around MMIO on Cortex-M7.
  - Deliver complete drivers (init + ISR + usage), not snippets.
  - Guard against buffer overruns, blocking calls, priority inversions.
  - Document tradeoffs: blocking vs async, RAM vs flash, throughput vs CPU.

### compiler-development
- **Trigger**: Building compilers, DSLs, LLVM IR, optimization passes.
- **Path**: `.agents/skills/compiler-development/SKILL.md`
- **Compact Rules**:
  - Prefer recursive descent for simple grammars; LALR only for complex cases.
  - Keep AST nodes with `codegen()` virtual method for LLVM IR generation.
  - Use `llvm::IRBuilder` for instruction emission.
  - Separate frontend (lex/parse/AST), middle-end (LLVM passes), backend (target code).

### electron-pro
- **Trigger**: Electron desktop apps, IPC, OS integration, auto-updaters.
- **Path**: `.agents/skills/electron-pro/SKILL.md`
- **Compact Rules**:
  - Always enable context isolation; never enable `nodeIntegration` in renderer.
  - Use preload scripts as the IPC bridge.
  - Lazy-load heavy modules inside `ipcMain` handlers, not at top-level.
  - Bundle main process with esbuild/webpack for tree-shaking.
  - Escalate security red flags (remote module, disabled CSP) immediately.

### embedded-systems
- **Trigger**: RTOS, bare-metal, embedded Linux, Zephyr, FreeRTOS.
- **Path**: `.agents/skills/embedded-systems/SKILL.md`
- **Compact Rules**:
  - MCU <1MB RAM → Zephyr/FreeRTOS; MPU >64MB → Embedded Linux/Yocto.
  - Prefer Rust for new projects; C11/C17 for legacy/HALs with MISRA.
  - Use static allocation to avoid heap fragmentation.
  - Escalate security red flags (open JTAG, plaintext keys, unsigned OTA) immediately.

### find-skills
- **Trigger**: "how do I do X", "find a skill for X", extending agent capabilities.
- **Path**: `.agents/skills/find-skills/SKILL.md`
- **Compact Rules**:
  - Use `npx skills find [query]` to search the ecosystem.
  - Install with `npx skills add <owner/repo@skill> -g -y`.
  - Prefer project-level skills over user-level skills when both exist.

### git-commit
- **Trigger**: `/commit`, creating git commits, conventional commits.
- **Path**: `.agents/skills/git-commit/SKILL.md`
- **Compact Rules**:
  - Analyze diff to determine type, scope, and message.
  - Format: `<type>[optional scope]: <description>` (imperative, <72 chars).
  - Never commit secrets (.env, credentials).
  - Stage by work unit; keep tests/docs with the code they verify.

### javascript-testing-patterns
- **Trigger**: Writing JS/TS tests, TDD/BDD, mocking, fixtures.
- **Path**: `.agents/skills/javascript-testing-patterns/SKILL.md`
- **Compact Rules**:
  - Use table-driven tests for multiple cases.
  - Mock external dependencies; test behavior, not implementation trivia.
  - Use `t.TempDir()` for filesystem tests (Go) or equivalent isolation.
  - Keep integration tests skippable with `testing.Short()` or equivalent.

### react-flow
- **Trigger**: React Flow, @xyflow/react, custom nodes/edges, fitView.
- **Path**: `.agents/skills/react-flow/SKILL.md`
- **Compact Rules**:
  - Use `NodeProps<T>` and `EdgeProps<T>` for typed custom nodes/edges.
  - Register custom types with `nodeTypes`/`edgeTypes` maps.
  - Use `useReactFlow()` for programmatic control (fitView, zoom, addNode).
  - Wrap with `ReactFlowProvider` when using `useReactFlow()` outside the flow component.
  - Add `className="nodrag"` to interactive elements inside nodes.

### react-flow-architecture
- **Trigger**: Designing node-based UIs, state management for React Flow.
- **Path**: `.agents/skills/react-flow-architecture/SKILL.md`
- **Compact Rules**:
  - Simple apps: `useNodesState`/`useEdgesState`.
  - Production: external Zustand/Redux store with `applyNodeChanges`.
  - Avoid 10k+ nodes without WebGL (use Sigma.js instead).
  - Keep core logic framework-agnostic (`@xyflow/system`).

### stm32-freertos-developer
- **Trigger**: STM32 + FreeRTOS tasks, queues, semaphores, HAL drivers.
- **Path**: `.agents/skills/stm32-freertos-developer/SKILL.md`
- **Compact Rules**:
  - Use static task allocation to avoid heap fragmentation.
  - In ISR, only use `FromISR` APIs and end with `portYIELD_FROM_ISR`.
  - Enable `configASSERT()` and stack overflow checking.
  - Use `configUSE_PREEMPTION = 1` for hard real-time.
  - Refer to decision tables for driver/debugging file selection.

### superhuman-ui-skills
- **Trigger**: Superhuman-style UI, light mode, Inter font, 4px grid.
- **Path**: `.agents/skills/superhuman-ui-skills/SKILL.md`
- **Compact Rules**:
  - Use `Inter` font; 4px grid; 56px/extra_bold for headings.
  - Surface base `#C9B7FD`, accent `#BCBAFC`.
  - Focus: 2px outline with accent, 2px offset.
  - Animate only compositor props (transform, opacity), max 200ms.
  - Respect `prefers-reduced-motion`.

### tailwind-css-patterns
- **Trigger**: Tailwind CSS styling, responsive layouts, design systems.
- **Path**: `.agents/skills/tailwind-css-patterns/SKILL.md`
- **Compact Rules**:
  - Mobile-first; use responsive prefixes (`sm:`, `md:`, `lg:`).
  - Prefer utility composition over `@apply`.
  - Configure content paths for purge/optimization.
  - Use `@theme` for v4.1+ CSS-first configuration.
  - Respect `prefers-reduced-motion` and `focus:` states.

### typescript-react-reviewer
- **Trigger**: TypeScript + React 19 code review, anti-patterns, state management.
- **Path**: `.agents/skills/typescript-react-reviewer/SKILL.md`
- **Compact Rules**:
  - Block merge on: `useEffect` for derived state, missing cleanup, direct mutation, conditional hooks, `key={index}`, unjustified `any`.
  - Never copy server data to local state (use TanStack Query as source of truth).
  - Use `noUncheckedIndexedAccess` in TSConfig.
  - Keep components <300 lines; split prop drilling >2-3 levels.

### vite
- **Trigger**: Vite config, plugins, SSR, build, Rolldown migration.
- **Path**: `.agents/skills/vite/SKILL.md`
- **Compact Rules**:
  - Prefer `vite.config.ts` and ESM; avoid CommonJS.
  - Use `defineConfig` for conditional configs and `loadEnv` for env vars.
  - Vite 8 uses Rolldown + Oxc; review migration guide for breaking changes.
  - Use `@tailwindcss/vite` for Tailwind v4 integration.

### webapp-testing
- **Trigger**: Testing local web apps with Playwright.
- **Path**: `.agents/skills/webapp-testing/SKILL.md`
- **Compact Rules**:
  - Use `scripts/with_server.py` as a black-box server lifecycle manager.
  - Always wait for `networkidle` before inspecting dynamic apps.
  - Use reconnaissance-then-action: screenshot/inspect → identify selectors → act.
  - Launch chromium in headless mode; always close browser.

### zustand-state
- **Trigger**: Zustand stores, selectors, persistence, devtools.
- **Path**: `.agents/skills/zustand-state/SKILL.md`
- **Compact Rules**:
  - Select only needed state to prevent rerenders.
  - Use `useShallow` for multiple values or arrays.
  - Use `getState()`/`setState()` outside React; `subscribe()` for external systems.
  - Nested objects require manual spread; `set({ ... }, true)` replaces entire state.

## User Skills

### branch-pr
- **Trigger**: Creating/opening PRs, issue-first checks.
- **Path**: `~/.config/opencode/skills/branch-pr/SKILL.md`
- **Compact Rules**:
  - Every PR MUST link an approved issue.
  - Branch naming: `type/description` (regex `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)/[a-z0-9._-]+$`).
  - Add exactly one `type:*` label.
  - Run shellcheck on modified scripts before opening.

### chained-pr
- **Trigger**: PRs over 400 lines, stacked PRs, review slices.
- **Path**: `~/.config/opencode/skills/chained-pr/SKILL.md`
- **Compact Rules**:
  - Split PRs >400 changed lines unless `size:exception` is approved.
  - Each PR must be reviewable in ≤60 minutes.
  - Keep tests/docs with the work unit they verify.
  - State dependencies, out-of-scope items, and dependency diagram in each PR.

### cognitive-doc-design
- **Trigger**: Writing guides, READMEs, RFCs, onboarding, architecture docs.
- **Path**: `~/.config/opencode/skills/cognitive-doc-design/SKILL.md`
- **Compact Rules**:
  - Lead with the answer; context comes after.
  - Use progressive disclosure, chunking, signposting, and recognition over recall.
  - Keep docs reviewable: state what to review first and what's out of scope.

### comment-writer
- **Trigger**: PR feedback, issue replies, reviews, Slack messages.
- **Path**: `~/.config/opencode/skills/comment-writer/SKILL.md`
- **Compact Rules**:
  - Start with the actionable point; be warm, direct, and short (1-3 paragraphs).
  - Explain why when requesting changes.
  - Match thread language (Rioplatense Spanish/voseo when appropriate).
  - Avoid em dashes.

### go-testing
- **Trigger**: Go tests, coverage, Bubbletea teatest, golden files.
- **Path**: `~/.config/opencode/skills/go-testing/SKILL.md`
- **Compact Rules**:
  - Prefer table-driven tests with `t.Run(tt.name, ...)`.
  - Use `t.TempDir()` for filesystem tests.
  - Skip slow integration tests with `testing.Short()`.
  - Update golden files only via `-update` path, then rerun without it.

### issue-creation
- **Trigger**: Creating GitHub issues, bug reports, feature requests.
- **Path**: `~/.config/opencode/skills/issue-creation/SKILL.md`
- **Compact Rules**:
  - Blank issues disabled; always use a template.
  - Auto-label `status:needs-review`; maintainer must add `status:approved` before PR.
  - Questions go to Discussions, not issues.

### judgment-day
- **Trigger**: Judgment day, dual review, adversarial review.
- **Path**: `~/.config/opencode/skills/judgment-day/SKILL.md`
- **Compact Rules**:
  - Launch two blind judges in parallel with identical criteria.
  - Wait for both before synthesis; never accept partial verdicts.
  - Only terminal states: `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.
  - Re-judge in parallel after any fix iteration.

### skill-creator
- **Trigger**: New skills, agent instructions, documenting AI usage patterns.
- **Path**: `~/.config/opencode/skills/skill-creator/SKILL.md`
- **Compact Rules**:
  - Follow `docs/skill-style-guide.md` if it exists.
  - Target 180–450 tokens, hard max 1000.
  - Put templates/schemas in `assets/`, conceptual detail in `references/`.
  - Frontmatter must include `name`, `description`, `license`, `metadata.author`, `metadata.version`.
  - `description` must be one line, trigger-first, ≤250 chars.

### work-unit-commits
- **Trigger**: Commit planning, commit splitting, keeping tests/docs with code.
- **Path**: `~/.config/opencode/skills/work-unit-commits/SKILL.md`
- **Compact Rules**:
  - A commit represents one deliverable behavior/fix/docs unit.
  - Do not commit by file type (all models, then all services).
  - Tell a story: reviewer should understand why the commit exists.
  - If SDD forecasts >400 lines, group into chained PR slices before implementation.
