/**
 * ZPLC IDE Global State Store
 * 
 * Uses Zustand for simple, type-safe state management
 */

import { create } from 'zustand';
import type {
  ProjectFile,
  ConnectionState,
  ConsoleEntry,
  ConsoleTab,
  PLCLanguage,
  CompilerMessage,
  ProjectConfig,
  SerializableProject,
} from '../types';
import {
  DEFAULT_PROJECT_CONFIG,
  getExtensionForLanguage,
  createEmptyFileContent,
} from '../types';

// =============================================================================
// Theme Types
// =============================================================================

export type Theme = 'light' | 'dark' | 'system';

// =============================================================================
// Store Interface
// =============================================================================

interface IDEState {
  // Theme State
  theme: Theme;

  // Project State
  projectConfig: ProjectConfig;
  files: ProjectFile[];
  activeFileId: string | null;
  openTabs: string[];

  // Connection State
  connection: ConnectionState;

  // Console State
  consoleEntries: ConsoleEntry[];
  activeConsoleTab: ConsoleTab;
  compilerMessages: CompilerMessage[];

  // UI State
  sidebarWidth: number;
  consoleHeight: number;
  isSidebarCollapsed: boolean;
  isConsoleCollapsed: boolean;
  showSettings: boolean;

  // Actions - Theme
  setTheme: (theme: Theme) => void;

  // Actions - Project Config
  updateProjectConfig: (config: Partial<ProjectConfig>) => void;

