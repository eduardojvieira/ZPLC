TYPE Pt : STRUCT x : INT := 7; y : INT := 8; z : DINT := 100000; END_STRUCT END_TYPE

PROGRAM Main
VAR
  p : Pt := (y := 20);
  q : Pt;
  px AT %QW0 : INT;
  py AT %QW1 : INT;
  pz AT %QD1 : DINT;
  qx AT %QW4 : INT;
END_VAR
  px := p.x;
  py := p.y;
  pz := p.z;
  qx := q.x;
END_PROGRAM
