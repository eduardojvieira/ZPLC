TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Member
VAR
  p : Pt;
  total AT %QW0 : INT;
END_VAR
  p.x := 3;
  p.y := 4;
  total := p.x + p.y;
END_PROGRAM
