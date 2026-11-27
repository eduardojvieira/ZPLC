# AI evaluation task set (AIX-009, JRN-007)

A fixed set of 15 tasks kept in the repository: five languages (ST, IL, LD, FBD, SFC) times three types, all `must`.

| Type | What the model does | Passes when |
|---|---|---|
| `write` | completes a starter program from a goal and a plant map or scenario | `compilerCheck` and `scenarioRun` pass |
| `repair` | fixes a seeded failing program | `scenarioRun` passes |
| `explain` | explains a failing build or a failing plant scenario | the answer names the failing signal or fact, the expected versus observed condition, and the source place (`rubric` in `tasks.json`) |

`tasks.json` lists the tasks. `fixtures/<id>/project` is what the model sees; `fixtures/<id>/reference` is the reference solution or repair of a write or repair task. Fixtures are copies of projects in `packages/zplc-ide/projects`, with one seeded fault where a task needs it. Grading restores `tests/`, `scene.json` and `plant-map.json` from the fixture first, so a run cannot pass by editing the check.

`bun test ./tools/ai-eval` is the self-check and runs in CI without a model: every starter and seeded program fails today, every reference passes, and the run scripts are exercised with a fake provider and a fake client.

## Running with a real model (owner only)

Both scripts work on a disposable copy under the temp directory, take everything explicitly, support `--dry-run` (validates the set and prints the plan, calls nothing) and write one evidence JSON with `model`, `client`, `date`, `evidenceLevel: "manual-model-run"`, per-task pass or fail, latency and response bytes. Put it at `specs/014-zplc-2-1-release-quality/evidence/aix-real-run-<date>.json`.

Claude Code over MCP (the reference client). The script reads no credential; your own `claude` command signs in as usual, and only the `zplc` MCP server of the task copy is allowed:

```
bun tools/ai-eval/run-claude-code-mcp.ts --client claude --model <model> --out <evidence.json> [--tasks st-write,ld-repair|all]
```

The Assistant (`createAiProvider`). A loopback endpoint needs no key; for any other, name the environment variable that holds it, and it is read only then and never printed:

```
bun tools/ai-eval/run-assistant-eval.ts --endpoint <url> --model <model> --out <evidence.json> [--key-env NAME] [--tasks all]
```

## Never automatic

CI never runs these scripts for real, nothing here reads a credential on its own, and a result is recorded evidence of a model run, not a deterministic test.
