PROGRAM Literal
VAR
  small AT %QW0 : INT;
  bits AT %QD2 : DWORD;
  flag AT %QX6.0 : BOOL;
  half AT %QD8 : REAL;
END_VAR
  small := SINT#-3 + INT#4;
  bits := DWORD#16#DEAD_BEEF;
  flag := BOOL#TRUE;
  half := REAL#1.5;
END_PROGRAM
