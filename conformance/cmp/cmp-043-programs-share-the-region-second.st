PROGRAM Second
VAR
  block : ARRAY[0..299] OF BYTE;
  seen AT %QW1 : INT;
END_VAR
  block[299] := 9;
  seen := block[299];
END_PROGRAM
