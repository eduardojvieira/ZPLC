PROGRAM Widths
VAR
  in_bit AT %IX0.3 : BOOL;
  in_byte AT %IB1 : BYTE;
  in_word AT %IW1 : WORD;
  in_dword AT %ID1 : DWORD;
  out_bit AT %QX0.5 : BOOL;
  out_byte AT %QB1 : BYTE;
  out_word AT %QW1 : WORD;
  out_dword AT %QD1 : DWORD;
END_VAR
  out_bit := in_bit;
  out_byte := in_byte;
  out_word := in_word;
  out_dword := in_dword;
END_PROGRAM
