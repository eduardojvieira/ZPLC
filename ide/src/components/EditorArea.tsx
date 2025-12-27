/**
 * EditorArea Component
 * 
 * Tabbed editor container with Monaco for text languages (ST, IL)
 * and visual editors for graphical languages (LD, FBD, SFC)
 */

import { useMemo, useCallback } from 'react';
import { X, FileCode, File, Settings } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useIDEStore } from '../store/useIDEStore';
import { useTheme } from '../hooks/useTheme';
import { PLC_LANGUAGES, type PLCLanguage } from '../types';
import { FBDEditor } from '../editors/fbd';
import { LDEditor } from '../editors/ld';
import { SFCEditor } from '../editors/sfc';
import { parseFBDModel, serializeFBDModel, type FBDModel } from '../models/fbd';
import { parseLDModel, serializeLDModel, type LDModel } from '../models/ld';
import { parseSFCModel, serializeSFCModel, type SFCModel } from '../models/sfc';
import { ProjectSettings } from './settings/ProjectSettings';

export function EditorArea() {
  const {
    activeFileId,
    openTabs,
    setActiveFile,
    closeTab,
    updateFileContent,
    showSettings,
    toggleSettings,
    getActiveFile,
    getFile,
  } = useIDEStore();
  
  const { isDark } = useTheme();

  const activeFile = getActiveFile();
  const tabFiles = openTabs
    .map((id) => getFile(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  // Monaco language mapping
  const getMonacoLanguage = (lang: PLCLanguage): string => {
    switch (lang) {
      case 'ST':
        return 'pascal'; // Closest match for Structured Text
      case 'IL':
        return 'plaintext'; // Assembly-like
      default:
        return 'json';
    }
  };

  const getFileIcon = (lang: PLCLanguage) => {
    const info = PLC_LANGUAGES[lang];
    if (info?.isVisual) {
      return <FileCode size={14} className="text-[var(--color-accent-purple)]" />;
    }
    return <File size={14} className="text-[var(--color-accent-blue)]" />;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value);
    }
  };

  // Parse FBD model from file content
  const fbdModel = useMemo((): FBDModel | null => {
    if (!activeFile || activeFile.language !== 'FBD') return null;
    try {
      return parseFBDModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse FBD model:', e);
      return null;
    }
  }, [activeFile]);

  // Parse LD model from file content
  const ldModel = useMemo((): LDModel | null => {
    if (!activeFile || activeFile.language !== 'LD') return null;
    try {
      return parseLDModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse LD model:', e);
      return null;
    }
  }, [activeFile]);

  // Parse SFC model from file content
  const sfcModel = useMemo((): SFCModel | null => {
    if (!activeFile || activeFile.language !== 'SFC') return null;
    try {
      return parseSFCModel(activeFile.content);
    } catch (e) {
      console.error('Failed to parse SFC model:', e);
      return null;
    }
  }, [activeFile]);

  // Handle FBD model changes
  const handleFBDChange = useCallback((model: FBDModel) => {
    if (activeFileId) {
      updateFileContent(activeFileId, serializeFBDModel(model));
    }
  }, [activeFileId, updateFileContent]);

  // Handle LD model changes
  const handleLDChange = useCallback((model: LDModel) => {
    if (activeFileId) {
      updateFileContent(activeFileId, serializeLDModel(model));
    }
  }, [activeFileId, updateFileContent]);

  // Handle SFC model changes
  const handleSFCChange = useCallback((model: SFCModel) => {
    if (activeFileId) {
      updateFileContent(activeFileId, serializeSFCModel(model));
    }
  }, [activeFileId, updateFileContent]);

  // Render visual editor based on language
  const renderVisualEditor = () => {
    if (!activeFile) return null;

    switch (activeFile.language) {
      case 'FBD':
        if (fbdModel) {
          return <FBDEditor model={fbdModel} onChange={handleFBDChange} />;
        }
        return renderParseError('FBD');
        
      case 'LD':
        if (ldModel) {
          return <LDEditor model={ldModel} onChange={handleLDChange} />;
        }
        return renderParseError('LD');
        
      case 'SFC':
        if (sfcModel) {
          return <SFCEditor model={sfcModel} onChange={handleSFCChange} />;
        }
        return renderParseError('SFC');
        
      default:
        return renderPlaceholder(activeFile.language, 'Unknown visual language');
    }
  };

  // Render parse error state
  const renderParseError = (lang: string) => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-800)]">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-red-900/30 flex items-center justify-center">
          <FileCode size={32} className="text-red-400" />
        </div>
        <p className="text-red-400 text-lg font-medium">Invalid {lang} Model</p>
        <p className="text-[var(--color-surface-400)] text-sm mt-1 max-w-md">
          Failed to parse the {lang} JSON. Check the console for details.
        </p>
      </div>
    </div>
  );

  // Render placeholder for unimplemented editors
  const renderPlaceholder = (lang: string, message: string) => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface-800)]">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-lg bg-[var(--color-surface-700)] flex items-center justify-center">
          <FileCode size={40} className="text-[var(--color-accent-purple)]" />
        </div>
        <p className="text-[var(--color-surface-100)] text-lg font-medium">
          {PLC_LANGUAGES[lang as PLCLanguage]?.fullName || lang}
        </p>
        <p className="text-[var(--color-surface-400)] text-sm mt-1">
          {message}
        </p>
        {activeFile && (
          <p className="text-[var(--color-surface-500)] text-xs mt-3 font-mono">
            {activeFile.name}
          </p>
        )}
      </div>
    </div>
  );

  // No open tabs state (only if settings not shown)
  if (openTabs.length === 0 && !showSettings) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-surface-900)]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-surface-800)] flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-surface-400)]" />
          </div>
          <p className="text-[var(--color-surface-300)] text-lg">No file open</p>
          <p className="text-[var(--color-surface-400)] text-sm mt-1">
            Select a file from the explorer to start editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-surface-900)] overflow-hidden">
      {/* Tab Bar */}
      <div className="h-9 flex items-center bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)] overflow-x-auto">
        {/* Settings Tab (if open) */}
        {showSettings && (
          <div
            className="group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none transition-colors bg-[var(--color-surface-700)] text-[var(--color-surface-100)]"
          >
            <Settings size={14} className="text-[var(--color-accent-blue)]" />
            <span className="text-sm whitespace-nowrap">Settings</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSettings();
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-500)] transition-opacity"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
        
        {/* File Tabs */}
        {tabFiles.map((file) => {
          if (!file) return null;
          const isActive = file.id === activeFileId && !showSettings;
          
          return (
            <div
              key={file.id}
              className={`group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none transition-colors ${
                isActive
                  ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-100)]'
                  : 'bg-[var(--color-surface-800)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'
              }`}
              onClick={() => {
                if (showSettings) toggleSettings();
                setActiveFile(file.id);
              }}
            >
              {getFileIcon(file.language)}
              <span className="text-sm whitespace-nowrap">{file.name}</span>
              {file.isModified && (
                <span className="text-[var(--color-accent-orange)] text-lg leading-none">
                  *
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(file.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-500)] transition-opacity"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden">
        {showSettings ? (
          /* Project Settings Panel */
          <ProjectSettings />
        ) : activeFile ? (
          PLC_LANGUAGES[activeFile.language]?.isVisual ? (
            /* Visual Editors (FBD, LD, SFC) */
            renderVisualEditor()
          ) : (
            /* Monaco Editor for Text Languages */
            <Editor
              height="100%"
              language={getMonacoLanguage(activeFile.language)}
              value={activeFile.content}
              onChange={handleEditorChange}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                lineNumbers: 'on',
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                tabSize: 4,
                insertSpaces: true,
                automaticLayout: true,
                padding: { top: 8 },
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
              }}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
