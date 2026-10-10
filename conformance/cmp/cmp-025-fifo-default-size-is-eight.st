PROGRAM DefaultQueue
VAR
  push AT %IX0.0 : BOOL;
  item AT %ID1 : DINT;
  line : FIFO;
  count AT %QD0 : DINT;
  full AT %QX4.0 : BOOL;
END_VAR
  line(PUSH := push, DATA_IN := item);
  count := line.COUNT;
  full := line.FULL;
END_PROGRAM
