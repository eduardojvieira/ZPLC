PROGRAM Queue
VAR
  push AT %IX0.0 : BOOL;
  pop AT %IX0.1 : BOOL;
  item AT %ID1 : DINT;
  line : FIFO;
  first AT %QD0 : DINT;
  count AT %QD1 : DINT;
  empty AT %QX8.0 : BOOL;
END_VAR
  line(PUSH := push, POP := pop, DATA_IN := item, SIZE := 8);
  first := line.DATA_OUT;
  count := line.COUNT;
  empty := line.EMPTY;
END_PROGRAM
