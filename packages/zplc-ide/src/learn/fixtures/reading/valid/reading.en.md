## A first page

The scenario has {{assertions}} assertions and the lamp changes at {{t:500}} ms. Open src/FirstBlink.st first.

- one
  - nested
- two

| In | Out |
|:--|--:|
| a | b |

> [!NOTE]
> A note with `code 250 ms` inline.

![The panel](images/panel.svg)

![A dot](images/dot.png)

```ld-figure
src: reading/fig.ld.json
rung: 1
caption: The seal-in rung
```

```ld-try
src: reading/try.ld.json
inputs:
  - { name: Ack, kind: push }
outputs: [SetFirst]
timing: [Ack, SetFirst]
caption: Press the button
```

```timing
span: 1600
signals:
  - { name: Ack, edges: [500, 1000] }
marks:
  - { from: 500, to: 1000, label: PT }
caption: A timing diagram
```

```quiz
question: What is read at rest?
options:
  - { text: 'TRUE', correct: true, feedback: Yes, it conducts. }
  - { text: 'FALSE', feedback: No, it does not. }
```
