/**
 * @file useEditorLiveValues.ts
 * @brief Viewport-aware variable polling for the live editor overlay
 *
 * This hook connects the Monaco editor's visible range to the debug polling
 * system. Instead of polling all 64 variables from the entire debug map on
 * every tick, it:
 *
 *   1. Listens to Monaco scroll / layout change events
 *   2. Reads the editor's visible line range via getVisibleRanges()
 *   3. Maps those lines → variable names using DebugVarInfo.declarationLine
 *   4. Returns the list of visible variable names as `visibleVarNames`
 *
 * The parent component (`CodeEditor.tsx`) can use `visibleVarNames` to
 * restrict the set of variables passed to `useDebugValues`, so that only
 * the variables currently on screen are read from the live-values cache
 * and overlaid as inline decorations.
 *
 * Variables whose `declarationLine` is undefined (e.g. from older compiler
 * output) fall back to "always visible" so nothing is silently lost.
 *
 * SPDX-License-Identifier: MIT
 */

import { useState, useEffect, useRef } from 'react';
import type * as MonacoEditor from 'monaco-editor';
import type { DebugMap } from '../compiler';

// ---------------------------------------------------------------------------
// Pure logic — exported for testing without React
// ---------------------------------------------------------------------------

/**
 * Build a fast lookup: declarationLine → varName[]
 * One variable can have only one declarationLine, but we keep the value type
 * as string[] so the Map is symmetric with multi-var-per-line edge cases
 * (two vars declared on the same `VAR ... END_VAR` line can share a line
 * in IL mode, though it's rare in ST).
 */
export function buildLineToVarMap(debugMap: DebugMap): Map<number, string[]> {
  const lineMap = new Map<number, string[]>();

  for (const pouInfo of Object.values(debugMap.pou)) {
    for (const [varName, varInfo] of Object.entries(pouInfo.vars)) {
      const line = varInfo.declarationLine;
      if (line === undefined) continue;

      const existing = lineMap.get(line);
      if (existing) {
        existing.push(varName);
      } else {
        lineMap.set(line, [varName]);
      }
    }
  }

  return lineMap;
}

/**
 * Given a visible line range [startLine, endLine] (1-based, inclusive) and the
 * pre-built line→var map, return the variable names whose declaration line
 * falls within the range.
 *
 * Variables with no declarationLine are collected separately as
 * `unknownLineVars` so callers can decide whether to always-include them.
 */
export function getVarsInRange(
  lineMap: Map<number, string[]>,
  allVarNames: string[],
  startLine: number,
  endLine: number,
): { visibleVars: string[]; unknownLineVars: string[] } {
  // Collect all var names that have a known declarationLine
  const varNamesWithLine = new Set<string>();
  for (const names of lineMap.values()) {
    for (const n of names) varNamesWithLine.add(n);
  }

  const visibleVars: string[] = [];
  const unknownLineVars: string[] = [];

  // Visible: vars whose declarationLine is within the viewport
  for (let line = startLine; line <= endLine; line++) {
    const names = lineMap.get(line);
    if (names) {
      for (const n of names) visibleVars.push(n);
    }
  }

  // Unknown-line: vars that exist in debugMap but have no declarationLine
  for (const n of allVarNames) {
    if (!varNamesWithLine.has(n)) {
      unknownLineVars.push(n);
    }
  }

  return { visibleVars, unknownLineVars };
}

/**
 * Collect all top-level variable names from a DebugMap (across all POUs).
 * Mirrors the logic in useDebugController's polling effect, capped at 64.
 */
export function collectAllVarNames(debugMap: DebugMap, cap = 64): string[] {
  const names: string[] = [];
  outer: for (const pouInfo of Object.values(debugMap.pou)) {
    for (const varName of Object.keys(pouInfo.vars)) {
      if (names.length >= cap) break outer;
      names.push(varName);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Debounce constant
// ---------------------------------------------------------------------------

const VIEWPORT_DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Options for useEditorLiveValues.
 */
export interface UseEditorLiveValuesOptions {
  /** Reference to the Monaco standalone code editor instance */
  editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>;
  /** Current debug map (null when not debugging) */
  debugMap: DebugMap | null;
  /** Whether debug mode is active */
  debugActive: boolean;
}

/**
 * Hook result.
 */
export interface UseEditorLiveValuesResult {
  /**
   * Variable names that should be overlaid in the current viewport.
   *
   * - When debugActive is false → empty array
   * - When debugMap has no declarationLine data → all known var names
   *   (graceful degradation to the old "poll everything" behaviour)
   * - Otherwise → only vars whose declarationLine is in the visible range,
   *   plus any vars that have no declarationLine (unknown-origin vars are
   *   always included so nothing is silently dropped)
   */
  visibleVarNames: string[];
}

/**
 * Viewport-aware hook that returns the variable names visible in the Monaco
 * editor. Call this in `CodeEditor.tsx` and pass `visibleVarNames` to
 * `useDebugValues` instead of the full variable list.
 */
export function useEditorLiveValues({
  editorRef,
  debugMap,
  debugActive,
}: UseEditorLiveValuesOptions): UseEditorLiveValuesResult {
  const [visibleVarNames, setVisibleVarNames] = useState<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!debugActive || !debugMap) {
      setVisibleVarNames([]);
      return;
    }

    const allVarNames = collectAllVarNames(debugMap);
    const lineMap = buildLineToVarMap(debugMap);

    // If no variable in the debug map has a declarationLine, fall back to
    // returning all vars (older compiler output without Phase 4 changes).
    const hasAnyDeclarationLine = lineMap.size > 0;
    if (!hasAnyDeclarationLine) {
      setVisibleVarNames(allVarNames);
      return;
    }

    /** Compute and apply the current visible set */
    const updateVisible = () => {
      const editor = editorRef.current;
      if (!editor) {
        setVisibleVarNames(allVarNames);
        return;
      }

      const ranges = editor.getVisibleRanges();
      if (ranges.length === 0) {
        setVisibleVarNames(allVarNames);
        return;
      }

      // Monaco can return multiple ranges (folded sections create gaps).
      // Merge them into one bounding range for simplicity — we prefer a
      // few extra vars over missing ones.
      const startLine = ranges[0].startLineNumber;
      const endLine = ranges[ranges.length - 1].endLineNumber;

      const { visibleVars, unknownLineVars } = getVarsInRange(
        lineMap,
        allVarNames,
        startLine,
        endLine,
      );

      // Always include unknownLineVars so older-compiler variables are shown
      const merged = [...new Set([...visibleVars, ...unknownLineVars])];
      setVisibleVarNames(merged);
    };

    // Run immediately on mount / debugMap change
    updateVisible();

    const editor = editorRef.current;
    if (!editor) return;

    // Debounced scroll listener
    const onScroll = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(updateVisible, VIEWPORT_DEBOUNCE_MS);
    };

    const scrollDisposable = editor.onDidScrollChange(onScroll);
    // Also update when the editor layout changes (resize, fold/unfold)
    const layoutDisposable = editor.onDidLayoutChange(onScroll);

    return () => {
      scrollDisposable.dispose();
      layoutDisposable.dispose();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [debugActive, debugMap, editorRef]);

  return { visibleVarNames };
}
