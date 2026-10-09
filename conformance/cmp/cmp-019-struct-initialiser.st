TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Init
VAR
  p : Pt := (x := 1, y := 2);
  seen AT %QW0 : INT;
END_VAR
  seen := p.y;
END_PROGRAM
