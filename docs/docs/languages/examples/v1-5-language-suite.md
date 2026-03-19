---
title: v1.5 Language Suite
sidebar_label: v1.5 Language Suite
description: Canonical cross-language workflow examples for the v1.5 release claim.
---

# v1.5 Language Suite

This page defines the canonical workflow samples used to support the v1.5 release claim
for `ST`, `IL`, `LD`, `FBD`, and `SFC`.

## Shared Behavior

Every sample in this suite proves the same workflow-level behavior:

- authoring in the claimed language path
- successful compilation to `.zplc`
- simulation support
- deployment support
- debugging support

The canonical logic shape is intentionally small:

- one start condition
- one timer-driven output
- one visible output binding

## Structured Text (ST)

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

## Instruction List (IL)

```iecst
PROGRAM WorkflowIL
VAR
    Start : BOOL := TRUE;
    Timer : TON;
END_VAR
VAR_OUTPUT
    Out1 AT %Q0.0 : BOOL;
END_VAR
    LD Start
    ST Timer.IN
    CAL Timer(
        PT := T#250ms
    )
    LD Timer.Q
    ST Out1
END_PROGRAM
```

## Ladder Diagram (LD)

LD uses the visual model path. The canonical rung expresses `Start -> Out1` and must
compile, simulate, deploy, and debug through the same task flow as ST.

## Function Block Diagram (FBD)

FBD uses the visual model path. The canonical diagram connects an input block to an output
block through the standard transpilation path.

## Sequential Function Chart (SFC)

SFC uses a single initial step and one action that sets the output. The release claim is
not tied to a separate backend; it is tied to the verified end-to-end workflow.
