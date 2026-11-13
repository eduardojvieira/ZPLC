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

(* Goal: on Start, stack three layers of four boxes on Pallet1.
   Raise the head first: it starts at its lowest and the boxes would meet it.
   For each layer, load two pairs of boxes (one Emit1 and one Emit2 pulse
   makes a pair; count the pairs with EyeIn), run the Infeed until
   LayerReady, then Square the block and wait for Squared. Retract the
   pusher, lower the head a short timed jog, close the clamp, wait for
   Gripped, raise the head all the way, travel to XMax, lower to YMin, and
   for the second and third layer raise the head a timed jog of one box
   height per layer already placed. Open the clamp, raise, travel back to
   XMin. Amber while working, Green at the end. *)

END_PROGRAM
