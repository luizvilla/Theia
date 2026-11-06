# Overview in pictures

The decided structure so far, drawn. Terms are defined in the [glossary](../GLOSSARY.md); reasons are in the [ADRs](adr/).

## Three workbenches, one converter project

Like the pages of a video editor that all edit one timeline, the three workbenches are views of the same converter project ([ADR 0002](adr/0002-one-shared-converter-project.md)).

```mermaid
flowchart TB
  CP[("Converter project<br/>requirements · blocks · plant model ·<br/>control code · test procedures · test records")]
  D["Design<br/>requirements, estimation,<br/>control design<br/>(no firmware runs)"]
  C["Code<br/>firmware for the control block<br/>(C++, AI-assisted)"]
  L["Lab<br/>test procedures run the firmware<br/>on a target, file test records<br/>(Python, AI-assisted)"]
  D <--> CP
  C <--> CP
  L <--> CP
  D -- "requirements become pass criteria" --> L
  L -- "measurements return to design" --> D
```

## Simulation is a target

The Lab runs the same test procedure against different targets ([ADR 0003](adr/0003-simulation-is-a-target-not-a-workbench.md)).

```mermaid
flowchart LR
  TP["Test procedure"] --> SW{Target}
  SW -- simulator --> S["Pulsim: plant model +<br/>firmware block (controlStep)"]
  SW -- board --> B["Spin + Twist on the bench<br/>+ instruments"]
  S --> TR["Test record"]
  B --> TR
  TR --> CMP["Requirement vs simulation vs measurement"]
```

## The five converter blocks

As stated in round 1. Block boundaries are still being questioned (round 2).

```mermaid
flowchart LR
  P[Power] -- "currents, voltages" --> M[Measurement]
  M -- "conditioned signals" --> C[Control]
  C -- PWM --> D[Driver]
  D -- "gate commands" --> P
  F[Feeder] -. "auxiliary energy" .-> M
  F -. "auxiliary energy" .-> C
  F -. "auxiliary energy" .-> D
```
