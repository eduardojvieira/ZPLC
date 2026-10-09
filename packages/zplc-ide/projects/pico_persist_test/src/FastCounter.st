(*
 * FastCounter - the fast task of the two-task smoke test.
 *
 * Runs in FastCounter (every 10 ms, priority 0 = highest, see zplc.json) and adds 1 to Counter on every scan. Nothing
 * reads Counter: it exists so that you can watch it climb in the Studio debugger, at about 100 per second, as proof that
 * the fast task is being scheduled next to the slow one. It is not retained: Counter starts from 0 on every start.
 *
 * DINT overflows after about 248 days at this rate.
 *)

PROGRAM FastCounter

VAR
    Counter : DINT := 0;
END_VAR

Counter := Counter + 1;

END_PROGRAM
