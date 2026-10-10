PROGRAM Main
VAR
  s : STRING[16] := 'HELLO';
  p1 AT %QW0 : INT;
  p2 AT %QW1 : INT;
  p3 AT %QW2 : INT;
  p4 AT %QW3 : INT;
END_VAR
  p1 := FIND(s, 'LL');
  p2 := FIND(s, 'H');
  p3 := FIND(s, 'LOL');
  p4 := FIND(s, 'O');
END_PROGRAM
