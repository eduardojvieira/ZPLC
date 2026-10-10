PROGRAM Overfill
VAR
  n : INT;
  line : FIFO;
  guard : DINT := 77;
  count AT %QD0 : DINT;
  full AT %QX4.0 : BOOL;
  neighbour AT %QD2 : DINT;
END_VAR
  n := n + 1;
  line(PUSH := (n MOD 2) = 1, DATA_IN := n, SIZE := 16);
  count := line.COUNT;
  full := line.FULL;
  neighbour := guard;
END_PROGRAM
