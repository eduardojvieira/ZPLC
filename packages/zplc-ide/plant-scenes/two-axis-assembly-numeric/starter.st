PROGRAM Assembler
VAR_INPUT
    Start     AT %IX0.0 : BOOL;  (* StartButton.pressed: start the assembly *)
    LidReady  AT %IX0.1 : BOOL;  (* LidEye.detect: a lid waits at the lid blade *)
    BaseReady AT %IX0.2 : BOOL;  (* BaseEye.detect: a base waits at the base blade *)
    Gripped   AT %IX0.3 : BOOL;  (* Pick1.gripped: the pad holds a part *)
    XPos      AT %ID1   : REAL;  (* Pick1.xPos: pad position in centimetres, 0..100 for 0..1 m *)
    YPos      AT %ID2   : REAL;  (* Pick1.yPos: pad height in centimetres, 0..30 for 0..0.3 m *)
END_VAR
VAR_OUTPUT
    Grip     AT %QX0.0 : BOOL;  (* Pick1.grip: vacuum on *)
    RunLid   AT %QX0.1 : BOOL;  (* LidBelt.run: run the lid belt *)
    RunBase  AT %QX0.2 : BOOL;  (* BaseBelt.run: run the base belt *)
    RunExit  AT %QX0.3 : BOOL;  (* ExitBelt.run: run the exit belt *)
    HoldLid  AT %QX0.4 : BOOL;  (* LidBlade.extend: the blade holds the lid while true *)
    HoldBase AT %QX0.5 : BOOL;  (* BaseBlade.extend: the blade holds the base while true *)
    EmitLid  AT %QX0.6 : BOOL;  (* LidEmitter.emit: put one lid on the lid belt *)
    EmitBase AT %QX0.7 : BOOL;  (* BaseEmitter.emit: put one base on the base belt *)
    Green    AT %QX1.0 : BOOL;  (* StackLight1.green: three assemblies are done *)
    Amber    AT %QX1.1 : BOOL;  (* StackLight1.amber: the assembly is running *)
    XSet     AT %QD1   : REAL;  (* Pick1.xSet: target position in centimetres *)
    YSet     AT %QD2   : REAL;  (* Pick1.ySet: target height in centimetres *)
END_VAR

(* Goal: a press of the start button assembles three lids onto three bases.
   Feed one lid and one base at a time and hold each at its blade. With a
   lid and a base in place, send the pad to named positions: lower it on the
   lid (x 0, y 0), grip, raise to the safe height (y 30), move over the base
   (x 100), lower, release, raise and return. A move is done when the pad is
   within 0.2 cm of its target. Then let the assembled base run out on the
   exit belt and feed the next pair. Never move the pad across the belts
   while it is down. Light Green after the third. *)

END_PROGRAM
