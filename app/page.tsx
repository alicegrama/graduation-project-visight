"use client";

import { figmaAPI } from "@/lib/figmaAPI";
import { useState, useEffect } from "react";

const SERVER_URL = "http://127.0.0.1:5001";

const CONDITIONS = [
  { value: "deuteranopia", label: "Deuteranopia (red-green)" },
  { value: "protanopia", label: "Protanopia (red-blind)" },
  { value: "tritanopia", label: "Tritanopia (blue-blind)" },
  { value: "achromatopsia", label: "Achromatopsia (no color)" },
  { value: "cataracts", label: "Cataracts" },
  { value: "glaucoma", label: "Glaucoma" },
  { value: "low_vision", label: "Low Vision" },
  { value: "macular_degeneration", label: "Macular Degeneration" },
];

const PERSONAS = [
  { value: "maya", label: "Maya — 20s, high tech literacy, phone" },
  { value: "david", label: "David — 40s, medium tech literacy, tablet" },
  { value: "elena", label: "Elena — 60s+, low tech literacy, small phone" },
];

type Flow = { name: string; startNodeId: string };

type SessionStep = {
  step: number;
  frameName: string;
  choice: string;
  reasoning: string;
  confidence: string;
  outcome: string;
  detectedElements?: string[];
  detectedButNotWired?: string[];
  wiredButNotDetected?: string[];
};

type SimulationResult = {
  sessionTrace: SessionStep[];
  finalOutcome: "completion" | "failure" | "dropout";
  stoppedAtStep: number;
  narrative: string;
  personaName: string;
};

function getPositionLabel(x: number, y: number, frameWidth: number, frameHeight: number): string {
  const col = x < frameWidth / 3 ? "left" : x < (frameWidth * 2) / 3 ? "center" : "right";
  const row = y < frameHeight / 3 ? "top" : y < (frameHeight * 2) / 3 ? "middle" : "bottom";
  return `${row} ${col}`;
}

const outcomeConfig = {
  completion: { color: "#166534", bg: "#f0fdf4", border: "#bbf7d0", label: "✓ Completion" },
  failure:    { color: "#991b1b", bg: "#fef2f2", border: "#fecaca", label: "✗ Failure" },
  dropout:    { color: "#92400e", bg: "#fffbeb", border: "#fde68a", label: "⚠ Drop-out" },
};

