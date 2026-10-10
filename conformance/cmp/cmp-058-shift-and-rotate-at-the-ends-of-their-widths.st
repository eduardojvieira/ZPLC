PROGRAM Bits
VAR
  one : DWORD := 16#00000001;
  top : DWORD := 16#80000000;
  byte_value : BYTE := 16#81;
  word_value : WORD := 16#0001;
  all_ones : BYTE := 16#FF;
  q0 AT %QD0 : DWORD;
  q1 AT %QD1 : DWORD;
  q2 AT %QB8 : BYTE;
  q3 AT %QW5 : WORD;
  q4 AT %QB12 : BYTE;
  q5 AT %QD4 : DWORD;
  q6 AT %QB20 : BYTE;
  q7 AT %QB21 : BYTE;
END_VAR
  q0 := SHL(one, 31);
  q1 := SHR(top, 31);
  q2 := ROL(byte_value, 1);
  q3 := ROR(word_value, 1);
  q4 := SHL(all_ones, 4);
  q5 := ROL(top, 32);
  q6 := ROL(byte_value, 8);
  q7 := ROR(byte_value, 0);
END_PROGRAM
