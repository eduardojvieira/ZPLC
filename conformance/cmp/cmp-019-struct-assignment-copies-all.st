TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

PROGRAM Copy
VAR
  p : Pt;
  q : Pt;
  seen AT %QD0 : DINT;
END_VAR
  p.x := 1;
  p.z := 7;
  q := p;
  seen := q.z;
END_PROGRAM
