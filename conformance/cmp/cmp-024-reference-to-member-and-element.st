TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  s : Pt;
  a : ARRAY[0..3] OF DINT;
  pz : REF_TO DINT;
  pe : REF_TO DINT;
  z AT %QD0 : DINT;
  e2 AT %QD1 : DINT;
END_VAR
  pz := REF(s.z);
  pz^ := 123456;
  pe := REF(a[2]);
  pe^ := 654321;
  z := s.z;
  e2 := a[2];
END_PROGRAM
