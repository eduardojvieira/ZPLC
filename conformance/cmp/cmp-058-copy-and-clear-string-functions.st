PROGRAM Edit
VAR
  source : STRING[20] := 'hello';
  target : STRING[20] := 'xxxxxxxxxxxxxxxx';
  other : STRING[20] := 'abc';
  short : STRING[3] := 'zzz';
  l0 AT %QW0 : INT;
  l1 AT %QW1 : INT;
  l2 AT %QW2 : INT;
  l3 AT %QW3 : INT;
  same AT %QX8.0 : BOOL;
  kept AT %QX8.1 : BOOL;
END_VAR
  target := COPY(source, target);
  l0 := LEN(target);
  same := EQ_STRING(target, 'hello');
  other := CLEAR(other);
  l1 := LEN(other);
  short := COPY(source, short);
  l2 := LEN(short);
  kept := EQ_STRING(source, 'hello');
  l3 := LEN(source);
END_PROGRAM
