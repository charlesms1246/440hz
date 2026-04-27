# 440hz Training Executor

The compute backbone of 440hz: a modular, RLAIF-capable training runtime that runs
inside 0G Compute (TEE/CVM) or on enterprise edge hardware.

## What this is

0G's native fine-tuning service is supervised-only with a fixed config schema. 440hz fills
the RL gap: it runs **arbitrary Gymnasium environments** with **arbitrary base models** and
uses an **arbitrary supervisor LLM** as the reward signal — composed at task-creation time,
not baked into the image.

## Architecture

```
                         ┌────────────────────────────────────────────────┐
                         │  440hz Aggregator (Flower server, own TEE)     │
                         │  • Custom LoRAFedAvg strategy                  │
                         │  • Weighted per-tensor averaging               │
                         │  • Uploads global adapter to 0G Storage        │
                         └────────────────────────────────────────────────┘
                                  ↑↑↑   gRPC submissions from N executors
                       ┌──────────┘ │ └──────────┐
┌──────────────────────┴┐  ┌────────┴───────────┐│ ┌──────────────────────┐
│  0G Compute Provider  │  │ 0G Compute Provider│└→│ 0G Compute Provider  │
│  ┌──────────────────┐ │  │ ┌────────────────┐ │  │ ┌──────────────────┐ │
│  │ 440hz Executor   │ │  │ │ 440hz Executor │ │  │ │ 440hz Executor   │ │
│  │ • orchestrator   │ │  │ │   ...          │ │  │ │   ...            │ │
│  │ • base model +   │ │  │ │                │ │  │ │                  │ │
│  │   QLoRA adapter  │ │  │ │                │ │  │ │                  │ │
│  │ • RLAIF loop     │ │  │ │                │ │  │ │                  │ │
│  │ ┌──────────────┐ │ │  │ │                │ │  │ │                  │ │
│  │ │ Inner Gym    │ │ │  │ │                │ │  │ │                  │ │
│  │ │ container    │ │ │  │ │                │ │  │ │                  │ │
│  │ └──────────────┘ │ │  │ │                │ │  │ │                  │ │
│  └──────────────────┘ │  │ └────────────────┘ │  │ └──────────────────┘ │
└───────────────────────┘  └────────────────────┘  └──────────────────────┘
                ↓                                              ↓
                └─────── 0G Inference (supervisor LLM) ────────┘
```

When `federation.enabled = false`, the executor uploads its trained adapter
directly to 0G Storage. When enabled, it submits to an aggregator instead, and
the aggregator handles the upload of the FedAvg-merged global adapter.

## Layout

```
440hz-executor/
├── executor/          The outer training image — this is what runs on 0G compute
├── aggregator/        Flower server image — runs federated LoRA averaging
├── gym_sdk/           Library that Gym authors use to wrap their environments
├── examples/          Reference Gyms (SQL debugging, etc.)
├── configs/           Example task.json and round.json files
├── tests/             Unit tests (esp. the aggregation arithmetic)
└── scripts/           Local dev helpers
```

## Quick local run

### Single-node (no federation)

```bash
./scripts/build-images.sh
./scripts/local-test.sh                       # uses configs/task.example.json
```

### Federated 3-node demo

```bash
./scripts/build-images.sh
./scripts/federated-demo.sh
```

This brings up one aggregator and three executors. Each executor runs the same
RLAIF training task locally, then connects to the aggregator as a Flower client
and submits its LoRA adapter. The aggregator does weighted FedAvg across the
three submissions and writes the global adapter to a shared volume.

## Key design decisions

1. **DinD for Gym isolation.** Gyms are user code. They run in a nested container,
   pulled by content hash, and torn down after the task. Host runtime is swappable
   between Docker, Podman-rootless, and Sysbox.

2. **GRPO as default RL algorithm.** No critic, group-relative advantages map naturally
   onto RLAIF (sample N, score N, normalize). PPO/DPO are also wired in.

3. **Supervisor over 0G inference.** RLAIF reward comes from a TEE-attested 0G inference
   endpoint by default. Self-hosted supervisor is supported via the same OpenAI-compatible
   interface.

4. **Modularity through `task.json`.** A single executor image can train any
   (base_model × gym × supervisor × algorithm) combination. No image rebuilds per task.

5. **Attestation surface.** Outer image hash + Gym image hash + base model root hash +
   `task.json` hash all get bundled into the TEE quote that's posted on 0G Chain at
   settlement.
