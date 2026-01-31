import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, GitBranch, CircuitBoard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, Monorepo, MonorepoStructure } from "@/types/project";

interface SidebarTreeProps {
  standaloneProjects: Project[];
  monorepos: Monorepo[];
  selectedProjectId?: string;
  selectedMonorepo?: string;
  selectedMonorepoPath?: string;
  onSelectProject: (project: Project) => void;
  onSelectMonorepoFolder: (repoName: string, path: string) => void;
  onGoHome?: () => void;
  onRefresh?: () => void;
}

interface MonorepoNodeProps {
  monorepo: Monorepo;
  isExpanded: boolean;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggle: () => void;
  onToggleFolder: (path: string) => void;
  onSelectFolder: (path: string) => void;
}

function MonorepoNode({ monorepo, isExpanded, selectedPath, expandedPaths, onToggle, onToggleFolder, onSelectFolder }: MonorepoNodeProps) {
  const [structure, setStructure] = useState<MonorepoStructure | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && !structure) {
      setLoading(true);
      fetch(`/api/projects/monorepos/${monorepo.name}/structure`)
        .then((res) => res.json())
        .then((data) => {
          setStructure(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isExpanded, monorepo.name, structure]);

  const handleRootClick = () => {
    onSelectFolder("");
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
          selectedPath === "" && "bg-accent"
        )}
      >
        <div onClick={onToggle} className="p-0.5 hover:bg-accent rounded">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div onClick={handleRootClick} className="flex items-center gap-2 flex-1 min-w-0">
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-blue-500" />
          ) : (
            <Folder className="h-4 w-4 text-blue-500" />
          )}
          <span className="text-sm font-medium truncate">{monorepo.name}</span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {monorepo.project_count}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-1">
          {loading ? (
            <div className="text-xs text-muted-foreground py-2 px-4">Loading...</div>
          ) : structure ? (
            <>
              {structure.folders.map((folder) => (
                <FolderNode
                  key={folder.path}
                  repoName={monorepo.name}
                  folder={folder}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onToggle={onToggleFolder}
                  onSelect={onSelectFolder}
                />
              ))}
              {structure.projects.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border/50">
                  {structure.projects.map((project) => (
                    <div
                      key={project.id}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
                        selectedPath === project.relative_path && "bg-accent"
                      )}
                      style={{ paddingLeft: "32px" }}
                      onClick={() => onSelectFolder(project.relative_path)}
                    >
                      <div className="w-5" />
                      <CircuitBoard className="h-4 w-4 text-green-500" />
                      <span className="text-sm truncate">{project.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Recursive folder node
interface FolderNodeProps {
  repoName: string;
  folder: { name: string; path: string; item_count: number };
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  depth?: number;
}

function FolderNode({ repoName, folder, selectedPath, expandedPaths, onToggle, onSelect, depth = 0 }: FolderNodeProps) {
  const isExpanded = expandedPaths.has(folder.path);
  const [children, setChildren] = useState<MonorepoStructure | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && !children) {
      setLoading(true);
      fetch(`/api/projects/monorepos/${repoName}/structure?subpath=${encodeURIComponent(folder.path)}`)
        .then((res) => res.json())
        .then((data) => {
          setChildren(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isExpanded, folder.path, repoName, children]);

  const handleClick = () => {
    onSelect(folder.path);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(folder.path);
  };

  const hasSubfolders = children ? children.folders.length > 0 : folder.item_count > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
          selectedPath === folder.path && "bg-accent"
        )}
        onClick={handleClick}
        style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
      >
        {hasSubfolders ? (
          <div onClick={handleToggle} className="p-0.5 hover:bg-accent rounded">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="w-5" />
        )}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-blue-400" />
        ) : (
          <Folder className="h-4 w-4 text-blue-400" />
        )}
        <span className="text-sm truncate flex-1">{folder.name}</span>
      </div>

      {isExpanded && children && (
        <div className="mt-0.5">
          {loading ? (
            <div className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${(depth + 2) * 12 + 8}px` }}>Loading...</div>
          ) : (
            <>
              {children.folders.map((subfolder) => (
                <FolderNode
                  key={subfolder.path}
                  repoName={repoName}
                  folder={subfolder}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ))}
              {children.projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
                    selectedPath === project.relative_path && "bg-accent"
                  )}
                  style={{ paddingLeft: `${(depth + 2) * 12 + 8}px` }}
                  onClick={() => onSelect(project.relative_path)}
                >
                  <div className="w-5" />
                  <CircuitBoard className="h-4 w-4 text-green-500" />
                  <span className="text-sm truncate">{project.name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SidebarTree({
  standaloneProjects,
  monorepos,
  selectedProjectId,
  selectedMonorepo,
  selectedMonorepoPath,
  onSelectProject,
  onSelectMonorepoFolder,
  onGoHome,
}: SidebarTreeProps) {
  const [expandedMonorepos, setExpandedMonorepos] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleMonorepo = (name: string) => {
    setExpandedMonorepos((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Home Button */}
      <div className="px-3 py-2 border-b">
        <button
          onClick={onGoHome}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
            !selectedMonorepo && !selectedProjectId
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          )}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          All Projects
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
        {/* Standalone Projects Section */}
      {standaloneProjects.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <CircuitBoard className="h-3.5 w-3.5" />
            Projects
          </div>
          <div className="space-y-0.5 px-1">
            {standaloneProjects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
                  selectedProjectId === project.id && "bg-accent"
                )}
                onClick={() => onSelectProject(project)}
              >
                <CircuitBoard className="h-4 w-4 text-green-500" />
                <span className="text-sm truncate">{project.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monorepos Section */}
      {monorepos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <GitBranch className="h-3.5 w-3.5" />
            Monorepos
          </div>
          <div className="space-y-0.5 px-1">
            {monorepos.map((monorepo) => (
              <MonorepoNode
                key={monorepo.name}
                monorepo={monorepo}
                isExpanded={expandedMonorepos.has(monorepo.name)}
                selectedPath={selectedMonorepo === monorepo.name ? selectedMonorepoPath : undefined}
                expandedPaths={expandedFolders}
                onToggle={() => toggleMonorepo(monorepo.name)}
                onToggleFolder={toggleFolder}
                onSelectFolder={(path) => onSelectMonorepoFolder(monorepo.name, path)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {standaloneProjects.length === 0 && monorepos.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No projects found</p>
          <p className="text-xs mt-1">Import a project to get started</p>
        </div>
      )}
      </div>
    </div>
  );
}
