PROGRAM Table
VAR
  a : ARRAY[1..4] OF INT;
  i : INT;
  third AT %QW0 : INT;
END_VAR
  FOR i := 1 TO 4 DO
    a[i] := i * 10;
  END_FOR;
  third := a[3];
END_PROGRAM