  // Actions - Files
  addFile: (file: ProjectFile) => void;
  createFile: (name: string, language: PLCLanguage) => string; // Returns file ID
  deleteFile: (fileId: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  setActiveFile: (fileId: string | null) => void;
  updateFileContent: (fileId: string, content: string) => void;
  closeTab: (fileId: string) => void;
  openTab: (fileId: string) => void;
  markFileSaved: (fileId: string) => void;

  // Actions - Import/Export
  exportProject: () => SerializableProject;
  importProject: (project: SerializableProject) => void;

  // Actions - Connection
  setConnectionStatus: (status: ConnectionState['status']) => void;
  setPlcState: (state: ConnectionState['plcState']) => void;

  // Actions - Console
  addConsoleEntry: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void;
  clearConsole: () => void;
  setActiveConsoleTab: (tab: ConsoleTab) => void;
  addCompilerMessage: (message: Omit<CompilerMessage, 'timestamp'>) => void;
  clearCompilerMessages: () => void;

  // Actions - UI
  setSidebarWidth: (width: number) => void;
  setConsoleHeight: (height: number) => void;
  toggleSidebar: () => void;
  toggleConsole: () => void;
  toggleSettings: () => void;
}

// =============================================================================
// Golden Standard Example Files - All 5 IEC 61131-3 Languages
// =============================================================================

const EXAMPLE_ST = `(* Blinky Program - Structured Text *)
PROGRAM Blinky
VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

(* Timer with 500ms interval *)
BlinkTimer(IN := TRUE, PT := T#500ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE);
END_IF;

(* Output to LED *)
%Q0.0 := LedState;

END_PROGRAM`;

const EXAMPLE_IL = `(* Blinky Program - Instruction List *)
PROGRAM Blinky

        LD      TRUE
        ST      BlinkTimer.IN
        
        LD      BlinkTimer.Q
        JMPCN   SKIP_TOGGLE
        
        LD      LedState
        NOT
        ST      LedState
        
SKIP_TOGGLE:
        LD      LedState
        ST      %Q0.0
        
        RET

END_PROGRAM`;

const EXAMPLE_LD = `{
  "$schema": "./schemas/ld.schema.json",
  "name": "Blinky",
  "description": "ZPLC Golden Standard - Blinky in Ladder Diagram (LD)",
  "version": "1.0.0",
  "variables": {
    "local": [
      { "name": "BlinkTimer", "type": "TON", "comment": "Timer for 500ms blink interval" },
      { "name": "TimerDone", "type": "BOOL", "initialValue": false },
      { "name": "LedState", "type": "BOOL", "initialValue": false }
    ],
    "outputs": [
      { "name": "LED_Output", "type": "BOOL", "address": "%Q0.0" }
    ]
  },
  "rungs": [
    {
      "id": "rung_1",
      "number": 1,
      "comment": "Timer Network - Generate 500ms pulse train",
      "elements": [
        { "id": "rail_left_1", "type": "left_rail", "position": { "x": 0, "y": 0 } },
        { "id": "nc_timer", "type": "contact_nc", "variable": "TimerDone", "position": { "x": 100, "y": 0 } },
        { "id": "ton_blink", "type": "function_block", "fbType": "TON", "instance": "BlinkTimer", "position": { "x": 250, "y": 0 }, "parameters": { "IN": "CONNECTED", "PT": "T#500ms" }, "outputs": { "Q": "TimerDone" } },
        { "id": "rail_right_1", "type": "right_rail", "position": { "x": 450, "y": 0 } }
      ],
      "connections": [
        { "from": "rail_left_1", "to": "nc_timer" },
        { "from": "nc_timer", "to": "ton_blink.IN" },
        { "from": "ton_blink.Q", "to": "rail_right_1" }
      ]
    },
    {
      "id": "rung_2",
      "number": 2,
      "comment": "Toggle Network - Toggle LED on timer pulse",
      "elements": [
        { "id": "rail_left_2", "type": "left_rail", "position": { "x": 0, "y": 100 } },
        { "id": "contact_done", "type": "contact_no", "variable": "TimerDone", "position": { "x": 100, "y": 100 } },
        { "id": "contact_led_off", "type": "contact_nc", "variable": "LedState", "position": { "x": 200, "y": 100 } },
        { "id": "coil_set_led", "type": "coil_set", "variable": "LedState", "position": { "x": 350, "y": 100 } },
        { "id": "rail_right_2", "type": "right_rail", "position": { "x": 450, "y": 100 } }
      ],
      "connections": [
        { "from": "rail_left_2", "to": "contact_done" },
        { "from": "contact_done", "to": "contact_led_off" },
        { "from": "contact_led_off", "to": "coil_set_led" },
        { "from": "coil_set_led", "to": "rail_right_2" }
      ]
    },
    {
      "id": "rung_3",
      "number": 3,
      "comment": "Reset Network - Reset LED when timer done and LED is ON",
      "elements": [
        { "id": "rail_left_3", "type": "left_rail", "position": { "x": 0, "y": 200 } },
        { "id": "contact_done_3", "type": "contact_no", "variable": "TimerDone", "position": { "x": 100, "y": 200 } },
        { "id": "contact_led_on", "type": "contact_no", "variable": "LedState", "position": { "x": 200, "y": 200 } },
        { "id": "coil_reset_led", "type": "coil_reset", "variable": "LedState", "position": { "x": 350, "y": 200 } },
        { "id": "rail_right_3", "type": "right_rail", "position": { "x": 450, "y": 200 } }
      ],
      "connections": [
        { "from": "rail_left_3", "to": "contact_done_3" },
        { "from": "contact_done_3", "to": "contact_led_on" },
        { "from": "contact_led_on", "to": "coil_reset_led" },
        { "from": "coil_reset_led", "to": "rail_right_3" }
      ]
    },
    {
      "id": "rung_4",
      "number": 4,
      "comment": "Output Network - Drive physical LED from latch",
      "elements": [
        { "id": "rail_left_4", "type": "left_rail", "position": { "x": 0, "y": 300 } },
        { "id": "contact_state", "type": "contact_no", "variable": "LedState", "position": { "x": 100, "y": 300 } },
        { "id": "coil_output", "type": "coil", "variable": "LED_Output", "position": { "x": 350, "y": 300 } },
        { "id": "rail_right_4", "type": "right_rail", "position": { "x": 450, "y": 300 } }
      ],
      "connections": [
        { "from": "rail_left_4", "to": "contact_state" },
        { "from": "contact_state", "to": "coil_output" },
        { "from": "coil_output", "to": "rail_right_4" }
      ]
    }
  ],
  "metadata": {
    "author": "ZPLC Team",
    "created": "2024-12-23",
    "iecStandard": "IEC 61131-3"
  }
}`;

const EXAMPLE_FBD = `{
  "$schema": "./schemas/fbd.schema.json",
  "name": "Blinky",
  "description": "ZPLC Golden Standard - Blinky in Function Block Diagram (FBD)",
  "version": "1.0.0",
  "variables": {
    "local": [
      { "name": "LedState", "type": "BOOL", "initialValue": false, "comment": "Current LED state" }
    ],
    "outputs": [
      { "name": "LED_Output", "type": "BOOL", "address": "%Q0.0", "comment": "Physical LED output" }
    ]
  },
  "blocks": [
    { "id": "const_true", "type": "constant", "dataType": "BOOL", "value": true, "position": { "x": 50, "y": 50 }, "outputs": [{ "name": "OUT", "type": "BOOL" }] },
    { "id": "const_500ms", "type": "constant", "dataType": "TIME", "value": "T#500ms", "position": { "x": 50, "y": 150 }, "outputs": [{ "name": "OUT", "type": "TIME" }] },
    { "id": "ton_timer", "type": "TON", "instanceName": "BlinkTimer", "position": { "x": 250, "y": 60 }, "inputs": [{ "name": "IN", "type": "BOOL" }, { "name": "PT", "type": "TIME" }], "outputs": [{ "name": "Q", "type": "BOOL" }, { "name": "ET", "type": "TIME" }], "comment": "500ms timer" },
    { "id": "r_trig", "type": "R_TRIG", "instanceName": "EdgeDetect", "position": { "x": 500, "y": 60 }, "inputs": [{ "name": "CLK", "type": "BOOL" }], "outputs": [{ "name": "Q", "type": "BOOL" }], "comment": "Rising edge detection" },
    { "id": "not_gate", "type": "NOT", "position": { "x": 500, "y": 200 }, "inputs": [{ "name": "IN", "type": "BOOL" }], "outputs": [{ "name": "OUT", "type": "BOOL" }] },
    { "id": "and_set", "type": "AND", "position": { "x": 700, "y": 50 }, "inputs": [{ "name": "IN1", "type": "BOOL" }, { "name": "IN2", "type": "BOOL" }], "outputs": [{ "name": "OUT", "type": "BOOL" }] },
    { "id": "and_reset", "type": "AND", "position": { "x": 700, "y": 150 }, "inputs": [{ "name": "IN1", "type": "BOOL" }, { "name": "IN2", "type": "BOOL" }], "outputs": [{ "name": "OUT", "type": "BOOL" }] },
    { "id": "sr_latch", "type": "SR", "instanceName": "LedLatch", "position": { "x": 900, "y": 80 }, "inputs": [{ "name": "S1", "type": "BOOL" }, { "name": "R", "type": "BOOL" }], "outputs": [{ "name": "Q1", "type": "BOOL" }], "comment": "Toggle logic" },
    { "id": "output_led", "type": "output", "variableName": "LED_Output", "position": { "x": 1100, "y": 80 }, "inputs": [{ "name": "IN", "type": "BOOL" }] }
  ],
  "connections": [
    { "id": "conn_1", "from": { "block": "const_true", "port": "OUT" }, "to": { "block": "ton_timer", "port": "IN" } },
    { "id": "conn_2", "from": { "block": "const_500ms", "port": "OUT" }, "to": { "block": "ton_timer", "port": "PT" } },
    { "id": "conn_3", "from": { "block": "ton_timer", "port": "Q" }, "to": { "block": "r_trig", "port": "CLK" } },
    { "id": "conn_4", "from": { "block": "r_trig", "port": "Q" }, "to": { "block": "and_set", "port": "IN1" } },
    { "id": "conn_5", "from": { "block": "r_trig", "port": "Q" }, "to": { "block": "and_reset", "port": "IN1" } },
    { "id": "conn_6", "from": { "block": "not_gate", "port": "OUT" }, "to": { "block": "and_set", "port": "IN2" } },
    { "id": "conn_7", "from": { "block": "and_set", "port": "OUT" }, "to": { "block": "sr_latch", "port": "S1" } },
    { "id": "conn_8", "from": { "block": "and_reset", "port": "OUT" }, "to": { "block": "sr_latch", "port": "R" } },
    { "id": "conn_9", "from": { "block": "sr_latch", "port": "Q1" }, "to": { "block": "output_led", "port": "IN" } }
  ],
  "metadata": {
    "author": "ZPLC Team",
    "created": "2024-12-23",
    "iecStandard": "IEC 61131-3"
  }
}`;

const EXAMPLE_SFC = `{
  "$schema": "./schemas/sfc.schema.json",
  "name": "Blinky",
  "description": "ZPLC Golden Standard - Blinky in Sequential Function Chart (SFC)",
  "version": "1.0.0",
  "variables": {
    "local": [
      { "name": "LedState", "type": "BOOL", "initialValue": false, "comment": "Current LED state" }
    ],
    "outputs": [
      { "name": "LED_Output", "type": "BOOL", "address": "%Q0.0", "comment": "Physical LED output" }
    ]
  },
  "steps": [
    { "id": "step_init", "name": "Init", "isInitial": true, "position": { "x": 200, "y": 50 }, "actions": [{ "qualifier": "N", "actionName": "LED_OFF", "comment": "Ensure LED starts OFF" }] },
    { "id": "step_led_on", "name": "LED_ON", "isInitial": false, "position": { "x": 200, "y": 250 }, "actions": [{ "qualifier": "N", "actionName": "SET_LED_ON", "comment": "Turn LED ON" }] },
    { "id": "step_led_off", "name": "LED_OFF", "isInitial": false, "position": { "x": 200, "y": 450 }, "actions": [{ "qualifier": "N", "actionName": "SET_LED_OFF", "comment": "Turn LED OFF" }] }
  ],
  "transitions": [
    { "id": "trans_init_to_on", "fromStep": "step_init", "toStep": "step_led_on", "condition": "TRUE", "comment": "Immediately transition to ON state", "position": { "x": 200, "y": 150 } },
    { "id": "trans_on_to_off", "fromStep": "step_led_on", "toStep": "step_led_off", "condition": "step_led_on.T >= T#500ms", "comment": "After 500ms, transition to OFF", "position": { "x": 200, "y": 350 } },
    { "id": "trans_off_to_on", "fromStep": "step_led_off", "toStep": "step_led_on", "condition": "step_led_off.T >= T#500ms", "comment": "After 500ms, transition to ON", "position": { "x": 400, "y": 350 } }
  ],
  "actions": [
    { "id": "SET_LED_ON", "name": "SET_LED_ON", "type": "ST", "body": "LedState := TRUE;\\nLED_Output := LedState;" },
    { "id": "SET_LED_OFF", "name": "SET_LED_OFF", "type": "ST", "body": "LedState := FALSE;\\nLED_Output := LedState;" },
    { "id": "LED_OFF", "name": "LED_OFF", "type": "ST", "body": "LedState := FALSE;\\nLED_Output := FALSE;" }
  ],
  "metadata": {
    "author": "ZPLC Team",
    "created": "2024-12-23",
    "iecStandard": "IEC 61131-3",
    "notes": ["SFC step timing uses implicit .T property", "Action qualifiers: N=Non-stored, S=Set, R=Reset"]
  }
}`;

// Motor Control - LD example with parallel branches
const EXAMPLE_MOTOR_LD = `{
  "name": "MotorControl",
  "description": "Motor Start/Stop with Parallel Branches",
  "version": "1.0.0",
  "variables": {
    "local": [{ "name": "MotorRunning", "type": "BOOL", "initialValue": false }],
    "inputs": [
      { "name": "StartPB", "type": "BOOL", "address": "%I0.0" },
      { "name": "StopPB", "type": "BOOL", "address": "%I0.1" }
    ],
    "outputs": [{ "name": "MotorContactor", "type": "BOOL", "address": "%Q0.0" }]
  },
  "rungs": [
    {
      "id": "rung_1",
      "number": 1,
      "comment": "Motor Start with Seal-In (Parallel Branch)",
      "grid": [
        [
          { "element": { "id": "stop_nc", "type": "contact_nc", "variable": "StopPB", "row": 0, "col": 0 }, "hasWire": true },
          { "element": { "id": "start_no", "type": "contact_no", "variable": "StartPB", "row": 0, "col": 1 }, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": { "id": "motor_coil", "type": "coil", "variable": "MotorContactor", "row": 0, "col": 7 }, "hasWire": true }
        ],
        [
          { "element": null, "hasWire": false },
          { "element": { "id": "seal_in", "type": "contact_no", "variable": "MotorRunning", "row": 1, "col": 1 }, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": false },
          { "element": null, "hasWire": false },
          { "element": null, "hasWire": false }
        ]
      ],
      "branches": [{ "id": "branch_1", "startCol": 1, "endCol": 4, "rows": [0, 1] }],
      "gridConfig": { "cols": 8, "rows": 2, "cellWidth": 80, "cellHeight": 60 }
    },
    {
      "id": "rung_2",
      "number": 2,
      "comment": "Latch Motor State",
      "grid": [
        [
          { "element": { "id": "contactor_fb", "type": "contact_no", "variable": "MotorContactor", "row": 0, "col": 0 }, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": null, "hasWire": true },
          { "element": { "id": "running_set", "type": "coil_set", "variable": "MotorRunning", "row": 0, "col": 7 }, "hasWire": true }
        ]
      ],
      "gridConfig": { "cols": 8, "rows": 1, "cellWidth": 80, "cellHeight": 60 }
    }
  ]
}`;

const EXAMPLE_FILES: ProjectFile[] = [
  {
    id: 'blinky-st',
    name: 'blinky.st',
    language: 'ST' as PLCLanguage,
    content: EXAMPLE_ST,
    isModified: false,
    path: '/examples/blinky.st',
  },
  {
    id: 'blinky-il',
    name: 'blinky.il',
    language: 'IL' as PLCLanguage,
    content: EXAMPLE_IL,
    isModified: false,
    path: '/examples/blinky.il',
  },
  {
    id: 'blinky-ld',
    name: 'blinky.ld',
    language: 'LD' as PLCLanguage,
    content: EXAMPLE_LD,
    isModified: false,
    path: '/examples/blinky.ld',
  },
  {
    id: 'motor-ld',
    name: 'motor.ld',
    language: 'LD' as PLCLanguage,
    content: EXAMPLE_MOTOR_LD,
    isModified: false,
    path: '/examples/motor.ld',
  },
  {
    id: 'blinky-fbd',
    name: 'blinky.fbd',
    language: 'FBD' as PLCLanguage,
    content: EXAMPLE_FBD,
    isModified: false,
    path: '/examples/blinky.fbd',
  },
  {
    id: 'blinky-sfc',
    name: 'blinky.sfc',
    language: 'SFC' as PLCLanguage,
    content: EXAMPLE_SFC,
    isModified: false,
    path: '/examples/blinky.sfc',
  },
];

// =============================================================================
// Theme Utilities
// =============================================================================

const THEME_STORAGE_KEY = 'zplc-ide-theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function applyThemeToDOM(theme: Theme): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;

