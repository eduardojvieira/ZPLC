PROGRAM Wrap
VAR
  big : INT := 300;
  wide : DINT := 70000;
  max_uint : UINT := 65535;
  minus_one : INT := -1;
  minus_sint : SINT := -1;
  all_ones : UDINT := 4294967295;
  dword_value : DWORD := 16#12345678;
  word_value : WORD := 16#ABCD;
  r0 AT %QB0 : SINT;
  r1 AT %QW1 : INT;
  r2 AT %QW2 : INT;
  r3 AT %QB6 : USINT;
  r4 AT %QW4 : UINT;
  r5 AT %QW5 : UINT;
  r6 AT %QD3 : UDINT;
  r7 AT %QD4 : DINT;
  r8 AT %QW10 : WORD;
  r9 AT %QB22 : BYTE;
  r10 AT %QB23 : BYTE;
  r11 AT %QW12 : INT;
END_VAR
  r0 := INT_TO_SINT(big);
  r1 := DINT_TO_INT(wide);
  r2 := UINT_TO_INT(max_uint);
  r3 := INT_TO_USINT(minus_one);
  r4 := INT_TO_UINT(minus_one);
  r5 := SINT_TO_UINT(minus_sint);
  r6 := INT_TO_UDINT(minus_one);
  r7 := UDINT_TO_DINT(all_ones);
  r8 := DWORD_TO_WORD(dword_value);
  r9 := DWORD_TO_BYTE(dword_value);
  r10 := WORD_TO_BYTE(word_value);
  r11 := WORD_TO_INT(word_value);
END_PROGRAM
