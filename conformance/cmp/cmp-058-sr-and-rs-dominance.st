PROGRAM Latches
VAR
  s : SR;
  r : RS;
  set_wins AT %QX0.0 : BOOL;
  reset_wins AT %QX0.1 : BOOL;
END_VAR
  s(S1 := TRUE, R := TRUE);
  r(S := TRUE, R1 := TRUE);
  set_wins := s.Q1;
  reset_wins := r.Q1;
END_PROGRAM
