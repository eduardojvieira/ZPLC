PROGRAM Conversions
VAR
  small : SINT := -3;
  half : INT := -300;
  whole : DINT := -70000;
  unsigned_half : UINT := 65535;
  octet : BYTE := 200;
  word_value : WORD := 40000;
  a AT %QW0 : INT;
  b AT %QW1 : INT;
  c AT %QD1 : DINT;
  d AT %QD2 : DINT;
  e AT %QW6 : INT;
  f AT %QD3 : DINT;
END_VAR
  a := SINT_TO_INT(small);
  b := DINT_TO_INT(half);
  c := INT_TO_DINT(half);
  d := UINT_TO_DINT(unsigned_half);
  e := BYTE_TO_INT(octet);
  f := WORD_TO_DINT(word_value);
END_PROGRAM
