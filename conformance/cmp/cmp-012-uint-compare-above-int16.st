PROGRAM Big
VAR
  big : UINT := 40000;
  above AT %QX0.0 : BOOL;
END_VAR
  above := big > 30000;
END_PROGRAM
