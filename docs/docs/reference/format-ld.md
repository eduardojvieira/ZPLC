---
title: "Ladder Diagram file format"
sidebar_label: "Ladder file format"
description: "The JSON Schema, the accepted values and a worked example of a Ladder Diagram file (.ld.json)."
tags: [reference, generated]
---

# Ladder Diagram file format

{/* >>> GENERATED (tools/docs/generate_source_references.ts): reference/format-ld. Do not edit. >>> */}

A Ladder Diagram program is a JSON file `src/*.ld.json`: its variables and its rungs. Each rung is a grid of cells; contacts read from the left, and the last column holds a coil or a function block. A function box (`MOVE`, `ADD`, `GT`...) computes into a variable.

The schema, the lists and the examples below are read off `packages/zplc-ide/src/formats`, the module that the MCP resource `zplc://formats/ld` serves too, so the page, the resource and the loader say the same. The descriptions inside the schema are in English in both languages.

## Where the file lives

`src/*.ld.json`

## JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "zplc://formats/ld",
  "title": "ZPLC Ladder Diagram (.ld.json)",
  "type": "object",
  "required": [
    "name",
    "variables",
    "rungs"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "The program name; tasks in zplc.json name it as `<name>.ld`."
    },
    "description": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "variables": {
      "type": "object",
      "required": [
        "local",
        "outputs"
      ],
      "properties": {
        "local": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1,
                "description": "An IEC type (BOOL, INT, REAL, TIME) or a function block (TON, CTU)."
              },
              "address": {
                "type": "string",
                "description": "A located input or output: %I0.0, %Q0.1, %IW0, %QD1."
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1,
                "description": "An IEC type (BOOL, INT, REAL, TIME) or a function block (TON, CTU)."
              },
              "address": {
                "type": "string",
                "description": "A located input or output: %I0.0, %Q0.1, %IW0, %QD1."
              },
              "comment": {
                "type": "string"
              }
            }
          }
        },
        "outputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "name",
              "type"
            ],
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1
              },
              "type": {
                "type": "string",
                "minLength": 1,
                "description": "An IEC type (BOOL, INT, REAL, TIME) or a function block (TON, CTU)."
              },
              "address": {
                "type": "string",
                "description": "A located input or output: %I0.0, %Q0.1, %IW0, %QD1."
              },
              "comment": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "rungs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "number"
        ],
        "anyOf": [
          {
            "required": [
              "grid"
            ]
          },
          {
            "required": [
              "elements"
            ]
          }
        ],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "number": {
            "type": "number"
          },
          "comment": {
            "type": "string"
          },
          "gridConfig": {
            "type": "object",
            "required": [
              "cols",
              "rows"
            ],
            "properties": {
              "cols": {
                "type": "integer",
                "minimum": 1
              },
              "rows": {
                "type": "integer",
                "minimum": 1
              },
              "cellWidth": {
                "type": "number"
              },
              "cellHeight": {
                "type": "number"
              }
            }
          },
          "grid": {
            "type": "array",
            "description": "Rows of cells, left to right; the last column holds the coil or the function block.",
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "element": {
                    "anyOf": [
                      {
                        "type": "object",
                        "required": [
                          "id",
                          "type"
                        ],
                        "properties": {
                          "id": {
                            "type": "string",
                            "minLength": 1
                          },
                          "type": {
                            "enum": [
                              "left_rail",
                              "right_rail",
                              "contact_no",
                              "contact_nc",
                              "contact_p",
                              "contact_n",
                              "coil",
                              "coil_negated",
                              "coil_set",
                              "coil_reset",
                              "coil_p",
                              "coil_n",
                              "function_block",
                              "function"
                            ]
                          },
                          "variable": {
                            "type": "string",
                            "description": "The variable a contact reads or a coil writes; `Timer.Q` reads a function block output."
                          },
                          "row": {
                            "type": "integer",
                            "minimum": 0
                          },
                          "col": {
                            "type": "integer",
                            "minimum": 0
                          },
                          "fbType": {
                            "type": "string",
                            "description": "For function_block: the block type, one of acceptedValues.functionBlocks."
                          },
                          "instance": {
                            "type": "string",
                            "description": "For function_block: the declared instance (a local variable of that type)."
                          },
                          "parameters": {
                            "type": "object",
                            "description": "For function_block: input pin -> \"CONNECTED\" (the rung) or a literal such as \"T#5s\"."
                          },
                          "functionName": {
                            "enum": [
                              "GT",
                              "GE",
                              "EQ",
                              "NE",
                              "LE",
                              "LT",
                              "ADD",
                              "SUB",
                              "MUL",
                              "DIV",
                              "MOD",
                              "MOVE",
                              "LIMIT",
                              "MIN",
                              "MAX",
                              "SEL",
                              "MUX",
                              "NAND",
                              "NOR",
                              "ROL",
                              "ROR",
                              "SHL",
                              "SHR",
                              "AND_WORD",
                              "OR_WORD",
                              "XOR_WORD",
                              "NOT_WORD",
                              "AND_DWORD",
                              "OR_DWORD",
                              "XOR_DWORD",
                              "NOT_DWORD",
                              "ABS",
                              "ABSF",
                              "NEG",
                              "NEGF",
                              "SQRT",
                              "EXPT",
                              "TRUNC",
                              "ROUND",
                              "SIN",
                              "COS",
                              "TAN",
                              "ASIN",
                              "ACOS",
                              "ATAN",
                              "ATAN2",
                              "LN",
                              "LOG",
                              "EXP",
                              "NORM_X",
                              "SCALE_X",
                              "UPTIME",
                              "CYCLE_TIME",
                              "WATCHDOG_RESET",
                              "LEN",
                              "CONCAT",
                              "LEFT",
                              "RIGHT",
                              "MID",
                              "FIND",
                              "INSERT",
                              "DELETE",
                              "REPLACE",
                              "STRCMP",
                              "COPY",
                              "CLEAR",
                              "EQ_STRING",
                              "NE_STRING",
                              "BOOL_TO_SINT",
                              "BOOL_TO_USINT",
                              "BOOL_TO_BYTE",
                              "BOOL_TO_INT",
                              "BOOL_TO_UINT",
                              "BOOL_TO_WORD",
                              "BOOL_TO_DINT",
                              "BOOL_TO_UDINT",
                              "BOOL_TO_DWORD",
                              "BOOL_TO_TIME",
                              "BOOL_TO_LINT",
                              "BOOL_TO_ULINT",
                              "BOOL_TO_LWORD",
                              "BOOL_TO_REAL",
                              "BOOL_TO_LREAL",
                              "SINT_TO_BOOL",
                              "SINT_TO_USINT",
                              "SINT_TO_BYTE",
                              "SINT_TO_INT",
                              "SINT_TO_UINT",
                              "SINT_TO_WORD",
                              "SINT_TO_DINT",
                              "SINT_TO_UDINT",
                              "SINT_TO_DWORD",
                              "SINT_TO_TIME",
                              "SINT_TO_LINT",
                              "SINT_TO_ULINT",
                              "SINT_TO_LWORD",
                              "SINT_TO_REAL",
                              "SINT_TO_LREAL",
                              "USINT_TO_BOOL",
                              "USINT_TO_SINT",
                              "USINT_TO_BYTE",
                              "USINT_TO_INT",
                              "USINT_TO_UINT",
                              "USINT_TO_WORD",
                              "USINT_TO_DINT",
                              "USINT_TO_UDINT",
                              "USINT_TO_DWORD",
                              "USINT_TO_TIME",
                              "USINT_TO_LINT",
                              "USINT_TO_ULINT",
                              "USINT_TO_LWORD",
                              "USINT_TO_REAL",
                              "USINT_TO_LREAL",
                              "BYTE_TO_BOOL",
                              "BYTE_TO_SINT",
                              "BYTE_TO_USINT",
                              "BYTE_TO_INT",
                              "BYTE_TO_UINT",
                              "BYTE_TO_WORD",
                              "BYTE_TO_DINT",
                              "BYTE_TO_UDINT",
                              "BYTE_TO_DWORD",
                              "BYTE_TO_TIME",
                              "BYTE_TO_LINT",
                              "BYTE_TO_ULINT",
                              "BYTE_TO_LWORD",
                              "BYTE_TO_REAL",
                              "BYTE_TO_LREAL",
                              "INT_TO_BOOL",
                              "INT_TO_SINT",
                              "INT_TO_USINT",
                              "INT_TO_BYTE",
                              "INT_TO_UINT",
                              "INT_TO_WORD",
                              "INT_TO_DINT",
                              "INT_TO_UDINT",
                              "INT_TO_DWORD",
                              "INT_TO_TIME",
                              "INT_TO_LINT",
                              "INT_TO_ULINT",
                              "INT_TO_LWORD",
                              "INT_TO_REAL",
                              "INT_TO_LREAL",
                              "UINT_TO_BOOL",
                              "UINT_TO_SINT",
                              "UINT_TO_USINT",
                              "UINT_TO_BYTE",
                              "UINT_TO_INT",
                              "UINT_TO_WORD",
                              "UINT_TO_DINT",
                              "UINT_TO_UDINT",
                              "UINT_TO_DWORD",
                              "UINT_TO_TIME",
                              "UINT_TO_LINT",
                              "UINT_TO_ULINT",
                              "UINT_TO_LWORD",
                              "UINT_TO_REAL",
                              "UINT_TO_LREAL",
                              "WORD_TO_BOOL",
                              "WORD_TO_SINT",
                              "WORD_TO_USINT",
                              "WORD_TO_BYTE",
                              "WORD_TO_INT",
                              "WORD_TO_UINT",
                              "WORD_TO_DINT",
                              "WORD_TO_UDINT",
                              "WORD_TO_DWORD",
                              "WORD_TO_TIME",
                              "WORD_TO_LINT",
                              "WORD_TO_ULINT",
                              "WORD_TO_LWORD",
                              "WORD_TO_REAL",
                              "WORD_TO_LREAL",
                              "DINT_TO_BOOL",
                              "DINT_TO_SINT",
                              "DINT_TO_USINT",
                              "DINT_TO_BYTE",
                              "DINT_TO_INT",
                              "DINT_TO_UINT",
                              "DINT_TO_WORD",
                              "DINT_TO_UDINT",
                              "DINT_TO_DWORD",
                              "DINT_TO_TIME",
                              "DINT_TO_LINT",
                              "DINT_TO_ULINT",
                              "DINT_TO_LWORD",
                              "DINT_TO_REAL",
                              "DINT_TO_LREAL",
                              "UDINT_TO_BOOL",
                              "UDINT_TO_SINT",
                              "UDINT_TO_USINT",
                              "UDINT_TO_BYTE",
                              "UDINT_TO_INT",
                              "UDINT_TO_UINT",
                              "UDINT_TO_WORD",
                              "UDINT_TO_DINT",
                              "UDINT_TO_DWORD",
                              "UDINT_TO_TIME",
                              "UDINT_TO_LINT",
                              "UDINT_TO_ULINT",
                              "UDINT_TO_LWORD",
                              "UDINT_TO_REAL",
                              "UDINT_TO_LREAL",
                              "DWORD_TO_BOOL",
                              "DWORD_TO_SINT",
                              "DWORD_TO_USINT",
                              "DWORD_TO_BYTE",
                              "DWORD_TO_INT",
                              "DWORD_TO_UINT",
                              "DWORD_TO_WORD",
                              "DWORD_TO_DINT",
                              "DWORD_TO_UDINT",
                              "DWORD_TO_TIME",
                              "DWORD_TO_LINT",
                              "DWORD_TO_ULINT",
                              "DWORD_TO_LWORD",
                              "DWORD_TO_REAL",
                              "DWORD_TO_LREAL",
                              "TIME_TO_BOOL",
                              "TIME_TO_SINT",
                              "TIME_TO_USINT",
                              "TIME_TO_BYTE",
                              "TIME_TO_INT",
                              "TIME_TO_UINT",
                              "TIME_TO_WORD",
                              "TIME_TO_DINT",
                              "TIME_TO_UDINT",
                              "TIME_TO_DWORD",
                              "TIME_TO_LINT",
                              "TIME_TO_ULINT",
                              "TIME_TO_LWORD",
                              "TIME_TO_REAL",
                              "TIME_TO_LREAL",
                              "LINT_TO_BOOL",
                              "LINT_TO_SINT",
                              "LINT_TO_USINT",
                              "LINT_TO_BYTE",
                              "LINT_TO_INT",
                              "LINT_TO_UINT",
                              "LINT_TO_WORD",
                              "LINT_TO_DINT",
                              "LINT_TO_UDINT",
                              "LINT_TO_DWORD",
                              "LINT_TO_TIME",
                              "LINT_TO_ULINT",
                              "LINT_TO_LWORD",
                              "LINT_TO_REAL",
                              "LINT_TO_LREAL",
                              "ULINT_TO_BOOL",
                              "ULINT_TO_SINT",
                              "ULINT_TO_USINT",
                              "ULINT_TO_BYTE",
                              "ULINT_TO_INT",
                              "ULINT_TO_UINT",
                              "ULINT_TO_WORD",
                              "ULINT_TO_DINT",
                              "ULINT_TO_UDINT",
                              "ULINT_TO_DWORD",
                              "ULINT_TO_TIME",
                              "ULINT_TO_LINT",
                              "ULINT_TO_LWORD",
                              "ULINT_TO_REAL",
                              "ULINT_TO_LREAL",
                              "LWORD_TO_BOOL",
                              "LWORD_TO_SINT",
                              "LWORD_TO_USINT",
                              "LWORD_TO_BYTE",
                              "LWORD_TO_INT",
                              "LWORD_TO_UINT",
                              "LWORD_TO_WORD",
                              "LWORD_TO_DINT",
                              "LWORD_TO_UDINT",
                              "LWORD_TO_DWORD",
                              "LWORD_TO_TIME",
                              "LWORD_TO_LINT",
                              "LWORD_TO_ULINT",
                              "LWORD_TO_REAL",
                              "LWORD_TO_LREAL",
                              "REAL_TO_BOOL",
                              "REAL_TO_SINT",
                              "REAL_TO_USINT",
                              "REAL_TO_BYTE",
                              "REAL_TO_INT",
                              "REAL_TO_UINT",
                              "REAL_TO_WORD",
                              "REAL_TO_DINT",
                              "REAL_TO_UDINT",
                              "REAL_TO_DWORD",
                              "REAL_TO_TIME",
                              "REAL_TO_LINT",
                              "REAL_TO_ULINT",
                              "REAL_TO_LWORD",
                              "REAL_TO_LREAL",
                              "LREAL_TO_BOOL",
                              "LREAL_TO_SINT",
                              "LREAL_TO_USINT",
                              "LREAL_TO_BYTE",
                              "LREAL_TO_INT",
                              "LREAL_TO_UINT",
                              "LREAL_TO_WORD",
                              "LREAL_TO_DINT",
                              "LREAL_TO_UDINT",
                              "LREAL_TO_DWORD",
                              "LREAL_TO_TIME",
                              "LREAL_TO_LINT",
                              "LREAL_TO_ULINT",
                              "LREAL_TO_LWORD",
                              "LREAL_TO_REAL"
                            ],
                            "description": "For function: required."
                          },
                          "operands": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "description": "For function: required, one per pin."
                          },
                          "output": {
                            "type": "string",
                            "description": "For function: the variable the result is written to."
                          },
                          "comment": {
                            "type": "string"
                          }
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "hasWire": {
                    "type": "boolean"
                  }
                }
              }
            }
          },
          "elements": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "type"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "type": {
                  "enum": [
                    "left_rail",
                    "right_rail",
                    "contact_no",
                    "contact_nc",
                    "contact_p",
                    "contact_n",
                    "coil",
                    "coil_negated",
                    "coil_set",
                    "coil_reset",
                    "coil_p",
                    "coil_n",
                    "function_block",
                    "function"
                  ]
                },
                "variable": {
                  "type": "string",
                  "description": "The variable a contact reads or a coil writes; `Timer.Q` reads a function block output."
                },
                "row": {
                  "type": "integer",
                  "minimum": 0
                },
                "col": {
                  "type": "integer",
                  "minimum": 0
                },
                "fbType": {
                  "type": "string",
                  "description": "For function_block: the block type, one of acceptedValues.functionBlocks."
                },
                "instance": {
                  "type": "string",
                  "description": "For function_block: the declared instance (a local variable of that type)."
                },
                "parameters": {
                  "type": "object",
                  "description": "For function_block: input pin -> \"CONNECTED\" (the rung) or a literal such as \"T#5s\"."
                },
                "functionName": {
                  "enum": [
                    "GT",
                    "GE",
                    "EQ",
                    "NE",
                    "LE",
                    "LT",
                    "ADD",
                    "SUB",
                    "MUL",
                    "DIV",
                    "MOD",
                    "MOVE",
                    "LIMIT",
                    "MIN",
                    "MAX",
                    "SEL",
                    "MUX",
                    "NAND",
                    "NOR",
                    "ROL",
                    "ROR",
                    "SHL",
                    "SHR",
                    "AND_WORD",
                    "OR_WORD",
                    "XOR_WORD",
                    "NOT_WORD",
                    "AND_DWORD",
                    "OR_DWORD",
                    "XOR_DWORD",
                    "NOT_DWORD",
                    "ABS",
                    "ABSF",
                    "NEG",
                    "NEGF",
                    "SQRT",
                    "EXPT",
                    "TRUNC",
                    "ROUND",
                    "SIN",
                    "COS",
                    "TAN",
                    "ASIN",
                    "ACOS",
                    "ATAN",
                    "ATAN2",
                    "LN",
                    "LOG",
                    "EXP",
                    "NORM_X",
                    "SCALE_X",
                    "UPTIME",
                    "CYCLE_TIME",
                    "WATCHDOG_RESET",
                    "LEN",
                    "CONCAT",
                    "LEFT",
                    "RIGHT",
                    "MID",
                    "FIND",
                    "INSERT",
                    "DELETE",
                    "REPLACE",
                    "STRCMP",
                    "COPY",
                    "CLEAR",
                    "EQ_STRING",
                    "NE_STRING",
                    "BOOL_TO_SINT",
                    "BOOL_TO_USINT",
                    "BOOL_TO_BYTE",
                    "BOOL_TO_INT",
                    "BOOL_TO_UINT",
                    "BOOL_TO_WORD",
                    "BOOL_TO_DINT",
                    "BOOL_TO_UDINT",
                    "BOOL_TO_DWORD",
                    "BOOL_TO_TIME",
                    "BOOL_TO_LINT",
                    "BOOL_TO_ULINT",
                    "BOOL_TO_LWORD",
                    "BOOL_TO_REAL",
                    "BOOL_TO_LREAL",
                    "SINT_TO_BOOL",
                    "SINT_TO_USINT",
                    "SINT_TO_BYTE",
                    "SINT_TO_INT",
                    "SINT_TO_UINT",
                    "SINT_TO_WORD",
                    "SINT_TO_DINT",
                    "SINT_TO_UDINT",
                    "SINT_TO_DWORD",
                    "SINT_TO_TIME",
                    "SINT_TO_LINT",
                    "SINT_TO_ULINT",
                    "SINT_TO_LWORD",
                    "SINT_TO_REAL",
                    "SINT_TO_LREAL",
                    "USINT_TO_BOOL",
                    "USINT_TO_SINT",
                    "USINT_TO_BYTE",
                    "USINT_TO_INT",
                    "USINT_TO_UINT",
                    "USINT_TO_WORD",
                    "USINT_TO_DINT",
                    "USINT_TO_UDINT",
                    "USINT_TO_DWORD",
                    "USINT_TO_TIME",
                    "USINT_TO_LINT",
                    "USINT_TO_ULINT",
                    "USINT_TO_LWORD",
                    "USINT_TO_REAL",
                    "USINT_TO_LREAL",
                    "BYTE_TO_BOOL",
                    "BYTE_TO_SINT",
                    "BYTE_TO_USINT",
                    "BYTE_TO_INT",
                    "BYTE_TO_UINT",
                    "BYTE_TO_WORD",
                    "BYTE_TO_DINT",
                    "BYTE_TO_UDINT",
                    "BYTE_TO_DWORD",
                    "BYTE_TO_TIME",
                    "BYTE_TO_LINT",
                    "BYTE_TO_ULINT",
                    "BYTE_TO_LWORD",
                    "BYTE_TO_REAL",
                    "BYTE_TO_LREAL",
                    "INT_TO_BOOL",
                    "INT_TO_SINT",
                    "INT_TO_USINT",
                    "INT_TO_BYTE",
                    "INT_TO_UINT",
                    "INT_TO_WORD",
                    "INT_TO_DINT",
                    "INT_TO_UDINT",
                    "INT_TO_DWORD",
                    "INT_TO_TIME",
                    "INT_TO_LINT",
                    "INT_TO_ULINT",
                    "INT_TO_LWORD",
                    "INT_TO_REAL",
                    "INT_TO_LREAL",
                    "UINT_TO_BOOL",
                    "UINT_TO_SINT",
                    "UINT_TO_USINT",
                    "UINT_TO_BYTE",
                    "UINT_TO_INT",
                    "UINT_TO_WORD",
                    "UINT_TO_DINT",
                    "UINT_TO_UDINT",
                    "UINT_TO_DWORD",
                    "UINT_TO_TIME",
                    "UINT_TO_LINT",
                    "UINT_TO_ULINT",
                    "UINT_TO_LWORD",
                    "UINT_TO_REAL",
                    "UINT_TO_LREAL",
                    "WORD_TO_BOOL",
                    "WORD_TO_SINT",
                    "WORD_TO_USINT",
                    "WORD_TO_BYTE",
                    "WORD_TO_INT",
                    "WORD_TO_UINT",
                    "WORD_TO_DINT",
                    "WORD_TO_UDINT",
                    "WORD_TO_DWORD",
                    "WORD_TO_TIME",
                    "WORD_TO_LINT",
                    "WORD_TO_ULINT",
                    "WORD_TO_LWORD",
                    "WORD_TO_REAL",
                    "WORD_TO_LREAL",
                    "DINT_TO_BOOL",
                    "DINT_TO_SINT",
                    "DINT_TO_USINT",
                    "DINT_TO_BYTE",
                    "DINT_TO_INT",
                    "DINT_TO_UINT",
                    "DINT_TO_WORD",
                    "DINT_TO_UDINT",
                    "DINT_TO_DWORD",
                    "DINT_TO_TIME",
                    "DINT_TO_LINT",
                    "DINT_TO_ULINT",
                    "DINT_TO_LWORD",
                    "DINT_TO_REAL",
                    "DINT_TO_LREAL",
                    "UDINT_TO_BOOL",
                    "UDINT_TO_SINT",
                    "UDINT_TO_USINT",
                    "UDINT_TO_BYTE",
                    "UDINT_TO_INT",
                    "UDINT_TO_UINT",
                    "UDINT_TO_WORD",
                    "UDINT_TO_DINT",
                    "UDINT_TO_DWORD",
                    "UDINT_TO_TIME",
                    "UDINT_TO_LINT",
                    "UDINT_TO_ULINT",
                    "UDINT_TO_LWORD",
                    "UDINT_TO_REAL",
                    "UDINT_TO_LREAL",
                    "DWORD_TO_BOOL",
                    "DWORD_TO_SINT",
                    "DWORD_TO_USINT",
                    "DWORD_TO_BYTE",
                    "DWORD_TO_INT",
                    "DWORD_TO_UINT",
                    "DWORD_TO_WORD",
                    "DWORD_TO_DINT",
                    "DWORD_TO_UDINT",
                    "DWORD_TO_TIME",
                    "DWORD_TO_LINT",
                    "DWORD_TO_ULINT",
                    "DWORD_TO_LWORD",
                    "DWORD_TO_REAL",
                    "DWORD_TO_LREAL",
                    "TIME_TO_BOOL",
                    "TIME_TO_SINT",
                    "TIME_TO_USINT",
                    "TIME_TO_BYTE",
                    "TIME_TO_INT",
                    "TIME_TO_UINT",
                    "TIME_TO_WORD",
                    "TIME_TO_DINT",
                    "TIME_TO_UDINT",
                    "TIME_TO_DWORD",
                    "TIME_TO_LINT",
                    "TIME_TO_ULINT",
                    "TIME_TO_LWORD",
                    "TIME_TO_REAL",
                    "TIME_TO_LREAL",
                    "LINT_TO_BOOL",
                    "LINT_TO_SINT",
                    "LINT_TO_USINT",
                    "LINT_TO_BYTE",
                    "LINT_TO_INT",
                    "LINT_TO_UINT",
                    "LINT_TO_WORD",
                    "LINT_TO_DINT",
                    "LINT_TO_UDINT",
                    "LINT_TO_DWORD",
                    "LINT_TO_TIME",
                    "LINT_TO_ULINT",
                    "LINT_TO_LWORD",
                    "LINT_TO_REAL",
                    "LINT_TO_LREAL",
                    "ULINT_TO_BOOL",
                    "ULINT_TO_SINT",
                    "ULINT_TO_USINT",
                    "ULINT_TO_BYTE",
                    "ULINT_TO_INT",
                    "ULINT_TO_UINT",
                    "ULINT_TO_WORD",
                    "ULINT_TO_DINT",
                    "ULINT_TO_UDINT",
                    "ULINT_TO_DWORD",
                    "ULINT_TO_TIME",
                    "ULINT_TO_LINT",
                    "ULINT_TO_LWORD",
                    "ULINT_TO_REAL",
                    "ULINT_TO_LREAL",
                    "LWORD_TO_BOOL",
                    "LWORD_TO_SINT",
                    "LWORD_TO_USINT",
                    "LWORD_TO_BYTE",
                    "LWORD_TO_INT",
                    "LWORD_TO_UINT",
                    "LWORD_TO_WORD",
                    "LWORD_TO_DINT",
                    "LWORD_TO_UDINT",
                    "LWORD_TO_DWORD",
                    "LWORD_TO_TIME",
                    "LWORD_TO_LINT",
                    "LWORD_TO_ULINT",
                    "LWORD_TO_REAL",
                    "LWORD_TO_LREAL",
                    "REAL_TO_BOOL",
                    "REAL_TO_SINT",
                    "REAL_TO_USINT",
                    "REAL_TO_BYTE",
                    "REAL_TO_INT",
                    "REAL_TO_UINT",
                    "REAL_TO_WORD",
                    "REAL_TO_DINT",
                    "REAL_TO_UDINT",
                    "REAL_TO_DWORD",
                    "REAL_TO_TIME",
                    "REAL_TO_LINT",
                    "REAL_TO_ULINT",
                    "REAL_TO_LWORD",
                    "REAL_TO_LREAL",
                    "LREAL_TO_BOOL",
                    "LREAL_TO_SINT",
                    "LREAL_TO_USINT",
                    "LREAL_TO_BYTE",
                    "LREAL_TO_INT",
                    "LREAL_TO_UINT",
                    "LREAL_TO_WORD",
                    "LREAL_TO_DINT",
                    "LREAL_TO_UDINT",
                    "LREAL_TO_DWORD",
                    "LREAL_TO_TIME",
                    "LREAL_TO_LINT",
                    "LREAL_TO_ULINT",
                    "LREAL_TO_LWORD",
                    "LREAL_TO_REAL"
                  ],
                  "description": "For function: required."
                },
                "operands": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "For function: required, one per pin."
                },
                "output": {
                  "type": "string",
                  "description": "For function: the variable the result is written to."
                },
                "comment": {
                  "type": "string"
                }
              }
            }
          },
          "branches": {
            "type": "array"
          }
        }
      }
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

