PROGRAM Main
VAR
  flag : BOOL := TRUE;
  ratio : REAL := 1.5;
  big : DINT := -70000;
  wait : TIME := T#2s;
  oflag AT %QX0.0 : BOOL;
  oratio AT %QD1 : REAL;
  obig AT %QD2 : DINT;
  owait AT %QD3 : DINT;
END_VAR
  oflag := flag;
  oratio := ratio;
  obig := big;
  owait := wait;
END_PROGRAM
