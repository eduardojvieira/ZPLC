PROGRAM WideVariable
VAR
  w : WSTRING := "abcd";
  n AT %QW0 : INT;
END_VAR
  n := LEN(w);
END_PROGRAM