## Accepted values

### Element types

`left_rail`, `right_rail`, `contact_no`, `contact_nc`, `contact_p`, `contact_n`, `coil`, `coil_negated`, `coil_set`, `coil_reset`, `coil_p`, `coil_n`, `function_block`, `function`

### Contact types

`contact_no`, `contact_nc`, `contact_p`, `contact_n`

### Coil types

`coil`, `coil_negated`, `coil_set`, `coil_reset`, `coil_p`, `coil_n`

### Functions of a function box

`GT`, `GE`, `EQ`, `NE`, `LE`, `LT`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `MOVE`, `LIMIT`, `MIN`, `MAX`, `SEL`, `MUX`, `NAND`, `NOR`, `ROL`, `ROR`, `SHL`, `SHR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`, `AND_DWORD`, `OR_DWORD`, `XOR_DWORD`, `NOT_DWORD`, `ABS`, `ABSF`, `NEG`, `NEGF`, `SQRT`, `EXPT`, `TRUNC`, `ROUND`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `LN`, `LOG`, `EXP`, `NORM_X`, `SCALE_X`, `UPTIME`, `CYCLE_TIME`, `WATCHDOG_RESET`, `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`, `FIND`, `INSERT`, `DELETE`, `REPLACE`, `STRCMP`, `COPY`, `CLEAR`, `EQ_STRING`, `NE_STRING`, `BOOL_TO_SINT`, `BOOL_TO_USINT`, `BOOL_TO_BYTE`, `BOOL_TO_INT`, `BOOL_TO_UINT`, `BOOL_TO_WORD`, `BOOL_TO_DINT`, `BOOL_TO_UDINT`, `BOOL_TO_DWORD`, `BOOL_TO_TIME`, `BOOL_TO_LINT`, `BOOL_TO_ULINT`, `BOOL_TO_LWORD`, `BOOL_TO_REAL`, `BOOL_TO_LREAL`, `SINT_TO_BOOL`, `SINT_TO_USINT`, `SINT_TO_BYTE`, `SINT_TO_INT`, `SINT_TO_UINT`, `SINT_TO_WORD`, `SINT_TO_DINT`, `SINT_TO_UDINT`, `SINT_TO_DWORD`, `SINT_TO_TIME`, `SINT_TO_LINT`, `SINT_TO_ULINT`, `SINT_TO_LWORD`, `SINT_TO_REAL`, `SINT_TO_LREAL`, `USINT_TO_BOOL`, `USINT_TO_SINT`, `USINT_TO_BYTE`, `USINT_TO_INT`, `USINT_TO_UINT`, `USINT_TO_WORD`, `USINT_TO_DINT`, `USINT_TO_UDINT`, `USINT_TO_DWORD`, `USINT_TO_TIME`, `USINT_TO_LINT`, `USINT_TO_ULINT`, `USINT_TO_LWORD`, `USINT_TO_REAL`, `USINT_TO_LREAL`, `BYTE_TO_BOOL`, `BYTE_TO_SINT`, `BYTE_TO_USINT`, `BYTE_TO_INT`, `BYTE_TO_UINT`, `BYTE_TO_WORD`, `BYTE_TO_DINT`, `BYTE_TO_UDINT`, `BYTE_TO_DWORD`, `BYTE_TO_TIME`, `BYTE_TO_LINT`, `BYTE_TO_ULINT`, `BYTE_TO_LWORD`, `BYTE_TO_REAL`, `BYTE_TO_LREAL`, `INT_TO_BOOL`, `INT_TO_SINT`, `INT_TO_USINT`, `INT_TO_BYTE`, `INT_TO_UINT`, `INT_TO_WORD`, `INT_TO_DINT`, `INT_TO_UDINT`, `INT_TO_DWORD`, `INT_TO_TIME`, `INT_TO_LINT`, `INT_TO_ULINT`, `INT_TO_LWORD`, `INT_TO_REAL`, `INT_TO_LREAL`, `UINT_TO_BOOL`, `UINT_TO_SINT`, `UINT_TO_USINT`, `UINT_TO_BYTE`, `UINT_TO_INT`, `UINT_TO_WORD`, `UINT_TO_DINT`, `UINT_TO_UDINT`, `UINT_TO_DWORD`, `UINT_TO_TIME`, `UINT_TO_LINT`, `UINT_TO_ULINT`, `UINT_TO_LWORD`, `UINT_TO_REAL`, `UINT_TO_LREAL`, `WORD_TO_BOOL`, `WORD_TO_SINT`, `WORD_TO_USINT`, `WORD_TO_BYTE`, `WORD_TO_INT`, `WORD_TO_UINT`, `WORD_TO_DINT`, `WORD_TO_UDINT`, `WORD_TO_DWORD`, `WORD_TO_TIME`, `WORD_TO_LINT`, `WORD_TO_ULINT`, `WORD_TO_LWORD`, `WORD_TO_REAL`, `WORD_TO_LREAL`, `DINT_TO_BOOL`, `DINT_TO_SINT`, `DINT_TO_USINT`, `DINT_TO_BYTE`, `DINT_TO_INT`, `DINT_TO_UINT`, `DINT_TO_WORD`, `DINT_TO_UDINT`, `DINT_TO_DWORD`, `DINT_TO_TIME`, `DINT_TO_LINT`, `DINT_TO_ULINT`, `DINT_TO_LWORD`, `DINT_TO_REAL`, `DINT_TO_LREAL`, `UDINT_TO_BOOL`, `UDINT_TO_SINT`, `UDINT_TO_USINT`, `UDINT_TO_BYTE`, `UDINT_TO_INT`, `UDINT_TO_UINT`, `UDINT_TO_WORD`, `UDINT_TO_DINT`, `UDINT_TO_DWORD`, `UDINT_TO_TIME`, `UDINT_TO_LINT`, `UDINT_TO_ULINT`, `UDINT_TO_LWORD`, `UDINT_TO_REAL`, `UDINT_TO_LREAL`, `DWORD_TO_BOOL`, `DWORD_TO_SINT`, `DWORD_TO_USINT`, `DWORD_TO_BYTE`, `DWORD_TO_INT`, `DWORD_TO_UINT`, `DWORD_TO_WORD`, `DWORD_TO_DINT`, `DWORD_TO_UDINT`, `DWORD_TO_TIME`, `DWORD_TO_LINT`, `DWORD_TO_ULINT`, `DWORD_TO_LWORD`, `DWORD_TO_REAL`, `DWORD_TO_LREAL`, `TIME_TO_BOOL`, `TIME_TO_SINT`, `TIME_TO_USINT`, `TIME_TO_BYTE`, `TIME_TO_INT`, `TIME_TO_UINT`, `TIME_TO_WORD`, `TIME_TO_DINT`, `TIME_TO_UDINT`, `TIME_TO_DWORD`, `TIME_TO_LINT`, `TIME_TO_ULINT`, `TIME_TO_LWORD`, `TIME_TO_REAL`, `TIME_TO_LREAL`, `LINT_TO_BOOL`, `LINT_TO_SINT`, `LINT_TO_USINT`, `LINT_TO_BYTE`, `LINT_TO_INT`, `LINT_TO_UINT`, `LINT_TO_WORD`, `LINT_TO_DINT`, `LINT_TO_UDINT`, `LINT_TO_DWORD`, `LINT_TO_TIME`, `LINT_TO_ULINT`, `LINT_TO_LWORD`, `LINT_TO_REAL`, `LINT_TO_LREAL`, `ULINT_TO_BOOL`, `ULINT_TO_SINT`, `ULINT_TO_USINT`, `ULINT_TO_BYTE`, `ULINT_TO_INT`, `ULINT_TO_UINT`, `ULINT_TO_WORD`, `ULINT_TO_DINT`, `ULINT_TO_UDINT`, `ULINT_TO_DWORD`, `ULINT_TO_TIME`, `ULINT_TO_LINT`, `ULINT_TO_LWORD`, `ULINT_TO_REAL`, `ULINT_TO_LREAL`, `LWORD_TO_BOOL`, `LWORD_TO_SINT`, `LWORD_TO_USINT`, `LWORD_TO_BYTE`, `LWORD_TO_INT`, `LWORD_TO_UINT`, `LWORD_TO_WORD`, `LWORD_TO_DINT`, `LWORD_TO_UDINT`, `LWORD_TO_DWORD`, `LWORD_TO_TIME`, `LWORD_TO_LINT`, `LWORD_TO_ULINT`, `LWORD_TO_REAL`, `LWORD_TO_LREAL`, `REAL_TO_BOOL`, `REAL_TO_SINT`, `REAL_TO_USINT`, `REAL_TO_BYTE`, `REAL_TO_INT`, `REAL_TO_UINT`, `REAL_TO_WORD`, `REAL_TO_DINT`, `REAL_TO_UDINT`, `REAL_TO_DWORD`, `REAL_TO_TIME`, `REAL_TO_LINT`, `REAL_TO_ULINT`, `REAL_TO_LWORD`, `REAL_TO_LREAL`, `LREAL_TO_BOOL`, `LREAL_TO_SINT`, `LREAL_TO_USINT`, `LREAL_TO_BYTE`, `LREAL_TO_INT`, `LREAL_TO_UINT`, `LREAL_TO_WORD`, `LREAL_TO_DINT`, `LREAL_TO_UDINT`, `LREAL_TO_DWORD`, `LREAL_TO_TIME`, `LREAL_TO_LINT`, `LREAL_TO_ULINT`, `LREAL_TO_LWORD`, `LREAL_TO_REAL`

