PROGRAM Assembler
VAR_INPUT
    Start     AT %I0.0 : BOOL;  (* StartButton.pressed: start the assembly *)
    LidReady  AT %I0.1 : BOOL;  (* LidEye.detect: a lid waits at the lid blade *)
    BaseReady AT %I0.2 : BOOL;  (* BaseEye.detect: a base waits at the base blade *)
    XAtMin    AT %I0.3 : BOOL;  (* Pick1.xAtMin: the pad is over the lid belt *)
    XAtMax    AT %I0.4 : BOOL;  (* Pick1.xAtMax: the pad is over the base belt *)
    YAtMin    AT %I0.5 : BOOL;  (* Pick1.yAtMin: the pad is down *)
    YAtMax    AT %I0.6 : BOOL;  (* Pick1.yAtMax: the pad is up *)
    Gripped   AT %I0.7 : BOOL;  (* Pick1.gripped: the pad holds a part *)
END_VAR
VAR_OUTPUT
    XPlus    AT %Q0.0 : BOOL;  (* Pick1.xPlus: move the pad toward the base belt while true *)
    XMinus   AT %Q0.1 : BOOL;  (* Pick1.xMinus: move the pad toward the lid belt while true *)
    YPlus    AT %Q0.2 : BOOL;  (* Pick1.yPlus: raise the pad while true *)
    YMinus   AT %Q0.3 : BOOL;  (* Pick1.yMinus: lower the pad while true *)
    Grip     AT %Q0.4 : BOOL;  (* Pick1.grip: vacuum on *)
    RunLid   AT %Q0.5 : BOOL;  (* LidBelt.run: run the lid belt *)
    RunBase  AT %Q0.6 : BOOL;  (* BaseBelt.run: run the base belt *)
    RunExit  AT %Q0.7 : BOOL;  (* ExitBelt.run: run the exit belt *)
    HoldLid  AT %Q1.0 : BOOL;  (* LidBlade.extend: the blade holds the lid while true *)
    HoldBase AT %Q1.1 : BOOL;  (* BaseBlade.extend: the blade holds the base while true *)
    EmitLid  AT %Q1.2 : BOOL;  (* LidEmitter.emit: put one lid on the lid belt *)
    EmitBase AT %Q1.3 : BOOL;  (* BaseEmitter.emit: put one base on the base belt *)
    Green    AT %Q1.4 : BOOL;  (* StackLight1.green: three assemblies are done *)
    Amber    AT %Q1.5 : BOOL;  (* StackLight1.amber: the assembly is running *)
END_VAR

(* Goal: a press of the start button assembles three lids onto three bases.
   Feed one lid and one base at a time and hold each at its blade. With a
   lid and a base in place, lower the pad, grip the lid, raise, move over
   the base, lower, release, raise and return. Then let the assembled base
   run out on the exit belt and feed the next pair. Never move the pad
   across the belts while it is down. Light Green after the third. *)

END_PROGRAM
