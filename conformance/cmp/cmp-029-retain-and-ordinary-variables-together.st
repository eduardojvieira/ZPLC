PROGRAM Mixed
VAR RETAIN
  kept : DINT;
  flag : BOOL;
END_VAR
VAR
  plain : INT;
  seen AT %QD0 : DINT;
  mark AT %QX4.0 : BOOL;
END_VAR
  kept := kept + 10;
  flag := kept > 15;
  plain := plain + 1;
  seen := kept + plain;
  mark := flag;
END_PROGRAM
