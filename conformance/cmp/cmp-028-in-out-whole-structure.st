TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

FUNCTION_BLOCK Move
VAR_IN_OUT p : Pt; END_VAR
  p.x := p.x + 1;
  p.z := p.z + 100000;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  m : Move;
  point : Pt;
  ox AT %QW0 : INT;
  oz AT %QD1 : DINT;
END_VAR
  point.x := 5;
  point.z := 1;
  m(p := point);
  ox := point.x;
  oz := point.z;
END_PROGRAM
