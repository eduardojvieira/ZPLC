TYPE Segment : STRUCT
  a : Point;
  b : Point;
END_STRUCT END_TYPE

PROGRAM Geometry
VAR
  s : Segment;
  total AT %QW0 : INT;
END_VAR
  s.a.x := 3;
  s.a.y := 4;
  s.b.x := 10;
  s.b.y := 20;
  total := s.a.x + s.a.y + s.b.x + s.b.y;
END_PROGRAM
