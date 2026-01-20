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
import type { PLCLanguage } from '../types';
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

interface InlineValueWidget {
  lineNumber: number;
  column: number;
  variableName: string;
  value: string;
  type: string | null;
  isBool: boolean;
  isTrue?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

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

/**
 * Extract all variable references from ST/IL code.
 * Returns variable names and their line positions.
 */
function extractVariablesFromCode(content: string, _language: PLCLanguage): Map<string, { lines: number[], instances: Array<{ line: number, col: number }> }> {
  const variables = new Map<string, { lines: number[], instances: Array<{ line: number, col: number }> }>();
  const lines = content.split('\n');

  // Keywords to ignore (ST + IL instructions)
  const keywords = new Set([
    // ST/Common keywords
    'PROGRAM', 'END_PROGRAM', 'FUNCTION', 'END_FUNCTION', 'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
    'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_GLOBAL', 'END_VAR',
    'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF', 'CASE', 'OF', 'END_CASE',
    'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT',
    'TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'XOR', 'MOD', 'DIV',
    'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD', 'SINT', 'INT', 'DINT', 'LINT',
    'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL', 'TIME', 'STRING',
    'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG', 'SR', 'RS',
    'AT', 'RETAIN', 'CONSTANT', 'RETURN', 'EXIT',
    // IL instructions
    'LD', 'LDN', 'ST', 'STN', 'S', 'R',
    'AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN', 'NOT',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'GT', 'GE', 'EQ', 'NE', 'LE', 'LT',
    'JMP', 'JMPC', 'JMPCN', 'CAL', 'CALC', 'CALCN', 'RET', 'RETC', 'RETCN',
  ]);

  // Track declared FB instances
  const fbInstances = new Map<string, string>(); // name -> type

  // First pass: find FB instance declarations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match pattern: InstanceName : TON; or InstanceName : TON := (...);
    const fbDeclMatch = line.match(/^\s*(\w+)\s*:\s*(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)\b/i);
    if (fbDeclMatch) {
      fbInstances.set(fbDeclMatch[1], fbDeclMatch[2].toUpperCase());
    }
  }

  // Regex to match identifiers (including dot notation for FB members)
  const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\b/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('(*')) continue;

    // Remove string literals to avoid false matches
    const cleanLine = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    let match;
    while ((match = identifierRegex.exec(cleanLine)) !== null) {
      const varName = match[1];
      const baseName = varName.split('.')[0];

      // Skip keywords
      if (keywords.has(baseName.toUpperCase())) continue;
      if (keywords.has(varName.toUpperCase())) continue;

      // Skip type annotations (after colon)
      const beforeMatch = cleanLine.substring(0, match.index);
      if (beforeMatch.match(/:\s*$/)) continue;

      // Get column position
      const col = match.index + 1;

      // Track variable
      const existing = variables.get(varName) || { lines: [], instances: [] };
      if (!existing.lines.includes(lineNum)) {
        existing.lines.push(lineNum);
      }
      existing.instances.push({ line: lineNum, col });
      variables.set(varName, existing);

      // For FB instances, also track their outputs
      if (fbInstances.has(baseName) && !varName.includes('.')) {
        const fbType = fbInstances.get(baseName)!;

        // Add common FB outputs to watch
        const outputs: string[] = [];
        switch (fbType) {
          case 'TON':
          case 'TOF':
          case 'TP':
            outputs.push(`${baseName}.Q`, `${baseName}.ET`, `${baseName}.IN`, `${baseName}.PT`);
            break;
          case 'CTU':
            outputs.push(`${baseName}.Q`, `${baseName}.CV`, `${baseName}.CU`, `${baseName}.PV`);
            break;
          case 'CTD':
            outputs.push(`${baseName}.Q`, `${baseName}.CV`, `${baseName}.CD`, `${baseName}.PV`);
            break;
          case 'CTUD':
            outputs.push(`${baseName}.QU`, `${baseName}.QD`, `${baseName}.CV`, `${baseName}.CU`, `${baseName}.CD`, `${baseName}.PV`);
            break;
          case 'R_TRIG':
          case 'F_TRIG':
            outputs.push(`${baseName}.Q`, `${baseName}.CLK`);
            break;
          case 'SR':
          case 'RS':
            outputs.push(`${baseName}.Q1`, `${baseName}.S`, `${baseName}.R1`);
            break;
        }

        for (const output of outputs) {
          if (!variables.has(output)) {
            variables.set(output, { lines: existing.lines.slice(), instances: [] });
          }
        }
      }
    }
  }

  return variables;
}

