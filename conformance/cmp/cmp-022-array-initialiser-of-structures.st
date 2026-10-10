TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  a : ARRAY[0..1] OF Pt := [(x := 1, z := 100000), (x := 2, z := 200000)];
  x1 AT %QW0 : INT;
  z0 AT %QD1 : DINT;
  z1 AT %QD2 : DINT;
END_VAR
  x1 := a[1].x;
  z0 := a[0].z;
  z1 := a[1].z;
END_PROGRAM
