PROGRAM Analog
VAR
  level AT %IW0 : INT;
  doubled AT %QW2 : INT;
  below AT %QX0.0 : BOOL;
END_VAR
  doubled := level * 2;
  below := level < 0;
END_PROGRAM
