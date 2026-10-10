FUNCTION_BLOCK Mixed
VAR_INPUT b : BYTE; END_VAR
VAR_OUTPUT i : INT; d : DINT; r : REAL; s : SINT; END_VAR
  i := -1000;
  d := -100000;
  r := 2.5;
  s := -3;
  b := 200;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  m : Mixed;
  oi AT %QW0 : INT;
  od AT %QD1 : DINT;
  orr AT %QD2 : REAL;
  os AT %QB12 : SINT;
  ob AT %QB13 : BYTE;
END_VAR
  m();
  oi := m.i;
  od := m.d;
  orr := m.r;
  os := m.s;
  ob := m.b;
END_PROGRAM
