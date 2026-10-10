TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  s : Pt;
  pp : REF_TO Pt;
  x AT %QW0 : INT;
  z AT %QD1 : DINT;
END_VAR
  pp := REF(s);
  pp^.z := 123456;
  pp^.x := -7;
  x := s.x;
  z := pp^.z;
END_PROGRAM
