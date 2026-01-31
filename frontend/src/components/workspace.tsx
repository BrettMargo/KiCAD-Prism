import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Project, Monorepo, MonorepoStructure } from "@/types/project";
import { ProjectCard } from "./project-card";
import { SidebarTree } from "./sidebar-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight, Folder, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiProjectImportDialog } from "./multi-project-import-dialog";
import { cn } from "@/lib/utils";

interface FolderCardProps {
  folder: { name: string; path: string; item_count: number };
  onDoubleClick: () => void;
}

function FolderCard({ folder, onDoubleClick }: FolderCardProps) {
  return (
    <div
      className="group relative bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
      onDoubleClick={onDoubleClick}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Folder className="h-8 w-8 text-blue-500" />
        </div>
        <div>
          <h3 className="font-medium text-sm truncate max-w-[150px]">{folder.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{folder.item_count} items</p>
        </div>
      </div>
    </div>
  );
}

interface MonorepoProjectCardProps {
  project: { id: string; name: string; relative_path: string; has_thumbnail: boolean; last_modified: string };
  repoName: string;
  onClick: () => void;
}

function MonorepoProjectCard({ project, repoName, onClick }: MonorepoProjectCardProps) {
  return (
    <div
      className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {project.has_thumbnail ? (
          <img
            src={`/api/projects/${project.id}/thumbnail`}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-4xl font-bold text-muted-foreground/30">
              {project.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{project.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{repoName}</p>
        <p className="text-xs text-muted-foreground">Modified: {project.last_modified}</p>
      </div>
    </div>
  );
}

export function Workspace() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [monorepos, setMonorepos] = useState<Monorepo[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Navigation state
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedMonorepo, setSelectedMonorepo] = useState<string | undefined>();
  const [selectedMonorepoPath, setSelectedMonorepoPath] = useState<string | undefined>();
  const [monorepoStructure, setMonorepoStructure] = useState<MonorepoStructure | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ repoName?: string; path?: string }>({});

  // Import Dialog State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState({ message: "", percent: 0 });
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showMultiProjectDialog, setShowMultiProjectDialog] = useState(false);

  // Recent projects (last 3 opened) - stored in localStorage
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("recentProjects");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectsRes, monoreposRes] = await Promise.all([
        fetch("/api/projects/"),
        fetch("/api/projects/monorepos")
      ]);

      if (!projectsRes.ok || !monoreposRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const [projectsData, monoreposData] = await Promise.all([
        projectsRes.json(),
        monoreposRes.json()
      ]);

      setProjects(projectsData);
      setMonorepos(monoreposData);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Global search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/projects/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Load monorepo structure when navigating
  useEffect(() => {
    if (selectedMonorepo) {
      const subpath = selectedMonorepoPath || "";
      fetch(`/api/projects/monorepos/${selectedMonorepo}/structure?subpath=${encodeURIComponent(subpath)}`)
        .then((res) => res.json())
        .then((data) => {
          setMonorepoStructure(data);
          setBreadcrumb({ repoName: selectedMonorepo, path: subpath });
        })
        .catch(console.error);
    } else {
      setMonorepoStructure(null);
      setBreadcrumb({});
    }
  }, [selectedMonorepo, selectedMonorepoPath]);

  const handleImport = async () => {
    if (!importUrl) return;

    setIsDiscovering(true);

    try {
      const discoverRes = await fetch("/api/projects/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });

      if (!discoverRes.ok) {
        const errorData = await discoverRes.json();
        throw new Error(errorData.detail || "Failed to discover projects");
      }

      const discovery = await discoverRes.json();

      if (discovery.project_count > 1) {
        setIsDiscovering(false);
        setShowMultiProjectDialog(true);
        setIsImportOpen(false);
      } else if (discovery.project_count === 1) {
        setIsDiscovering(false);
        await startImport([]);
      } else {
        setIsDiscovering(false);
        alert("No KiCAD projects found in this repository");
      }
    } catch (err: any) {
      setIsDiscovering(false);
      alert(err.message);
    }
  };

  const startImport = async (selectedPaths: string[]) => {
    setIsImporting(true);
    setImportStatus({ message: "Starting...", percent: 0 });

    try {
      const startRes = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl, selected_paths: selectedPaths }),
      });

      if (!startRes.ok) {
        const errorData = await startRes.json();
        throw new Error(errorData.detail || "Failed to start import");
      }

      const { job_id } = await startRes.json();

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/projects/import/${job_id}`);
          if (!statusRes.ok) return;

          const status = await statusRes.json();

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setIsImporting(false);
            setIsImportOpen(false);
            setShowMultiProjectDialog(false);
            setImportUrl("");
            setImportStatus({ message: "", percent: 0 });
            fetchData();
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setIsImporting(false);
            alert(`Import Failed: ${status.error}`);
            setImportStatus({ message: "", percent: 0 });
          } else {
            setImportStatus({
              message: status.message,
              percent: status.percent || 0,
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

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedMonorepo(undefined);
    setSelectedMonorepoPath(undefined);

    // Update recent projects
    setRecentProjectIds((prev) => {
      const newRecent = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, 3);
      localStorage.setItem("recentProjects", JSON.stringify(newRecent));
      return newRecent;
    });

    // Navigate to project
    navigate(`/project/${project.id}`);
  };

  const handleSelectMonorepoFolder = (repoName: string, path: string) => {
    setSelectedMonorepo(repoName);
    setSelectedMonorepoPath(path);
    setSelectedProjectId(undefined);

    // Check if it's a project (has .kicad_pro) - navigate if so
    if (monorepoStructure) {
      const project = monorepoStructure.projects.find((p) => p.relative_path === path);
      if (project) {
        // Update recent projects
        setRecentProjectIds((prev) => {
          const newRecent = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, 3);
          localStorage.setItem("recentProjects", JSON.stringify(newRecent));
          return newRecent;
        });
        navigate(`/project/${project.id}`);
      }
    }
  };

  const handleNavigateToFolder = (folderPath: string) => {
    if (selectedMonorepo) {
      setSelectedMonorepoPath(folderPath);
    }
  };

  const handleGoHome = () => {
    setSelectedMonorepo(undefined);
    setSelectedMonorepoPath(undefined);
    setSelectedProjectId(undefined);
    setSearchQuery("");
  };

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProject = async (project: Project) => {
    setProjectToDelete(project);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        // Remove from recent projects if present
        setRecentProjectIds((prev) => prev.filter((id) => id !== projectToDelete.id));
        // Refresh the project list
        fetchData();
      } else {
        alert('Failed to delete project');
      }
    } catch (e) {
      console.error('Delete error:', e);
      alert('Failed to delete project');
    } finally {
      setIsDeleting(false);
      setProjectToDelete(null);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (!selectedMonorepo) return;
    if (index === 0) {
      // Root level
      setSelectedMonorepoPath("");
    } else if (breadcrumb.path) {
      const parts = breadcrumb.path.split("/");
      const newPath = parts.slice(0, index).join("/");
      setSelectedMonorepoPath(newPath);
    }
  };

  // Get recent projects data
  const recentProjects = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter(Boolean) as Project[];

  // Filter projects based on search (for standalone projects view only)
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
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="font-semibold text-lg">KiCAD Prism</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <SidebarTree
              standaloneProjects={projects}
              monorepos={monorepos}
              selectedProjectId={selectedProjectId}
              selectedMonorepo={selectedMonorepo}
              selectedMonorepoPath={selectedMonorepoPath}
              onSelectProject={handleSelectProject}
              onSelectMonorepoFolder={handleSelectMonorepoFolder}
              onGoHome={handleGoHome}
              onRefresh={fetchData}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            {/* Breadcrumb */}
            {breadcrumb.repoName ? (
              <nav className="flex items-center gap-2 text-sm">
                <span
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => handleBreadcrumbClick(0)}
                >
                  {breadcrumb.repoName}
                </span>
                {breadcrumb.path && (
                  <>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    {breadcrumb.path.split("/").map((part, index, arr) => (
                      <span key={index} className="flex items-center gap-2">
                        <span
                          className={cn(
                            index === arr.length - 1
                              ? "font-medium text-foreground"
                              : "text-muted-foreground hover:text-foreground cursor-pointer"
                          )}
                          onClick={() =>
                            index < arr.length - 1 && handleBreadcrumbClick(index + 1)
                          }
                        >
                          {part}
                        </span>
                        {index < arr.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    ))}
                  </>
                )}
              </nav>
            ) : (
              <h2 className="text-2xl font-bold tracking-tight">Projects</h2>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
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
              Import
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                <Button onClick={handleImport} disabled={isDiscovering || !importUrl}>
                  {isDiscovering ? "Scanning..." : "Import"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <MultiProjectImportDialog
            repoUrl={importUrl}
            open={showMultiProjectDialog}
            onOpenChange={setShowMultiProjectDialog}
            onImport={startImport}
          />

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[280px] rounded-xl" />
              ))}
            </div>
          ) : searchQuery.trim() ? (
            // Global Search Results View
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Search Results ({searchResults.length} found)
              </h3>
              {isSearching ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[280px] rounded-xl" />
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p>No projects found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {searchResults.map((project) => (
                    <div
                      key={project.id}
                      className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                      onClick={() => {
                        setRecentProjectIds((prev) => {
                          const newRecent = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, 3);
                          localStorage.setItem("recentProjects", JSON.stringify(newRecent));
                          return newRecent;
                        });
                        navigate(`/project/${project.id}`);
                      }}
                    >
                      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                        <img
                          src={project.thumbnail_url}
                          alt={project.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm truncate">{project.name}</h3>
                        {project.parent_repo && (
                          <p className="text-xs text-muted-foreground mt-0.5">{project.parent_repo}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{project.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedMonorepo && monorepoStructure ? (
            // Monorepo Folder View
            <div className="space-y-6">
              {monorepoStructure.folders.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Folders</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {monorepoStructure.folders.map((folder) => (
                      <FolderCard
                        key={folder.path}
                        folder={folder}
                        onDoubleClick={() => handleNavigateToFolder(folder.path)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {monorepoStructure.projects.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Boards</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {monorepoStructure.projects.map((project) => (
                      <MonorepoProjectCard
                        key={project.id}
                        project={project}
                        repoName={monorepoStructure.repo_name}
                        onClick={() => handleSelectMonorepoFolder(monorepoStructure.repo_name, project.relative_path)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {monorepoStructure.folders.length === 0 && monorepoStructure.projects.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Folder className="h-12 w-12 mb-4 opacity-50" />
                  <p>This folder is empty</p>
                </div>
              )}
            </div>
          ) : (
            // Default Projects View with Recent Projects
            <div className="space-y-8">
              {/* Recent Projects */}
              {recentProjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-muted-foreground">Recent</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentProjects.slice(0, 3).map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        compact
                        onClick={() => handleSelectProject(project)}
                        showDelete
                        onDelete={() => handleDeleteProject(project)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Projects */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">All Projects</h3>
                {filteredProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>{searchQuery ? `No projects found matching "${searchQuery}"` : "No standalone projects found."}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => handleSelectProject(project)}
                        showDelete
                        onDelete={() => handleDeleteProject(project)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{projectToDelete?.name}</strong>?
              This action cannot be undone. The project files will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
