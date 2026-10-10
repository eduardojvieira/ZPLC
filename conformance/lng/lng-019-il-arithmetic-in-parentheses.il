PROGRAM Scaled
VAR
  Out AT %QW0 : INT;
  Cmp AT %QX2.0 : BOOL;
END_VAR
  LD 10
  MUL( 2
  ADD 3
  )
  ST Out
  GT( 40
  ADD 5
  )
  ST Cmp
END_PROGRAM
