"""
440hz Provider API Daemon — FastAPI application.

Exposes the compute provider's HTTP interface to the web console and to the
0G network. The web console's Compute page connects here for real-time metrics,
log streaming, and task management.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import task_manager, provider
from .metrics import get_system_metrics
from .models import ProviderInfo, QuoteResponse, SystemMetrics, TaskStatus, TaskSubmitRequest, ZGTask

log = logging.getLogger("440hz.api")

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://localhost:3000")


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    task_manager.init_queues()
    task_manager.load_persisted_tasks()
    log.info("440hz provider daemon started")
    yield
    log.info("440hz provider daemon shutting down")


app = FastAPI(title="440hz Provider API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Root — browser-friendly info (fixes 404 on port click in Portainer/Docker)
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    info = await provider.get_provider_info()
    return {
        "service": "440hz Provider API",
        "version": "0.1.0",
        "status": "online",
        "provider_address": info.address,
        "endpoint": info.endpoint,
        "registered": info.registered,
        "models": info.models,
        "docs": "/docs",
        "health": "/health",
        "tasks": "/tasks",
        "metrics": "/metrics",
        "zg_quote": "/v1/quote",
        "zg_fine_tuning": "/v1/fine-tuning/service",
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "ts": time.time()}


# ---------------------------------------------------------------------------
# Provider registration
# ---------------------------------------------------------------------------

@app.get("/provider/info", response_model=ProviderInfo)
async def get_provider_info():
    return await provider.get_provider_info()


@app.post("/provider/register")
async def register_provider():
    try:
        result = await provider.register_provider()
        return result
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (RuntimeError, TimeoutError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Task management
# ---------------------------------------------------------------------------

@app.post("/tasks", response_model=TaskStatus, status_code=201)
async def submit_task(req: TaskSubmitRequest):
    status = await task_manager.submit_task(req)
    return status


@app.get("/tasks", response_model=list[TaskStatus])
async def list_tasks():
    return task_manager.list_tasks()


@app.get("/tasks/{task_id}", response_model=TaskStatus)
async def get_task(task_id: str):
    ts = task_manager.get_task(task_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return ts


@app.post("/tasks/{task_id}/merge")
async def start_merge(task_id: str):
    try:
        return await task_manager.merge_task(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/tasks/{task_id}/merge/logs")
async def stream_merge_logs(task_id: str):
    ts = task_manager.get_task(task_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Task not found")

    async def _generate() -> AsyncIterator[str]:
        async for entry in task_manager.stream_merge_logs(task_id):
            payload = json.dumps(entry.model_dump())
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    ok = await task_manager.cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Task cannot be cancelled (not running or not found)")
    return {"cancelled": True, "task_id": task_id}


# ---------------------------------------------------------------------------
# SSE: task log stream
# ---------------------------------------------------------------------------

@app.get("/tasks/{task_id}/logs")
async def stream_task_logs(task_id: str):
    ts = task_manager.get_task(task_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Task not found")

    async def _generate() -> AsyncIterator[str]:
        async for entry in task_manager.stream_task_logs(task_id):
            payload = json.dumps(entry.model_dump())
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# SSE: global DA checkpoint stream (all tasks)
# ---------------------------------------------------------------------------

@app.get("/da/stream")
async def stream_da_events():
    async def _generate() -> AsyncIterator[str]:
        async for entry in task_manager.stream_da_events():
            payload = json.dumps(entry.model_dump())
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# System metrics (polled by web console every 2s)
# ---------------------------------------------------------------------------

@app.get("/metrics", response_model=SystemMetrics)
async def get_metrics():
    return await get_system_metrics()


# ---------------------------------------------------------------------------
# 0G fine-tuning provider protocol
# Routes called by the 0G SDK / CLI when consumers submit fine-tuning jobs.
# Spec: @0glabs/0g-serving-broker provider/provider.ts
# ---------------------------------------------------------------------------

@app.get("/v1/quote", response_model=QuoteResponse)
async def zg_quote():
    """
    TEE attestation endpoint required by the 0G protocol.
    Non-TEE providers return "0x" as the quote.
    """
    info = await provider.get_provider_info()
    return QuoteResponse(
        quote="0x",
        provider_signer=info.address,
    )


@app.post("/v1/fine-tuning/service", response_model=ZGTask, status_code=201)
async def zg_create_task(zg_task: ZGTask):
    """
    Accept a fine-tuning task from the 0G SDK.
    Translates ZGTask → internal TaskSubmitRequest and enqueues the job.
    """
    try:
        result, _ = await task_manager.submit_zg_task(zg_task)
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/v1/fine-tuning/service", response_model=list[ZGTask])
async def zg_list_tasks():
    """List all tasks in 0G ZGTask format."""
    tasks = task_manager.list_tasks()
    results = []
    for ts in tasks:
        zt = task_manager.get_zg_task(ts.id)
        if zt:
            results.append(zt)
    return results


@app.get("/v1/fine-tuning/service/{task_id}", response_model=ZGTask)
async def zg_get_task(task_id: str):
    """Get a specific task by ID in 0G ZGTask format."""
    zt = task_manager.get_zg_task(task_id)
    if zt is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return zt


@app.get("/v1/fine-tuning/service/{task_id}/log")
async def zg_get_task_log(task_id: str, lines: int = 200):
    """
    Return task training logs as plain text.
    Called by: 0g-compute-cli fine-tuning get-log --provider <addr> --task <id>
    """
    ts = task_manager.get_task(task_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Task not found")
    log_lines = task_manager.get_zg_task_logs(task_id, max_lines=lines)
    return JSONResponse(content={"taskId": task_id, "log": "\n".join(log_lines)})


@app.post("/v1/fine-tuning/service/{task_id}/acknowledge")
async def zg_acknowledge_delivery(task_id: str, request: Request):
    """
    Consumer acknowledges model download completion.
    Called by: 0g-compute-cli fine-tuning acknowledge-model
    After this the task transitions to Finished on the consumer side.
    """
    ts = task_manager.get_task(task_id)
    if ts is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if ts.state not in ("completed", "failed"):
        raise HTTPException(status_code=400, detail=f"Task is not yet complete (state={ts.state})")
    zt = task_manager.get_zg_task(task_id)
    return {"taskId": task_id, "acknowledged": True, "deliverIndex": zt.deliverIndex if zt else None}


# ---------------------------------------------------------------------------
# Dev entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8420")),
        reload=os.environ.get("DEV", "") == "1",
    )
