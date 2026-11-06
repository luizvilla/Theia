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

## The five converter blocks and the environment

Boundaries as decided in round 2 (see the [glossary](../GLOSSARY.md) and Luiz's [reference drawing](images/five-blocks-reference.png)). Thick arrows carry energy, thin arrows carry signals, dotted arrows are auxiliary supply.

```mermaid
flowchart LR
  subgraph ENV1["Environment"]
    SRC["supply / battery / grid<br/>(or its model)"]
  end
  subgraph CONV["Converter"]
    subgraph PWR["Power side · power ground"]
      P["Power<br/>switches, filters, fuses/relays/PTCs,<br/>connectors, thermal, hot side of sensors"]
    end
    subgraph BR["Bridge blocks · an isolation barrier can only cross here"]
      M["Measurement<br/>conditioning, amplification<br/>up to the controller pin"]
      D["Driver<br/>PWM to gate, bootstrap or not,<br/>switch-dependent"]
      A["Auxiliary power supply (feeder)<br/>auto-start, filtering, protection"]
    end
    subgraph DIG["Controller side · digital ground"]
      C["Controller<br/>MCU, ADCs, comms, PWM,<br/>relay and trip commands"]
    end
  end
  subgraph ENV2["Environment"]
    LOAD["load / battery / grid<br/>(or its model)"]
    EXT["outside world<br/>(PC, instruments, networks)"]
  end
  SRC <==>|"power port"| P <==>|"power port"| LOAD
  P -- signals --> M --> C -- PWM --> D -- gate --> P
  C <-- data --> EXT
  P ==> A
  A -.-> M
  A -.-> C
  A -.-> D
```

The isolation barrier is not drawn as a line: it is recorded as whether each bridge block is isolated, and with which insulation class. Power ports carry energy in either direction; their voltage side (high or low) is a property, not a name. On the Twist the ports are HIGH, LOW1 and LOW2.
