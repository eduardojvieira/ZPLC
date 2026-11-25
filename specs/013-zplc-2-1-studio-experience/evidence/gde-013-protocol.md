# GDE-013 first-use sessions: protocol

The sessions are run by the owner. This file holds no personal data.

Requirement (spec.md, GDE-013): at least three people who have not used Studio each do the first lesson and the first blink while being observed. Record the time to the first blink and each place they stopped as manual evidence. Results go in [gde-013-sessions.md](./gde-013-sessions.md).

## Who

Three people who have never used Studio. Call them P1, P2, P3. No names, initials, e-mail or photos go in the repository, only the code.

## Before each session

1. Write down the build id (the version shown in the application, or the installer file name) and the platform (OS and version).
2. Use a clean install and a fresh user profile: no earlier projects, no saved Learn progress.
3. Ask the person to pick the language of the application, English or Spanish. Record it.
4. Get written consent before anything is recorded (see Recording a session). Without it, take paper notes only.
5. Close everything except Studio. The observer sits beside the person, with a clock.

## Script, read aloud

English: "We are testing the software, not you. Please think aloud: say what you expect and what surprises you. I cannot help or answer questions about how to use it. If you are stuck, do what you would normally do. You can stop at any time."

Spanish: "Estamos probando el programa, no a ti. Por favor piensa en voz alta: di lo que esperas y lo que te sorprende. No puedo ayudarte ni responder preguntas sobre cómo usarlo. Si te atascas, haz lo que harías normalmente. Puedes parar cuando quieras."

## The two tasks

Start the clock when the person is on the Welcome screen. Give the task as one sentence, in their language, and nothing more. Do task L first for every person, then task B. The person gets the application only, not the docs page.

| Task | Say                                                                        | Start point (docs)                                                                                                                                                                              | Done when                                                     |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| L    | "Do the first lesson of the course." / "Haz la primera lección del curso." | Welcome screen, **Learn**, **Start the course**, then **Check** until the lesson passes: `docs/docs/learn/index.md`, section "Take the course"                                                 | **Check** reports every assertion passed                      |
| B    | "Make a program blink." / "Haz que un programa parpadee."                  | Welcome screen, **Examples**, group **Language tour**, **Blinky (structured text)**, then Build, Run, Watch `LED_Output`: `docs/docs/getting-started/index.md`, section "Run your first program" | `LED_Output` is seen changing between true and false in Watch |

Stop rule: 20 minutes per task. At 20 minutes the observer may end the task and records "not finished".

## What the observer writes

- Time to the outcome, from the start of the task to the done condition (mm:ss).
- Each place the person stopped (screen or control, and what they did next: waited, searched, opened something, gave up).
- Each thing said aloud, word for word when possible, in the language spoken. No names.
- Anything the person did that the observer did not expect.

## What the observer does not do

- Point at the screen.
- Hint, answer questions about the application, or react to a right or wrong move.
- Touch the keyboard or the mouse.

If the person asks, answer: "what would you do if I were not here?".

## Recording a session

- One row per person per task in [gde-013-sessions.md](./gde-013-sessions.md), filled right after the session from the paper notes.
- No video, audio or screen recording of a person without their written consent. Keep any consent form outside the repository.
- No personal data in the repository: no names, e-mail, faces or recordings.

## Status

GDE-013 stays pending until three people have done both tasks. If the sessions are not held, the SHOULD is recorded as not met with the reason (spec section 8.2, item 8).
