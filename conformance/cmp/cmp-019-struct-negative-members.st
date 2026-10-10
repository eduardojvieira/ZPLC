TYPE Pt : STRUCT a : SINT; b : INT; c : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  p : Pt;
  sa AT %QB0 : SINT;
  sb AT %QW1 : INT;
  sc AT %QD1 : DINT;
END_VAR
  p.a := -5;
  p.b := -1000;
  p.c := -100000;
  sa := p.a;
  sb := p.b;
  sc := p.c;
END_PROGRAM
