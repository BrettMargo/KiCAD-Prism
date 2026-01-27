import { useState, useEffect, useRef } from "react";
import { X, Loader2, AlertCircle, Layers, FileImage, Eye, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface VisualDiffViewerProps {
    projectId: string;
    commit1: string;  // Newer commit
    commit2: string;  // Older commit
    onClose: () => void;
}

interface DiffJobStatus {
    status: "running" | "completed" | "failed";
    message: string;
    percent: number;
    logs: string[];
    error?: string;
}

interface DiffManifest {
    job_id: string;
    commit1: string;
    commit2: string;
    schematic: boolean;
    pcb: boolean;
    sheets: string[]; // filenames
    layers: string[]; // layer names like F.Cu
}

export function VisualDiffViewer({ projectId, commit1, commit2, onClose }: VisualDiffViewerProps) {
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<DiffJobStatus | null>(null);
    const [manifest, setManifest] = useState<DiffManifest | null>(null);
    const [error, setError] = useState<string | null>(null);

    // View State
    const [viewMode, setViewMode] = useState<"schematic" | "pcb">("schematic");
    const [selectedSheet, setSelectedSheet] = useState<string>("");
    const [selectedLayer, setSelectedLayer] = useState<string>("");
    const [opacity, setOpacity] = useState([50]); // 0-100, 50 = mix

    // Layout
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (jobId) {
                fetch(`/api/projects/${projectId}/diff/${jobId}`, { method: "DELETE" });
            }
        };
    }, [jobId, projectId]);

    // Start Job
    useEffect(() => {
        const startJob = async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/diff`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ commit1, commit2 })
                });

                if (!res.ok) throw new Error("Failed to start diff job");

                const data = await res.json();
                setJobId(data.job_id);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to start diff");
            }
        };
        startJob();
    }, [projectId, commit1, commit2]);

    // Poll Status
    useEffect(() => {
        if (!jobId || manifest) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/diff/${jobId}/status`);
                if (!res.ok) throw new Error("Failed to poll status");
                const data: DiffJobStatus = await res.json();
                setStatus(data);

                if (data.status === "failed") {
                    setError(data.error || "Generation failed");
                } else if (data.status === "completed") {
                    // Fetch manifest
                    const mRes = await fetch(`/api/projects/${projectId}/diff/${jobId}/manifest`);
                    if (mRes.ok) {
                        const mData: DiffManifest = await mRes.json();
                        setManifest(mData);

                        // Set defaults
                        if (mData.sheets.length > 0) setSelectedSheet(mData.sheets[0]);
                        if (mData.layers.length > 0) setSelectedLayer(mData.layers[0]);
                        if (!mData.schematic && mData.pcb) setViewMode("pcb");
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };

        const interval = setInterval(() => {
            if (status?.status !== "completed" && status?.status !== "failed") {
                poll();
            }
        }, 1000);
        poll();
        return () => clearInterval(interval);
    }, [jobId, projectId, status?.status, manifest]);

    // Scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [status?.logs]);


    // Asset URLs
    const getAssetUrl = (commit: string, type: "sch" | "pcb", item: string) => {
        if (!jobId) return "";
        // item is filename for sch, layer name for pcb
        let filename = item;
        if (type === "pcb") {
            filename = item.replace(/\./g, "_") + ".svg";
        }
        return `/api/projects/${projectId}/diff/${jobId}/assets/${commit}/${type}/${encodeURIComponent(filename)}`;
    };

    const renderViewer = () => {
        if (!manifest) return null;

        const isSch = viewMode === "schematic";
        const currentItem = isSch ? selectedSheet : selectedLayer;

        if (!currentItem) return <div className="flex items-center justify-center h-full text-muted-foreground">No assets found</div>;

        const oldImg = getAssetUrl(commit2, isSch ? "sch" : "pcb", currentItem);
        const newImg = getAssetUrl(commit1, isSch ? "sch" : "pcb", currentItem);

        return (
            <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={20}
                centerOnInit
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        {/* Floating Zoom Controls */}
                        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 bg-background/90 backdrop-blur border rounded-md p-1 shadow-lg">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()}>
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()}>
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetTransform()}>
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        </div>

                        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                            <div className="relative shadow-2xl border bg-white" style={{ minWidth: "1200px", minHeight: "800px" }}>
                                {/* Old Commit (Bottom) */}
                                <img
                                    src={oldImg}
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                    alt="Old Version"
                                />

                                {/* New Commit (Top) - Opacity controlled */}
                                <img
                                    src={newImg}
                                    className="absolute inset-0 w-full h-full object-contain bg-white transition-opacity duration-150 pointer-events-none"
                                    style={{ opacity: opacity[0] / 100 }}
                                    alt="New Version"
                                />
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        );
    };

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-background border rounded-lg shadow-lg flex flex-col w-[98vw] h-[95vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold">Visual Diff</h2>
                        <div className="text-sm text-muted-foreground flex gap-2">
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">{commit2.slice(0, 7)} (Old)</span>
                            <span>vs</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200">{commit1.slice(0, 7)} (New)</span>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>

                {manifest ? (
                    // Toolbar & Viewer
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="p-2 border-b bg-muted/30 flex items-center gap-4 flex-wrap">
                            {/* Mode Scwitcher */}
                            <div className="flex items-center rounded-md border bg-background p-1">
                                <Button
                                    variant={viewMode === "schematic" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode("schematic")}
                                    disabled={!manifest.schematic}
                                >
                                    <FileImage className="h-4 w-4 mr-2" /> Schematic
                                </Button>
                                <Button
                                    variant={viewMode === "pcb" ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setViewMode("pcb")}
                                    disabled={!manifest.pcb}
                                >
                                    <Layers className="h-4 w-4 mr-2" /> PCB
                                </Button>
                            </div>

                            {/* Selector */}
                            <div className="w-64">
                                {viewMode === "schematic" ? (
                                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                                        <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select Sheet" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {manifest.sheets.map(s => <SelectItem key={s} value={s}>{s.replace(".svg", "")}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Select value={selectedLayer} onValueChange={setSelectedLayer}>
                                        <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select Layer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {manifest.layers.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="flex-1" />

                            {/* Opacity Slider */}
                            <div className="flex items-center gap-3 w-64 bg-background border px-4 py-2 rounded-full shadow-sm">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs font-semibold w-8 text-right text-red-600">Old</span>
                                <Slider
                                    value={opacity}
                                    onValueChange={setOpacity}
                                    max={100}
                                    step={1}
                                    className="flex-1"
                                />
                                <span className="text-xs font-semibold w-8 text-green-600">New</span>
                            </div>
                        </div>

                        {/* Canvas */}
                        <div className="flex-1 bg-zinc-100 overflow-hidden relative">
                            {renderViewer()}
                        </div>
                    </div>
                ) : (
                    // Loading State
                    <div className="flex-1 flex flex-col p-8">
                        {error ? (
                            <div className="text-center text-destructive">
                                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                                <h3 className="text-lg font-bold">Generation Failed</h3>
                                <p>{error}</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
                                    <h3 className="text-lg font-medium">{status?.message || "Initializing..."}</h3>
                                </div>
                                <div className="flex-1 bg-zinc-950 rounded-lg p-4 font-mono text-xs text-zinc-300 overflow-auto border border-zinc-800">
                                    {status?.logs.map((L, i) => (
                                        <div key={i} className="border-b border-zinc-900/50 pb-0.5 mb-0.5">{L}</div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
