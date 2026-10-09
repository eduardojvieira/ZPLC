PROGRAM JumpTest
VAR
  A : BOOL;
  Hits AT %QW0 : INT;
  Tail AT %QW1 : INT;
END_VAR
  LD Hits
  ADD 1
  ST Hits
  LD A
  JMPC skip
  LD Tail
  ADD 1
  ST Tail
skip:
  LD Hits
  ST Hits
END_PROGRAM
