PROGRAM Fill
VAR
  all : ARRAY[0..8190] OF BYTE;
  seen AT %QW0 : INT;
END_VAR
  all[0] := 1;
  all[8190] := 2;
  seen := all[0] + all[8190];
END_PROGRAM
