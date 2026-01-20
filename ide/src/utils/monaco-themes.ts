import type { editor } from 'monaco-editor';

// =============================================================================
// ZPLC Dark Theme - Industrial Control Inspired
// =============================================================================

export const ZPLC_DARK_THEME: editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        // Comments - Muted green
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },

        // Keywords - Bold blue (control structures)
        { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },

        // Types - Cyan (data types)
        { token: 'type', foreground: '4EC9B0' },

        // Operators - Light orange
        { token: 'operator', foreground: 'D4D4D4' },

        // Identifiers - White
        { token: 'identifier', foreground: 'D4D4D4' },

        // Direct Addresses (%I, %Q, %M) - Bright yellow for visibility
        { token: 'variable.predefined', foreground: 'DCDCAA', fontStyle: 'bold' },

        // Numbers - Light green
        { token: 'number', foreground: 'B5CEA8' },

        // Strings - Orange
        { token: 'string', foreground: 'CE9178' },

        // Delimiters
        { token: 'delimiter', foreground: 'D4D4D4' },

        // Brackets
        { token: 'bracket', foreground: 'FFD700' },

        // IL Labels - Bright magenta
        { token: 'type.identifier', foreground: 'C586C0', fontStyle: 'bold' },
    ],
    colors: {
        // Editor background
        'editor.background': '#1E1E1E',
        'editor.foreground': '#D4D4D4',

        // Selection
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',

        // Line numbers
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#C6C6C6',

        // Cursor
        'editorCursor.foreground': '#AEAFAD',

        // Gutter (for breakpoints)
        'editorGutter.background': '#1E1E1E',

        // Current line highlight
        'editor.lineHighlightBackground': '#2D2D2D',
        'editor.lineHighlightBorder': '#282828',
    },
};

// =============================================================================
// ZPLC Light Theme - Industrial Control Inspired
// =============================================================================

export const ZPLC_LIGHT_THEME: editor.IStandaloneThemeData = {
    base: 'vs',
    inherit: true,
    rules: [
        // Comments - Green
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },

        // Keywords - Bold blue (control structures)
        { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },

        // Types - Teal (data types)
        { token: 'type', foreground: '267F99' },

        // Operators - Dark gray
        { token: 'operator', foreground: '000000' },

        // Identifiers - Black
        { token: 'identifier', foreground: '001080' },

        // Direct Addresses (%I, %Q, %M) - Brown/orange for visibility
        { token: 'variable.predefined', foreground: 'A31515', fontStyle: 'bold' },

        // Numbers - Dark green
        { token: 'number', foreground: '098658' },

        // Strings - Red/brown
        { token: 'string', foreground: 'A31515' },

        // Delimiters
        { token: 'delimiter', foreground: '000000' },

        // Brackets
        { token: 'bracket', foreground: '0431FA' },

        // IL Labels - Purple
        { token: 'type.identifier', foreground: 'AF00DB', fontStyle: 'bold' },
    ],
    colors: {
        // Editor background
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',

        // Selection
        'editor.selectionBackground': '#ADD6FF',
        'editor.inactiveSelectionBackground': '#E5EBF1',

        // Line numbers
        'editorLineNumber.foreground': '#237893',
        'editorLineNumber.activeForeground': '#0B216F',

        // Cursor
        'editorCursor.foreground': '#000000',

        // Gutter (for breakpoints)
        'editorGutter.background': '#FFFFFF',

        // Current line highlight
        'editor.lineHighlightBackground': '#EFF4F9',
        'editor.lineHighlightBorder': '#D3D3D3',
    },
};

// Theme IDs
export const ZPLC_DARK_THEME_ID = 'zplc-dark';
export const ZPLC_LIGHT_THEME_ID = 'zplc-light';
