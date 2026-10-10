TYPE Mixed : STRUCT f : BOOL; b : BYTE; i : INT; d : DINT; r : REAL; END_STRUCT END_TYPE

PROGRAM Main
VAR
  m : Mixed;
  oflag AT %QX0.0 : BOOL;
  ob AT %QB1 : BYTE;
  oi AT %QW1 : INT;
  od AT %QD1 : DINT;
  orr AT %QD2 : REAL;
END_VAR
  m.d := 123456;
  m.r := 0.5;
  m.i := 31000;
  m.b := 250;
  m.f := TRUE;
  oflag := m.f;
  ob := m.b;
  oi := m.i;
  od := m.d;
  orr := m.r;
END_PROGRAM
