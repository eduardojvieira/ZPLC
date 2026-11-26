# The bar (BAR-001)

**Written by**: the reviewer (S-19, D-29). **The run reads this file and no reference** (BAR-003).

**State**: first pass, **AI part only**, 2026-11-26. The parts for the plant view, teaching and the programming environment follow; the second pass (first use, documentation, installers, free project) comes at the freeze.

**How it was read, and what that allows**: public material only, on 2026-11-26: product pages, help pages, one data sheet and the public pages of two open projects, through search extracts. No product was installed or used and no screen was looked at. So a criterion says what a product states that it does, not how well it does it. No text, name of a part, image or layout of a reference is in this file beyond its own name in the table below (BAR-004).

## 1. References (BAR-003)

| Ref | What | Class | What was read |
|---|---|---|---|
| R1 | The engineering assistant of TIA Portal (Siemens) | proprietary, public material | Product pages and one press release |
| R2 | TwinCAT CoAgent (Beckhoff) | proprietary, public material | Product page |
| R3 | CODESYS Development System MCP Server and the help chatbot | proprietary, public material | Product pages, the data sheet, the release page |
| R4 | FactoryTalk Design Studio Copilot (Rockwell Automation) | proprietary, public material | Help pages and the product page |
| R5 | TcKit, an MCP server for TwinCAT 3 projects | open project; its licence was not read, so nothing of it may be reused | Its public package page |
| R6 | SemaPLC, an agent-driven editor on an open runtime | open project, MIT by its own page; nothing of it was copied | Its public README |
| R7 | The Model Context Protocol | open standard | As R2, R3 and R5 state they use it |

## 2. Criteria: AI

Each criterion is in ZPLC's terms and rests on two references or on a requirement (BAR-002).

| Id | Level | Criterion | Rests on | ZPLC |
|---|---|---|---|---|
| AI-1 | must | The assistant and an agent work from the real project: its files, its tasks, its diagnostics and, in ZPLC, its plant and its lesson. A person does not paste the project into a chat. | R1, R3, R4, R5 | AIX-001, AIX-002 |
| AI-2 | must | A program is written or changed from a description, in the languages of the tool, and the compiler checks it before it is offered or stored. | R1, R3, R5, R6 | AIX-011, IDE-030 |
| AI-3 | must | It explains: a program, a failing build, a failing test, in the person's language and naming the place. | R1, R3, R4 | AIX-003, AIX-004 |
| AI-4 | must | A person stays in control of every change: they approve it before it takes effect, or they see what changed and can put it back. | R2, R4 | IDE-030, AIX-012 |
| AI-5 | must | A test can be made and run, and a failure points to a place in the program. | R1, R5, R6 | AIX-014, AIX-015 |
| AI-6 | must | An agent connects through an open protocol with a general client, with no integration made for one vendor. | R2, R3, R5, R7 | AIX-007, AIX-008, D-35 |
| AI-7 | must | The person chooses the model, and a model that runs on their own computer is one of the choices. | R2, R3 | AIX-006 |
| AI-8 | must | The pages say what is sent to a model and what is kept, field by field. | R4, and the requirement | AIX-010, `docs/docs/ide/ai-privacy.md` |
| AI-9 | must | The limits are said where a person meets them: what AI never does, and that an answer can be wrong. | R4, R2 | AIX-010, rule 8 |
| AI-10 | should | Answers are sized for an agent: it asks for the part it needs and gets no whole-file dump it did not ask for. | R3, R5 | AIX-015 |
| AI-11 | should | The product's own documentation is at hand to the assistant, so a "how do I" question is answered from it. | R1, R2, R3, R4 | Part only: the format resources and the lesson context |
| AI-12 | must | The graphical languages are written by an agent too, not only text. | Requirement (S-20) | AIX-011, AIX-013, LNG-029, LNG-030 |
| AI-13 | must | An agent debugs in a simulation of its own: inputs, steps, breakpoints, values. | Requirement (S-20) | AIX-014 |
| AI-14 | must | In a lesson the help is a hint first, and a hidden solution stays hidden. | Requirement (D-32) | AIX-002, AIX-005 |

## 3. Where ZPLC 2.1 stands apart

- **Beyond what the references state**: an agent that debugs in a private simulation with breakpoints in five languages, the plant facts in the answers, the stance of a lesson, and a physical boundary pinned by tests. These rest on requirements (AI-12 to AI-14), not on references.
- **Behind, by decision**: an assistant inside the tool that carries out several steps by itself, which R1, R2 and R4 state. D-31 leaves that to 2.2. The agent path of 2.1 has the same shape as R3 and R5: a server in the tool and a client outside it. This is a known limit for the page of PUB-002, not a finding.

## 4. The plan of AIX-011 to AIX-015 read against this part (2026-11-26)

Read: `plan-aix.md` at `62d8d25a`, with the six corrections of the review of 2026-11-26 applied.

- **Met by the plan**: AI-1, AI-2, AI-3, AI-5, AI-6, AI-7, AI-8, AI-9, AI-10, AI-12, AI-13, AI-14.
- **One finding, AI-4 on the MCP path**: a write by an agent replaces a file on disk. Before it, the control is the client's own question, which the plan now invites by declaring the tool destructive. After it, Studio shows a notice with the name of the file and nothing more when the file had no unsaved change: the person cannot see what changed nor put it back. For a file that was open in an editor, the notice of AIX-U7 MUST offer what changed, with the same renderer the conflict prompt uses, and a way to restore what Studio held. For a file that was not open it SHOULD.
- **One should not covered, AI-11**: the assistant does not read the documentation. Not a finding in 2.1.
