TYPE Rec : STRUCT n : INT; a : ARRAY[1..3] OF DINT; tail : INT; END_STRUCT END_TYPE

PROGRAM Main
VAR
  s : Rec;
  i : INT;
  second AT %QD0 : DINT;
  tail AT %QW2 : INT;
END_VAR
  s.tail := 77;
  FOR i := 1 TO 3 DO
    s.a[i] := i * 100000;
  END_FOR;
  second := s.a[2];
  tail := s.tail;
END_PROGRAM
