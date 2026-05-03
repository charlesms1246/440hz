"use client";

import dynamic from "next/dynamic";
import { Suspense, useState, useEffect, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { Sidebar } from "@nodeui/components/Sidebar";
import { Canvas } from "@nodeui/components/Canvas";
import { PropertiesPanel } from "@nodeui/components/PropertiesPanel";
import { ChatPanel, type ChatMessage } from "@nodeui/components/ChatPanel";
import { useGraphStore } from "@nodeui/store/graphStore";
import type { AppNode, AppEdge } from "@nodeui/types/graph";
import { generatePython } from "@/lib/nodeui/utils/codegen";
import { parsePythonToGraph } from "@/lib/nodeui/utils/codegen/parsePython";
import { generateConfigAndRequirements } from "@/lib/nodeui/utils/codegen/generateConfig";
import {
  uploadGymBundle,
  downloadGymBundle,
  computeBundleHash,
  uploadVersionManifest,
  type GymBundle,
} from "@/lib/utils/upload0g";
import { useGymStore, type VersionEntry } from "@/lib/gymStore";
import type { VersionManifest } from "@/lib/gymStore";
import {
  publishGymListing,
  type MarketListing,
} from "@/lib/utils/kvMarketplace";
import { contractListGym } from "@/lib/contracts";
import {
  registerSubname,
  buildEnsName,
  slugify,
  setEnsTextRecord,
} from "@/lib/utils/ensSubname";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { notify } from "@/lib/notificationStore";

const MonacoEditor = dynamic(() => import("./_MonacoEditor"), { ssr: false });

// ── Default file contents ──────────────────────────────────────
const INITIAL_GYM_ENV = `import gymnasium as gym
import numpy as np
from typing import Optional


class GymEnv(gym.Env):
    """440hz custom training environment.

    Observation space: code file state + test results
    Action space:      token generation (vocab 32k)
    """

    metadata = {"render_modes": ["human"]}

    def __init__(self, render_mode: Optional[str] = None):
        super().__init__()

        # Observation: [code_length, syntax_errors, tests_passed, tests_total]
        self.observation_space = gym.spaces.Box(
            low=np.array([0, 0, 0, 0], dtype=np.float32),
            high=np.array([1000, 50, 100, 100], dtype=np.float32),
        )

        # Action: token ID to emit (vocabulary size 32k)
        self.action_space = gym.spaces.Discrete(32000)

        self.render_mode = render_mode
        self._code_buffer: list[int] = []
        self._step_count: int = 0
        self.max_steps: int = 512

    def reset(self, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        self._code_buffer = []
        self._step_count = 0
        observation = self._get_obs()
        return observation, {}

    def step(self, action: int):
        self._code_buffer.append(action)
        self._step_count += 1

        code = self._decode_tokens(self._code_buffer)
        reward = compute_reward(code)

        terminated = self._step_count >= self.max_steps
        truncated = False
        observation = self._get_obs()

        return observation, reward, terminated, truncated, {}

    def _get_obs(self) -> np.ndarray:
        code = self._decode_tokens(self._code_buffer)
        syntax_errors = self._count_syntax_errors(code)
        tests_passed, tests_total = self._run_tests(code)
        return np.array(
            [len(self._code_buffer), syntax_errors, tests_passed, tests_total],
            dtype=np.float32
        )

    def _decode_tokens(self, tokens: list[int]) -> str:
        return " ".join(str(t) for t in tokens)

    def _count_syntax_errors(self, code: str) -> int:
        import ast
        try:
            ast.parse(code)
            return 0
        except SyntaxError:
            return 1

    def _run_tests(self, code: str) -> tuple[int, int]:
        return (0, 5)


def compute_reward(code: str) -> float:
    import ast
    reward = 0.0
    try:
        ast.parse(code)
        reward += 1.0
    except SyntaxError as e:
        reward -= 0.5 * e.lineno if e.lineno else 0.5
        return reward
    tests_passed = 3
    tests_total = 5
    reward += 3.0 * (tests_passed / tests_total)
    return reward
`;

const INITIAL_REWARD = `from __future__ import annotations
import ast


def compute_reward(code: str) -> float:
    """Reward heuristic for code quality.

    +1.0  if code compiles without syntax errors
    +3.0  if all unit tests pass
    -0.5  per syntax error
    """
    reward = 0.0
    try:
        ast.parse(code)
        reward += 1.0
    except SyntaxError as e:
        reward -= 0.5 * (e.lineno or 1)
    return reward
`;

const INITIAL_CONFIG = `environment:
  name: gym-env
  max_steps: 512
  seed: 42

training:
  algorithm: grpo
  epochs: 3
  batch_size: 8
  learning_rate: 1.0e-4

reward:
  syntax_pass: 1.0
  test_pass: 3.0
  syntax_error_penalty: -0.5
  crash_penalty: -2.0

output:
  storage: 0g
  adapter_format: lora
`;

const DEFAULT_CONTENTS: Record<string, string> = {
  "gym_env.py": INITIAL_GYM_ENV,
  "reward.py": INITIAL_REWARD,
  "config.yml": INITIAL_CONFIG,
  "__init__.py": 'from .gym_env import GymEnv\n\n__all__ = ["GymEnv"]\n',
  "requirements.txt": "gymnasium>=0.26\nnumpy\n",
};

const FILE_TREE = [
  { name: "gym_env.py", icon: "ⓟ" },
  { name: "reward.py", icon: "ⓟ" },
  { name: "config.yml", icon: "⚙️" },
  { name: "__init__.py", icon: "ⓟ" },
  { name: "requirements.txt", icon: "📦" },
];

// ── Main page ──────────────────────────────────────────────────
export default function GymBuilderPage() {
  const [monacoMode, setMonacoMode] = useState(false);
  const [monacoRightTab, setMonacoRightTab] = useState<"history" | "agent">(
    "agent",
  );
  const [storageCid, setStorageCid] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Chat history (persisted with bundle + localStorage) ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem("440hz-chat-draft");
      if (stored) return JSON.parse(stored) as ChatMessage[];
    } catch {
      /* ignore */
    }
    return [];
  });

  // ── Publish modal ──
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishCategory, setPublishCategory] = useState("Coding");
  const [publishLicense, setPublishLicense] = useState<
    "Open" | "Pro" | "Enterprise"
  >("Open");
  const [publishPrice, setPublishPrice] = useState("0");
  const [publishReqs, setPublishReqs] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishDone, setPublishDone] = useState(false);
  const [publishListingError, setPublishListingError] = useState<string | null>(
    null,
  );
  const [publishingListing, setPublishingListing] = useState(false);
  const [publishEnsName, setPublishEnsName] = useState<string | null>(null);

  // ── Save state ──
  const [saving, setSaving] = useState(false);
  const [versionMessage, setVersionMessage] = useState("");
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>([]);
  const [rollingBack, setRollingBack] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [noChanges, setNoChanges] = useState(false);

  // ── Open modal state ──
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [openHashInput, setOpenHashInput] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // ── My Gyms panel state ──
  const [gymsOpen, setGymsOpen] = useState(false);

  // ── Gym name editing ──
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // ── Gym store (persisted) ──
  const {
    addSavedGym,
    setCurrentGymHash,
    currentGymHash,
    savedGyms,
    removeSavedGym,
    updateGymEntry,
  } = useGymStore();

  // ── File state ──
  const [fileContents, setFileContents] =
    useState<Record<string, string>>(DEFAULT_CONTENTS);
  const [openFiles, setOpenFiles] = useState<string[]>(["gym_env.py"]);
  const [activeFile, setActiveFile] = useState("gym_env.py");

  const projectName = useGraphStore((s) => s.projectName);
  const setProjectName = useGraphStore((s) => s.setProjectName);
  const graphVersion = useGraphStore((s) => s.graphVersion);

  // ── Sync state / refs ──
  type SyncStatus = "synced" | "pending" | "parsing" | "manual";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const pythonUpdatedByGraphRef = useRef(false);
  const syncLockCountRef = useRef(0);
  const isInitialMountRef = useRef(true);
  const builderRef = useRef<HTMLDivElement>(null);

  function lockSync(ms = 2000) {
    syncLockCountRef.current++;
    setTimeout(() => {
      syncLockCountRef.current--;
    }, ms);
  }

  function commitName(value: string) {
    const trimmed = value.trim();
    if (trimmed) setProjectName(trimmed);
    setEditingName(false);
  }

  // ── Effect 1: Graph → Python (debounced 500ms) ────────────────
  useEffect(() => {
    const { nodes } = useGraphStore.getState();
    if (nodes.length === 0) return; // don't overwrite default content on empty graph
    setSyncStatus("pending");
    const timer = setTimeout(() => {
      if (syncLockCountRef.current > 0) return;
      const { nodes: n, edges: e, projectName: pn } = useGraphStore.getState();
      const code = generatePython(n, e, pn);
      pythonUpdatedByGraphRef.current = true;
      setFileContents((prev) => ({ ...prev, "gym_env.py": code }));
      setSyncStatus("synced");
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion]);

  // ── Effect 2: Python → Graph (debounced 1000ms) ───────────────
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (pythonUpdatedByGraphRef.current) {
      pythonUpdatedByGraphRef.current = false;
      return;
    }
    if (syncLockCountRef.current > 0) return;
    setSyncStatus("parsing");
    const code = fileContents["gym_env.py"] ?? "";
    const timer = setTimeout(() => {
      const result = parsePythonToGraph(code);
      if (result) {
        useGraphStore.getState().loadGraph(result.nodes, result.edges);
        useGraphStore.setState({ projectName: result.projectName });
        setSyncStatus("synced");
      } else {
        setSyncStatus("manual");
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileContents["gym_env.py"]]);

  // ── Effect 3: Graph → config.yml + requirements.txt (debounced 600ms) ──────
  useEffect(() => {
    const { nodes } = useGraphStore.getState();
    if (nodes.length === 0) return;
    const timer = setTimeout(() => {
      const { nodes: n } = useGraphStore.getState();
      const { yaml, requirements } = generateConfigAndRequirements(n);
      setFileContents((prev) => ({
        ...prev,
        "config.yml": yaml,
        "requirements.txt": requirements,
      }));
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion]);

  // ── Effect 4: Persist chat to localStorage ───────────────────
  useEffect(() => {
    try {
      localStorage.setItem("440hz-chat-draft", JSON.stringify(chatMessages));
    } catch {
      /* ignore quota errors */
    }
  }, [chatMessages]);

  // ── Effect 5: Auto-load gym when navigated from Gym Hub ──────
  useEffect(() => {
    const hash = sessionStorage.getItem("440hz-open-gym-hash");
    if (hash) {
      sessionStorage.removeItem("440hz-open-gym-hash");
      handleOpen(hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File handlers ──
  function handleFileSelect(name: string) {
    setOpenFiles((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveFile(name);
  }

  function handleFileClose(name: string) {
    setOpenFiles((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((f) => f !== name);
      if (activeFile === name) {
        const idx = prev.indexOf(name);
        setActiveFile(next[Math.min(idx, next.length - 1)]);
      }
      return next;
    });
  }

  function handleContentChange(name: string, value: string) {
    setFileContents((prev) => ({ ...prev, [name]: value }));
  }

  // ── Save full bundle to 0G ──
  async function handleSave(
    filesOverride?: Record<string, string>,
    chatOverride?: ChatMessage[],
  ): Promise<string | null> {
    setSaving(true);
    setUploadError(null);
    setManifestError(null);
    setNoChanges(false);

    const { nodes, edges, projectName: name } = useGraphStore.getState();
    const files = filesOverride ?? fileContents;

    const bundle: GymBundle = {
      version: "1.0",
      projectName: name,
      savedAt: new Date().toISOString(),
      graph: { nodes, edges },
      files,
      chat: (chatOverride ?? chatMessages).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Phase 1: change detection + upload
    let rootHash: string;
    try {
      const newContentHash = await computeBundleHash(bundle);
      const current = savedGyms.find((g) => g.rootHash === currentGymHash);

      if (current?.contentHash === newContentHash) {
        notify("info", "No changes", "Content unchanged since last save.");
        setNoChanges(true);
        setTimeout(() => setNoChanges(false), 2500);
        setSaving(false);
        return currentGymHash;
      }

      rootHash = await uploadGymBundle(bundle);

      const versionEntry: VersionEntry = {
        hash: rootHash,
        timestamp: bundle.savedAt,
        message: versionMessage.trim(),
      };
      const newVersions: VersionEntry[] = [
        ...(current?.versions ?? []),
        versionEntry,
      ];

      notify(
        "success",
        "Saved to 0G Storage",
        `CID: ${rootHash.slice(0, 10)}…${rootHash.slice(-6)}`,
      );
      setStorageCid(rootHash);
      setCurrentGymHash(rootHash);
      addSavedGym({
        rootHash,
        name,
        savedAt: bundle.savedAt,
        contentHash: newContentHash,
        versions: newVersions,
        ensLabel: current?.ensLabel,
      });
      setVersionHistory(newVersions);
      setVersionMessage("");

      // Phase 2: manifest upload (best-effort, non-blocking)
      const ensLabel = current?.ensLabel;
      (async () => {
        try {
          const manifest: VersionManifest = {
            schemaVersion: "1",
            gymName: name,
            versions: newVersions,
            current: rootHash,
          };
          const manifestHash = await uploadVersionManifest(manifest);
          updateGymEntry(rootHash, { manifestHash });
          if (ensLabel) {
            await setEnsTextRecord(
              ensLabel,
              "gym",
              "com.440hz.versions",
              manifestHash,
            );
          }
        } catch (e) {
          const msg = (e as Error).message;
          setManifestError(msg);
          notify(
            "warning",
            "Version manifest failed",
            "History saved locally only.",
          );
        }
      })();

      return rootHash;
    } catch (e) {
      const msg = (e as Error).message;
      setUploadError(msg);
      notify("error", "Upload failed", msg);
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ── Rollback to a previous version ──
  async function handleRollback(targetHash: string) {
    setRollingBack(true);
    setVersionPanelOpen(false);
    await handleOpen(targetHash);
    const entry = useGymStore
      .getState()
      .savedGyms.find((g) => g.rootHash === targetHash);
    if (entry?.versions) setVersionHistory(entry.versions);
    setRollingBack(false);
  }

  // ── Publish (compile + upload + marketplace listing) ──
  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishDone(false);
    setPublishListingError(null);

    const { nodes, edges, projectName: name } = useGraphStore.getState();
    const code = generatePython(nodes, edges, name);

    pythonUpdatedByGraphRef.current = true;
    const updatedFiles = { ...fileContents, "gym_env.py": code };
    setFileContents(updatedFiles);

    let rootHash: string | null = null;
    try {
      rootHash = await handleSave(updatedFiles);
      if (!rootHash) throw new Error("Upload failed — check wallet connection");
    } catch (e) {
      setPublishError((e as Error).message);
      setPublishing(false);
      return;
    }
    setPublishing(false);

    // Write marketplace listing (non-blocking — gym is already saved)
    setPublishingListing(true);
    try {
      const nodeCount = useGraphStore.getState().nodes.length;
      const complexity = Math.min(100, Math.round((nodeCount / 20) * 100));
      const listing: MarketListing = {
        rootHash,
        name: publishName,
        description: publishDesc,
        category: publishCategory as MarketListing["category"],
        complexity,
        license: publishLicense,
        cost:
          !publishPrice || publishPrice === "0"
            ? "Free"
            : `${publishPrice} $0G`,
        publishedAt: new Date().toISOString(),
        publishedBy: "", // filled below
      };
      // Try to get wallet address for attribution
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const { BrowserProvider } = await import("ethers");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const provider = new BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          listing.publishedBy = (await signer.getAddress()).toLowerCase();
        }
      } catch {
        /* attribution best-effort */
      }

      await publishGymListing(listing);

      // Write on-chain listing — non-blocking, best-effort alongside KV write
      const priceWei =
        !publishPrice || publishPrice === "0"
          ? 0n
          : BigInt(Math.round(parseFloat(publishPrice) * 1e18));
      await contractListGym(
        rootHash,
        publishName,
        publishCategory,
        publishLicense,
        priceWei,
      );

      // Register gym.440hz.eth subname on Base Sepolia — best-effort
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const { BrowserProvider } = await import("ethers");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const provider = new BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          const ensName = await registerSubname(publishName, "gym", addr);
          setPublishEnsName(ensName);
          // Record ENS label so future saves can write version manifest text record
          if (rootHash)
            updateGymEntry(rootHash, { ensLabel: slugify(publishName) });
        }
      } catch {
        setPublishEnsName(buildEnsName(publishName, "gym"));
      }
    } catch (e) {
      setPublishListingError((e as Error).message);
    } finally {
      setPublishingListing(false);
    }

    setPublishDone(true);
  }

  // ── Open gym bundle from 0G by root hash ──
  async function handleOpen(hash: string) {
    if (!hash.trim()) return;
    lockSync(3000); // suppress both sync effects during restore
    setOpening(true);
    setOpenError(null);

    try {
      const bundle = await downloadGymBundle(hash.trim());

      // Restore graph state
      useGraphStore
        .getState()
        .loadGraph(
          bundle.graph.nodes as AppNode[],
          bundle.graph.edges as AppEdge[],
        );
      useGraphStore.setState({ projectName: bundle.projectName });

      // Restore Monaco files
      setFileContents(bundle.files);
      const firstFile = Object.keys(bundle.files)[0];
      if (firstFile) {
        setOpenFiles([firstFile]);
        setActiveFile(firstFile);
      }

      // Restore chat history
      if (bundle.chat && bundle.chat.length > 0) {
        setChatMessages(bundle.chat as ChatMessage[]);
      }

      setCurrentGymHash(hash.trim());
      setStorageCid(hash.trim());

      // Restore version history from local store entry if available
      const entry = useGymStore
        .getState()
        .savedGyms.find((g) => g.rootHash === hash.trim());
      setVersionHistory(entry?.versions ?? []);

      setOpenModalVisible(false);
      setOpenHashInput("");
    } catch (e) {
      setOpenError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  function handleCopyCid() {
    if (storageCid) navigator.clipboard.writeText(storageCid);
  }

  return (
    <div ref={builderRef} className="flex flex-col h-full overflow-hidden">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--nodeui-border-strong);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--nodeui-muted);
        }
      `}</style>
      {/* Open from 0G modal */}
      {openModalVisible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenModalVisible(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-6 w-[440px] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-white">
              Open from 0G Storage
            </h2>
            <p className="text-[12px] text-muted">
              Paste a root hash to restore a previously saved gym bundle.
            </p>
            <input
              type="text"
              placeholder="0x…"
              value={openHashInput}
              onChange={(e) => setOpenHashInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpen(openHashInput)}
              className="w-full px-3 py-2 text-[13px] font-mono bg-canvas border border-border rounded-lg text-white placeholder:text-muted/50 focus:outline-none focus:border-purple/60"
            />
            {openError && (
              <p className="text-[11px] text-red-400">{openError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setOpenModalVisible(false);
                  setOpenError(null);
                }}
                className="text-[12px] px-4 py-1.5 rounded-lg border border-border text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleOpen(openHashInput)}
                disabled={opening || !openHashInput.trim()}
                className={`text-[12px] px-4 py-1.5 rounded-lg font-medium transition-all ${
                  opening
                    ? "bg-purple/40 text-purple-300 cursor-wait"
                    : "bg-purple hover:bg-purple/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {opening ? "Loading…" : "Load"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish modal */}
      {publishOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !publishing && setPublishOpen(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl p-6 w-[520px] flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Publish Gym to Marketplace
              </h2>
              <button
                onClick={() => setPublishOpen(false)}
                className="text-muted hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            {publishDone ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 p-3 bg-green/10 border border-green/30 rounded-lg">
                  <span className="text-green text-sm">✓</span>
                  <span className="text-[12px] text-green">
                    Gym uploaded to 0G Storage
                  </span>
                </div>
                {publishingListing ? (
                  <p className="text-[11px] text-muted">
                    Publishing to marketplace…
                  </p>
                ) : publishListingError ? (
                  <div className="p-2 border border-amber/30 bg-amber/10 rounded-lg">
                    <p className="text-[11px] text-amber">
                      ⚠ Gym saved — marketplace listing failed:{" "}
                      {publishListingError}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-green/10 border border-green/20 rounded-lg">
                    <span className="text-[11px] text-green">
                      ✓ Listed on marketplace
                    </span>
                  </div>
                )}
                {publishEnsName && (
                  <div className="flex items-center gap-2 p-2 bg-purple/10 border border-purple/20 rounded-lg">
                    <span className="text-[11px] text-purple-300">
                      ⬡ {publishEnsName}
                    </span>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setPublishOpen(false);
                      setPublishDone(false);
                      setPublishListingError(null);
                      setPublishEnsName(null);
                    }}
                    className="text-[12px] px-4 py-1.5 rounded-lg bg-purple hover:bg-purple/80 text-white transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[11px] text-muted">
                      Display name
                    </label>
                    <input
                      value={publishName}
                      onChange={(e) => setPublishName(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white focus:outline-none focus:border-purple/60"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[11px] text-muted">
                      Description
                    </label>
                    <textarea
                      value={publishDesc}
                      onChange={(e) => setPublishDesc(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white focus:outline-none focus:border-purple/60 resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">Category</label>
                    <select
                      value={publishCategory}
                      onChange={(e) => setPublishCategory(e.target.value)}
                      className="px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white focus:outline-none focus:border-purple/60"
                    >
                      {[
                        "Coding",
                        "Trading",
                        "Physics",
                        "Robotics",
                        "Math",
                        "Language",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">
                      License tier
                    </label>
                    <select
                      value={publishLicense}
                      onChange={(e) =>
                        setPublishLicense(
                          e.target.value as "Open" | "Pro" | "Enterprise",
                        )
                      }
                      className="px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white focus:outline-none focus:border-purple/60"
                    >
                      <option value="Open">Open (free)</option>
                      <option value="Pro">Pro</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">
                      Price (0G tokens, 0 = free)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={publishPrice}
                      onChange={(e) => setPublishPrice(e.target.value)}
                      className="px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white focus:outline-none focus:border-purple/60"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted">
                      System requirements
                    </label>
                    <input
                      placeholder="e.g. 8GB RAM, 4GB VRAM"
                      value={publishReqs}
                      onChange={(e) => setPublishReqs(e.target.value)}
                      className="px-3 py-2 text-[13px] bg-canvas border border-border rounded-lg text-white placeholder:text-muted/40 focus:outline-none focus:border-purple/60"
                    />
                  </div>
                </div>

                {publishError && (
                  <p className="text-[11px] text-red-400">{publishError}</p>
                )}

                <p className="text-[11px] text-muted/60">
                  This will compile the graph to Python and upload the full gym
                  bundle to 0G Storage. On-chain marketplace listing is coming
                  soon.
                </p>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setPublishOpen(false)}
                    className="text-[12px] px-4 py-1.5 rounded-lg border border-border text-muted hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={
                      publishing || publishingListing || !publishName.trim()
                    }
                    className={`text-[12px] px-5 py-1.5 rounded-lg font-medium transition-all ${
                      publishing || publishingListing
                        ? "bg-purple/40 text-purple-300 cursor-wait"
                        : "bg-purple hover:bg-purple/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    {publishingListing
                      ? "📋 Listing…"
                      : publishing
                      ? "⚙ Publishing…"
                      : "↑ Publish to 0G"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Topbar */}
      <div
        className="card"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "10px 16px",
          borderRadius: 0,
          borderLeft: "none",
          borderRight: "none",
          borderTop: "none",
          borderBottom: "none",
          flexShrink: 0,
        }}
      >
        {/* Left: title */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            <em
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--accent-2)",
                fontSize: 20,
              }}
            >
              {" "}
              Gym Builder
            </em>
          </span>
        </div>

        {/* Center: project name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => commitName(nameInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName(nameInput);
                if (e.key === "Escape") setEditingName(false);
              }}
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "transparent",
                border: "1px solid var(--accent-soft)",
                padding: "2px 8px",
                borderRadius: 999,
                outline: "none",
                color: "var(--text)",
                width: 160,
                textAlign: "center",
              }}
            />
          ) : (
            <span
              onClick={() => {
                setNameInput(projectName);
                setEditingName(true);
              }}
              title="Click to rename"
              className="pill accent"
              style={{
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            >
              {projectName}
            </span>
          )}
        </div>

        {/* Right: toggle + publish */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifySelf: "end",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Code</span>
            <div
              onClick={() => setMonacoMode((m) => !m)}
              style={{
                position: "relative",
                width: 36,
                height: 20,
                borderRadius: 999,
                cursor: "pointer",
                background: monacoMode
                  ? "var(--accent)"
                  : "var(--border-strong)",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  transition: "transform 0.15s",
                  transform: monacoMode
                    ? "translateX(18px)"
                    : "translateX(3px)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: monacoMode ? "var(--text-3)" : "var(--text)",
              }}
            >
              Node Graph
            </span>
          </div>

          <div
            style={{ width: 1, height: 16, background: "var(--border-strong)" }}
          />

          <button
            onClick={() => {
              setPublishOpen(true);
              setPublishName(projectName);
              setPublishDone(false);
              setPublishError(null);
              setPublishEnsName(null);
            }}
            className="btn primary sm"
          >
            Publish
          </button>
        </div>
      </div>

      {/* 3-pane body */}
      <div
        className="flex flex-1"
        style={{ borderRadius: 22, overflow: "hidden" }}
      >
        {monacoMode ? (
          <>
            {/* Left: file tree + symbols */}
            <CodeFileTree
              activeFile={activeFile}
              onFileSelect={handleFileSelect}
              fileContents={fileContents}
            />
            {/* Center: Monaco */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <Suspense
                fallback={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      background: "var(--nodeui-canvas)",
                      color: "var(--nodeui-muted)",
                      fontSize: 13,
                    }}
                  >
                    Loading editor…
                  </div>
                }
              >
                <MonacoEditor
                  activeFile={activeFile}
                  openFiles={openFiles}
                  fileContents={fileContents}
                  onFileSelect={handleFileSelect}
                  onFileClose={handleFileClose}
                  onContentChange={handleContentChange}
                />
              </Suspense>
            </div>
            {/* Right: History + AI Agent tabs */}
            <div
              style={{
                width: 280,
                flexShrink: 0,
                background: "var(--nodeui-surface)",
                borderLeft: "1px solid var(--nodeui-border-subtle)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Tab header */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--nodeui-border-subtle)",
                  flexShrink: 0,
                }}
              >
                {(["history", "agent"] as const).map((t) => {
                  const active = monacoRightTab === t;
                  const label = t === "history" ? "History" : "AI Agent";
                  return (
                    <button
                      key={t}
                      onClick={() => setMonacoRightTab(t)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        padding: "9px 0",
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        color: active
                          ? "var(--nodeui-text)"
                          : "var(--nodeui-dim)",
                        background: "none",
                        border: "none",
                        borderBottom: active
                          ? "2px solid #6366f1"
                          : "2px solid transparent",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "color 0.15s",
                      }}
                    >
                      {label}
                      {t === "history" && versionHistory.length > 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            background: "var(--accent-soft)",
                            color: "var(--accent-2)",
                            padding: "0 4px",
                            borderRadius: 999,
                          }}
                        >
                          {versionHistory.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {monacoRightTab === "agent" && (
                <ChatPanel
                  initialMessages={chatMessages}
                  onMessagesChange={setChatMessages}
                />
              )}

              {monacoRightTab === "history" && (
                <div
                  className="nodeui-scroll custom-scrollbar"
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {versionHistory.length === 0 ? (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--nodeui-dim)",
                        textAlign: "center",
                        paddingTop: 16,
                      }}
                    >
                      No versions saved yet
                    </p>
                  ) : (
                    [...versionHistory].reverse().map((v) => (
                      <div
                        key={v.hash}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "var(--nodeui-canvas)",
                          border: "1px solid var(--nodeui-border-strong)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "var(--nodeui-text)",
                              margin: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {v.message || "No message"}
                          </p>
                          <p
                            style={{
                              fontSize: 9,
                              fontFamily: "var(--font-mono)",
                              color: "var(--nodeui-dim)",
                              margin: 0,
                            }}
                          >
                            {new Date(v.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleOpen(v.hash)}
                          style={{
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 4,
                            border: "1px solid var(--accent-soft)",
                            color: "var(--accent-2)",
                            background: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            flexShrink: 0,
                          }}
                        >
                          Load
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <ReactFlowProvider>
            <Sidebar
              sourceContent={
                <SourceTabContent
                  syncStatus={syncStatus}
                  currentGymHash={currentGymHash}
                  savedGyms={savedGyms}
                  saving={saving}
                  versionMessage={versionMessage}
                  setVersionMessage={setVersionMessage}
                  versionHistory={versionHistory}
                  versionPanelOpen={versionPanelOpen}
                  setVersionPanelOpen={setVersionPanelOpen}
                  gymsOpen={gymsOpen}
                  setGymsOpen={setGymsOpen}
                  onSave={() => handleSave()}
                  onOpenByHash={() => setOpenModalVisible(true)}
                  onLoadGym={(hash) => {
                    handleOpen(hash);
                    setGymsOpen(false);
                  }}
                  onRemoveGym={removeSavedGym}
                />
              }
            />
            <Canvas fullscreenTarget={builderRef} />
            <PropertiesPanel
              versionHistory={versionHistory}
              currentHash={currentGymHash}
              onRollback={handleRollback}
              rollingBack={rollingBack}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}

// ── Source tab content (node graph sidebar Source tab) ─────────
interface SourceTabContentProps {
  syncStatus: string;
  currentGymHash: string | null;
  savedGyms: import("@/lib/gymStore").GymEntry[];
  saving: boolean;
  versionMessage: string;
  setVersionMessage: (v: string) => void;
  versionHistory: import("@/lib/gymStore").VersionEntry[];
  versionPanelOpen: boolean;
  setVersionPanelOpen: (v: boolean) => void;
  gymsOpen: boolean;
  setGymsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onSave: () => void;
  onOpenByHash: () => void;
  onLoadGym: (hash: string) => void;
  onRemoveGym: (hash: string) => void;
}

function SourceTabContent({
  syncStatus,
  currentGymHash,
  savedGyms,
  saving,
  versionMessage,
  setVersionMessage,
  versionHistory,
  versionPanelOpen,
  setVersionPanelOpen,
  gymsOpen,
  setGymsOpen,
  onSave,
  onOpenByHash,
  onLoadGym,
  onRemoveGym,
}: SourceTabContentProps) {
  const section: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid var(--nodeui-border-subtle)",
  };
  const label: React.CSSProperties = {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--nodeui-dim)",
    fontWeight: 600,
    paddingBottom: 8,
    display: "block",
  };
  const col: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Status */}
      <div style={section}>
        <span style={label}>Status</span>
        <div style={col}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 500,
              ...(syncStatus === "synced"
                ? {
                    color: "var(--ok)",
                    border: "1px solid oklch(0.78 0.14 150 / 0.3)",
                    background: "oklch(0.78 0.14 150 / 0.10)",
                  }
                : {
                    color: "var(--warn)",
                    border: "1px solid oklch(0.80 0.14 75 / 0.3)",
                    background: "oklch(0.80 0.14 75 / 0.10)",
                  }),
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "currentColor",
                display: "inline-block",
              }}
            />
            {syncStatus === "synced"
              ? "Synced"
              : syncStatus === "parsing"
              ? "Parsing…"
              : syncStatus === "pending"
              ? "Pending"
              : "Manual"}
          </span>

          {currentGymHash && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--accent-2)",
                border: "1px solid var(--accent-soft)",
                background: "var(--accent-soft)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span>Saved&nbsp;</span>
              <span style={{ opacity: 0.8 }}>
                {currentGymHash.slice(0, 6)}…{currentGymHash.slice(-4)}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(currentGymHash)}
                title="Copy full hash"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  opacity: 0.6,
                  padding: "0 0 0 4px",
                  fontSize: 12,
                }}
              >
                ⎘
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Version */}
      <div style={section}>
        <span style={label}>Version</span>
        <div style={col}>
          <input
            type="text"
            placeholder="Version note…"
            value={versionMessage}
            onChange={(e) => setVersionMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !saving && onSave()}
            maxLength={120}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 10px",
              fontSize: 12,
              background: "var(--nodeui-canvas)",
              border: "1px solid var(--nodeui-border-strong)",
              borderRadius: 6,
              color: "var(--nodeui-text)",
              outline: "none",
            }}
          />
          <button
            onClick={() => setVersionPanelOpen(!versionPanelOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: "100%",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "none",
              border: "1px solid var(--nodeui-border-strong)",
              borderRadius: 6,
              cursor: "pointer",
              color: "var(--nodeui-muted)",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--nodeui-text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--nodeui-muted)";
            }}
          >
            ⧖ History
            {versionHistory.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  background: "var(--accent-soft)",
                  color: "var(--accent-2)",
                  padding: "0 5px",
                  borderRadius: 999,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {versionHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Storage */}
      <div style={section}>
        <span style={label}>Storage</span>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            width: "100%",
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 500,
            background: "none",
            border: saving
              ? "1px solid var(--accent-soft)"
              : "1px solid var(--accent-soft)",
            borderRadius: 6,
            cursor: saving ? "wait" : "pointer",
            color: saving ? "var(--accent-2)" : "var(--accent-2)",
            fontFamily: "inherit",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!saving)
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--accent-soft)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
        >
          {saving ? "↑ Saving…" : "↑ Save to 0G"}
        </button>
      </div>

      {/* Gyms */}
      <div
        style={{
          ...section,
          borderBottom: "none",
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span style={label}>My Gyms</span>
        <div style={col}>
          <button
            onClick={() => setGymsOpen((g) => !g)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: gymsOpen ? "var(--accent-soft)" : "none",
              border: "1px solid var(--nodeui-border-strong)",
              borderRadius: 6,
              cursor: "pointer",
              color: "var(--nodeui-muted)",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--nodeui-text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--nodeui-muted)";
            }}
          >
            <span>My Gyms</span>
            {savedGyms.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  background: "var(--accent-soft)",
                  color: "var(--accent-2)",
                  padding: "0 6px",
                  borderRadius: 999,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {savedGyms.length}
              </span>
            )}
          </button>

          {gymsOpen && (
            <div
              className="custom-scrollbar"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {savedGyms.length === 0 ? (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--nodeui-dim)",
                    textAlign: "center",
                    padding: "8px 0",
                  }}
                >
                  No gyms saved yet
                </p>
              ) : (
                Object.values(
                  savedGyms.reduce((acc, g) => {
                    if (!acc[g.name] || g.savedAt > acc[g.name].savedAt)
                      acc[g.name] = g;
                    return acc;
                  }, {} as Record<string, (typeof savedGyms)[0]>),
                ).map((entry) => (
                  <div
                    key={entry.rootHash}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 6px",
                      borderRadius: 6,
                      background: "var(--nodeui-canvas)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--nodeui-text)",
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.name}
                      </p>
                      <p
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--nodeui-dim)",
                          margin: 0,
                        }}
                      >
                        {entry.rootHash.slice(0, 6)}…{entry.rootHash.slice(-4)}
                      </p>
                    </div>
                    <button
                      onClick={() => onLoadGym(entry.rootHash)}
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 4,
                        border: "1px solid var(--accent-soft)",
                        color: "var(--accent-2)",
                        background: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        flexShrink: 0,
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => onRemoveGym(entry.rootHash)}
                      style={{
                        fontSize: 12,
                        color: "var(--nodeui-dim)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <button
                onClick={onOpenByHash}
                style={{
                  fontSize: 10,
                  color: "var(--accent-2)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                + Open by hash
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Code file tree (Monaco mode left panel) ────────────────────
interface CodeFileTreeProps {
  activeFile: string;
  onFileSelect: (name: string) => void;
  fileContents: Record<string, string>;
}

function extractSymbols(code: string) {
  const symbols: { kind: string; name: string }[] = [];
  code.split("\n").forEach((line) => {
    const cls = line.match(/^class\s+(\w+)/);
    if (cls) {
      symbols.push({ kind: "class", name: cls[1] });
      return;
    }
    const fn = line.match(/^(?:\s{4})?def\s+(\w+\(.*?\))/);
    if (fn)
      symbols.push({
        kind: fn[1].startsWith("_") ? "method" : "function",
        name: fn[1],
      });
  });
  return symbols;
}

function CodeFileTree({
  activeFile,
  onFileSelect,
  fileContents,
}: CodeFileTreeProps) {
  const pythonSymbols = extractSymbols(fileContents[activeFile] ?? "");

  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        background: "var(--nodeui-canvas)",
        borderRight: "1px solid var(--nodeui-border-subtle)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--nodeui-border-subtle)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--nodeui-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Files
        </span>
      </div>
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--nodeui-border-subtle)",
        }}
      >
        {FILE_TREE.map((f) => (
          <div
            key={f.name}
            onClick={() => onFileSelect(f.name)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: activeFile === f.name ? "#7c3aed22" : "none",
              color: activeFile === f.name ? "#a78bfa" : "var(--nodeui-muted)",
            }}
          >
            <span style={{ fontSize: 13 }}>{f.icon}</span>
            <span style={{ fontSize: 11 }}>{f.name}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--nodeui-border-subtle)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--nodeui-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Symbols
        </span>
      </div>
      <div
        className="custom-scrollbar"
        style={{ flex: 1, padding: "4px 8px", overflowY: "auto" }}
      >
        {pythonSymbols.map((s) => (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 4,
              cursor: "pointer",
              color: "var(--nodeui-dim)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.color =
                "var(--nodeui-text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.color =
                "var(--nodeui-dim)";
            }}
          >
            <span
              style={{
                fontSize: 9,
                width: 14,
                color:
                  s.kind === "class"
                    ? "#7c3aed"
                    : s.kind === "method"
                    ? "#22c55e"
                    : s.kind === "function"
                    ? "#f59e0b"
                    : "var(--nodeui-dim)",
              }}
            >
              {s.kind === "class"
                ? "C"
                : s.kind === "method"
                ? "M"
                : s.kind === "function"
                ? "F"
                : "V"}
            </span>
            <span
              style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            >
              {s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
