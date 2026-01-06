import { useEffect, useState } from "react";
import { Project } from "@/types/project";
import { ProjectCard } from "./project-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function Workspace() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Import Dialog State
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importUrl, setImportUrl] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState({ message: "", percent: 0 });

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/projects/");
            if (!response.ok) {
                throw new Error("Failed to fetch projects");
            }
            const data = await response.json();
            setProjects(data);
        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    const handleImport = async () => {
        if (!importUrl) return;

        setIsImporting(true);
        setImportStatus({ message: "Starting...", percent: 0 });

        try {
            // Start Job
            const startRes = await fetch("/api/projects/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: importUrl }),
            });

            if (!startRes.ok) {
                const errorData = await startRes.json();
                throw new Error(errorData.detail || "Failed to start import");
            }

            const { job_id } = await startRes.json();

            // Poll Status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/projects/import/${job_id}`);
                    if (!statusRes.ok) return;

                    const status = await statusRes.json();

                    if (status.status === 'completed') {
                        clearInterval(pollInterval);
                        setIsImporting(false);
                        setIsImportOpen(false);
                        setImportUrl("");
                        setImportStatus({ message: "", percent: 0 });
                        fetchProjects(); // Refresh list
                    } else if (status.status === 'failed') {
                        clearInterval(pollInterval);
                        setIsImporting(false);
                        alert(`Import Failed: ${status.error}`);
                        setImportStatus({ message: "", percent: 0 });
                    } else {
                        setImportStatus({
                            message: status.message,
                            percent: status.percent || 0
                        });
                    }
                } catch (e) {
                    console.error("Poll error", e);
                }
            }, 1000);

        } catch (err: any) {
            setIsImporting(false);
            alert(err.message);
        }
    };

    // Filter projects based on search query
    const filteredProjects = projects.filter((project) => {
        const query = searchQuery.toLowerCase();
        return (
            project.name.toLowerCase().includes(query) ||
            project.description.toLowerCase().includes(query)
        );
    });

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-red-500">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="h-full">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Recent Projects</h2>

                <div className="flex items-center gap-4">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <Button onClick={() => setIsImportOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Import Project
                    </Button>
                </div>
            </div>

            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Project</DialogTitle>
                        <DialogDescription>
                            Enter the URL of a GitHub repository containing a KiCAD project.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="url" className="text-right">
                                GitHub URL
                            </Label>
                            <Input
                                id="url"
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                placeholder="https://github.com/username/repo"
                                className="col-span-3"
                                disabled={isImporting}
                            />
                        </div>

                        {isImporting && (
                            <div className="space-y-2 mt-4">
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-300 ease-out"
                                        style={{ width: `${importStatus.percent}%` }}
                                    />
                                </div>
                                <p className="text-sm text-center text-muted-foreground">
                                    {importStatus.message}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsImportOpen(false)} disabled={isImporting}>
                            Cancel
                        </Button>
                        <Button onClick={handleImport} disabled={isImporting || !importUrl}>
                            {isImporting ? "Importing..." : "Import"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[280px] rounded-xl" />
                    ))}
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>{searchQuery ? `No projects found matching "${searchQuery}"` : "No projects found."}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProjects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            )}
        </div>
    );
}
