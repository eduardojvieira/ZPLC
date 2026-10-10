PROGRAM Rest
VAR
  A AT %IX0.0 : BOOL;
  B AT %IX0.1 : BOOL;
  Xor1 AT %QX0.0 : BOOL;
  Xor2 AT %QX0.1 : BOOL;
  Not1 AT %QX0.2 : BOOL;
  IsEq AT %QX0.3 : BOOL;
  IsNe AT %QX0.4 : BOOL;
  IsGe AT %QX0.5 : BOOL;
  IsLe AT %QX0.6 : BOOL;
  Remainder AT %QW1 : INT;
  Negated AT %QW2 : INT;
  Rises AT %QW3 : INT;
  Hit AT %QW4 : INT;
  N : INT := 7;
  Cnt : CTU;
END_VAR
  LD A
  XOR B
  ST Xor1
  LD A
  XORN B
  ST Xor2
  LD A
  NOT
  ST Not1
  LD N
  EQ 7
  ST IsEq
  LD N
  NE 7
  ST IsNe
  LD N
  GE 8
  ST IsGe
  LD N
  LE 7
  ST IsLe
  LD N
  MOD 4
  ST Remainder
  LD N
  NEG
  ST Negated
  CAL Cnt(CU := A, R := FALSE, PV := 100)
  LD Cnt.CV
  ST Rises
  JMP skip
  LD 99
  ST Hit
skip:
  LD 1
  ST Hit
  RET
  LD 77
  ST Hit
END_PROGRAM
