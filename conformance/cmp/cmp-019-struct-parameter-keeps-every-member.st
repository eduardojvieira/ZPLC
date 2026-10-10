TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

FUNCTION Tail : DINT
VAR_INPUT whole : Pt; END_VAR
  Tail := whole.z;
END_FUNCTION

FUNCTION Bump : INT
VAR_INPUT copy : Pt; END_VAR
  copy.x := 99;
  Bump := copy.x;
END_FUNCTION

PROGRAM Main
VAR
  point : Pt;
  z AT %QD0 : DINT;
  bumped AT %QW2 : INT;
  kept AT %QW3 : INT;
END_VAR
  point.x := 3;
  point.z := 100000;
  z := Tail(point);
  bumped := Bump(point);
  kept := point.x;
END_PROGRAM
