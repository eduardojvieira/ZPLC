/** What checking and running a proposal or a place of an answer need of the application, read from its live stores and commands. */
import { getCommandState, runCommand } from '../../commands/bus';
import { requestElementSelection } from '../../editors/elementSelectionRequests';
import { useAppSettings } from '../../store/useAppSettings';
import { useIDEStore } from '../../store/useIDEStore';
import type { ProposalDeps } from './editorProposals';

type SettingName = 'theme' | 'language' | 'density' | 'editorFontSize' | 'editorTabSize';

export function liveDeps(): ProposalDeps {
  const store = useIDEStore.getState();
  return {
    isProjectOpen: store.isProjectOpen,
    deviceConnected: getCommandState().connected,
    fileTree: store.fileTree,
    loadedFiles: store.loadedFiles,
    openFile: store.openFile,
    navigate: store.navigateToCompilerDiagnostic,
    selectElement: (path, element) => requestElementSelection(path, element),
    runCommand: (id) => runCommand(id, { respectEnabled: true }),
    currentSetting: (name: SettingName) => (name === 'theme' ? store.theme : useAppSettings.getState().settings[name]),
    applySetting: (name: SettingName, value) => {
      // the theme and the other settings are applied by the setters the settings screen uses; a value outside its choices is ignored there
      if (name === 'theme') store.setTheme(value as never);
      else useAppSettings.getState().update({ [name]: value });
    },
  };
}

