PROGRAM Clock
VAR
  up AT %QD0 : DINT;
  cycle_known AT %QX4.0 : BOOL;
  survived AT %QX4.1 : BOOL;
END_VAR
  up := UPTIME();
  cycle_known := CYCLE_TIME() >= 0;
  WATCHDOG_RESET();
  survived := TRUE;
END_PROGRAM
