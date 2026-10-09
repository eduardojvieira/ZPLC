TYPE Pt : STRUCT x : INT; y : INT; END_STRUCT END_TYPE

PROGRAM Mapped
VAR
  p : Pt;
  s : INT;
  copy AT %QW0 : INT;
END_VAR
  s := 42;
  copy := s;
END_PROGRAM
