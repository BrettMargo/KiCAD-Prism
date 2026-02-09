import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Project } from "@/types/project";
import { ProjectCard } from "./project-card";
import { SidebarTree } from "./sidebar-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, Settings, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./import-dialog";
import { SettingsDialog } from "./settings-dialog";
import Fuse from "fuse.js";
import { toast } from "sonner";



export function Workspace() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Helper function to get display name
  const getDisplayName = (project: Project) => {
    return project.display_name || project.name;
  };

  // Navigation state
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  // Import Dialog State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      const res = await fetch("/api/projects/");
      if (!res.ok) {
        throw new Error("Failed to fetch data");
      }
      const projectsData = await res.json();
      setProjects(projectsData);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(projects, {
      keys: [
        { name: "name", weight: 2 },
        { name: "display_name", weight: 2 },
        { name: "description", weight: 1 },
        { name: "parent_repo", weight: 0.5 }
      ],
      threshold: 0.4, // Lower = stricter matching
      includeScore: true,
      ignoreLocation: true,
    });
  }, [projects]);

  // Global fuzzy search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsSearching(true);
      try {
        // Use Fuse.js for client-side fuzzy search
        const results = fuse.search(searchQuery);
        // Map to include the matched items with score
        const mappedResults = results.map(result => ({
          ...result.item,
          _score: result.score,
          thumbnail_url: `/api/projects/${result.item.id}/thumbnail`
        }));
        setSearchResults(mappedResults);
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setIsSearching(false);
      }
    }, 150); // Faster since it's client-side

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fuse]);

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    navigate(`/project/${project.id}`);
  };

  const handleGoHome = () => {
    setSelectedProjectId(undefined);
    setSearchQuery("");
  };

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        // Show success toast
        toast.success(`Deleted "${getDisplayName(projectToDelete)}" successfully`);
        // Refresh the project list
        fetchData();
      } else {
        // Parse and show actual error from backend
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || 'Unknown error occurred';
        toast.error(`Failed to delete project: ${errorMessage}`);
      }
    } catch (e: any) {
      console.error('Delete error:', e);
      toast.error(`Failed to delete project: ${e.message || 'Network error'}`);
    } finally {
      setIsDeleting(false);
      setProjectToDelete(null);
    }
  };

  // Get recent projects data
  const recentProjects = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter(Boolean) as Project[];

  // Filter projects based on search (for standalone projects view only)
  const filteredProjects = projects.filter((project) => {
    const query = searchQuery.toLowerCase();
    const displayName = getDisplayName(project);
    return (
      displayName.toLowerCase().includes(query) ||
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
        <div className="p-4 border-b flex items-center justify-between">
          <h1
            className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
            onClick={handleGoHome}
          >
            KiCAD Prism
          </h1>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={fetchData} title="Refresh Projects">
            <RefreshCw className="h-4 w-4" />
          </Button>
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
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={handleSelectProject}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight">Projects</h2>
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
            <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button onClick={() => setIsImportOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Import
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ImportDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            onImportComplete={fetchData}
          />
          <SettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
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
                    <ProjectCard
                      key={project.id}
                      project={project}
                      searchQuery={searchQuery}
                      onClick={() => {
                        setRecentProjectIds((prev) => {
                          const newRecent = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, 3);
                          localStorage.setItem("recentProjects", JSON.stringify(newRecent));
                          return newRecent;
                        });
                        navigate(`/project/${project.id}`);
                      }}
                      showDelete
                      onDelete={() => handleDeleteProject(project)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Default Projects View
            <div className="space-y-8">
              {recentProjects.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Recent</h3>
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
                    <p>No projects found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        searchQuery={searchQuery}
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
              Are you sure you want to delete <strong>{projectToDelete ? getDisplayName(projectToDelete) : ''}</strong>?
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
