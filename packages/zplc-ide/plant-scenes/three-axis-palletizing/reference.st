PROGRAM Palletizing
VAR_INPUT
    XPos    AT %IW0 : INT;    (* Gantry1.xPos: 0 to 1000 is 0 to 1.6 m *)
    YPos    AT %IW1 : INT;    (* Gantry1.yPos: 0 to 1000 is 0 to 1.2 m *)
    ZPos    AT %IW2 : INT;    (* Gantry1.zPos: 0 to 1000 is 0 to 1.2 m *)
    Start   AT %I6.0 : BOOL;  (* StartButton.pressed *)
    Gripped AT %I6.1 : BOOL;  (* Gantry1.gripped: the vacuum pad holds a box *)
    EyePick AT %I6.2 : BOOL;  (* EyePick.detect: a box waits at the blade *)
END_VAR
VAR_OUTPUT
    XCmd    AT %QW0 : INT;    (* Gantry1.xSet: same scale as XPos *)
    YCmd    AT %QW1 : INT;    (* Gantry1.ySet *)
    ZCmd    AT %QW2 : INT;    (* Gantry1.zSet *)
    Grip    AT %Q6.0 : BOOL;  (* Gantry1.grip: vacuum on *)
    RunBelt AT %Q6.1 : BOOL;  (* Belt1.run *)
    Emit    AT %Q6.2 : BOOL;  (* Emitter1.emit: one box per rising edge *)
    Hold    AT %Q6.3 : BOOL;  (* Blade1.extend: stops the box at the pick spot *)
    Green   AT %Q6.4 : BOOL;  (* StackLight1.green: the pallet is full *)
    Amber   AT %Q6.5 : BOOL;  (* StackLight1.amber: palletizing *)
END_VAR

VAR
    Step     : INT;   (* 0 idle, 1 raise, 2 wait for a box, 3 lower, 4 grip, 5 lift, 6 travel, 7 lower, 8 release, 9 raise, 10 return, 11 done *)
    Cycle    : INT;   (* boxes placed so far, 0 to 8 *)
    Slot     : INT;   (* place in the layer, 0 to 3 *)
    Settled  : TON;
    Released : TON;
    Arrived  : BOOL;
    EmitNow  : BOOL;
END_VAR

(* Positions in raw counts. X: 625 counts per m. Y and Z: 833 counts per m.
   Y 500 puts the pad on the top of a box that stands on the belt (0.60 m).
   Y 917 carries a box above a full second layer. Y 372 and 622 lower a box
   onto the pallet (0.144 m) and onto the first layer (0.444 m). *)

Slot := Cycle MOD 4;
Arrived := XPos >= XCmd - 1 AND XPos <= XCmd + 1 AND YPos >= YCmd - 1 AND YPos <= YCmd + 1 AND ZPos >= ZCmd - 1 AND ZPos <= ZCmd + 1;
EmitNow := FALSE;

Settled(IN := Step = 2 AND EyePick, PT := T#600ms);
Released(IN := Step = 8, PT := T#400ms);

CASE Step OF
    0:
        IF Start THEN
            YCmd := 917;
            Step := 1;
        END_IF;
    1:
        (* the pad starts on the floor: rise before anything moves across the belt *)
        IF Arrived THEN
            EmitNow := TRUE;
            Step := 2;
        END_IF;
    2:
        IF Settled.Q THEN
            YCmd := 500;
            Step := 3;
        END_IF;
    3:
        IF Arrived THEN
            Step := 4;
        END_IF;
    4:
        IF Gripped THEN
            YCmd := 917;
            Step := 5;
        END_IF;
    5:
        IF Arrived THEN
            CASE Slot OF
                0: XCmd := 550; ZCmd := 442;
                1: XCmd := 825; ZCmd := 442;
                2: XCmd := 550; ZCmd := 725;
                3: XCmd := 825; ZCmd := 725;
            END_CASE;
            Step := 6;
        END_IF;
    6:
        IF Arrived THEN
            (* the next box is sent when the pad is clear of the belt *)
            IF Cycle < 7 THEN
                EmitNow := TRUE;
            END_IF;
            IF Cycle < 4 THEN
                YCmd := 372;
            ELSE
                YCmd := 622;
            END_IF;
            Step := 7;
        END_IF;
    7:
        IF Arrived THEN
            Step := 8;
        END_IF;
    8:
        IF Released.Q THEN
            Cycle := Cycle + 1;
            YCmd := 917;
            Step := 9;
        END_IF;
    9:
        IF Arrived THEN
            IF Cycle >= 8 THEN
                Step := 11;
            ELSE
                XCmd := 0;
                ZCmd := 0;
                Step := 10;
            END_IF;
        END_IF;
    10:
        IF Arrived THEN
            Step := 2;
        END_IF;
END_CASE;

Grip    := Step >= 4 AND Step <= 7;
Emit    := EmitNow;
RunBelt := Step >= 1 AND Step <= 10;
Hold    := Step >= 1 AND Step <= 10;
Amber   := Step >= 1 AND Step <= 10;
Green   := Step = 11;

END_PROGRAM
