PROGRAM DefaultStack
VAR
  push AT %IX0.0 : BOOL;
  item AT %ID1 : DINT;
  pile : LIFO;
  count AT %QD0 : DINT;
  full AT %QX4.0 : BOOL;
END_VAR
  pile(PUSH := push, DATA_IN := item);
  count := pile.COUNT;
  full := pile.FULL;
END_PROGRAM
