TYPE Pt : STRUCT x : INT := 3; z : DINT := 90000; END_STRUCT END_TYPE

VAR_GLOBAL
  g : Pt;
  t : ARRAY[0..2] OF INT := [4, 5, 6];
END_VAR

PROGRAM Main
VAR
  x AT %QW0 : INT;
  z AT %QD1 : DINT;
  t2 AT %QW4 : INT;
END_VAR
  x := g.x;
  z := g.z;
  t2 := t[2];
END_PROGRAM
