TYPE
  Point : STRUCT x : INT; y : INT; END_STRUCT;
  Marker : Point;
  Samples : ARRAY[0..2] OF INT;
END_TYPE

PROGRAM Aliases
VAR
  m : Marker;
  s : Samples;
  total AT %QW0 : INT;
END_VAR
  m.x := 2;
  m.y := 3;
  s[0] := 10;
  s[2] := 20;
  total := m.x + m.y + s[0] + s[2];
END_PROGRAM