  // Remove existing theme classes
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    // Let CSS @media query handle it - don't add any class
    // The CSS already has @media (prefers-color-scheme: dark) rules
  } else {
    root.classList.add(theme);
  }

  // Store preference
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useIDEStore = create<IDEState>((set, get) => ({
  // Initial State
  theme: getStoredTheme(),
  projectConfig: DEFAULT_PROJECT_CONFIG,
  files: EXAMPLE_FILES,
  activeFileId: EXAMPLE_FILES[0].id,
  openTabs: [EXAMPLE_FILES[0].id],

  connection: {
    status: 'disconnected',
    device: null,
    plcState: 'unknown',
    lastError: null,
    cycleTime: null,
    uptime: null,
  },

  consoleEntries: [
    {
      id: '1',
      type: 'info',
      message: 'ZPLC IDE initialized',
      timestamp: new Date(),
      source: 'system',
    },
    {
      id: '2',
      type: 'info',
      message: 'Ready to connect to target device',
      timestamp: new Date(),
      source: 'system',
    },
  ],
  activeConsoleTab: 'output',
  compilerMessages: [],

  sidebarWidth: 260,
  consoleHeight: 200,
  isSidebarCollapsed: false,
  isConsoleCollapsed: false,
  showSettings: false,

  // Theme Actions
  setTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  // Project Config Actions
  updateProjectConfig: (config) =>
    set((state) => ({
      projectConfig: { ...state.projectConfig, ...config },
    })),

  // File Actions
  addFile: (file) =>
    set((state) => ({
      files: [...state.files, file],
    })),

  createFile: (name, language) => {
    const ext = getExtensionForLanguage(language);
    const fileName = name.endsWith(ext) ? name : `${name}${ext}`;
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newFile: ProjectFile = {
      id: fileId,
      name: fileName,
      language,
      content: createEmptyFileContent(language),
      isModified: true,
      path: `/src/${fileName}`,
    };

    set((state) => ({
      files: [...state.files, newFile],
      openTabs: [...state.openTabs, fileId],
      activeFileId: fileId,
    }));

    return fileId;
  },

  deleteFile: (fileId) =>
    set((state) => {
      const newFiles = state.files.filter((f) => f.id !== fileId);
      const newTabs = state.openTabs.filter((id) => id !== fileId);
      const newActiveId = state.activeFileId === fileId
        ? newTabs[newTabs.length - 1] || null
        : state.activeFileId;

      return {
        files: newFiles,
        openTabs: newTabs,
        activeFileId: newActiveId,
      };
    }),

  renameFile: (fileId, newName) =>
    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== fileId) return f;

        // Update extension if needed
        const ext = getExtensionForLanguage(f.language);
        const fileName = newName.endsWith(ext) ? newName : `${newName}${ext}`;

        return {
          ...f,
          name: fileName,
          path: `/src/${fileName}`,
          isModified: true,
        };
      }),
    })),

  setActiveFile: (fileId) =>
    set((state) => ({
      activeFileId: fileId,
      openTabs: fileId && !state.openTabs.includes(fileId)
        ? [...state.openTabs, fileId]
        : state.openTabs,
    })),

  updateFileContent: (fileId, content) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, content, isModified: true } : f
      ),
    })),

  closeTab: (fileId) =>
    set((state) => {
      const newTabs = state.openTabs.filter((id) => id !== fileId);
      const newActiveId = state.activeFileId === fileId
        ? newTabs[newTabs.length - 1] || null
        : state.activeFileId;
      return {
        openTabs: newTabs,
        activeFileId: newActiveId,
      };
    }),

  openTab: (fileId) =>
    set((state) => ({
      openTabs: state.openTabs.includes(fileId)
        ? state.openTabs
        : [...state.openTabs, fileId],
      activeFileId: fileId,
    })),

  markFileSaved: (fileId) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === fileId ? { ...f, isModified: false } : f
      ),
    })),

  // Import/Export Actions
  exportProject: () => {
    const state = get();
    return {
      version: '1.0.0',
      config: state.projectConfig,
      files: state.files.map(({ isModified, ...rest }) => rest),
      exportedAt: new Date().toISOString(),
    };
  },

  importProject: (project) =>
    set(() => ({
      projectConfig: project.config,
      files: project.files.map((f) => ({ ...f, isModified: false })),
      openTabs: project.files.length > 0 ? [project.files[0].id] : [],
      activeFileId: project.files.length > 0 ? project.files[0].id : null,
    })),

  // Connection Actions
  setConnectionStatus: (status) =>
    set((state) => ({
      connection: { ...state.connection, status },
    })),

  setPlcState: (plcState) =>
    set((state) => ({
      connection: { ...state.connection, plcState },
    })),

  // Console Actions
  addConsoleEntry: (entry) =>
    set((state) => ({
      consoleEntries: [
        ...state.consoleEntries,
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),

  clearConsole: () =>
    set({ consoleEntries: [] }),

  setActiveConsoleTab: (tab) =>
    set({ activeConsoleTab: tab }),

  addCompilerMessage: (message) =>
    set((state) => ({
      compilerMessages: [
        ...state.compilerMessages,
        { ...message, timestamp: new Date() },
      ],
    })),

  clearCompilerMessages: () =>
    set({ compilerMessages: [] }),

  // UI Actions
  setSidebarWidth: (width) =>
    set({ sidebarWidth: width }),

  setConsoleHeight: (height) =>
    set({ consoleHeight: height }),

  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  toggleConsole: () =>
    set((state) => ({ isConsoleCollapsed: !state.isConsoleCollapsed })),

  toggleSettings: () =>
    set((state) => ({ showSettings: !state.showSettings })),
}));

// =============================================================================
// Theme Initialization Hook
// =============================================================================

export function initializeTheme(): void {
  const theme = getStoredTheme();
  applyThemeToDOM(theme);
}
