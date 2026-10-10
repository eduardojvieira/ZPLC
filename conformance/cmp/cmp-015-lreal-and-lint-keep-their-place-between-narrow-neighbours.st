TYPE Cell :
STRUCT
  flag : BOOL;
  value : LREAL;
  tag : BYTE;
  count : LINT;
  small : INT;
END_STRUCT
END_TYPE

FUNCTION_BLOCK Holder
VAR_INPUT
  on : BOOL;
  level : LREAL;
END_VAR
VAR_OUTPUT
  seen : LINT;
  half : LREAL;
END_VAR
VAR
  steps : BYTE;
END_VAR
  steps := steps + 1;
  seen := seen + 4294967297;
  half := level / 2.0;
END_FUNCTION_BLOCK

PROGRAM WideLayout
VAR
  flag0 : BOOL;
  lone : LREAL;
  byte0 : BYTE;
  wide0 : LINT;
  int0 : INT;
  cells : ARRAY[0..2] OF Cell;
  holder : Holder;
  unit : LINT := 4294967296;
  i : DINT;
  o_flag0 AT %QX512.0 : BOOL;
  o_lone AT %QD0 : LREAL;
  o_byte0 AT %QB1024 : BYTE;
  o_wide0 AT %QD2 : LINT;
  o_int0 AT %QW600 : INT;
  o_flag1 AT %QX512.1 : BOOL;
  o_flag2 AT %QX512.2 : BOOL;
  o_value1 AT %QD4 : LREAL;
  o_value2 AT %QD6 : LREAL;
  o_tag2 AT %QB1025 : BYTE;
  o_count1 AT %QD8 : LINT;
  o_count2 AT %QD10 : LINT;
  o_small1 AT %QW601 : INT;
  o_seen AT %QD12 : LINT;
  o_half AT %QD14 : LREAL;
END_VAR
  flag0 := TRUE;
  lone := 0.1;
  byte0 := 200;
  wide0 := -4294967297;
  int0 := -3;
  FOR i := 0 TO 2 DO
    cells[i].flag := (i = 1);
    cells[i].value := 1.5 * (i + 1);
    cells[i].tag := 10 + i;
    cells[i].count := unit * (i + 1);
    cells[i].small := -100 * (i + 1);
  END_FOR;
  holder(on := TRUE, level := 0.5);
  holder(on := FALSE, level := 0.1);
  o_flag0 := flag0;
  o_lone := lone;
  o_byte0 := byte0;
  o_wide0 := wide0;
  o_int0 := int0;
  o_flag1 := cells[1].flag;
  o_flag2 := cells[2].flag;
  o_value1 := cells[1].value;
  o_value2 := cells[2].value;
  o_tag2 := cells[2].tag;
  o_count1 := cells[1].count;
  o_count2 := cells[2].count;
  o_small1 := cells[1].small;
  o_seen := holder.seen;
  o_half := holder.half;
END_PROGRAM
