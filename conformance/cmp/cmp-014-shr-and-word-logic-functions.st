PROGRAM WordLogic
VAR
  w : WORD := 61680;
  d : DWORD := 4042322160;
  shifted AT %QW0 : WORD;
  and_w AT %QW1 : WORD;
  or_w AT %QW2 : WORD;
  xor_w AT %QW3 : WORD;
  not_w AT %QW4 : WORD;
  and_d AT %QD3 : DWORD;
  or_d AT %QD4 : DWORD;
  xor_d AT %QD5 : DWORD;
  not_d AT %QD6 : DWORD;
  ones : DWORD := 4294967295;
END_VAR
  shifted := SHR(w, 4);
  and_w := AND_WORD(w, 255);
  or_w := OR_WORD(w, 15);
  xor_w := XOR_WORD(w, 65535);
  not_w := NOT_WORD(w);
  and_d := AND_DWORD(d, 65535);
  or_d := OR_DWORD(d, 255);
  xor_d := XOR_DWORD(d, ones);
  not_d := NOT_DWORD(d);
END_PROGRAM
