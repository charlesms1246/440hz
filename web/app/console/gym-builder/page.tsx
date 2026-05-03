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
import { publishGymListing, type MarketListing } from "@/lib/utils/kvMarketplace";
import { contractListGym } from "@/lib/contracts";
import { buildEnsName, slugify, setEnsTextRecord } from "@/lib/utils/ensSubname";
import { VersionHistoryPanel } from "./VersionHistoryPanel";

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
  const [storageCid, setStorageCid] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Chat history (persisted with bundle + localStorage) ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem('440hz-chat-draft')
      if (stored) return JSON.parse(stored) as ChatMessage[]
    } catch { /* ignore */ }
    return []
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
  const [publishListingError, setPublishListingError] = useState<string | null>(null);
  const [publishingListing, setPublishingListing] = useState(false);
  const [publishEnsName, setPublishEnsName] = useState<string | null>(null);

  // ── Save state ──
  const [saving, setSaving] = useState(false);
  const [versionMessage, setVersionMessage] = useState('');
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
      localStorage.setItem('440hz-chat-draft', JSON.stringify(chatMessages))
    } catch { /* ignore quota errors */ }
  }, [chatMessages]);

  // ── Effect 5: Auto-load gym when navigated from Gym Hub ──────
  useEffect(() => {
    const hash = sessionStorage.getItem('440hz-open-gym-hash')
    if (hash) {
      sessionStorage.removeItem('440hz-open-gym-hash')
      handleOpen(hash)
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
        // No content change — skip upload
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
      setVersionMessage('');

      // Phase 2: manifest upload (best-effort, non-blocking)
      const ensLabel = current?.ensLabel;
      ;(async () => {
        try {
          const manifest: VersionManifest = {
            schemaVersion: '1',
            gymName: name,
            versions: newVersions,
            current: rootHash,
          };
          const manifestHash = await uploadVersionManifest(manifest);
          updateGymEntry(rootHash, { manifestHash });
          if (ensLabel) {
            await setEnsTextRecord(ensLabel, 'gym', 'com.440hz.versions', manifestHash);
          }
        } catch (e) {
          setManifestError((e as Error).message);
        }
      })();

      return rootHash;
    } catch (e) {
      setUploadError((e as Error).message);
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
    const entry = useGymStore.getState().savedGyms.find((g) => g.rootHash === targetHash);
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
        name:        publishName,
        description: publishDesc,
        category:    publishCategory as MarketListing['category'],
        complexity,
        license:     publishLicense,
        cost:        !publishPrice || publishPrice === '0' ? 'Free' : `${publishPrice} $0G`,
        publishedAt: new Date().toISOString(),
        publishedBy: '',  // filled below
      };
      // Try to get wallet address for attribution — use eth_accounts (no popup)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eth = typeof window !== 'undefined' && (window as any).ethereum
        if (eth) {
          const accounts: string[] = await eth.request({ method: 'eth_accounts' })
          if (accounts?.length) listing.publishedBy = accounts[0].toLowerCase()
        }
      } catch { /* attribution best-effort */ }

      await publishGymListing(listing);

      // Write on-chain listing — non-blocking, best-effort alongside KV write
      const priceWei = !publishPrice || publishPrice === '0'
        ? 0n
        : BigInt(Math.round(parseFloat(publishPrice) * 1e18))
      await contractListGym(
        rootHash,
        publishName,
        publishCategory,
        publishLicense,
        priceWei,
      )

      // Register gym.440hz.eth subname on Base Sepolia via server wallet — best-effort
      const addr = listing.publishedBy
      try {
        const ensLabel = slugify(publishName)
        await fetch('/api/ens/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: `${ensLabel}-gym`, ownerAddress: addr || '0x0000000000000000000000000000000000000000' }),
        })
        const ensName = buildEnsName(publishName, 'gym')
        setPublishEnsName(ensName)
        // Record ENS label so future saves can write version manifest text record
        if (rootHash) updateGymEntry(rootHash, { ensLabel })
      } catch {
        setPublishEnsName(buildEnsName(publishName, 'gym'));
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
      const entry = useGymStore.getState().savedGyms.find((g) => g.rootHash === hash.trim());
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
    <div className="flex flex-col h-full overflow-hidden">
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
                  <p className="text-[11px] text-muted">Publishing to marketplace…</p>
                ) : publishListingError ? (
                  <div className="p-2 border border-amber/30 bg-amber/10 rounded-lg">
                    <p className="text-[11px] text-amber">
                      ⚠ Gym saved — marketplace listing failed: {publishListingError}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-green/10 border border-green/20 rounded-lg">
                    <span className="text-[11px] text-green">✓ Listed on marketplace</span>
                  </div>
                )}
                {publishEnsName && (
                  <div className="flex items-center gap-2 p-2 bg-purple/10 border border-purple/20 rounded-lg">
                    <span className="text-[11px] text-purple-300">⬡ {publishEnsName}</span>
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
                    disabled={publishing || publishingListing || !publishName.trim()}
                    className={`text-[12px] px-5 py-1.5 rounded-lg font-medium transition-all ${
                      publishing || publishingListing
                        ? "bg-purple/40 text-purple-300 cursor-wait"
                        : "bg-purple hover:bg-purple/80 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    {publishingListing ? "📋 Listing…" : publishing ? "⚙ Publishing…" : "↑ Publish to 0G"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <span className="text-sm font-semibold text-white">Gym Builder</span>
        <div className="w-px h-4 bg-border" />

        {/* Editable project name */}
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
            className="text-[11px] font-mono text-white bg-transparent border border-purple/50 px-2 py-0.5 rounded focus:outline-none w-44"
          />
        ) : (
          <span
            onClick={() => {
              setNameInput(projectName);
              setEditingName(true);
            }}
            title="Click to rename"
            className="text-[11px] font-mono text-muted border border-border px-2 py-0.5 rounded cursor-pointer hover:border-purple/40 hover:text-white transition-colors"
          >
            {projectName}
          </span>
        )}

        {/* Sync status */}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-all ${
            syncStatus === "synced"
              ? "text-green/60 bg-green/10"
              : syncStatus === "pending"
                ? "text-yellow-400/70 bg-yellow-400/10"
                : syncStatus === "parsing"
                  ? "text-blue-400/70 bg-blue-400/10"
                  : "text-orange-400/70 bg-orange-400/10"
          }`}
        >
          {syncStatus === "synced"
            ? "⟳ synced"
            : syncStatus === "pending"
              ? "⟳ …"
              : syncStatus === "parsing"
                ? "⟳ parsing"
                : "✎ manual"}
        </span>

        {/* Saved hash badge */}
        {currentGymHash && (
          <span className="flex items-center gap-1.5 text-[11px] font-mono border border-purple/30 px-2 py-0.5 rounded text-purple/80">
            <span className="text-muted font-sans">Saved:</span>
            {currentGymHash.slice(0, 8)}…{currentGymHash.slice(-6)}
            <button
              onClick={() => navigator.clipboard.writeText(currentGymHash)}
              title="Copy full hash"
              className="text-purple/50 hover:text-purple transition-colors leading-none"
            >
              ⎘
            </button>
          </span>
        )}

        <div className="flex-1" />

        {/* My Gyms dropdown */}
        <div className="relative">
          <button
            onClick={() => setGymsOpen((g) => !g)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-all ${
              gymsOpen
                ? "border-purple/40 text-purple bg-purple/10"
                : "border-border text-muted hover:text-white hover:border-border/60"
            }`}
          >
            My Gyms
            {savedGyms.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-purple/20 text-purple px-1 rounded-full">
                {savedGyms.length}
              </span>
            )}
          </button>

          {gymsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setGymsOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white">
                    Saved Gyms
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">
                      {savedGyms.length} / 50
                    </span>
                    <button
                      onClick={() => {
                        setGymsOpen(false);
                        setOpenModalVisible(true);
                      }}
                      className="text-[10px] text-purple/70 hover:text-purple transition-colors"
                    >
                      + Open by hash
                    </button>
                  </div>
                </div>
                {savedGyms.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <p className="text-[12px] text-muted">No gyms saved yet</p>
                    <p className="text-[11px] text-muted/50 mt-1">
                      Click ↑ Save to 0G to save your current gym
                    </p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
                    {savedGyms.map((entry) => (
                      <div
                        key={entry.rootHash}
                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 group transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-white truncate font-medium">
                            {entry.name}
                          </p>
                          <p className="text-[10px] font-mono text-muted/60 mt-0.5">
                            {entry.rootHash.slice(0, 8)}…
                            {entry.rootHash.slice(-6)}
                            <span className="ml-1.5 font-sans">
                              · {new Date(entry.savedAt).toLocaleDateString()}
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            handleOpen(entry.rootHash);
                            setGymsOpen(false);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded border border-purple/30 text-purple hover:bg-purple/10 transition-colors shrink-0"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => removeSavedGym(entry.rootHash)}
                          title="Remove from list"
                          className="text-[13px] leading-none text-muted/30 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Version note input */}
        <input
          type="text"
          placeholder="Version note…"
          value={versionMessage}
          onChange={(e) => setVersionMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
          maxLength={120}
          className="text-[11px] px-2 py-1.5 w-32 bg-canvas border border-border rounded-lg
                     text-white placeholder:text-muted/40 focus:outline-none focus:border-purple/40"
        />

        {/* Version history toggle */}
        <button
          onClick={() => setVersionPanelOpen((v) => !v)}
          className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
            versionPanelOpen
              ? 'border-purple/40 text-purple bg-purple/10'
              : 'border-border text-muted hover:text-white hover:border-border/60'
          }`}
          title="Version history"
        >
          ⧖
          {versionHistory.length > 0 && (
            <span className="text-[10px] bg-purple/20 text-purple px-1 rounded-full leading-tight">
              {versionHistory.length}
            </span>
          )}
        </button>

        {/* Save to 0G */}
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-all ${
            saving
              ? "border-purple/30 text-purple/60 cursor-wait"
              : "border-purple/40 text-purple hover:bg-purple/10"
          }`}
        >
          {saving ? "↑ Saving…" : "↑ Save to 0G"}
        </button>

        <div className="w-px h-4 bg-border" />

        {/* Monaco toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">Code Editor</span>
          <div
            onClick={() => setMonacoMode((m) => !m)}
            className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${monacoMode ? "bg-purple" : "bg-border"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${monacoMode ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </div>
          <span className="text-[11px] text-muted">Node Graph</span>
        </div>

        <div className="w-px h-4 bg-border" />

        <button
          onClick={() => {
            setPublishOpen(true);
            setPublishName(projectName);
            setPublishDone(false);
            setPublishError(null);
            setPublishEnsName(null);
          }}
          className="text-[12px] font-medium px-4 py-1.5 rounded-lg transition-all bg-purple hover:bg-purple/80 text-white"
        >
          Publish
        </button>
      </div>

      {/* CID / error banner */}
      {storageCid && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-green/10 border-b border-green/20 shrink-0">
          <span className="text-[11px] text-green font-medium">
            0G Storage CID
          </span>
          <span className="text-[11px] font-mono text-green/80">
            {storageCid.slice(0, 10)}…{storageCid.slice(-6)}
          </span>
          <button
            onClick={handleCopyCid}
            className="text-[10px] px-2 py-0.5 rounded border border-green/30 text-green/70 hover:text-green hover:border-green/60 transition-colors"
          >
            Copy
          </button>
          <span className="text-[10px] text-green/50 ml-1">
            · indexed by sequence on 0G
          </span>
        </div>
      )}
      {noChanges && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/20 shrink-0">
          <span className="text-[11px] text-blue-400 font-medium">No changes</span>
          <span className="text-[11px] text-blue-400/70">Content unchanged since last save.</span>
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 shrink-0">
          <span className="text-[11px] text-red-400 font-medium">
            Upload failed
          </span>
          <span className="text-[11px] text-red-400/70 truncate">
            {uploadError}
          </span>
        </div>
      )}
      {manifestError && (
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 shrink-0">
          <span className="text-[11px] text-yellow-400/80 truncate">
            Version manifest upload failed — history saved locally only
          </span>
          <button
            onClick={() => setManifestError(null)}
            className="text-[11px] text-yellow-400/50 hover:text-yellow-400 shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {/* 3-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {monacoMode ? (
          <>
            {/* Left: file tree + symbols */}
            <CodeFileTree
              activeFile={activeFile}
              onFileSelect={handleFileSelect}
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
            {/* Right: AI Agent chat */}
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
              <div
                style={{
                  padding: "8px 14px",
                  flexShrink: 0,
                  borderBottom: "1px solid var(--nodeui-border-subtle)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--nodeui-muted)",
                  }}
                >
                  AI Agent
                </span>
              </div>
              <ChatPanel
                initialMessages={chatMessages}
                onMessagesChange={setChatMessages}
              />
            </div>
          </>
        ) : (
          <ReactFlowProvider>
            <Sidebar />
            <Canvas />
            <PropertiesPanel />
          </ReactFlowProvider>
        )}
      </div>

      {/* Version history drawer */}
      <VersionHistoryPanel
        open={versionPanelOpen}
        onClose={() => setVersionPanelOpen(false)}
        versions={versionHistory}
        currentHash={currentGymHash}
        onRollback={handleRollback}
        rollingBack={rollingBack}
      />
    </div>
  );
}

// ── Code file tree (Monaco mode left panel) ────────────────────
interface CodeFileTreeProps {
  activeFile: string;
  onFileSelect: (name: string) => void;
}

function CodeFileTree({ activeFile, onFileSelect }: CodeFileTreeProps) {
  const pythonSymbols = [
    { kind: "class", name: "GymEnv" },
    { kind: "method", name: "reset()" },
    { kind: "method", name: "step()" },
    { kind: "method", name: "_get_obs()" },
    { kind: "function", name: "compute_reward()" },
    { kind: "variable", name: "observation_space" },
    { kind: "variable", name: "action_space" },
  ];

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
      <div style={{ flex: 1, padding: "4px 8px", overflowY: "auto" }}>
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