const s: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background: "#ffffff",
    minHeight: "100vh",
    color: "#111",
    fontSize: "12px",
  },
  header: {
    padding: "14px 16px 12px",
    borderBottom: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
  },
  headerTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#111",
    letterSpacing: "-0.3px",
  },
  headerSub: {
    fontSize: "11px",
    color: "#999",
  },
  body: {
    padding: "14px 16px",
  },
  label: {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "#555",
    marginBottom: "4px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  input: {
    width: "100%",
    padding: "7px 9px",
    background: "#f9f9f9",
    border: "1px solid #e0e0e0",
    borderRadius: "5px",
    color: "#111",
    fontSize: "12px",
    boxSizing: "border-box" as const,
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "7px 9px",
    background: "#f9f9f9",
    border: "1px solid #e0e0e0",
    borderRadius: "5px",
    color: "#111",
    fontSize: "12px",
    boxSizing: "border-box" as const,
  },
  btnPrimary: {
    width: "100%",
    padding: "9px",
    background: "#111",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "inherit",
    letterSpacing: "0.01em",
  },
  btnDisabled: {
    width: "100%",
    padding: "9px",
    background: "#e5e5e5",
    border: "none",
    borderRadius: "6px",
    color: "#999",
    cursor: "not-allowed",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "inherit",
  },
  btnGhost: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 600,
    color: "#999",
    padding: "0 0 10px 0",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontFamily: "inherit",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  divider: {
    border: "none",
    borderTop: "1px solid #e5e5e5",
    margin: "14px 0",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  field: {
    marginBottom: "10px",
  },
  errorBox: {
    padding: "8px 10px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "5px",
    color: "#991b1b",
    fontSize: "11px",
    marginBottom: "12px",
  },
  loadingBox: {
    marginBottom: "16px",
    padding: "10px 12px",
    background: "#f9f9f9",
    border: "1px solid #e5e5e5",
    borderRadius: "6px",
  },
  loadingLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
    color: "#333",
    fontSize: "11px",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#111",
    animation: "vsPulse 1s ease-in-out infinite",
    flexShrink: 0,
  },
  track: {
    height: "3px",
    background: "#e5e5e5",
    borderRadius: "3px",
    overflow: "hidden" as const,
    position: "relative" as const,
  },
  indeterminate: {
    position: "absolute" as const,
    height: "100%",
    width: "40%",
    background: "#111",
    borderRadius: "3px",
    animation: "vsSlide 1.4s ease-in-out infinite",
  },
  outcomeMeta: {
    fontSize: "11px",
    color: "#666",
    lineHeight: "1.6",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #e5e5e5",
    marginBottom: "16px",
    gap: "0",
  },
  narrative: {
    color: "#222",
    fontSize: "12px",
    lineHeight: "1.85",
    whiteSpace: "pre-wrap" as const,
  },
  stepBlock: {
    marginBottom: "16px",
    paddingBottom: "16px",
    borderBottom: "1px solid #f0f0f0",
  },
  stepHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  stepMeta: {
    fontSize: "10px",
    fontWeight: 600,
    color: "#999",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  stepReasoning: {
    color: "#333",
    fontSize: "12px",
    lineHeight: "1.7",
    margin: "0 0 6px 0",
  },
  stepChoice: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#111",
    marginBottom: "4px",
  },
  warningOrange: {
    marginTop: "6px",
    padding: "6px 8px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "4px",
    fontSize: "11px",
    color: "#9a3412",
    lineHeight: "1.6",
  },
  warningYellow: {
    marginTop: "4px",
    padding: "6px 8px",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: "4px",
    fontSize: "11px",
    color: "#78350f",
    lineHeight: "1.6",
  },
  previewFrame: {
    marginBottom: "20px",
  },
  previewLabel: {
    fontSize: "10px",
    fontWeight: 600,
    color: "#999",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "8px",
  },
  previewImg: {
    width: "100%",
    borderRadius: "4px",
    display: "block",
    border: "1px solid #e5e5e5",
  },
  previewSubLabel: {
    fontSize: "10px",
    color: "#aaa",
    marginBottom: "4px",
  },
};

