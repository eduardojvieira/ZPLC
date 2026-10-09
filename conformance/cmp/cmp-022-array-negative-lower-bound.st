PROGRAM Table
VAR
  a : ARRAY[-5..5] OF INT;
  total AT %QW0 : INT;
END_VAR
  a[-5] := 3;
  a[0] := 4;
  total := a[-5] + a[0];
END_PROGRAM
