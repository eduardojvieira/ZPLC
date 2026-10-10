PROGRAM Lamp
VAR
  enable AT %IX0.0 : BOOL;
  flasher : BLINK;
  q AT %QX0.0 : BOOL;
END_VAR
  flasher(ENABLE := enable, T_ON := T#30ms, T_OFF := T#20ms);
  q := flasher.Q;
END_PROGRAM
