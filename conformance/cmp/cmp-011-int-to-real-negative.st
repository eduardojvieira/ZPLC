PROGRAM Convert
VAR
  count : INT := -7;
  value AT %QD0 : REAL;
END_VAR
  value := INT_TO_REAL(count);
END_PROGRAM
