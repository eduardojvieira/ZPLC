import type { LearnLessonId } from '../components/learnLesson';

/**
 * Deliberately wrong programs for the Learn starters, one table per lesson. Each program compiles and is missing one
 * behaviour the lesson teaches, so it must NOT turn the lesson's graded scenario green (see starterGrading.test.ts).
 */

const program = (name: string, declarations: string, body: string): string => `PROGRAM ${name}\n${declarations}\n${body}\nEND_PROGRAM\n`;

const motorDeclarations = `VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; EStop AT %I0.2 : BOOL; Overload AT %I0.3 : BOOL; END_VAR
VAR_OUTPUT Forward AT %Q0.0 : BOOL; Reverse AT %Q0.1 : BOOL; END_VAR`;
const crossingDeclarations = `VAR_INPUT PedRequest AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT VehicleRed AT %Q0.0 : BOOL; VehicleYellow AT %Q0.1 : BOOL; VehicleGreen AT %Q0.2 : BOOL; PedWalk AT %Q0.3 : BOOL; PedStop AT %Q0.4 : BOOL; END_VAR`;
const tankDeclarations = `VAR_INPUT AutoEnable AT %I0.0 : BOOL; LevelLow AT %I0.1 : BOOL; LevelHigh AT %I0.2 : BOOL; PumpFault AT %I0.3 : BOOL; EStop AT %I0.4 : BOOL; Reset AT %I0.5 : BOOL; END_VAR
VAR_OUTPUT Pump AT %Q0.0 : BOOL; Alarm AT %Q0.1 : BOOL; END_VAR`;
const conveyorDeclarations = `VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; Reset AT %I0.2 : BOOL; PartAtClassifier AT %I0.3 : BOOL; MetalDetected AT %I0.4 : BOOL; PartAtDiverter AT %I0.5 : BOOL; JamDetected AT %I0.6 : BOOL; END_VAR
VAR_OUTPUT BeltCommand AT %Q0.0 : BOOL; DiverterCommand AT %Q0.1 : BOOL; FaultLamp AT %Q0.2 : BOOL; END_VAR`;
const motorPlantDeclarations = `VAR_INPUT Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; AtSpeed AT %I0.2 : BOOL; END_VAR
VAR_OUTPUT Command AT %Q0.0 : BOOL; Running AT %Q0.1 : BOOL; END_VAR`;
const edgeCounterDeclarations = `VAR_INPUT PulseInput AT %I0.0 : BOOL; Reset AT %I0.1 : BOOL; END_VAR
VAR_OUTPUT CountReached AT %Q0.0 : BOOL; END_VAR`;
const scanDeclarations = `VAR_INPUT Button AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Current AT %Q0.0 : BOOL; Delayed AT %Q0.1 : BOOL; RisingPulse AT %Q0.2 : BOOL; END_VAR`;
const blinkyDeclarations = 'VAR_OUTPUT LED_Output AT %Q0.0 : BOOL; END_VAR';

export interface Wrong { readonly intent: string; readonly source: string }
export interface Grading {
  /** File inside the reference project's src/ whose source is the lesson's solution; defaults to the starter program file. */
  readonly referenceSource?: string;
  /**
   * Projects that may carry that file, tried in order; defaults to the lesson's reference project. Every one that exists must
   * pass, and at least one must exist, so a reference moved to a sibling project cannot silently drop out of the check.
   */
  readonly referenceProjects?: readonly string[];
  /** Other complete, correct solutions that must also turn the scenario green: the lesson grades behaviour, not one technique. */
  readonly alsoGreen?: readonly Wrong[];
  readonly wrong: readonly Wrong[];
}

