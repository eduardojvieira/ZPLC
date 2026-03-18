/**
 * @file CodeEditor.tsx
 * @brief Monaco Editor wrapper with full inline debugging support
 *
 * Provides a code editor with:
 * - Breakpoint gutter (click to toggle, red dot indicators)
 * - Current line highlight (yellow when paused at breakpoint)
 * - INLINE VALUE WIDGETS: Shows live variable values next to their usage
 * - Function block argument display (TON.PT, TON.ET, TON.Q, etc.)
 * - Integration with IDE debug store
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import type * as MonacoEditor from 'monaco-editor';
import { useIDEStore } from '../store/useIDEStore';
import { useFileBreakpoints, useCurrentExecution, useDebugValues, formatDebugValue } from '../hooks/useDebugValue';
import { useTheme } from '../hooks/useTheme';
import { useEditorLiveValues } from '../hooks/useEditorLiveValues';
import type { PLCLanguage } from '../types';
import { filterEligibleBreakpointLines, isLineBreakpointEligible } from './codeEditorBreakpoints';
import {
  buildInlineWidgets,
  extractVariablesFromCode,
  type InlineValueWidget,
} from './codeEditorInlineValues';
import {
  ST_LANGUAGE_ID, stLanguage, stConf,
  IL_LANGUAGE_ID, ilLanguage, ilConf
} from '../utils/monaco-languages';
import {
  ZPLC_DARK_THEME, ZPLC_DARK_THEME_ID,
  ZPLC_LIGHT_THEME, ZPLC_LIGHT_THEME_ID
} from '../utils/monaco-themes';

// =============================================================================
// Types
// =============================================================================

interface CodeEditorProps {
  /** Unique file identifier */
  fileId: string;
  /** File content */
  content: string;
  /** PLC language for syntax highlighting */
  language: PLCLanguage;
  /** Callback when content changes */
  onChange?: (value: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

/**
 * Map PLC language to Monaco language ID
 */
function getMonacoLanguage(lang: PLCLanguage): string {
  switch (lang) {
    case 'ST':
      return ST_LANGUAGE_ID;
    case 'IL':
      return IL_LANGUAGE_ID;
    default:
      return 'json';
  }
}

// =============================================================================
// Component
// =============================================================================

export function CodeEditor({
  fileId,
  content,
  language,
  onChange,
  readOnly = false,
}: CodeEditorProps): React.ReactElement {
  const { isDark } = useTheme();
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const inlineDecorationsRef = useRef<MonacoEditor.editor.IEditorDecorationsCollection | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const toggleBreakpoint = useIDEStore((state) => state.toggleBreakpoint);
  const breakpoints = useFileBreakpoints(fileId);
  const fileName = useIDEStore((state) => state.loadedFiles.get(fileId)?.name ?? fileId);
  const { isPaused, currentLine, currentPOU } = useCurrentExecution();

  // Check if this file is the current execution context
  const isCurrentFile = useMemo(() => {
    return currentPOU ? fileId.toLowerCase().includes(currentPOU.toLowerCase()) : false;
  }, [fileId, currentPOU]);

  // Extract variables from code for debug value lookup
  const variablesInCode = useMemo(() => {
    if (debugMode === 'none') return new Map();
    return extractVariablesFromCode(content, language);
  }, [content, language, debugMode]);

  // Viewport-aware variable filtering: only read values for variables whose
  // declaration line is currently visible in the editor.  Falls back to all
  // vars when the debug map lacks declarationLine data (older compiler output).
  const { visibleVarNames } = useEditorLiveValues({
    editorRef,
    debugMap,
    debugActive: debugMode !== 'none',
  });

  // Get live values only for visible variables (or all if no viewport data)
  const debugValues = useDebugValues(
    debugMode !== 'none'
      ? (visibleVarNames.length > 0 ? visibleVarNames : Array.from(variablesInCode.keys()))
      : [],
  );

  // Build variable value map for widgets
  const variableValueMap = useMemo(() => {
    const map = new Map<string, { value: string; type: string | null; isBool: boolean; isTrue?: boolean }>();

    for (const [varPath, result] of debugValues) {
      if (result.exists && result.value !== null) {
        const isBool = result.type === 'BOOL';
        const isTrue = isBool && (result.value === true || result.value === 1);
        map.set(varPath, {
          value: formatDebugValue(result.value, result.type),
          type: result.type,
          isBool,
          isTrue,
        });
      }
    }

    if (map.size > 0) {
      console.log(`[CodeEditor] Found ${map.size} inline widgets to render:`, Array.from(map.entries()));
    }

    return map;
  }, [debugValues]);

  // Build inline widgets
  const inlineWidgets = useMemo(() => {
    if (debugMode === 'none' || variableValueMap.size === 0) return [];
    return buildInlineWidgets(content, variableValueMap);
  }, [content, variableValueMap, debugMode]);

  // Handle editor mount
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Add mouse down listener for gutter clicks (breakpoints)
    editor.onMouseDown((e) => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
        ) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          if (debugMap && !isLineBreakpointEligible(debugMap, fileName, lineNumber)) {
            return;
          }
          toggleBreakpoint(fileId, lineNumber);
        }
      }
    });

    // Enable glyph margin for breakpoint icons
    editor.updateOptions({
      glyphMargin: true,
    });

    // Register custom languages if not already registered
    const languages = monaco.languages.getLanguages();
    if (!languages.some((l: { id: string }) => l.id === ST_LANGUAGE_ID)) {
      monaco.languages.register({ id: ST_LANGUAGE_ID });
      monaco.languages.setMonarchTokensProvider(ST_LANGUAGE_ID, stLanguage);
      monaco.languages.setLanguageConfiguration(ST_LANGUAGE_ID, stConf);
    }
    if (!languages.some((l: { id: string }) => l.id === IL_LANGUAGE_ID)) {
      monaco.languages.register({ id: IL_LANGUAGE_ID });
      monaco.languages.setMonarchTokensProvider(IL_LANGUAGE_ID, ilLanguage);
      monaco.languages.setLanguageConfiguration(IL_LANGUAGE_ID, ilConf);
    }

    // Register custom themes
    monaco.editor.defineTheme(ZPLC_DARK_THEME_ID, ZPLC_DARK_THEME);
    monaco.editor.defineTheme(ZPLC_LIGHT_THEME_ID, ZPLC_LIGHT_THEME);

    setEditorReady(true);
  }, [debugMap, fileId, fileName, toggleBreakpoint]);

  // Update breakpoint and current line decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const newDecorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];
    const eligibleBreakpoints = filterEligibleBreakpointLines(debugMap, fileName, breakpoints);

    // Add breakpoint decorations
    for (const line of eligibleBreakpoints) {
      newDecorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'breakpoint-glyph',
          glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` },
          linesDecorationsClassName: 'breakpoint-line-decoration',
        },
      });
    }

    // Add current execution line decoration (when paused)
    if (isPaused && currentLine !== null && isCurrentFile) {
      newDecorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'current-line-highlight',
          glyphMarginClassName: 'current-line-glyph',
        },
      });
    }

    // Apply decorations
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [breakpoints, currentLine, debugMap, fileName, isCurrentFile, isPaused]);

  // Update inline value decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !editorReady) return;

    if (!inlineDecorationsRef.current) {
      inlineDecorationsRef.current = editor.createDecorationsCollection();
    }

    const newDecorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

    if (debugMode !== 'none') {
      // Group widgets by line for combined display
      const widgetsByLine = new Map<number, InlineValueWidget[]>();
      for (const widget of inlineWidgets) {
        const existing = widgetsByLine.get(widget.lineNumber) || [];
        existing.push(widget);
        widgetsByLine.set(widget.lineNumber, existing);
      }

      // Create inline decorations for each line
      for (const [lineNum, widgets] of widgetsByLine) {
        // Build combined text for all values on this line
        const valueParts = widgets.map(w => {
          const label = w.variableName.includes('.')
            ? w.variableName.split('.').pop()
            : w.variableName;
          return `${label}=${w.value}`;
        });

        const combinedText = `  ${valueParts.join('  ·  ')}`;

        // Determine CSS class based on bool state
        const cssClass = widgets.some(w => w.isBool && w.isTrue)
          ? 'inline-debug-value-true'
          : widgets.some(w => w.isBool && !w.isTrue)
            ? 'inline-debug-value-false'
            : 'inline-debug-value';

        // Get end of line
        const model = editor.getModel();
        if (!model) continue;
        const maxCol = model.getLineMaxColumn(lineNum);

        console.log(`[CodeEditor] Adding decoration to line ${lineNum} at col ${maxCol}:`, combinedText);
        newDecorations.push({
          range: new monaco.Range(lineNum, maxCol, lineNum, maxCol),
          options: {
            // Monaco drops empty-range decorations unless showIfCollapsed is true.
            // These inline values are intentionally attached to a collapsed range
            // at end-of-line, so this flag is REQUIRED for rendering.
            showIfCollapsed: true,
            // after: injects actual text content into the view after the line end.
            // inlineClassName is applied to the injected-text <span>.
            // CSS for these classes lives in src/index.css (static, guaranteed loaded).
            after: {
              content: combinedText,
              inlineClassName: cssClass,
              inlineClassNameAffectsLetterSpacing: true,
            },
          },
        });
      }
    }

    console.log(`[CodeEditor] Setting ${newDecorations.length} inline decorations!`);
    // Apply inline decorations
    inlineDecorationsRef.current.set(newDecorations);
  }, [inlineWidgets, debugMode, editorReady]);

  // Handle content change
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && onChange) {
      onChange(value);
    }
  }, [onChange]);

  // NOTE: All debug decoration CSS (breakpoints, inline values) is defined in
  // src/index.css — static stylesheet loaded by Vite. No dynamic injection here.

  return (
    <div className="relative w-full h-full">
      {/* Debug mode indicator */}
      {debugMode !== 'none' && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2 py-1 
                        bg-[var(--color-surface-800)]/90 rounded text-xs text-[var(--color-surface-300)]
                        border border-[var(--color-surface-600)]">
          <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`} />
          <span>{isPaused ? 'Paused' : 'Running'}</span>
          {variableValueMap.size > 0 && (
            <span className="text-blue-400">
              ({variableValueMap.size} values)
            </span>
          )}
          {breakpoints.size > 0 && (
            <span className="text-[var(--color-surface-400)]">
              • {breakpoints.size} BP{breakpoints.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      <Editor
        height="100%"
        language={getMonacoLanguage(language)}
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={isDark ? ZPLC_DARK_THEME_ID : ZPLC_LIGHT_THEME_ID}
        options={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          lineNumbers: 'on',
          glyphMargin: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          padding: { top: 8 },
          readOnly,
          cursorBlinking: 'solid',
          cursorSmoothCaretAnimation: 'off',
          smoothScrolling: false,
          renderLineHighlight: 'line',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          lineNumbersMinChars: 4,
          folding: true,
          foldingHighlight: true,
        }}
      />
    </div>
  );
}

export default CodeEditor;