/**
 * Find the best position to show inline value for each line
 */
function buildInlineWidgets(
  content: string,
  variableValues: Map<string, { value: string; type: string | null; isBool: boolean; isTrue?: boolean }>
): InlineValueWidget[] {
  const widgets: InlineValueWidget[] = [];
  const lines = content.split('\n');
  const shownOnLine = new Map<number, Set<string>>(); // Track which vars shown on each line

  // Keywords to skip for line-end display
  const skipPatterns = [/^\s*$/, /^\s*\/\//, /^\s*\(\*/, /^\s*VAR/, /^\s*END_VAR/, /^\s*PROGRAM/, /^\s*END_PROGRAM/];

  // IL instructions to ignore when building widgets
  const ilInstructions = new Set([
    'LD', 'LDN', 'ST', 'STN', 'S', 'R',
    'AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN', 'NOT',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'GT', 'GE', 'EQ', 'NE', 'LE', 'LT',
    'JMP', 'JMPC', 'JMPCN', 'CAL', 'CALC', 'CALCN', 'RET', 'RETC', 'RETCN',
    'PT', 'IN', 'TRUE', 'FALSE',
  ]);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip empty lines, comments, declarations
    if (skipPatterns.some(p => p.test(line))) continue;

    // Find variables on this line
    const varsOnLine: InlineValueWidget[] = [];
    const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\b/g;
    const cleanLine = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    let match;
    const seenOnThisLine = new Set<string>();

    while ((match = identifierRegex.exec(cleanLine)) !== null) {
      const varName = match[1];

      // Skip if we already have this var on this line
      if (seenOnThisLine.has(varName)) continue;
      seenOnThisLine.add(varName);

      // Skip IL instructions and keywords
      if (ilInstructions.has(varName.toUpperCase())) continue;

      // Check if we have a value for this variable
      const valInfo = variableValues.get(varName);
      if (valInfo) {
        varsOnLine.push({
          lineNumber: lineNum,
          column: match.index + 1,
          variableName: varName,
          value: valInfo.value,
          type: valInfo.type,
          isBool: valInfo.isBool,
          isTrue: valInfo.isTrue,
        });
      }
    }

    // For this line, show up to 3 most relevant variables
    // Priority: FB outputs (.Q, .ET) > assignments (LHS) > others
    varsOnLine.sort((a, b) => {
      const aIsFBOutput = a.variableName.includes('.');
      const bIsFBOutput = b.variableName.includes('.');
      if (aIsFBOutput && !bIsFBOutput) return -1;
      if (!aIsFBOutput && bIsFBOutput) return 1;
      return a.column - b.column;
    });

    // Take first 4 unique variables per line
    const lineVarsShown = shownOnLine.get(lineNum) || new Set();
    for (const widget of varsOnLine.slice(0, 4)) {
      if (!lineVarsShown.has(widget.variableName)) {
        widgets.push(widget);
        lineVarsShown.add(widget.variableName);
      }
    }
    shownOnLine.set(lineNum, lineVarsShown);
  }

  return widgets;
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
  const inlineDecorationsRef = useRef<string[]>([]);
  const [editorReady, setEditorReady] = useState(false);

  // Debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const toggleBreakpoint = useIDEStore((state) => state.toggleBreakpoint);
  const breakpoints = useFileBreakpoints(fileId);
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

  // Get all variable paths to watch
  const variablePaths = useMemo(() => {
    return Array.from(variablesInCode.keys());
  }, [variablesInCode]);

  // Get live values for all variables
  const debugValues = useDebugValues(debugMode !== 'none' ? variablePaths : []);

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
  }, [fileId, toggleBreakpoint]);

  // Update breakpoint and current line decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const newDecorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

    // Add breakpoint decorations
    for (const line of breakpoints) {
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
  }, [breakpoints, isPaused, currentLine, isCurrentFile]);

  // Update inline value decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !editorReady) return;

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

        const combinedText = `  // ${valueParts.join(' | ')}`;

        // Get end of line
        const model = editor.getModel();
        if (!model) continue;
        const lineLength = model.getLineLength(lineNum);

        newDecorations.push({
          range: new monaco.Range(lineNum, lineLength + 1, lineNum, lineLength + 1),
          options: {
            after: {
              content: combinedText,
              inlineClassName: widgets.some(w => w.isBool && w.isTrue)
                ? 'inline-debug-value-true'
                : widgets.some(w => w.isBool && !w.isTrue)
                  ? 'inline-debug-value-false'
                  : 'inline-debug-value',
            },
            isWholeLine: false,
          },
        });
      }
    }

    // Apply inline decorations
    inlineDecorationsRef.current = editor.deltaDecorations(
      inlineDecorationsRef.current,
      newDecorations
    );
  }, [inlineWidgets, debugMode, editorReady]);

  // Handle content change
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && onChange) {
      onChange(value);
    }
  }, [onChange]);

  // Custom CSS for decorations
  useEffect(() => {
    const styleId = 'zplc-editor-debug-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      /* Breakpoint glyph (red dot in margin) */
      .breakpoint-glyph {
        background: #ef4444;
        border-radius: 50%;
        width: 12px !important;
        height: 12px !important;
        margin-left: 4px;
        margin-top: 4px;
        cursor: pointer;
      }
      
      /* Breakpoint line decoration (subtle red background) */
      .breakpoint-line-decoration {
        background: rgba(239, 68, 68, 0.15);
        width: 3px !important;
      }
      
      /* Current execution line (yellow highlight) */
      .current-line-highlight {
        background: rgba(250, 204, 21, 0.2) !important;
        border-left: 3px solid #facc15;
      }
      
      /* Current line glyph (yellow arrow) */
      .current-line-glyph {
        background: #facc15;
        clip-path: polygon(0 0, 100% 50%, 0 100%);
        width: 10px !important;
        height: 14px !important;
        margin-left: 5px;
        margin-top: 3px;
      }
      
      /* Hover effect for gutter */
      .monaco-editor .margin-view-overlays .line-numbers:hover {
        cursor: pointer;
      }
      
      /* Inline debug value (default - numeric/string) */
      .inline-debug-value {
        color: #60a5fa !important;
        font-style: italic;
        opacity: 0.9;
        margin-left: 8px;
        font-size: 0.9em;
        background: rgba(96, 165, 250, 0.1);
        padding: 0 4px;
        border-radius: 2px;
      }
      
      /* Inline debug value (BOOL TRUE) */
      .inline-debug-value-true {
        color: #4ade80 !important;
        font-style: italic;
        opacity: 0.9;
        margin-left: 8px;
        font-size: 0.9em;
        background: rgba(74, 222, 128, 0.15);
        padding: 0 4px;
        border-radius: 2px;
      }
      
      /* Inline debug value (BOOL FALSE) */
      .inline-debug-value-false {
        color: #f87171 !important;
        font-style: italic;
        opacity: 0.9;
        margin-left: 8px;
        font-size: 0.9em;
        background: rgba(248, 113, 113, 0.15);
        padding: 0 4px;
        border-radius: 2px;
      }
    `;

    return () => {
      // Don't remove on unmount as other editors may use it
    };
  }, []);

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
