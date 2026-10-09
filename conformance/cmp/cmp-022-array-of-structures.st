TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Table
VAR
  a : ARRAY[0..3] OF Pt;
  seen AT %QW0 : INT;
END_VAR
  a[1].x := 5;
  seen := a[1].x;
END_PROGRAM
