# Overview in pictures

The decided structure so far, drawn. Terms are defined in the [glossary](../GLOSSARY.md); reasons are in the [ADRs](adr/).

## The dev map

Where OwnStudio's development stands: the [dev map](https://github.com/luizvilla/Theia/issues/17) (round 26), drawn from the tracker by [tools/devmap](../tools/devmap/README.md) into the map issue and here.

<!-- devmap:diagram:start -->
```mermaid
flowchart LR
  classDef done fill:#d3f9d8,stroke:#2b8a3e,color:#1b4332
  classDef open fill:#d0ebff,stroke:#1c7ed6,color:#0b3d6e
  classDef blocked fill:#ffe8cc,stroke:#e8590c,color:#5c2b00
  classDef wip fill:#f3d9fa,stroke:#ae3ec9,color:#4a1259
  classDef stale fill:#ffe3e3,stroke:#e03131,color:#5c0a0a,stroke-width:3px
  classDef fog fill:#f1f3f5,stroke:#868e96,color:#495057,stroke-dasharray:5 5
  classDef dest fill:#343a40,stroke:#000,color:#fff,font-weight:bold

  DEST(["🎯 OwnStudio 2.0 built through slice 5,<br/>accepted on the bench, PhD trial run"]):::dest

  subgraph Before["Done before the map"]
    D1["✓ Steps 1–4<br/>OwnStudio 1.0"]:::done
    D2["✓ Slice 0 · paper<br/>SPEC 2.0, ADRs, storyboards"]:::done
    D3["✓ Slice 1 · U1–U19"]:::done
    D4["✓ Fixes F1–F20<br/>after the 11-19 trial"]:::done
  end

  subgraph Upkeep["Map upkeep"]
    N18["✓ #18 Dev map tooling"]:::done
    N44["#44 Move plan.md status<br/>onto the map"]:::open
    N45["#45 Back-fill done units<br/>(after slice 5)"]:::open
  end

  subgraph Skills["Dev skills"]
    N22["✓ #22 Dev skills<br/>inventory"]:::done
    N27["👤 #27 Choose which<br/>dev skills to write"]:::open
    FS["dev skill builds"]:::fog
  end

  subgraph S1["Milestone A · slice 1 accepted"]
    N19["🔨👤 #19 F20 checked<br/>on the bench"]:::open
    N20["✓ #20 F14 leftovers"]:::done
    N50["✓ #50 Cancelled token<br/>thrown on restore"]:::done
    N21["✓ #21 Agent SDK<br/>licence"]:::done
    N23["👤 #23 Power and<br/>agent shells"]:::open
    N24["👤 #24 Pulsim<br/>exact-edges fix"]:::open
    N46["✓ #46 Agent extensions<br/>installed by users"]:::done
    N25["✓ #25 Slice 1 rulings"]:::done
    N47["✓ #47 Agents installed<br/>on first use"]:::done
    N49["👤 #49 Signing in<br/>without a terminal"]:::open
    N26["👤 #26 Slice 1 retest:<br/>nine steps"]:::blocked
  end

  subgraph Spec["Slices 2–4"]
    N28["👤 #28 Specify slice 2"]:::blocked
    N48["🔨 #48 Extensions view<br/>on Open VSX"]:::blocked
    N29["👤 #29 Specify slice 3"]:::blocked
    N30["👤 #30 Specify slice 4"]:::blocked
    F2["slice 2 build units"]:::fog
    F3["slice 3 build units"]:::fog
    F4["slice 4 build units"]:::fog
  end

  subgraph S5["Slice 5 · timing on the Spin"]
    N31["🔨 #31 T1 Spin API probes"]:::blocked
    N32["🔨 #32 T2 Timing check"]:::blocked
    N33_38["🔨 #33–#38 T3–T8<br/>gauge, tab, CodeLens,<br/>dots, restore, agent recipe"]:::blocked
    N39["🔨 #39 Examples<br/>on ThingSet"]:::blocked
    N40["👤 #40 Slice 5 accepted<br/>on the bench"]:::blocked
  end

  subgraph Trial["PhD trial"]
    N41["👤 #41 Bench accuracy<br/>before students"]:::blocked
    N42["👤 #42 Trial protocol"]:::blocked
    N43["👤 #43 Tutorial on 2.0"]:::blocked
    FT["trial build work"]:::fog
  end

  N18 --> N44
  N22 --> N27
  N19 --> N26
  N20 --> N26
  N21 --> N25
  N23 --> N26
  N24 --> N26
  N46 --> N25
  N25 --> N47
  N47 --> N49
  N47 --> N26
  N26 --> N28
  N28 --> N48
  N28 --> N29
  N29 --> N30
  N30 --> N31
  N30 --> N39
  N31 --> N32
  N32 --> N33_38
  N33_38 --> N40
  N39 --> N40
  N40 --> N41
  N40 --> N42
  N40 --> N43
  D4 --> N19
  D4 --> N20
  N27 -.-> FS
  N46 -.-> N23
  N46 -.-> N28
  N28 -.-> F2
  N29 -.-> F3
  N30 -.-> F4
  F3 -.-> N31
  N41 -.-> FT
  N42 -.-> FT
  N43 -.-> FT
  N40 --> DEST
  FT -.-> DEST
```

<sub>Green done · blue takeable · purple in progress · orange blocked · red ⏳ stale (3 days without activity) · grey dashed fog · 🔨 build · 🔎 research · 👤 can't move without Luiz.</sub>
<!-- devmap:diagram:end -->

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
