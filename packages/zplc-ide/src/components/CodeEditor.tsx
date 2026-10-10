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
import Editor, { loader, type OnMount, type Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import type * as MonacoEditor from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useIDEStore } from '../store/useIDEStore';
import { useAppSettings } from '../store/useAppSettings';
import { useFileBreakpoints, useCurrentExecution, useDebugValues, formatDebugValue } from '../hooks/useDebugValue';
import { useTheme } from '../hooks/useTheme';
import { useEditorLiveValues } from '../hooks/useEditorLiveValues';
import type { PLCLanguage } from '../types';
import { breakpointDecorationClasses, breakpointFileKey, breakpointHoverMessage, doesCurrentPOUMatchFile, filterEligibleBreakpointLines, isLineBreakpointEligible } from './codeEditorBreakpoints';
import {
  buildInlineWidgets,
  extractVariablesFromCode,
  type InlineValueWidget,
} from './codeEditorInlineValues';
import { isInlineLivePreviewEnabled } from './codeEditorLivePreview';
import {
  ST_LANGUAGE_ID, stLanguage, stConf,
  IL_LANGUAGE_ID, ilLanguage, ilConf
} from '../utils/monaco-languages';
import {
  ZPLC_DARK_THEME, ZPLC_DARK_THEME_ID, ZPLC_HIGH_CONTRAST_THEME, ZPLC_HIGH_CONTRAST_THEME_ID,
  ZPLC_LIGHT_THEME, ZPLC_LIGHT_THEME_ID
} from '../utils/monaco-themes';
import { debugLog } from '../utils/debugLog';
import { projectPathFromModelPath } from '../utils/sessionState';
import { recordViewState, takePendingViewState } from '../store/sessionPersistence';
import { compilerMarkersForFile } from './compilerMarkers';
import { editorModelPath, isMonacoCancellation } from './editorModels';
import { ensureSTLanguageService, getSTSyntaxDiagnostics } from './stLanguageService';

const ST_LIVE_MARKER_OWNER = 'zplc.st-live';
const ST_LIVE_ANALYSIS_DELAY_MS = 300;

const monacoEnvironment = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: () => Worker };
};

monacoEnvironment.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };
loader.config({ monaco });
window.addEventListener('unhandledrejection', (event) => {
  if (isMonacoCancellation(event.reason)) event.preventDefault();
});

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

