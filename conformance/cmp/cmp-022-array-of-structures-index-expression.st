TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  a : ARRAY[0..3] OF Pt;
  i : INT;
  z2 AT %QD0 : DINT;
  x3 AT %QW2 : INT;
  x0 AT %QW3 : INT;
END_VAR
  FOR i := 0 TO 3 DO
    a[i].z := i * 1000 + 70000;
    a[i].x := -i;
  END_FOR;
  z2 := a[2].z;
  x3 := a[3].x;
  x0 := a[0].x;
END_PROGRAM
