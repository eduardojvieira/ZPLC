PROGRAM Edges
VAR
  r : R_TRIG;
  x : BOOL;
  pulses AT %QW0 : INT;
END_VAR
  x := NOT x;
  r(CLK := x);
  IF r.Q THEN
    pulses := pulses + 1;
  END_IF;
END_PROGRAM
