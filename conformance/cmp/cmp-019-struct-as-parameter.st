TYPE Pt : STRUCT x : INT; y : INT; z : DINT; END_STRUCT END_TYPE

FUNCTION SumXY : INT
VAR_INPUT p : Pt; END_VAR
  SumXY := p.x + p.y;
END_FUNCTION

PROGRAM Param
VAR
  point : Pt;
  total AT %QW0 : INT;
END_VAR
  point.x := 3;
  point.y := 4;
  total := SumXY(point);
END_PROGRAM
