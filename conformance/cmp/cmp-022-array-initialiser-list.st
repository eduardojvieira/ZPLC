PROGRAM Table
VAR
  a : ARRAY[0..2] OF INT := [1, 2, 3];
  seen AT %QW0 : INT;
END_VAR
  seen := a[1];
END_PROGRAM
