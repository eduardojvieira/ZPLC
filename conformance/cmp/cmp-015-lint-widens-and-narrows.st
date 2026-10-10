PROGRAM Convert
VAR
  signed : DINT := -5;
  unsigned : UDINT := 4294967295;
  from_signed : LINT;
  from_unsigned : LINT;
  wide : LINT := 5000000000;
  low AT %QD1 : DINT;
  same AT %QX0.0 : BOOL;
  positive AT %QX0.1 : BOOL;
END_VAR
  from_signed := signed;
  from_unsigned := unsigned;
  low := wide;
  same := from_signed = -5;
  positive := from_unsigned = 4294967295;
END_PROGRAM
