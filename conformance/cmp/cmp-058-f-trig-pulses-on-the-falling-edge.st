PROGRAM Edges
VAR
  signal AT %IX0.0 : BOOL;
  fall : F_TRIG;
  seen AT %QX0.0 : BOOL;
END_VAR
  fall(CLK := signal);
  seen := fall.Q;
END_PROGRAM
