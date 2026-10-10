TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

FUNCTION_BLOCK Inc
VAR_IN_OUT x : INT; END_VAR
  x := x + 1;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  f : Inc;
  s : Pt;
  a : ARRAY[0..3] OF INT;
  i : INT;
  sx AT %QW0 : INT;
  a2 AT %QW1 : INT;
  a1 AT %QW2 : INT;
END_VAR
  s.x := 40;
  i := 2;
  a[2] := 7;
  f(x := s.x);
  f(x := a[i]);
  sx := s.x;
  a2 := a[2];
  a1 := a[1];
END_PROGRAM
