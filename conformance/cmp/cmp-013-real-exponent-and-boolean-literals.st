PROGRAM Literals
VAR
  big AT %QD0 : REAL;
  small AT %QD1 : REAL;
  whole AT %QW4 : INT;
  on AT %QX10.0 : BOOL;
  off AT %QX10.1 : BOOL;
END_VAR
  big := 1.5E2;
  small := 2.5E-1;
  whole := 12345;
  on := TRUE;
  off := FALSE;
END_PROGRAM