/** One entry per lesson: the wrong programs that must NOT turn the lesson's scenario green. */
export const starterGrading: Record<LearnLessonId, Grading> = {
  'motor-start-stop-safe': { wrong: [
    { intent: 'latches Start and has no Stop, EStop or Overload dropout', source: program('Motor', motorDeclarations, 'IF Start THEN Forward := TRUE; END_IF;\nReverse := FALSE;') },
    { intent: 'drops out on Stop and Overload but ignores EStop', source: program('Motor', motorDeclarations, 'IF Stop OR Overload THEN Forward := FALSE; ELSIF Start THEN Forward := TRUE; END_IF;\nReverse := FALSE;') },
    { intent: 'drops out on Stop and EStop but ignores Overload', source: program('Motor', motorDeclarations, 'IF Stop OR EStop THEN Forward := FALSE; ELSIF Start THEN Forward := TRUE; END_IF;\nReverse := FALSE;') },
    { intent: 'restarts by itself while Start is still held after a stop', source: program('Motor', motorDeclarations, 'IF Stop OR EStop OR Overload THEN Forward := FALSE; ELSIF Start THEN Forward := TRUE; END_IF;\nReverse := FALSE;') },
  ] },
  'pedestrian-crossing-states': { wrong: [
    { intent: 'goes red with WALK at once: no yellow, no red clearance', source: program('PedestrianCrossing', crossingDeclarations, 'VehicleRed := PedRequest; VehicleYellow := FALSE; VehicleGreen := NOT PedRequest; PedWalk := PedRequest; PedStop := NOT PedRequest;') },
    { intent: 'shows WALK while the vehicles keep a green light', source: program('PedestrianCrossing', crossingDeclarations, 'VehicleRed := FALSE; VehicleYellow := FALSE; VehicleGreen := TRUE; PedWalk := PedRequest; PedStop := NOT PedRequest;') },
    { intent: 'runs the whole cycle but skips the yellow phase', source: program('PedestrianCrossing', `${crossingDeclarations}\nVAR State : INT := 0; Ticks : INT := 0; END_VAR`, `VehicleRed := FALSE; VehicleYellow := FALSE; VehicleGreen := FALSE; PedWalk := FALSE; PedStop := TRUE;
IF State = 0 THEN VehicleGreen := TRUE; IF PedRequest THEN State := 1; Ticks := 0; END_IF;
ELSIF State = 1 THEN VehicleRed := TRUE; Ticks := Ticks + 1; IF Ticks >= 4 THEN State := 2; Ticks := 0; END_IF;
ELSIF State = 2 THEN VehicleRed := TRUE; PedWalk := TRUE; PedStop := FALSE; Ticks := Ticks + 1; IF Ticks >= 3 THEN State := 3; Ticks := 0; END_IF;
ELSE VehicleRed := TRUE; Ticks := Ticks + 1; IF Ticks >= 2 THEN State := 0; Ticks := 0; END_IF;
END_IF;`) },
  ] },
  'tank-level-fault-reset': { wrong: [
    { intent: 'alarm only mirrors PumpFault: nothing is latched', source: program('TankLevel', tankDeclarations, 'Pump := AutoEnable AND LevelLow AND NOT PumpFault;\nAlarm := PumpFault;') },
    { intent: 'fault clears by itself when the fault input drops, no Reset needed', source: program('TankLevel', `${tankDeclarations}\nVAR PumpOn : BOOL := FALSE; Fault : BOOL := FALSE; END_VAR`, `Fault := EStop OR PumpFault;
IF Fault OR NOT AutoEnable OR LevelHigh THEN PumpOn := FALSE; ELSIF LevelLow THEN PumpOn := TRUE; END_IF;
Pump := PumpOn AND AutoEnable AND NOT Fault;
Alarm := Fault;`) },
    { intent: 'fault latches but Reset never clears it', source: program('TankLevel', `${tankDeclarations}\nVAR PumpOn : BOOL := FALSE; Fault : BOOL := FALSE; END_VAR`, `IF EStop OR PumpFault THEN Fault := TRUE; END_IF;
IF Fault OR NOT AutoEnable OR LevelHigh THEN PumpOn := FALSE; ELSIF LevelLow THEN PumpOn := TRUE; END_IF;
Pump := PumpOn AND AutoEnable AND NOT Fault;
Alarm := Fault;`) },
  ] },
  'conveyor-classification-jam': { wrong: [
    { intent: 'belt runs forever and ignores the jam', source: program('Conveyor', conveyorDeclarations, 'BeltCommand := TRUE; DiverterCommand := FALSE; FaultLamp := FALSE;') },
    { intent: 'jam stops the belt but the fault lamp stays dark', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; Metal : BOOL := FALSE; END_VAR`, `IF JamDetected OR Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
IF PartAtClassifier AND MetalDetected THEN Metal := TRUE; END_IF;
BeltCommand := Requested; DiverterCommand := Requested AND PartAtDiverter AND Metal; FaultLamp := FALSE;
IF PartAtDiverter THEN Metal := FALSE; END_IF;`) },
    { intent: 'classifies and stops on a jam but never fires the diverter', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; END_VAR`, `IF JamDetected OR Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
BeltCommand := Requested; DiverterCommand := FALSE; FaultLamp := JamDetected;`) },
  ] },
  'blinky-ladder-timer-feedback': { referenceSource: 'main.st', alsoGreen: [
    { intent: 'two TON timers, one per half period (OffTimer and OnTimer)', source: program('Blinky', `${blinkyDeclarations}\nVAR OffTimer : TON; OnTimer : TON; State : BOOL := FALSE; END_VAR`, `OffTimer(IN := NOT State, PT := T#500ms);
OnTimer(IN := State, PT := T#500ms);
IF OffTimer.Q THEN State := TRUE; END_IF;
IF OnTimer.Q THEN State := FALSE; END_IF;
LED_Output := State;`) },
    { intent: 'one TON restarted by its own output and a toggled state', source: program('Blinky', `${blinkyDeclarations}\nVAR BlinkTimer : TON; LedState : BOOL := FALSE; END_VAR`, `BlinkTimer(IN := TRUE, PT := T#500ms);
IF BlinkTimer.Q THEN LedState := NOT LedState; BlinkTimer(IN := FALSE, PT := T#500ms); END_IF;
LED_Output := LedState;`) },
    { intent: 'exact 500 ms half period counted in scans', source: program('Blinky', `${blinkyDeclarations}\nVAR Scans : INT := 0; END_VAR`, `Scans := Scans + 1;
IF Scans >= 100 THEN Scans := 0; END_IF;
LED_Output := Scans >= 50;`) },
  ], wrong: [
    { intent: 'LED is always on', source: program('Blinky', blinkyDeclarations, 'LED_Output := TRUE;') },
    { intent: 'LED toggles on every scan: a flicker, not a 500 ms blink', source: program('Blinky', blinkyDeclarations, 'LED_Output := NOT LED_Output;') },
    { intent: 'TON oscillator with a 250 ms half period: twice too fast', source: program('Blinky', `${blinkyDeclarations}\nVAR Timer : TON; State : BOOL := FALSE; END_VAR`, `Timer(IN := TRUE, PT := T#250ms);
IF Timer.Q THEN State := NOT State; Timer(IN := FALSE, PT := T#250ms); END_IF;
LED_Output := State;`) },
    { intent: 'right period but 20 percent duty (100 ms on, 400 ms off)', source: program('Blinky', `${blinkyDeclarations}\nVAR Scans : INT := 0; END_VAR`, `Scans := Scans + 1;
IF Scans >= 50 THEN Scans := 0; END_IF;
LED_Output := Scans < 10;`) },
  ] },
  'motor-plant-feedback': { wrong: [
    { intent: 'command never drops on Stop', source: program('MotorPlant', motorPlantDeclarations, 'IF Start THEN Command := TRUE; END_IF;\nRunning := Command AND AtSpeed;') },
    { intent: 'Running copies the command instead of waiting for AtSpeed', source: program('MotorPlant', motorPlantDeclarations, 'IF Stop THEN Command := FALSE; ELSIF Start THEN Command := TRUE; END_IF;\nRunning := Command;') },
    { intent: 'Running follows AtSpeed alone and ignores the command', source: program('MotorPlant', motorPlantDeclarations, 'IF Stop THEN Command := FALSE; ELSIF Start THEN Command := TRUE; END_IF;\nRunning := AtSpeed;') },
  ] },
  'edge-counter-pulses': { alsoGreen: [
    { intent: 'CTU alone: it edge-detects CU by itself', source: program('EdgeCounter', `${edgeCounterDeclarations}\nVAR Count : CTU; END_VAR`, 'Count(CU := PulseInput, R := Reset, PV := 3);\nCountReached := Count.Q;') },
    { intent: 'R_TRIG in front of CTU (the form the reference used to teach)', source: program('EdgeCounter', `${edgeCounterDeclarations}\nVAR Edge : R_TRIG; Count : CTU; END_VAR`, 'Edge(CLK := PulseInput);\nCount(CU := Edge.Q, R := Reset, PV := 3);\nCountReached := Count.Q;') },
  ], wrong: [
    { intent: 'output simply follows the pulse input', source: program('EdgeCounter', edgeCounterDeclarations, 'CountReached := PulseInput;') },
    { intent: 'counts to 2 instead of 3', source: program('EdgeCounter', `${edgeCounterDeclarations}\nVAR Count : CTU; END_VAR`, 'Count(CU := PulseInput, R := Reset, PV := 2);\nCountReached := Count.Q;') },
    { intent: 'counts to 4 instead of 3', source: program('EdgeCounter', `${edgeCounterDeclarations}\nVAR Count : CTU; END_VAR`, 'Count(CU := PulseInput, R := Reset, PV := 4);\nCountReached := Count.Q;') },
    { intent: 'Reset is never wired to the counter', source: program('EdgeCounter', `${edgeCounterDeclarations}\nVAR Count : CTU; END_VAR`, 'Count(CU := PulseInput, R := FALSE, PV := 3);\nCountReached := Count.Q;') },
  ] },
  'scan-cycle-one-scan-memory': { wrong: [
    { intent: 'no memory: Delayed stays off and the pulse follows the button', source: program('ScanSnapshot', scanDeclarations, 'Current := Button; Delayed := FALSE; RisingPulse := Button;') },
    { intent: 'updates Previous before reading it, so the edge detector never fires', source: program('ScanSnapshot', `${scanDeclarations}\nVAR Previous : BOOL := FALSE; END_VAR`, 'Previous := Button;\nCurrent := Button; Delayed := Previous; RisingPulse := Current AND NOT Delayed;') },
  ] },
  'temporal-assertions-jam-fault': { wrong: [
    { intent: 'fault is not latched: lamp and belt follow the jam input', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; END_VAR`, `IF JamDetected OR Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
BeltCommand := Requested; DiverterCommand := FALSE; FaultLamp := JamDetected;`) },
    { intent: 'Reset clears the fault even while the jam is still present', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; Faulted : BOOL := FALSE; END_VAR`, `IF JamDetected THEN Faulted := TRUE; Requested := FALSE; ELSIF Stop THEN Requested := FALSE; ELSIF Start AND NOT Faulted THEN Requested := TRUE; END_IF;
IF Reset THEN Faulted := FALSE; END_IF;
BeltCommand := Requested AND NOT Faulted; DiverterCommand := FALSE; FaultLamp := Faulted;`) },
    { intent: 'belt restarts by itself when Reset releases the fault', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; Faulted : BOOL := FALSE; END_VAR`, `IF JamDetected THEN Faulted := TRUE; ELSIF Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
IF Reset AND NOT JamDetected THEN Faulted := FALSE; END_IF;
BeltCommand := Requested AND NOT Faulted; DiverterCommand := FALSE; FaultLamp := Faulted OR JamDetected;`) },
  ] },
  'conveyor-two-parts-diagnosis': { wrong: [
    { intent: 'belt follows Start directly and the diverter follows the diverter sensor', source: program('Conveyor', conveyorDeclarations, 'BeltCommand := Start; DiverterCommand := PartAtDiverter; FaultLamp := JamDetected;') },
    { intent: 'diverts every part, metal or not', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; END_VAR`, `IF Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
BeltCommand := Requested; DiverterCommand := Requested AND PartAtDiverter; FaultLamp := JamDetected;`) },
    { intent: 'metal flag is never cleared at the diverter, so the second part is diverted too', source: program('Conveyor', `${conveyorDeclarations}\nVAR Requested : BOOL := FALSE; Metal : BOOL := FALSE; END_VAR`, `IF Stop THEN Requested := FALSE; ELSIF Start THEN Requested := TRUE; END_IF;
IF PartAtClassifier AND MetalDetected THEN Metal := TRUE; END_IF;
BeltCommand := Requested; DiverterCommand := Requested AND PartAtDiverter AND Metal; FaultLamp := JamDetected;`) },
  ] },
};