/** Tells the session where the cursor and the scroll of the file behind the shown model are (IDE-008). */
function reportViewState(editor: MonacoEditor.editor.IStandaloneCodeEditor): void {
  const model = editor.getModel();
  const path = model ? projectPathFromModelPath(model.uri.path) : null;
  const position = editor.getPosition();
  if (path !== null && position) recordViewState(path, { line: position.lineNumber, column: position.column, scrollTop: editor.getScrollTop() });
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
  const { effectiveTheme } = useTheme();
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  // Decorations belong to a model, and each open file keeps its own model.
  const decorationsRef = useRef(new WeakMap<MonacoEditor.editor.ITextModel, string[]>());
  const inlineDecorationsRef = useRef(new WeakMap<MonacoEditor.editor.ITextModel, MonacoEditor.editor.IEditorDecorationsCollection>());
  const syncingRef = useRef(false);
  const [editorReady, setEditorReady] = useState(false);

  // Debug state from store
  const editorFontSize = useAppSettings((state) => state.settings.editorFontSize);
  const editorTabSize = useAppSettings((state) => state.settings.editorTabSize);
  const debugMode = useIDEStore((state) => state.debug.mode);
  const livePreviewEnabled = useIDEStore((state) => state.debug.mpeekEnabled);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const breakpointsInactiveReason = useIDEStore((state) => state.debug.breakpointsInactiveReason);
  const toggleBreakpoint = useIDEStore((state) => state.toggleBreakpoint);
  const breakpoints = useFileBreakpoints(fileId);
  const fileName = useIDEStore((state) => breakpointFileKey(state.loadedFiles.get(fileId), fileId));
  const filePath = useIDEStore((state) => state.loadedFiles.get(fileId)?.path ?? '');
  const compilerMessages = useIDEStore((state) => state.compilerMessages);
  const compilerNavigationTarget = useIDEStore((state) => state.compilerNavigationTarget);
  const projectSession = useIDEStore((state) => state.projectSession);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const stBufferDiagnostics = useIDEStore((state) => state.stBufferDiagnostics);
  const consumeCompilerNavigationTarget = useIDEStore((state) => state.consumeCompilerNavigationTarget);
  const modelPath = editorModelPath(projectSession, fileId);
  const debugMapRef = useRef(debugMap);
  const fileIdRef = useRef(fileId);
  const fileNameRef = useRef(fileName);
  const contentRef = useRef(content);
  const { isPaused, currentLine, currentPOU } = useCurrentExecution();

  // Check if this file is the current execution context
  const isCurrentFile = useMemo(() => {
    if (!currentPOU) {
      return false;
    }

    return doesCurrentPOUMatchFile(debugMap, currentPOU, fileName, fileId);
  }, [debugMap, fileId, fileName, currentPOU]);

  const inlinePreviewEnabled = isInlineLivePreviewEnabled(debugMode, livePreviewEnabled);

  useEffect(() => {
    debugMapRef.current = debugMap;
  }, [debugMap]);

  useEffect(() => {
    fileIdRef.current = fileId;
  }, [fileId]);

  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const isBreakpointGutterTarget = useCallback((type: MonacoEditor.editor.MouseTargetType): boolean => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return false;
    }

    return type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
      type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
      type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
  }, []);

  // Extract variables from code for debug value lookup
  const variablesInCode = useMemo(() => {
    if (debugMode === 'none') return new Map();
    return extractVariablesFromCode(content);
  }, [content, debugMode]);

  // Viewport-aware variable filtering: only read values for variables whose
  // declaration line is currently visible in the editor.  Falls back to all
  // vars when the debug map lacks declarationLine data (older compiler output).
  const { visibleVarNames } = useEditorLiveValues({
    editorRef,
    debugMap,
    debugActive: inlinePreviewEnabled,
  });

  // Get live values only for visible variables (or all if no viewport data)
  const debugValues = useDebugValues(
    inlinePreviewEnabled
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

    return map;
  }, [debugValues]);

  // Build inline widgets
  const inlineWidgets = useMemo(() => {
    if (!inlinePreviewEnabled || variableValueMap.size === 0) return [];
    return buildInlineWidgets(content, variableValueMap);
  }, [content, inlinePreviewEnabled, variableValueMap]);

  // Handle editor mount
  // The tab size is the user's preference (IDE-010): every model takes it, and the indentation of a file does not override it.
  useEffect(() => {
    for (const model of monaco.editor.getModels()) model.updateOptions({ tabSize: editorTabSize, insertSpaces: true });
  }, [editorTabSize, fileId]);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Add mouse down listener for gutter clicks (breakpoints)
    editor.onMouseDown((e) => {
      const fileId = fileIdRef.current;
      debugLog('[Breakpoint] Mouse down', {
        fileId,
        fileName: fileNameRef.current,
        targetType: e.target.type,
        hasPosition: Boolean(e.target.position),
        lineNumber: e.target.position?.lineNumber ?? null,
      });

      if (isBreakpointGutterTarget(e.target.type)) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          const activeDebugMap = debugMapRef.current;
          const activeFileName = fileNameRef.current;

          debugLog('[Breakpoint] Gutter click detected', {
            fileId,
            fileName: activeFileName,
            lineNumber,
            hasDebugMap: Boolean(activeDebugMap),
          });

          if (activeDebugMap && !isLineBreakpointEligible(activeDebugMap, activeFileName, lineNumber)) {
            debugLog('[Breakpoint] Rejected non-executable line', {
              fileId,
              fileName: activeFileName,
              lineNumber,
            });
            return;
          }

          debugLog('[Breakpoint] Toggling breakpoint', {
            fileId,
            fileName: activeFileName,
            lineNumber,
          });
          toggleBreakpoint(fileId, lineNumber);
        }
      }
    });

    // The session keeps the cursor and the scroll of each open file (IDE-008).
    editor.onDidChangeCursorPosition(() => reportViewState(editor));
    editor.onDidScrollChange((change) => { if (change.scrollTopChanged) reportViewState(editor); });

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
    ensureSTLanguageService(monaco);
    if (!languages.some((l: { id: string }) => l.id === IL_LANGUAGE_ID)) {
      monaco.languages.register({ id: IL_LANGUAGE_ID });
      monaco.languages.setMonarchTokensProvider(IL_LANGUAGE_ID, ilLanguage);
      monaco.languages.setLanguageConfiguration(IL_LANGUAGE_ID, ilConf);
    }

    // Register custom themes
    monaco.editor.defineTheme(ZPLC_DARK_THEME_ID, ZPLC_DARK_THEME);
    monaco.editor.defineTheme(ZPLC_LIGHT_THEME_ID, ZPLC_LIGHT_THEME);
    monaco.editor.defineTheme(ZPLC_HIGH_CONTRAST_THEME_ID, ZPLC_HIGH_CONTRAST_THEME);

    setEditorReady(true);
  }, [isBreakpointGutterTarget, toggleBreakpoint]);

  // Update breakpoint and current line decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;

    const newDecorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];
    const eligibleBreakpoints = filterEligibleBreakpointLines(debugMap, fileName, breakpoints);

    const showPendingBreakpoints = debugMap === null;
    const displayedBreakpoints = showPendingBreakpoints ? Array.from(breakpoints) : eligibleBreakpoints;

    debugLog('[Breakpoint] Decorations update', {
      fileId,
      fileName,
      rawBreakpoints: Array.from(breakpoints),
      eligibleBreakpoints,
      displayedBreakpoints,
      showPendingBreakpoints,
      isPaused,
      currentLine,
      isCurrentFile,
    });

    // Add breakpoint decorations; a dot the runtime will not stop at is drawn hollow and grey
    const dotClasses = breakpointDecorationClasses(breakpointsInactiveReason);
    for (const line of displayedBreakpoints) {
      newDecorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: dotClasses.glyph,
          glyphMarginHoverMessage: { value: breakpointHoverMessage(line, breakpointsInactiveReason) },
          linesDecorationsClassName: dotClasses.line,
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
    decorationsRef.current.set(model, editor.deltaDecorations(decorationsRef.current.get(model) ?? [], newDecorations));
  }, [breakpoints, breakpointsInactiveReason, currentLine, debugMap, editorReady, fileId, fileName, isCurrentFile, isPaused, modelPath]);

  // A kept model can be older than the store (the file changed while its tab was hidden): bring it up to date when shown.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const normalizeEol = (text: string) => text.replace(/\r\n?/g, '\n');
    if (!editor || !model || normalizeEol(model.getValue()) === normalizeEol(contentRef.current)) return;
    syncingRef.current = true;
    editor.executeEdits('zplc.sync', [{ range: model.getFullModelRange(), text: contentRef.current, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    syncingRef.current = false;
  }, [editorReady, modelPath]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    const markers = compilerMarkersForFile(compilerMessages, filePath, model.getLineCount(), (line) => model.getLineMaxColumn(line)).map((marker) => ({
      message: marker.message,
      severity: marker.type === 'error' ? monaco.MarkerSeverity.Error : marker.type === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
      startLineNumber: marker.line,
      startColumn: marker.column,
      endLineNumber: marker.line,
      endColumn: marker.endColumn,
    }));
    monaco.editor.setModelMarkers(model, 'zplc.compiler', markers);
    return () => monaco.editor.setModelMarkers(model, 'zplc.compiler', []);
  }, [compilerMessages, editorReady, filePath]);

  useEffect(() => {
    if (language !== 'ST' || !filePath) return;
    const state = useIDEStore.getState();
    const identity = { projectSession, compilerRunId, fileId, file: filePath };
    if (state.activeFileId !== fileId || state.projectSession !== projectSession || state.compilerRunId !== compilerRunId) return;

    const timer = window.setTimeout(() => {
      const diagnostics = getSTSyntaxDiagnostics(content);
      useIDEStore.getState().setSTBufferDiagnostics({ ...identity, diagnostics }, content);
    }, ST_LIVE_ANALYSIS_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      useIDEStore.getState().clearSTBufferDiagnostics(identity);
    };
  }, [compilerRunId, content, fileId, filePath, language, projectSession]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    const current = stBufferDiagnostics;
    const isCurrent = language === 'ST' && current?.projectSession === projectSession
      && current.compilerRunId === compilerRunId && current.fileId === fileId && current.file === filePath;
    const markers = !isCurrent ? [] : current.diagnostics.flatMap((diagnostic) => {
      if (!diagnostic.line || diagnostic.line < 1) return [];
      const line = Math.min(diagnostic.line, model.getLineCount());
      const column = Math.min(Math.max(1, diagnostic.column ?? 1), model.getLineMaxColumn(line));
      const endColumn = Math.min(column + 1, model.getLineMaxColumn(line));
      return [{
        message: diagnostic.message,
        severity: diagnostic.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn,
      }];
    });
    monaco.editor.setModelMarkers(model, ST_LIVE_MARKER_OWNER, markers);
    return () => monaco.editor.setModelMarkers(model, ST_LIVE_MARKER_OWNER, []);
  }, [compilerRunId, editorReady, fileId, filePath, language, projectSession, stBufferDiagnostics]);

  // A cursor and a scroll restored with the session are put back once, when the editor first shows the file (IDE-008).
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !editorReady || !filePath || projectPathFromModelPath(model.uri.path) !== filePath) return;
    const view = takePendingViewState(filePath);
    if (!view) return;
    const lineNumber = Math.min(view.line, model.getLineCount());
    const column = Math.min(view.column, model.getLineMaxColumn(lineNumber));
    editor.setPosition({ lineNumber, column });
    editor.setScrollTop(view.scrollTop);
  }, [editorReady, filePath, modelPath]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !compilerNavigationTarget || compilerNavigationTarget.file !== filePath) return;
    const model = editor.getModel();
    if (!model) return;
    const lineNumber = Math.min(compilerNavigationTarget.line, model.getLineCount());
    const column = Math.min(compilerNavigationTarget.column, model.getLineMaxColumn(lineNumber));
    editor.setPosition({ lineNumber, column });
    editor.revealPositionInCenter({ lineNumber, column });
    editor.focus();
    consumeCompilerNavigationTarget(compilerNavigationTarget);
  }, [compilerNavigationTarget, consumeCompilerNavigationTarget, filePath, editorReady]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isPaused || !isCurrentFile || currentLine === null) {
      return;
    }

    debugLog('[Execution] Revealing paused line', {
      fileId,
      fileName,
      currentPOU,
      currentLine,
      isCurrentFile,
    });

    editor.revealLineInCenterIfOutsideViewport(currentLine);
  }, [currentLine, currentPOU, fileId, fileName, isCurrentFile, isPaused]);

  useEffect(() => {
    if (!debugMap) {
      return;
    }

    const eligibleBreakpoints = filterEligibleBreakpointLines(debugMap, fileName, breakpoints);
    if (eligibleBreakpoints.length !== breakpoints.size) {
      debugLog('[Breakpoint] Pruning invalid breakpoint lines', {
        fileId,
        fileName,
        rawBreakpoints: Array.from(breakpoints),
        eligibleBreakpoints,
      });
      useIDEStore.getState().setBreakpoints(fileId, eligibleBreakpoints);
    }
  }, [breakpoints, debugMap, fileId, fileName]);

  // Update inline value decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !editorReady) return;

    const model = editor.getModel();
    if (!model) return;
    let inlineDecorations = inlineDecorationsRef.current.get(model);
    if (!inlineDecorations) {
      inlineDecorations = editor.createDecorationsCollection();
      inlineDecorationsRef.current.set(model, inlineDecorations);
    }

    const newDecorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

    if (inlinePreviewEnabled) {
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
        const maxCol = model.getLineMaxColumn(lineNum);

        debugLog(`[CodeEditor] Adding decoration to line ${lineNum} at col ${maxCol}:`, combinedText);
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

    debugLog(`[CodeEditor] Setting ${newDecorations.length} inline decorations!`);
    // Apply inline decorations
    inlineDecorations.set(newDecorations);
  }, [inlinePreviewEnabled, inlineWidgets, editorReady, modelPath]);

  // Handle content change
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && onChange && !syncingRef.current) {
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
          <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-[var(--color-accent-blue)]'}`} />
          <span>{isPaused ? 'Paused' : debugMode === 'simulation' ? 'Simulation' : 'Hardware'}</span>
          {variableValueMap.size > 0 && (
            <span className="text-blue-400">
              ({variableValueMap.size} values)
            </span>
          )}
          {filterEligibleBreakpointLines(debugMap, fileName, breakpoints).length > 0 && (
            <span className="text-[var(--color-surface-400)]">
              • {filterEligibleBreakpointLines(debugMap, fileName, breakpoints).length} BP{filterEligibleBreakpointLines(debugMap, fileName, breakpoints).length !== 1 ? 's' : ''}
              {breakpointsInactiveReason ? ' (not active)' : ''}
            </span>
          )}
        </div>
      )}

      <Editor
        height="100%"
        path={modelPath}
        keepCurrentModel
        language={getMonacoLanguage(language)}
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={effectiveTheme === 'high-contrast' ? ZPLC_HIGH_CONTRAST_THEME_ID : effectiveTheme === 'dark' ? ZPLC_DARK_THEME_ID : ZPLC_LIGHT_THEME_ID}
        options={{
          fontFamily: 'var(--font-mono)',
          fontSize: editorFontSize,
          lineNumbers: 'on',
          glyphMargin: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: editorTabSize,
          detectIndentation: false,
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
