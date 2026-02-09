import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Project, Monorepo, MonorepoStructure } from "@/types/project";
import { ProjectCard } from "./project-card";
import { SidebarTree } from "./sidebar-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight, Folder, Clock, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./import-dialog";
import { SettingsDialog } from "./settings-dialog";
import { cn } from "@/lib/utils";
import Fuse from "fuse.js";
import { toast } from "sonner";

// Highlight matched text in search results
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

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
  project: { id: string; name: string; display_name?: string; relative_path: string; has_thumbnail: boolean; last_modified: string };
  repoName: string;
  onClick: () => void;
}

function MonorepoProjectCard({ project, repoName, onClick }: MonorepoProjectCardProps) {
  const displayName = project.display_name || project.name;

  return (
    <div
      className="group relative bg-card border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {project.has_thumbnail ? (
          <img
            src={`/api/projects/${project.id}/thumbnail`}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-4xl font-bold text-muted-foreground/30">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{displayName}</h3>
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

  // Helper function to get display name
  const getDisplayName = (project: Project) => {
    return project.display_name || project.name;
  };

  // Navigation state
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedMonorepo, setSelectedMonorepo] = useState<string | undefined>();
  const [selectedMonorepoPath, setSelectedMonorepoPath] = useState<string | undefined>();
  const [monorepoStructure, setMonorepoStructure] = useState<MonorepoStructure | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ repoName?: string; path?: string }>({});

  // Monorepo structure cache to avoid refetching visited folders
  const [structureCache, setStructureCache] = useState<Map<string, MonorepoStructure>>(new Map());

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

  // Load monorepo structure when navigating (with caching)
  useEffect(() => {
    if (selectedMonorepo) {
      const subpath = selectedMonorepoPath || "";
      const cacheKey = `${selectedMonorepo}:${subpath}`;

      // Check cache first
      if (structureCache.has(cacheKey)) {
        setMonorepoStructure(structureCache.get(cacheKey)!);
        setBreadcrumb({ repoName: selectedMonorepo, path: subpath });
        return;
      }

      // Fetch and cache
      fetch(`/api/projects/monorepos/${selectedMonorepo}/structure?subpath=${encodeURIComponent(subpath)}`)
        .then((res) => res.json())
        .then((data) => {
          setMonorepoStructure(data);
          setBreadcrumb({ repoName: selectedMonorepo, path: subpath });
          // Add to cache
          setStructureCache(prev => new Map(prev).set(cacheKey, data));
        })
        .catch(console.error);
    } else {
      setMonorepoStructure(null);
      setBreadcrumb({});
    }
  }, [selectedMonorepo, selectedMonorepoPath, structureCache]);

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
        // Clear structure cache in case it contained this project
        setStructureCache(new Map());
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
                          alt={getDisplayName(project)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm truncate">{highlightMatch(getDisplayName(project), searchQuery)}</h3>
                        {project.parent_repo && (
                          <p className="text-xs text-muted-foreground mt-0.5">{highlightMatch(project.parent_repo, searchQuery)}</p>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2">{highlightMatch(project.description || '', searchQuery)}</p>
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
