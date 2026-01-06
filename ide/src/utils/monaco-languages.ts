import type { languages } from 'monaco-editor';

// =============================================================================
// Structured Text (ST) Definition
// =============================================================================

export const ST_LANGUAGE_ID = 'st';

export const stConf: languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
        blockComment: ['(*', '*)'],
    },
    brackets: [
        ['(', ')'],
        ['[', ']'],
    ],
    autoClosingPairs: [
        { open: '(*', close: '*)' },
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
    ],
    surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
    ],
};

export const stLanguage: languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: '.st',
    ignoreCase: true,

    keywords: [
        'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF',
        'CASE', 'OF', 'END_CASE',
        'FOR', 'TO', 'BY', 'DO', 'END_FOR',
        'WHILE', 'END_WHILE',
        'REPEAT', 'UNTIL', 'END_REPEAT',
        'RETURN', 'EXIT',
        'FUNCTION', 'FUNCTION_BLOCK', 'PROGRAM', 'END_FUNCTION', 'END_FUNCTION_BLOCK', 'END_PROGRAM',
        'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_EXTERNAL', 'VAR_GLOBAL', 'VAR_CONFIG', 'VAR_ACCESS', 'END_VAR',
        'CONSTANT', 'RETAIN', 'PERSISTENT', 'AT',
        'TYPE', 'END_TYPE', 'STRUCT', 'END_STRUCT', 'ARRAY', 'Unions', 'END_UNION', 'ENUM', 'END_ENUM'
    ],

    types: [
        'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD',
        'SINT', 'INT', 'DINT', 'LINT',
        'USINT', 'UINT', 'UDINT', 'ULINT',
        'REAL', 'LREAL',
        'TIME', 'DATE', 'TIME_OF_DAY', 'TOD', 'DATE_AND_TIME', 'DT',
        'STRING', 'WSTRING',
        'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG'
    ],

    operators: [
        ':=', '=', '>', '<', ':',
        '+', '-', '*', '/', '**', 'MOD',
        'OR', 'AND', 'NOT', 'XOR',
        '<=', '>=', '<>', '=>'
    ],

    // Common symbols
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
        root: [
            // Identifiers and Keywords
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@types': 'type',
                    '@keywords': 'keyword',
                    '@default': 'identifier'
                }
            }],

            // Direct Addresses (Analog I/O support: %IW4, %QW0)
            [/%[IQM](X|B|W|D|L)?[0-9]+(\.[0-9]+)?/, 'variable.predefined'],

            // Constants
            [/\d+(\.\d+)?/, 'number'],
            [/T#[0-9]+[ms|s|m|h|d]+/, 'number'], // Time literals

            // Strings
            [/'[^']*'/, 'string'],
            [/"[^"]*"/, 'string'], // Double quote strings allowed in some dialects

            // Whitespace
            { include: '@whitespace' },

            // Delimiters
            [/[{}()\[\]]/, '@brackets'],
            [/[;,.]/, 'delimiter'],

            // Operators
            [/@symbols/, {
                cases: {
                    '@operators': 'operator',
                    '@default': ''
                }
            }],
        ],

        whitespace: [
            [/[ \t\r\n]+/, 'white'],
            [/\(\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
        ],

        comment: [
            [/[^\(*]+/, 'comment'],
            [/\*\)/, 'comment', '@pop'],
            [/\(*$/, 'comment']
        ],
    },
};

// =============================================================================
// Instruction List (IL) Definition
// =============================================================================

export const IL_LANGUAGE_ID = 'il';

export const ilConf: languages.LanguageConfiguration = {
    comments: {
        blockComment: ['(*', '*)'],
    },
    autoClosingPairs: [
        { open: '(*', close: '*)' },
    ],
};

export const ilLanguage: languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: '.il',
    ignoreCase: true,

    keywords: [
        'LD', 'LDN', 'ST', 'STN', 'S', 'R',
        'AND', 'ANDN', '&', '&N',
        'OR', 'ORN', 'XOR', 'XORN',
        'ADD', 'SUB', 'MUL', 'DIV', 'MOD',
        'GT', 'GE', 'EQ', 'NE', 'LE', 'LT',
        'JMP', 'JMPC', 'JMPCN',
        'CAL', 'CALC', 'CALCN',
        'RET', 'RETC', 'RETCN',
        'PROGRAM', 'END_PROGRAM', 'VAR', 'END_VAR'
    ],

    tokenizer: {
        root: [
            // Labels
            [/^[a-zA-Z_]\w*:/, 'type.identifier'],

            // Keywords/Ops
            [/[a-zA-Z_]\w*/, {
                cases: {
                    '@keywords': 'keyword',
                    '@default': 'identifier'
                }
            }],

            // Addresses
            [/%[IQM](X|B|W|D|L)?[0-9]+(\.[0-9]+)?/, 'variable.predefined'],

            // Constants
            [/\d+(\.\d+)?/, 'number'],

            // Comments
            [/\(\*/, 'comment', '@comment'],
            [/[ \t\r\n]+/, 'white'],

            // Comma separator
            [/,/, 'delimiter']
        ],

        comment: [
            [/[^\(*]+/, 'comment'],
            [/\*\)/, 'comment', '@pop'],
            [/\(*$/, 'comment']
        ],
    }
};
