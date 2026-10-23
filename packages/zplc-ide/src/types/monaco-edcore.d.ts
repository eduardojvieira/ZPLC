// The editor core of Monaco without its language services and basic languages (IDE-015). The package ships no
// declarations for this entry; it exports what `editor.api` declares.
declare module 'monaco-editor/esm/vs/editor/edcore.main' {
  export * from 'monaco-editor/esm/vs/editor/editor.api.js';
}

// Monaco's own Structured Text grammar, which the code editor uses; the package ships no declarations for it.
declare module 'monaco-editor/esm/vs/basic-languages/st/st.js' {
  import type { languages } from 'monaco-editor';
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
