import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, RefreshCw, Check, AlertCircle, FileSearch } from "lucide-react";

interface PathConfig {
    schematic?: string;
    pcb?: string;
    subsheets?: string;
    designOutputs?: string;
    manufacturingOutputs?: string;
    documentation?: string;
    thumbnail?: string;
    readme?: string;
    jobset?: string;
}

interface PathConfigDialogProps {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PATH_LABELS: Record<string, { label: string; description: string }> = {
    schematic: {
        label: "Schematic",
        description: "Main schematic file (e.g., *.kicad_sch or project.kicad_sch)",
    },
    pcb: {
        label: "PCB",
        description: "PCB layout file (e.g., *.kicad_pcb or project.kicad_pcb)",
    },
    subsheets: {
        label: "Subsheets Folder",
        description: "Directory for hierarchical sheets (leave empty for project root)",
    },
    designOutputs: {
        label: "Design Outputs",
        description: "Directory for design outputs (PDFs, 3D models, etc.)",
    },
    manufacturingOutputs: {
        label: "Manufacturing Outputs",
        description: "Directory for manufacturing files (Gerbers, BOMs)",
    },
    documentation: {
        label: "Documentation",
        description: "Directory containing project documentation (markdown files)",
    },
    thumbnail: {
        label: "Thumbnail",
        description: "Path to thumbnail image or folder containing images",
    },
    readme: {
        label: "README",
        description: "README file name (e.g., README.md)",
    },
    jobset: {
        label: "Jobset File",
        description: "KiCAD jobset file for workflows (e.g., Outputs.kicad_jobset)",
    },
};

export function PathConfigDialog({ projectId, open, onOpenChange }: PathConfigDialogProps) {
    const [config, setConfig] = useState<PathConfig>({});
    const [originalConfig, setOriginalConfig] = useState<PathConfig>({});
    const [resolvedPaths, setResolvedPaths] = useState<Record<string, string | null>>({});
    const [source, setSource] = useState<string>("auto-detected");
    const [saving, setSaving] = useState(false);
    const [detecting, setDetecting] = useState(false);

    const fetchConfig = async () => {
        try {
            const response = await fetch(`/api/projects/${projectId}/config`);
            if (response.ok) {
                const data = await response.json();
                setConfig(data.config || {});
                setOriginalConfig(data.config || {});
                setResolvedPaths(data.resolved || {});
                setSource(data.source || "auto-detected");
            }
        } catch (err) {
            console.error("Failed to fetch config:", err);
        }
    };

    const detectPaths = async () => {
        setDetecting(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/detect-paths`, {
                method: "POST",
            });
            if (response.ok) {
                const data = await response.json();
                setConfig(data.detected || {});
                setSource("auto-detected (preview)");
            }
        } catch (err) {
            console.error("Failed to detect paths:", err);
        } finally {
            setDetecting(false);
        }
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (response.ok) {
                const data = await response.json();
                setOriginalConfig(config);
                setResolvedPaths(data.resolved || {});
                setSource("explicit");
            }
        } catch (err) {
            console.error("Failed to save config:", err);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchConfig();
        }
    }, [open, projectId]);

    const handleChange = (key: keyof PathConfig, value: string) => {
        setConfig((prev) => ({ ...prev, [key]: value || undefined }));
    };

    const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

    const getStatusIcon = (key: string) => {
        const resolved = resolvedPaths[key];
        if (!resolved) return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
        if (key === "thumbnail" && resolved) {
            return <Check className="h-4 w-4 text-green-500" />;
        }
        return <Check className="h-4 w-4 text-green-500" />;
    };

    const getResolvedPath = (key: string) => {
        const path = resolvedPaths[key];
        if (!path) return null;
        // Shorten the path for display
        const parts = path.split("/");
        if (parts.length > 3) {
            return ".../" + parts.slice(-3).join("/");
        }
        return path;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Path Configuration
                    </DialogTitle>
                    <DialogDescription>
                        Configure folder and file paths for this project.
                        <div className="flex items-center gap-2 mt-2">
                            <Badge variant={source === "explicit" ? "default" : "secondary"}>
                                {source}
                            </Badge>
                            {hasChanges && (
                                <Badge variant="destructive" className="text-xs">
                                    Unsaved changes
                                </Badge>
                            )}
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="px-6 py-2 max-h-[50vh]">
                    <div className="space-y-4">
                        {Object.entries(PATH_LABELS).map(([key, { label, description }]) => (
                            <div key={key} className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={key} className="text-sm font-medium">
                                        {label}
                                    </Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="cursor-help">
                                                    {getStatusIcon(key)}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                                <p className="max-w-sm">{description}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                <Input
                                    id={key}
                                    value={config[key as keyof PathConfig] || ""}
                                    onChange={(e) => handleChange(key as keyof PathConfig, e.target.value)}
                                    placeholder={description}
                                    className="h-8"
                                />
                                {resolvedPaths[key] && (
                                    <p className="text-xs text-muted-foreground truncate">
                                        Resolved: {getResolvedPath(key)}
                                    </p>
                                )}
                                {key === "subsheets" && !config.subsheets && (
                                    <p className="text-xs text-blue-500">Using project root (all .kicad_sch files)</p>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <Separator />

                <DialogFooter className="p-6 pt-4 gap-2">
                    <Button
                        variant="outline"
                        onClick={detectPaths}
                        disabled={detecting}
                        className="gap-2"
                    >
                        <FileSearch className="h-4 w-4" />
                        {detecting ? "Detecting..." : "Auto-Detect"}
                    </Button>
                    <div className="flex-1" />
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={saveConfig}
                        disabled={saving || !hasChanges}
                        className="gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
                        {saving ? "Saving..." : "Save Configuration"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
