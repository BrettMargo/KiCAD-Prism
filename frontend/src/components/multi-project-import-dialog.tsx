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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Folder, FileText, Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoveredProject {
    name: string;
    relative_path: string;
    schematic_count: number;
    pcb_count: number;
    description?: string;
}

interface MultiProjectImportDialogProps {
    repoUrl: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (selectedPaths: string[]) => void;
}

export function MultiProjectImportDialog({
    repoUrl,
    open,
    onOpenChange,
    onImport,
}: MultiProjectImportDialogProps) {
    const [projects, setProjects] = useState<DiscoveredProject[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [repoName, setRepoName] = useState("");

    useEffect(() => {
        if (open && repoUrl) {
            discoverProjects();
        }
    }, [open, repoUrl]);

    const discoverProjects = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/projects/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: repoUrl }),
            });

            if (!response.ok) {
                throw new Error("Failed to discover projects");
            }

            const data = await response.json();
            setProjects(data.projects);
            setRepoName(data.repo_name);

            // Auto-select all projects by default
            const allPaths = new Set<string>(data.projects.map((p: DiscoveredProject) => p.relative_path));
            setSelectedPaths(allPaths);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleProject = (path: string) => {
        setSelectedPaths((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    const toggleAll = (checked?: boolean | string) => {
        if (checked === true) {
            setSelectedPaths(new Set<string>(projects.map((p) => p.relative_path)));
        } else {
            setSelectedPaths(new Set<string>());
        }
    };

    const handleImport = () => {
        onImport(Array.from(selectedPaths));
        onOpenChange(false);
    };

    // Group projects by parent directory for tree view
    const groupedProjects = projects.reduce((acc, project) => {
        const parts = project.relative_path.split("/");
        const parent = parts.length > 1 ? parts[0] : "Root";
        if (!acc[parent]) {
            acc[parent] = [];
        }
        acc[parent].push(project);
        return acc;
    }, {} as Record<string, DiscoveredProject[]>);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle className="flex items-center gap-2">
                        <Folder className="h-5 w-5" />
                        Import from {repoName || "Repository"}
                    </DialogTitle>
                    <DialogDescription>
                        {projects.length > 0
                            ? `Found ${projects.length} KiCAD project${projects.length !== 1 ? "s" : ""}. Select which ones to import.`
                            : "Scanning for KiCAD projects..."}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <p className="text-muted-foreground">Scanning repository...</p>
                    </div>
                ) : error ? (
                    <div className="px-6 py-8 text-center">
                        <p className="text-red-500">{error}</p>
                        <Button
                            variant="outline"
                            onClick={discoverProjects}
                            className="mt-4"
                        >
                            Retry
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="px-6 pb-2">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <Checkbox
                                        checked={selectedPaths.size === projects.length && projects.length > 0}
                                        onCheckedChange={toggleAll}
                                    />
                                    <span className="text-sm font-medium">
                                        {selectedPaths.size === projects.length
                                            ? "Deselect All"
                                            : "Select All"}
                                    </span>
                                </label>
                                <Badge variant="secondary">
                                    {selectedPaths.size} selected
                                </Badge>
                            </div>
                        </div>

                        <ScrollArea className="px-6 py-2 max-h-[50vh]">
                            <div className="space-y-4">
                                {Object.entries(groupedProjects).map(([parent, groupProjects]) => (
                                    <div key={parent}>
                                        {parent !== "Root" && (
                                            <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                                <Folder className="h-3 w-3" />
                                                {parent}
                                            </h4>
                                        )}
                                        <div className="space-y-2 ml-0">
                                            {groupProjects.map((project) => (
                                                <div
                                                    key={project.relative_path}
                                                    className={cn(
                                                        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                                                        selectedPaths.has(project.relative_path)
                                                            ? "border-primary bg-primary/5"
                                                            : "border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    <Checkbox
                                                        checked={selectedPaths.has(project.relative_path)}
                                                        onCheckedChange={() => toggleProject(project.relative_path)}
                                                        className="mt-1"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Cpu className="h-4 w-4 text-primary" />
                                                            <span className="font-medium truncate">
                                                                {project.name}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1 truncate">
                                                            {project.relative_path}
                                                        </p>
                                                        {project.description && (
                                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                                {project.description}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-3 mt-2">
                                                            {project.schematic_count > 0 && (
                                                                <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                                                    <FileText className="h-3 w-3" />
                                                                    {project.schematic_count} schematic
                                                                    {project.schematic_count !== 1 ? "s" : ""}
                                                                </span>
                                                            )}
                                                            {project.pcb_count > 0 && (
                                                                <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                                                    <Cpu className="h-3 w-3" />
                                                                    {project.pcb_count} PCB
                                                                    {project.pcb_count !== 1 ? "s" : ""}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        <Separator />

                        <DialogFooter className="p-6 pt-4 gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={selectedPaths.size === 0}
                                className="gap-2"
                            >
                                Import {selectedPaths.size} Project
                                {selectedPaths.size !== 1 ? "s" : ""}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
