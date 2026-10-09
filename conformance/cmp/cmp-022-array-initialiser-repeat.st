PROGRAM Table
VAR
  a : ARRAY[0..3] OF INT := [4(7)];
  seen AT %QW0 : INT;
END_VAR
  seen := a[3];
END_PROGRAM
