PROGRAM Mixed
VAR
  flag : BOOL;
  small : SINT;
  word : INT;
  odd : BYTE;
  wide : DINT;
  ratio : REAL;
  big : LINT;
  tail : BOOL;
  o_word AT %QW0 : INT;
  o_wide AT %QD1 : DINT;
  o_ratio AT %QD2 : REAL;
  o_small AT %QB12 : SINT;
  o_odd AT %QB13 : BYTE;
  o_flag AT %QX14.0 : BOOL;
  o_tail AT %QX14.1 : BOOL;
  o_big AT %QX14.2 : BOOL;
END_VAR
  flag := TRUE;
  small := -7;
  word := -1234;
  odd := 201;
  wide := -70000;
  ratio := 2.5;
  big := 5000000000;
  tail := TRUE;
  o_word := word;
  o_wide := wide;
  o_ratio := ratio;
  o_small := small;
  o_odd := odd;
  o_flag := flag;
  o_tail := tail;
  o_big := big = 5000000000;
END_PROGRAM
