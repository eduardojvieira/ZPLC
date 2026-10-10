PROGRAM First
VAR
  block : ARRAY[0..299] OF BYTE;
  seen AT %QW0 : INT;
END_VAR
  block[299] := 5;
  seen := block[299];
END_PROGRAM
