PROGRAM Project
VAR
  d : Echo;
  seen AT %QX0.0 : BOOL;
END_VAR
  d(sig := TRUE);
  seen := d.out;
END_PROGRAM
