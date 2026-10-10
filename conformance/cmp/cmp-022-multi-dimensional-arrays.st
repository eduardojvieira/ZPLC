PROGRAM Grid
VAR
  plane : ARRAY[0..1, 0..2] OF INT;
  cube : ARRAY[1..2, 1..2, 1..2] OF DINT;
  gains : ARRAY[0..2] OF REAL;
  flags : ARRAY[0..3] OF BOOL;
  i : INT;
  j : INT;
  corner AT %QW0 : INT;
  inner AT %QW1 : INT;
  far AT %QD1 : DINT;
  gain AT %QD2 : REAL;
  flag AT %QX12.0 : BOOL;
  clear AT %QX12.1 : BOOL;
END_VAR
  FOR i := 0 TO 1 DO
    FOR j := 0 TO 2 DO
      plane[i, j] := i * 10 + j;
    END_FOR;
  END_FOR;
  cube[2, 1, 2] := 212;
  gains[2] := 1.5;
  flags[3] := TRUE;
  corner := plane[1, 2];
  inner := plane[0, 1];
  far := cube[2, 1, 2];
  gain := gains[2];
  flag := flags[3];
  clear := flags[0];
END_PROGRAM
