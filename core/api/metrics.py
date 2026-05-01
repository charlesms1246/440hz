"""
System resource metrics: GPU/VRAM via nvidia-smi, CPU/RAM via psutil.
Gracefully returns zeros when no GPU is available (dev machines, CI).
"""
from __future__ import annotations

import asyncio
import logging

import psutil

from .models import SystemMetrics

log = logging.getLogger("440hz.api.metrics")


async def get_system_metrics() -> SystemMetrics:
    cpu_pct = psutil.cpu_percent(interval=None)
    vm = psutil.virtual_memory()
    mem_used_gb = (vm.total - vm.available) / 1024**3
    mem_total_gb = vm.total / 1024**3

    gpu_pct, vram_used_mb, vram_total_mb = await _query_nvidia_smi()

    return SystemMetrics(
        gpu_pct=gpu_pct,
        vram_used_mb=vram_used_mb,
        vram_total_mb=vram_total_mb,
        cpu_pct=cpu_pct,
        mem_used_gb=round(mem_used_gb, 2),
        mem_total_gb=round(mem_total_gb, 2),
    )


async def _query_nvidia_smi() -> tuple[float, float, float]:
    """Return (gpu_utilization_pct, vram_used_mb, vram_total_mb) from GPU 0."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            "--query-gpu=utilization.gpu,memory.used,memory.total",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
        line = stdout.decode().strip().splitlines()[0]
        parts = [p.strip() for p in line.split(",")]
        return float(parts[0]), float(parts[1]), float(parts[2])
    except (FileNotFoundError, IndexError, ValueError, asyncio.TimeoutError):
        return 0.0, 0.0, 0.0
    except Exception as exc:
        log.debug("nvidia-smi query failed: %s", exc)
        return 0.0, 0.0, 0.0