### Function blocks of a rung

`AWS_FLEET_PROV`, `AZURE_C2D_RECV`, `AZURE_DPS_PROV`, `AZURE_EG_PUB`, `BLINK`, `CTD`, `CTU`, `CTUD`, `DEADBAND`, `DERIVATIVE`, `FIFO`, `F_TRIG`, `HYSTERESIS`, `INTEGRAL`, `LAG_FILTER`, `LIFO`, `MB_COIL`, `MB_DISCRETE_INPUT`, `MB_HOLDING_REGISTER`, `MB_INPUT_REGISTER`, `MB_READ_COIL`, `MB_READ_HREG`, `MB_WRITE_COIL`, `MB_WRITE_HREG`, `MQTT_CONNECT`, `MQTT_PUBLISH`, `MQTT_SUBSCRIBE`, `PID_Compact`, `PULSE`, `PWM`, `RAMP_REAL`, `RS`, `R_TRIG`, `SPB_REBIRTH`, `SR`, `TOF`, `TON`, `TP`

## Worked examples

### Start/stop latch, a TON timer rung and a MOVE to a display

```json
{
  "name": "Belt",
  "description": "Start runs the belt until the box reaches EyeFar; Late comes on if that takes over 5 s.",
  "version": "1.0.0",
  "variables": {
    "local": [
      {
        "name": "Running",
        "type": "BOOL",
        "comment": "Latch: the belt was started and the box has not arrived"
      },
      {
        "name": "RunTimer",
        "type": "TON",
        "comment": "Times how long the belt runs"
      }
    ],
    "inputs": [
      {
        "name": "Start",
        "type": "BOOL",
        "address": "%I0.0",
        "comment": "StartButton.pressed"
      },
      {
        "name": "EyeFar",
        "type": "BOOL",
        "address": "%I0.1",
        "comment": "EyeFar.detect"
      }
    ],
    "outputs": [
      {
        "name": "Run",
        "type": "BOOL",
        "address": "%Q0.0",
        "comment": "Belt1.run"
      },
      {
        "name": "Emit",
        "type": "BOOL",
        "address": "%Q0.1",
        "comment": "Emitter1.emit"
      },
      {
        "name": "Late",
        "type": "BOOL",
        "address": "%Q0.2",
        "comment": "The box took over 5 s"
      },
      {
        "name": "Speed",
        "type": "REAL",
        "address": "%QD1",
        "comment": "SpeedShown.value, in percent"
      }
    ]
  },
  "rungs": [
    {
      "id": "rung_1",
      "number": 1,
      "comment": "Start sets the latch.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r1_0",
              "type": "contact_no",
              "variable": "Start",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r1_out",
              "type": "coil_set",
              "variable": "Running",
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_2",
      "number": 2,
      "comment": "EyeFar resets it; the later rung wins.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r2_0",
              "type": "contact_no",
              "variable": "EyeFar",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r2_out",
              "type": "coil_reset",
              "variable": "Running",
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_3",
      "number": 3,
      "comment": "The belt follows the latch.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r3_0",
              "type": "contact_no",
              "variable": "Running",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r3_out",
              "type": "coil",
              "variable": "Run",
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_4",
      "number": 4,
      "comment": "A Start press puts one box on the belt.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r4_0",
              "type": "contact_no",
              "variable": "Start",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r4_out",
              "type": "coil",
              "variable": "Emit",
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_5",
      "number": 5,
      "comment": "Time the run.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r5_0",
              "type": "contact_no",
              "variable": "Running",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r5_out",
              "type": "function_block",
              "fbType": "TON",
              "instance": "RunTimer",
              "parameters": {
                "IN": "CONNECTED",
                "PT": "T#5s"
              },
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_6",
      "number": 6,
      "comment": "Five seconds without the box is late.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r6_0",
              "type": "contact_no",
              "variable": "RunTimer.Q",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": {
              "id": "r6_out",
              "type": "coil",
              "variable": "Late",
              "row": 0,
              "col": 7
            },
            "hasWire": true
          }
        ]
      ]
    },
    {
      "id": "rung_7",
      "number": 7,
      "comment": "Show the belt speed.",
      "gridConfig": {
        "cols": 8,
        "rows": 1,
        "cellWidth": 80,
        "cellHeight": 60
      },
      "grid": [
        [
          {
            "element": {
              "id": "r7_0",
              "type": "function",
              "functionName": "MOVE",
              "operands": [
                "50.0"
              ],
              "output": "Speed",
              "row": 0,
              "col": 0
            },
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          },
          {
            "element": null,
            "hasWire": true
          }
        ]
      ]
    }
  ]
}
```

{/* <<< END GENERATED: reference/format-ld <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
