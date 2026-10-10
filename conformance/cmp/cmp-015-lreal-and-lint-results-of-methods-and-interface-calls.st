INTERFACE IMeter
METHOD Reading : LREAL
END_METHOD
METHOD Ticks : LINT
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Probe IMPLEMENTS IMeter
VAR_INPUT
  gain : LREAL;
  offset : LINT;
END_VAR
METHOD Reading : LREAL
  Reading := gain * 0.1 + 0.5;
END_METHOD
METHOD Ticks : LINT
  Ticks := offset * 3;
END_METHOD
METHOD Twice : LREAL
  Twice := Reading() * 2.0;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FineProbe EXTENDS Probe
METHOD OVERRIDE Reading : LREAL
  Reading := SUPER^.Reading() + 0.25;
END_METHOD
METHOD OVERRIDE Ticks : LINT
  Ticks := SUPER^.Ticks() + 4294967296;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM WideMethods
VAR
  plain : Probe;
  fine : FineProbe;
  meter : IMeter;
  o_reading AT %QD0 : LREAL;
  o_ticks AT %QD2 : LINT;
  o_twice AT %QD4 : LREAL;
  o_fine AT %QD6 : LREAL;
  o_fine_ticks AT %QD8 : LINT;
  o_fine_twice AT %QD10 : LREAL;
  o_through AT %QD12 : LREAL;
  o_through_ticks AT %QD14 : LINT;
  o_through_plain AT %QD16 : LREAL;
  o_after AT %QX512.0 : BOOL;
END_VAR
  plain.gain := 3.0;
  plain.offset := -2000000000;
  fine.gain := 3.0;
  fine.offset := 1;
  o_reading := plain.Reading();
  o_ticks := plain.Ticks();
  o_twice := plain.Twice();
  o_fine := fine.Reading();
  o_fine_ticks := fine.Ticks();
  o_fine_twice := fine.Twice();
  meter := fine;
  o_through := meter.Reading() + 1.0;
  o_through_ticks := meter.Ticks() - 1;
  meter := plain;
  o_through_plain := meter.Reading();
  o_after := meter.Ticks() < 0;
END_PROGRAM
