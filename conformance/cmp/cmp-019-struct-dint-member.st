TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Member
VAR
  p : Pt;
  seen AT %QD0 : DINT;
END_VAR
  p.z := 100000;
  seen := p.z;
END_PROGRAM
