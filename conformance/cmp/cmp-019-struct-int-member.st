TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Member
VAR
  p : Pt;
  seen AT %QW0 : INT;
END_VAR
  p.x := 1000;
  seen := p.x;
END_PROGRAM