export default function Plugin() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [condition, setCondition] = useState("deuteranopia");
  const [severity, setSeverity] = useState(0.8);
  const [persona, setPersona] = useState("maya");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"narrative" | "trace" | "previews">("trace");
  const [transformedPreviews, setTransformedPreviews] = useState<{
    frameName: string;
    originalUrl: string;
    transformedUrl: string;
  }[]>([]);
  const [configOpen, setConfigOpen] = useState(true);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.pluginMessage?.type === "FRAME_SELECTED") {
        const { nodeId, nodeName } = event.data.pluginMessage;
        setSelectedFlow(nodeId);
        setFlows(prev => {
          if (prev.find(f => f.startNodeId === nodeId)) return prev;
          return [...prev, { name: nodeName, startNodeId: nodeId }];
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const loadFlows = async () => {
    setStatus("");
    const found = await figmaAPI.run(async (figma) => {
      return figma.currentPage.children
        .filter((n: any) => n.type === "FRAME")
        .map((n: any) => ({ name: n.name, startNodeId: n.id }));
    });
    if (!found.length) { setStatus("No frames found on this page."); return; }
    setFlows(found);
    setSelectedFlow(found[0].startNodeId);

    await figmaAPI.run(async (figma) => {
      figma.on("selectionchange", () => {
        const selected = figma.currentPage.selection;
        if (selected.length === 1 && selected[0].type === "FRAME") {
          figma.ui.postMessage({
            type: "FRAME_SELECTED",
            nodeId: selected[0].id,
            nodeName: selected[0].name,
          });
        }
      });
    });
  };

  const runSimulation = async () => {
    if (!selectedFlow || !task.trim()) {
      setStatus("Please set a task description before running.");
      return;
    }
    setIsLoading(true);
    setResult(null);
    setTransformedPreviews([]);
    setStatus("");
    setLoadingStep("Exporting frames from Figma...");
    setLoadingProgress(0);
    setLoadingTotal(0);
    setConfigOpen(false);

    const exportedSteps = await figmaAPI.run(
      async (figma, { startNodeId }) => {
        const results: any[] = [];
        const visited = new Set<string>();
        let currentId: string | null = startNodeId;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const node = figma.getNodeById(currentId);
          if (!node || node.type !== "FRAME") break;
          const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
          const interactiveElements: any[] = [];
          let elementIndex = 1;
          const children = node.findAll(() => true);
          for (const child of children) {
            if ("reactions" in child && (child as any).reactions.length > 0) {
              const navigatingReactions = (child as any).reactions.filter(
                (r: any) => r.action?.type === "NODE" && r.action?.destinationId
              );
              if (navigatingReactions.length > 0) {
                let meaningfulName = child.name;
                try {
                  const textChild = "findOne" in child ? (child as any).findOne((n: any) => n.type === "TEXT") : null;
                  if (textChild?.characters) meaningfulName = textChild.characters;
                } catch { }
                interactiveElements.push({
                  index: elementIndex++,
                  name: meaningfulName,
                  destinationId: navigatingReactions[0].action.destinationId,
                  x: (child as any).x,
                  y: (child as any).y,
                  frameWidth: node.width,
                  frameHeight: node.height,
                });
              }
            }
          }
          results.push({
            frameId: node.id,
            frameName: node.name,
            imageBytes: Array.from(bytes),
            interactiveElements,
            frameWidth: node.width,
            frameHeight: node.height,
          });
          let nextId: string | null = null;
          for (const child of children) {
            if ("reactions" in child) {
              for (const reaction of (child as any).reactions) {
                if (reaction.action?.type === "NODE" && reaction.action?.destinationId) {
                  nextId = reaction.action.destinationId;
                  break;
                }
              }
            }
            if (nextId) break;
          }
          currentId = nextId;
        }
        return results;
      },
      { startNodeId: selectedFlow }
    );

    setLoadingTotal(exportedSteps.length);
    setLoadingProgress(0);
    const stepsWithTransformed: any[] = [];

    for (let i = 0; i < exportedSteps.length; i++) {
      const step = exportedSteps[i];
      setLoadingStep(`Transforming frame ${i + 1} of ${exportedSteps.length}`);
      setLoadingProgress(i + 1);
      try {
        const blob = new Blob([new Uint8Array(step.imageBytes)], { type: "image/png" });
        const formData = new FormData();
        formData.append("image", blob, `${step.frameName}.png`);
        formData.append("condition", condition);
        formData.append("severity", severity.toString());
        const response = await fetch(`${SERVER_URL}/transform`, { method: "POST", body: formData });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const transformedBlob = await response.blob();
        const transformedBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(transformedBlob);
        });
        const elementsWithPositions = step.interactiveElements.map((el: any) => ({
          index: el.index,
          name: el.name,
          position: getPositionLabel(el.x, el.y, step.frameWidth, step.frameHeight),
          destinationId: el.destinationId,
        }));
        stepsWithTransformed.push({
          frameName: step.frameName,
          transformedImageBase64: transformedBase64,
          interactiveElements: elementsWithPositions,
        });
        setTransformedPreviews(prev => [...prev, {
          frameName: step.frameName,
          originalUrl: URL.createObjectURL(blob),
          transformedUrl: `data:image/png;base64,${transformedBase64}`,
        }]);
      } catch (err) {
        setLoadingStep("");
        setStatus(`Error transforming ${step.frameName}: ${err}. Is the Python server running?`);
        setIsLoading(false);
        return;
      }
    }

    setLoadingStep("Running VLM traversal");
    setLoadingProgress(0);
    setLoadingTotal(0);

    try {
      const response = await fetch("/api/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaKey: persona,
          condition,
          severity,
          task,
          steps: stepsWithTransformed,
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data: SimulationResult = await response.json();
      setResult(data);
      setLoadingStep("");
    } catch (err) {
      setLoadingStep("");
      setStatus(`Error during VLM traversal: ${err}`);
    }

    setIsLoading(false);
  };

  return (
    <div style={s.root}>
      <style>{`
        @keyframes vsPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes vsSlide { 0%{left:-40%} 100%{left:140%} }
        select:focus, input:focus { outline: 2px solid #111; outline-offset: 1px; }
      `}</style>

      <div style={s.header}>
        <span style={s.headerTitle}>ViSight</span>
        <span style={s.headerSub}>UI/UX Accessibility Evaluation Using Persona-Conditioned VLMs</span>
      </div>

      <div style={s.body}>

        {flows.length === 0 && (
          <button onClick={loadFlows} style={s.btnPrimary}>
            Load Frames from Current Page
          </button>
        )}

        {flows.length > 0 && (
          <div style={{ marginBottom: "4px" }}>
            <button style={s.btnGhost} onClick={() => setConfigOpen(o => !o)}>
              <span style={{
                display: "inline-block",
                transition: "transform 0.15s",
                transform: configOpen ? "rotate(90deg)" : "rotate(0deg)",
                fontSize: "8px",
              }}>▶</span>
              Configuration
            </button>

            {configOpen && (
              <>
                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>
                      Starting frame{" "}
                      <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none", letterSpacing: 0 }}>
                        (or click a frame on canvas)
                      </span>
                    </label>
                    <select
                      style={s.select}
                      value={selectedFlow ?? ""}
                      onChange={e => setSelectedFlow(e.target.value)}
                    >
                      {flows.map(f => (
                        <option key={f.startNodeId} value={f.startNodeId}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Persona</label>
                    <select
                      style={s.select}
                      value={persona}
                      onChange={e => setPersona(e.target.value)}
                    >
                      {PERSONAS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={s.grid2}>
                  <div style={s.field}>
                    <label style={s.label}>Condition</label>
                    <select
                      style={s.select}
                      value={condition}
                      onChange={e => setCondition(e.target.value)}
                    >
                      {CONDITIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Severity — {Math.round(severity * 100)}%</label>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={severity}
                      onChange={e => setSeverity(parseFloat(e.target.value))}
                      style={{ width: "100%", marginTop: "8px", accentColor: "#111" }}
                    />
                  </div>
                </div>

                <div style={s.field}>
                  <label style={s.label}>Task goal</label>
                  <input
                    type="text"
                    placeholder="e.g. Complete the registration form"
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    style={s.input}
                  />
                </div>

                <button
                  onClick={runSimulation}
                  disabled={isLoading}
                  style={isLoading ? s.btnDisabled : s.btnPrimary}
                >
                  {isLoading ? "Running..." : "Run Simulation →"}
                </button>
              </>
            )}
          </div>
        )}

        {status && <div style={s.errorBox}>{status}</div>}

        {isLoading && loadingStep && (
          <div style={s.loadingBox}>
            <div style={s.loadingLabel}>
              <div style={s.dot} />
              {loadingStep}
            </div>
            <div style={s.track}>
              {loadingTotal > 0
                ? <div style={{ height: "100%", background: "#111", borderRadius: "3px", width: `${(loadingProgress / loadingTotal) * 100}%`, transition: "width 0.3s ease" }} />
                : <div style={s.indeterminate} />
              }
            </div>
          </div>
        )}

        {result && (() => {
          const oc = outcomeConfig[result.finalOutcome];
          return (
            <div>
              <hr style={s.divider} />

              <div style={{
                padding: "10px 12px",
                background: oc.bg,
                border: `1px solid ${oc.border}`,
                borderRadius: "6px",
                marginBottom: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div style={s.outcomeMeta}>
                  <div style={{ fontWeight: 600, color: "#333", marginBottom: "1px" }}>
                    {result.personaName} · {CONDITIONS.find(c => c.value === condition)?.label} · {Math.round(severity * 100)}%
                  </div>
                  <div>{task}</div>
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: oc.color, whiteSpace: "nowrap" }}>
                  {oc.label}
                </span>
              </div>

              <div style={s.tabBar}>
                {(["trace", "narrative"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "7px 12px",
                      background: "none",
                      border: "none",
                      borderBottom: activeTab === tab ? "2px solid #111" : "2px solid transparent",
                      color: activeTab === tab ? "#111" : "#999",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: activeTab === tab ? 600 : 400,
                      fontFamily: "inherit",
                      marginBottom: "-1px",
                    }}
                  >
                    {tab === "narrative" ? "Report" : "Step Trace"}
                  </button>
                ))}
              </div>

              {activeTab === "narrative" && (
                <div style={s.narrative}>{result.narrative}</div>
              )}

              {activeTab === "trace" && (
                <div>
                  {result.sessionTrace.map(step => {
                    const preview = transformedPreviews.find(p => p.frameName === step.frameName);
                    return (
                      <div key={step.step} style={s.stepBlock}>
                        <div style={s.stepHeader}>
                          <span style={s.stepMeta}>Step {step.step} · {step.frameName}</span>
                          <span style={{
                            ...s.stepMeta,
                            color: step.confidence === "high" ? "#166534" : step.confidence === "medium" ? "#92400e" : "#991b1b",
                          }}>
                            {step.confidence} confidence
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", alignItems: "start" }}>
                          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
                            {preview
                              ? <img
                                  src={preview.transformedUrl}
                                  alt={step.frameName}
                                  style={{ width: "80%", borderRadius: "5px", border: "1px solid #e5e5e5", display: "block", padding: "6px", boxSizing: "border-box" }}
                                />
                              : <div style={{ width: "80%", aspectRatio: "9/16", background: "#f5f5f5", borderRadius: "5px", border: "1px solid #e5e5e5" }} />
                            }
                          </div>

                          <div>
                            <p style={s.stepReasoning}>{step.reasoning}</p>
                            <div style={s.stepChoice}>→ {step.choice}</div>
                            {step.detectedButNotWired && step.detectedButNotWired.length > 0 && (
                              <div style={s.warningOrange}>
                                <span style={{ fontWeight: 600 }}>Visible but unwired: </span>
                                {step.detectedButNotWired.slice(0, 5).join(", ")}
                                {step.detectedButNotWired.length > 5 && ` +${step.detectedButNotWired.length - 5} more`}
                              </div>
                            )}
                            {step.wiredButNotDetected && step.wiredButNotDetected.length > 0 && (
                              <div style={s.warningYellow}>
                                <span style={{ fontWeight: 600 }}>Wired but imperceptible: </span>
                                {step.wiredButNotDetected.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Previews — commented out, re-enable for debugging
              {activeTab === "previews" && (
                <div>
                  {transformedPreviews.length === 0
                    ? <p style={{ color: "#aaa", fontSize: "11px" }}>No previews available.</p>
                    : transformedPreviews.map((preview, i) => (
                      <div key={i} style={s.previewFrame}>
                        <div style={s.previewLabel}>{preview.frameName}</div>
                        <div style={s.grid2}>
                          <div>
                            <div style={s.previewSubLabel}>Original</div>
                            <img src={preview.originalUrl} alt="original" style={s.previewImg} />
                          </div>
                          <div>
                            <div style={s.previewSubLabel}>{CONDITIONS.find(c => c.value === condition)?.label}</div>
                            <img src={preview.transformedUrl} alt="transformed" style={s.previewImg} />
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
              */}
            </div>
          );
        })()}
      </div>
    </div>
  );
}