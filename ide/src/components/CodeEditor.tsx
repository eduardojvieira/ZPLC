/**
 * @file CodeEditor.tsx
 * @brief Monaco Editor wrapper with debugging support
 *
 * Provides a code editor with:
 * - Breakpoint gutter (click to toggle, red dot indicators)
 * - Current line highlight (yellow when paused at breakpoint)
 * - Integration with IDE debug store
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import type * as MonacoEditor from 'monaco-editor';
import { useIDEStore } from '../store/useIDEStore';
import { useFileBreakpoints, useCurrentExecution } from '../hooks/useDebugValue';
import { useTheme } from '../hooks/useTheme';
import type { PLCLanguage } from '../types';

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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map PLC language to Monaco language ID
 */
function getMonacoLanguage(lang: PLCLanguage): string {
  switch (lang) {
    case 'ST':
      return 'pascal'; // Closest match for Structured Text
    case 'IL':
      return 'plaintext'; // Assembly-like
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

  // Debug state from store
  const debugMode = useIDEStore((state) => state.debug.mode);
  const toggleBreakpoint = useIDEStore((state) => state.toggleBreakpoint);
  const breakpoints = useFileBreakpoints(fileId);
  const { isPaused, currentLine, currentPOU } = useCurrentExecution();

  // Check if this file is the current execution context
  const isCurrentFile = useMemo(() => {
    // Simple heuristic: check if file ID contains the POU name
    // In a real implementation, this would use the debug map
    return currentPOU ? fileId.toLowerCase().includes(currentPOU.toLowerCase()) : false;
  }, [fileId, currentPOU]);

  // Handle editor mount
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom CSS for breakpoint and current line decorations
    // This is done via the editor's built-in decoration system
    
    // Add mouse down listener for gutter clicks (breakpoints)
    editor.onMouseDown((e) => {
      // Check if click is in the gutter (line number area)
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
  }, [fileId, toggleBreakpoint]);

  // Update decorations when breakpoints or current line changes
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

  // Handle content change
  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && onChange) {
      onChange(value);
    }
  }, [onChange]);

  // Custom CSS for decorations (injected into editor)
  useEffect(() => {
    // Create or update style element for custom decorations
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
          <span className={`w-2 h-2 rounded-full ${
            isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'
          }`} />
          <span>{isPaused ? 'Paused' : 'Running'}</span>
          {breakpoints.size > 0 && (
            <span className="text-[var(--color-surface-400)]">
              ({breakpoints.size} breakpoint{breakpoints.size !== 1 ? 's' : ''})
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
        theme={isDark ? 'vs-dark' : 'light'}
        options={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          lineNumbers: 'on',
          glyphMargin: true, // Enable for breakpoints
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          padding: { top: 8 },
          readOnly,
          // Industrial feel - less fancy stuff
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
          // Allow clicking in gutter for breakpoints
          lineNumbersMinChars: 4,
          folding: true,
          foldingHighlight: true,
        }}
      />
    </div>
  );
}

export default CodeEditor;
