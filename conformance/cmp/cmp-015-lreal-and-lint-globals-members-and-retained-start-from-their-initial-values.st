TYPE Reading :
STRUCT
  weight : LREAL := 0.1;
  count : LINT := -5000000000;
  tag : INT := 7;
END_STRUCT
END_TYPE

VAR_GLOBAL
  g_double : LREAL := 0.1;
  g_wide : LINT := 5000000000;
  g_top : ULINT := 18446744073709551615;
  g_row : ARRAY[0..2] OF LREAL := [1.5, 2.5, 3.5];
  g_reading : Reading;
END_VAR

VAR_GLOBAL RETAIN
  g_kept : LREAL := 100.25;
  g_hits : LINT := 4294967296;
END_VAR

PROGRAM WideInitial
VAR
  o_double AT %QD0 : LREAL;
  o_wide AT %QD2 : LINT;
  o_top AT %QD4 : ULINT;
  o_row2 AT %QD6 : LREAL;
  o_weight AT %QD8 : LREAL;
  o_count AT %QD10 : LINT;
  o_tag AT %QW600 : INT;
  o_kept AT %QD12 : LREAL;
  o_hits AT %QD14 : LINT;
END_VAR
  g_kept := g_kept * 2.0;
  g_hits := g_hits + 1;
  o_double := g_double;
  o_wide := g_wide;
  o_top := g_top;
  o_row2 := g_row[2];
  o_weight := g_reading.weight;
  o_count := g_reading.count;
  o_tag := g_reading.tag;
  o_kept := g_kept;
  o_hits := g_hits;
END_PROGRAM
