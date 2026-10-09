PROGRAM Shifts
VAR
  one : DWORD := 1;
  top : DWORD := 2147483647;
  width : DINT := 32;
  negative : DINT := -1;
  shl_width AT %QD0 : DWORD;
  shr_width AT %QD4 : DWORD;
  shl_negative AT %QD8 : DWORD;
END_VAR
  shl_width := SHL(one, width);
  shr_width := SHR(top, width);
  shl_negative := SHL(one, negative);
END_PROGRAM
