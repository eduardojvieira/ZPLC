PROGRAM Loop
VAR
  I : INT;
  Out AT %QW0 : INT;
END_VAR
  LD 0
  ST I
again:
  LD I
  ADD 1
  ST I
  LT 3
  JMPC again
  LD I
  ST Out
END_PROGRAM
