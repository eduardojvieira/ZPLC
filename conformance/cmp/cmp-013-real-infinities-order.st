PROGRAM Infinite
VAR
  bits AT %ID0 : DWORD;
  pos AT %ID0 : REAL;
  low_bits AT %ID4 : DWORD;
  neg AT %ID4 : REAL;
  big : REAL := 3.0E38;
  pos_above AT %QX0.0 : BOOL;
  neg_below AT %QX0.1 : BOOL;
  pos_same AT %QX0.2 : BOOL;
  neg_less AT %QX0.3 : BOOL;
END_VAR
  pos_above := pos > big;
  neg_below := neg < 0.0 - big;
  pos_same := pos = pos;
  neg_less := neg < pos;
END_PROGRAM
