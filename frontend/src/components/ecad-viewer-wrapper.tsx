import { useEffect, useRef, useState, useCallback } from "react";

interface ECADViewerProps {
  projectId: string;
  schematicContent: string | null;
  pcbContent: string | null;
  subsheets: { filename: string; content: string }[];
  onCommentClick?: (detail: { worldX: number; worldY: number; layer?: string; context?: string }) => void;
  onTabActivate?: (kind: "PCB" | "SCH") => void;
  onSheetLoad?: (detail: string | { filename?: string; sheetName?: string }) => void;
}

export function ECADViewer({
  projectId,
  schematicContent,
  pcbContent,
  subsheets,
  onCommentClick,
  onTabActivate,
  onSheetLoad,
}: ECADViewerProps) {
  const initializedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Store callbacks in refs to avoid effect re-runs
  const callbacksRef = useRef({ onCommentClick, onTabActivate, onSheetLoad });
  callbacksRef.current = { onCommentClick, onTabActivate, onSheetLoad };

  useEffect(() => {
    // Wait for custom elements to be defined before rendering
    Promise.all([
      customElements.whenDefined('ecad-viewer'),
      customElements.whenDefined('ecad-blob')
    ]).then(() => {
      setIsReady(true);
    });
  }, []);

  // Use callback ref to initialize viewer synchronously when container is mounted
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || initializedRef.current) return;
    if (!isReady) return;
    if (!schematicContent && !pcbContent) return;

    initializedRef.current = true;

    // Create viewer element
    const viewer = document.createElement('ecad-viewer') as HTMLElement;
    viewer.id = `ecad-viewer-${projectId}`;
    viewer.style.width = '100%';
    viewer.style.height = '100%';

    // Create and append blobs first
    if (schematicContent) {
      const blob = document.createElement('ecad-blob') as HTMLElement;
      (blob as any).filename = 'root.kicad_sch';
      (blob as any).content = schematicContent;
      viewer.appendChild(blob);
    }

    subsheets.forEach((s) => {
      const blob = document.createElement('ecad-blob') as HTMLElement;
      (blob as any).filename = s.filename;
      (blob as any).content = s.content;
      viewer.appendChild(blob);
    });

    if (pcbContent) {
      const blob = document.createElement('ecad-blob') as HTMLElement;
      (blob as any).filename = 'board.kicad_pcb';
      (blob as any).content = pcbContent;
      viewer.appendChild(blob);
    }

    // Add event listeners
    const handleCommentClick = (e: CustomEvent) => {
      callbacksRef.current.onCommentClick?.(e.detail);
    };

    const handleTabActivate = (e: CustomEvent) => {
      const kind = e.detail?.current;
      if (kind === "PCB" || kind === "SCH") {
        callbacksRef.current.onTabActivate?.(kind);
      }
    };

    const handleSheetLoad = (e: CustomEvent) => {
      callbacksRef.current.onSheetLoad?.(e.detail);
    };

    viewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
    viewer.addEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
    viewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);

    // Append viewer to container
    node.appendChild(viewer);

    // Cleanup function for when ref is called with null (unmount)
    return () => {
      viewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
      viewer.removeEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
      viewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
    };
  }, [isReady, projectId, schematicContent, pcbContent, subsheets]);

  if (!schematicContent && !pcbContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No design files found.</p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Loading viewer...</p>
      </div>
    );
  }

  return (
    <div
      ref={setContainerRef}
      className="w-full h-full"
      style={{ minHeight: "100%", position: "relative" }}
    />
  );
}

// Static methods for controlling the viewer from parent
ECADViewer.setCommentMode = (enabled: boolean) => {
  const viewer = document.querySelector("ecad-viewer") as any;
  if (viewer?.setCommentMode) {
    viewer.setCommentMode(enabled);
  } else if (viewer) {
    if (enabled) viewer.setAttribute("comment-mode", "true");
    else viewer.removeAttribute("comment-mode");
  }
};

ECADViewer.zoomToLocation = (x: number, y: number) => {
  const viewer = document.querySelector("ecad-viewer") as any;
  viewer?.zoomToLocation?.(x, y);
};

ECADViewer.switchPage = (pageId: string) => {
  const viewer = document.querySelector("ecad-viewer") as any;
  viewer?.switchPage?.(pageId);
};

export default ECADViewer;
