PROGRAM LayerPalletizer
VAR_INPUT
    Start      AT %I0.0 : BOOL;  (* StartButton.pressed: start the job *)
    Eye        AT %I0.1 : BOOL;  (* EyeIn.detect: sees the near box of each pair that passes *)
    XMin       AT %I0.2 : BOOL;  (* Palletizer1.xAtMin: the head is over the forming zone *)
    XMax       AT %I0.3 : BOOL;  (* Palletizer1.xAtMax: the head is over the pallet *)
    YMin       AT %I0.4 : BOOL;  (* Palletizer1.yAtMin: the head is at its lowest *)
    YMax       AT %I0.5 : BOOL;  (* Palletizer1.yAtMax: the head is at its highest *)
    Squared    AT %I0.6 : BOOL;  (* Palletizer1.squared: the pusher is fully out *)
    LayerReady AT %I0.7 : BOOL;  (* Palletizer1.layerReady: four boxes lie at rest in the zone *)
    Gripped    AT %I1.0 : BOOL;  (* Palletizer1.gripped: the clamp holds a layer *)
END_VAR
VAR_OUTPUT
    Run    AT %Q0.0 : BOOL;  (* Infeed.run: run the infeed belt *)
    Emit1  AT %Q0.1 : BOOL;  (* Emitter1.emit: put one box on the near lane *)
    Emit2  AT %Q0.2 : BOOL;  (* Emitter2.emit: put one box on the far lane *)
    XPlus  AT %Q0.3 : BOOL;  (* Palletizer1.xPlus: move the head toward the pallet *)
    XMinus AT %Q0.4 : BOOL;  (* Palletizer1.xMinus: move the head back to the zone *)
    YPlus  AT %Q0.5 : BOOL;  (* Palletizer1.yPlus: raise the head *)
    YMinus AT %Q0.6 : BOOL;  (* Palletizer1.yMinus: lower the head *)
    Square AT %Q0.7 : BOOL;  (* Palletizer1.square: push the boxes into a block *)
    Grip   AT %Q1.0 : BOOL;  (* Palletizer1.grip: close the clamp *)
    Amber  AT %Q1.1 : BOOL;  (* StackLight1.amber: the job is running *)
    Green  AT %Q1.2 : BOOL;  (* StackLight1.green: all layers are on the pallet *)
END_VAR

VAR
    Step      : INT;   (* 0 idle, 1 raise, 2 load, 3 square, 4 retract, 5 pick jog, 6 settle, 7 grip, 8 lift, 9 travel,
                          10 lower, 11 settle, 12 release, 13 raise, 14 return, 15 done *)
    Layer     : INT;   (* layers already on the pallet, 0 to 3 *)
    PairsOut  : INT;   (* pairs of boxes put on the infeed for this layer *)
    PairsSeen : INT;   (* pairs that have passed EyeIn *)
    Waiting   : BOOL;  (* a pair is on its way past EyeIn: do not emit the next one yet *)
    EyeGone   : F_TRIG;
    ReadyT    : TON;
    SquareT   : TON;
    PickT     : TON;
    SettleT   : TON;
    DownT     : TON;
    HoldT     : TON;
    ReleaseT  : TON;
    DownMs    : TIME;
END_VAR

(* one Emit1 pulse and one Emit2 pulse put a pair of boxes on the infeed, one on each lane;
   EyeIn sees the near box of a pair pass *)
EyeGone(CLK := Eye);
Emit1 := FALSE;
Emit2 := FALSE;
IF Step = 2 THEN
    IF EyeGone.Q AND Waiting THEN
        Waiting := FALSE;
        PairsSeen := PairsSeen + 1;
    END_IF;
    IF PairsOut < 2 AND NOT Waiting THEN
        Emit1 := TRUE;
        Emit2 := TRUE;
        PairsOut := PairsOut + 1;
        Waiting := TRUE;
    END_IF;
END_IF;

(* the layer height: the head comes down from YMax by a timed jog, one box height lower per layer.
   The first layer is set down at YMin, so it needs no jog. *)
IF Layer = 1 THEN
    DownMs := T#580ms;
ELSE
    DownMs := T#440ms;
END_IF;

(* every timer runs only in its own step, so each step starts it from zero *)
ReadyT(IN := Step = 2 AND PairsSeen = 2 AND LayerReady, PT := T#500ms);
SquareT(IN := Step = 3 AND Squared AND LayerReady, PT := T#300ms);
PickT(IN := Step = 5, PT := T#550ms);
SettleT(IN := Step = 6, PT := T#700ms);
DownT(IN := Step = 10 AND Layer > 0, PT := DownMs);
HoldT(IN := Step = 11, PT := T#700ms);
ReleaseT(IN := Step = 12 AND NOT Gripped, PT := T#800ms);

CASE Step OF
    0:  (* wait for Start *)
        IF Start THEN
            Layer := 0;
            Step := 1;
        END_IF;
    1:  (* the head starts at its lowest: raise it before the boxes arrive *)
        IF YMax THEN
            PairsOut := 0;
            PairsSeen := 0;
            Waiting := FALSE;
            Step := 2;
        END_IF;
    2:  (* load two pairs; the belt runs until the layer is ready and stable *)
        IF ReadyT.Q THEN
            Step := 3;
        END_IF;
    3:  (* square the block with the pusher *)
        IF SquareT.Q THEN
            Step := 4;
        END_IF;
    4:  (* retract the pusher before the head moves *)
        IF NOT Squared THEN
            Step := 5;
        END_IF;
    5:  (* lower the head a timed jog, to just above the boxes *)
        IF PickT.Q THEN
            Step := 6;
        END_IF;
    6:  (* let the head come to rest, then close the clamp *)
        IF SettleT.Q THEN
            Step := 7;
        END_IF;
    7:  (* the clamp needs 0.3 s to close: wait for Gripped *)
        IF Gripped THEN
            Step := 8;
        END_IF;
    8:  (* lift the layer clear of the plates *)
        IF YMax THEN
            Step := 9;
        END_IF;
    9:  (* carry it over the pallet *)
        IF XMax THEN
            Step := 10;
        END_IF;
    10: (* lower onto the pallet: to YMin for the first layer, a timed jog for the others *)
        IF (Layer = 0 AND YMin) OR (Layer > 0 AND DownT.Q) THEN
            Step := 11;
        END_IF;
    11: (* let the head come to rest *)
        IF HoldT.Q THEN
            Step := 12;
        END_IF;
    12: (* open the clamp and wait until the boxes have settled on the pallet *)
        IF ReleaseT.Q THEN
            Step := 13;
        END_IF;
    13: (* raise clear of the layer *)
        IF YMax THEN
            Step := 14;
        END_IF;
    14: (* back over the forming zone *)
        IF XMin THEN
            Layer := Layer + 1;
            IF Layer = 3 THEN
                Step := 15;
            ELSE
                PairsOut := 0;
                PairsSeen := 0;
                Waiting := FALSE;
                Step := 2;
            END_IF;
        END_IF;
END_CASE;

Run := Step = 2;
Square := Step = 3;
Grip := Step >= 7 AND Step <= 11;
YMinus := (Step = 5 AND NOT PickT.Q) OR (Step = 10 AND Layer = 0 AND NOT YMin) OR (Step = 10 AND Layer > 0 AND NOT DownT.Q);
YPlus := Step = 1 OR Step = 8 OR Step = 13;
XPlus := Step = 9;
XMinus := Step = 14;
Amber := Step >= 1 AND Step <= 14;
Green := Step = 15;

END_PROGRAM
