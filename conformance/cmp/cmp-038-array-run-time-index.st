PROGRAM Counters
VAR
  c : ARRAY[0..2] OF CTU;
  i : INT;
  first AT %QW0 : INT;
  second AT %QW2 : INT;
  third AT %QW4 : INT;
END_VAR
  c[i](CU := TRUE, PV := 100);
  i := i + 1;
  IF i > 2 THEN i := 0; END_IF;
  first := c[0].CV;
  second := c[1].CV;
  third := c[2].CV;
END_PROGRAM
