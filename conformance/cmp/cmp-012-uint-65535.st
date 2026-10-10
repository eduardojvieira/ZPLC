PROGRAM Top
VAR
  top : UINT := 65535;
  above AT %QX0.0 : BOOL;
  wide AT %QD4 : UDINT;
  wrapped AT %QW2 : UINT;
END_VAR
  above := top > 32767;
  wide := top;
  wrapped := top + 1;
END_PROGRAM
