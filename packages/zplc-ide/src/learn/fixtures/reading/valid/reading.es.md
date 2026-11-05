## Una primera página

El escenario tiene {{assertions}} aserciones y la lámpara cambia a los {{t:500}} ms. Abra primero src/FirstBlink.st.

- uno
  - anidado
- dos

| In | Out |
|:--|--:|
| a | b |

> [!NOTE]
> Una nota con `code 250 ms` inline.

![El tablero](images/panel.svg)

![Un punto](images/dot.png)

```ld-figure
src: reading/fig.ld.json
rung: 1
caption: El renglón de enclavamiento
```

```ld-try
src: reading/try.ld.json
inputs:
  - { name: Ack, kind: push }
outputs: [SetFirst]
timing: [Ack, SetFirst]
caption: Apriete el botón
```

```timing
span: 1600
signals:
  - { name: Ack, edges: [500, 1000] }
marks:
  - { from: 500, to: 1000, label: PT }
caption: Un diagrama de tiempos
```

```quiz
question: ¿Qué se lee en reposo?
options:
  - { text: 'TRUE', correct: true, feedback: Sí, conduce. }
  - { text: 'FALSE', feedback: No, no conduce. }
```
