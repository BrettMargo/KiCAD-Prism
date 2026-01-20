import { useEffect, useState, useCallback, useRef } from "react";
import * as React from "react";
import { Cpu, Box, FileText, MessageSquarePlus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Model3DViewer } from "./model-3d-viewer";
import { CommentOverlay } from "./comment-overlay";
import { CommentForm } from "./comment-form";
import { CommentPanel } from "./comment-panel";
import type { Comment, CommentContext } from "@/types/comments";

// Wrapper to inject content via property instead of attribute to avoid size limits/parsing
const EcadBlobWrapper = ({ filename, content }: { filename: string, content: string }) => {
    const ref = React.useRef<HTMLElement>(null);

    React.useLayoutEffect(() => {
        if (ref.current) {
            (ref.current as any).content = content;
            (ref.current as any).filename = filename;
        }
    }, [filename, content]);

    return <ecad-blob ref={ref} filename={filename} />;
};

interface VisualizerProps {
    projectId: string;
}

type VisualizerTab = "ecad" | "3d" | "ibom";

export function Visualizer({ projectId }: VisualizerProps) {
    // We use a state for the viewer element to ensure the effect re-runs when it mounts
    const [viewerElement, setViewerElement] = useState<HTMLElement | null>(null);
    const viewerRef = useRef<HTMLElement | null>(null);

    // Callback ref to sync state and ref
    const setViewerRef = useCallback((node: HTMLElement | null) => {
        viewerRef.current = node;
        setViewerElement(node);
    }, []);

    const [activeTab, setActiveTab] = useState<VisualizerTab>("ecad");
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Record<string, string>>({});

    // Comment state
    const [comments, setComments] = useState<Comment[]>([]);
    const [activeContext, setActiveContext] = useState<CommentContext>("PCB");
    const [activePage, setActivePage] = useState<string>("root.kicad_sch");
    const [commentMode, setCommentMode] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [showCommentPanel, setShowCommentPanel] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<{ x: number, y: number, layer: string } | null>(null);
    const [pendingContext, setPendingContext] = useState<CommentContext>("PCB");
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const baseUrl = `/api/projects/${projectId}`;

            try {
                // Parallel fetch for main assets
                const [schRes, pcbRes, modelRes, ibomRes, commentsRes] = await Promise.allSettled([
                    fetch(`${baseUrl}/schematic`),
                    fetch(`${baseUrl}/pcb`),
                    fetch(`${baseUrl}/3d-model`),
                    fetch(`${baseUrl}/ibom`),
                    fetch(`/api/projects/${projectId}/comments`)
                ]);

                // Handle Schematic
                if (schRes.status === "fulfilled" && schRes.value.ok) {
                    setSchematicContent(await schRes.value.text());
                    // Try fetch subsheets
                    try {
                        const subsheetsRes = await fetch(`${baseUrl}/schematic/subsheets`);
                        if (subsheetsRes.ok) {
                            const data = await subsheetsRes.json();
                            if (data.files?.length) {
                                const subsheetPromises = data.files.map(async (f: any) => {
                                    const cRes = await fetch(f.url);
                                    let filename = f.name || f.path || f.url.split('/').pop() || "subsheet.kicad_sch";
                                    if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';
                                    if (!filename.includes('/') && f.url.includes('Subsheets')) filename = `Subsheets/${filename}`;
                                    return { filename, content: await cRes.text() };
                                });
                                setSubsheets(await Promise.all(subsheetPromises));
                            }
                        }
                    } catch (e) {
                        console.warn("Subsheets fetch failed", e);
                    }
                } else {
                    setError(prev => ({ ...prev, schematic: "Schematic not found" }));
                }

                // Handle PCB
                if (pcbRes.status === "fulfilled" && pcbRes.value.ok) {
                    setPcbContent(await pcbRes.value.text());
                    setActiveContext("PCB"); // Default preference if available (often main view)
                } else {
                    // if no PCB, SCH will be default from logic below
                    setError(prev => ({ ...prev, pcb: "PCB not found" }));
                }

                // Handle 3D
                if (modelRes.status === "fulfilled" && modelRes.value.ok) {
                    setModelUrl(`${baseUrl}/3d-model`);
                }

                // Handle iBoM
                if (ibomRes.status === "fulfilled" && ibomRes.value.ok) {
                    setIbomUrl(`${baseUrl}/ibom`);
                }

                // Handle Comments
                if (commentsRes.status === "fulfilled" && commentsRes.value.ok) {
                    const cData = await commentsRes.value.json();
                    setComments(cData.comments || []);
                }

            } catch (err) {
                console.error("Error loading visualizer data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [projectId]);

    // Update active context preference
    useEffect(() => {
        if (!loading) {
            if (pcbContent) setActiveContext("PCB");
            else if (schematicContent) setActiveContext("SCH");
        }
    }, [loading, pcbContent, schematicContent]);

    // Event Listeners for ecad-viewer
    // Event Listeners for ecad-viewer
    useEffect(() => {
        const viewer = viewerElement;
        if (!viewer) return;

        const handleCommentClick = (e: CustomEvent) => {
            const detail = e.detail;
            setPendingLocation({
                x: detail.worldX,
                y: detail.worldY,
                layer: detail.layer || "F.Cu",
            });
            setPendingContext(detail.context || activeContext);
            setShowCommentForm(true);
        };

        const handleTabActivate = (e: CustomEvent) => {
            const kind = e.detail.current; // "PCB" | "SCH"
            if (kind === "PCB") setActiveContext("PCB");
            else if (kind === "SCH") setActiveContext("SCH");
        };

        const handleSheetLoad = (e: CustomEvent) => {
            if (typeof e.detail === 'string') setActivePage(e.detail);
            else if (e.detail?.filename) setActivePage(e.detail.filename);
            else if (e.detail?.sheetName) setActivePage(e.detail.sheetName);
        };

        viewer.addEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
        viewer.addEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
        viewer.addEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);

        return () => {
            viewer.removeEventListener("ecad-viewer:comment:click", handleCommentClick as EventListener);
            viewer.removeEventListener("kicanvas:tab:activate", handleTabActivate as EventListener);
            viewer.removeEventListener("kicanvas:sheet:loaded", handleSheetLoad as EventListener);
        };
    }, [activeContext, viewerElement]);

    // Toggle Comment Mode
    const toggleCommentMode = () => {
        const newMode = !commentMode;
        setCommentMode(newMode);

        const viewer = viewerRef.current as any;
        if (viewer) {
            if (viewer.setCommentMode) {
                viewer.setCommentMode(newMode);
            } else if (viewer) {
                if (newMode) viewer.setAttribute("comment-mode", "true");
                else viewer.removeAttribute("comment-mode");
            }
        }
    };

    // Submit Comment
    const handleSubmitComment = async (content: string) => {
        if (!pendingLocation) return;
        setIsSubmittingComment(true);
        try {
            const location = { ...pendingLocation, page: pendingContext === "SCH" ? activePage : "" };
            const response = await fetch(`/api/projects/${projectId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: pendingContext,
                    location,
                    content
                })
            });

            if (response.ok) {
                const newComment = await response.json();
                setComments(prev => [...prev, newComment]);
                setShowCommentForm(false);
                setPendingLocation(null);
                // Turn off comment mode after posting? User might want to post multiple. Keep it on.
            }
        } catch (err) {
            console.error("Create comment failed", err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    // Navigate to Comment
    const handleCommentNavigate = (comment: Comment) => {
        const viewer = viewerRef.current as any;
        if (!viewer) return;

        // Force switch to ECAD tab if in 3D/iBom
        if (activeTab !== "ecad") setActiveTab("ecad");

        // Logic to switch context (PCB vs SCH)
        // We lack a direct public API to switch TABS in ecad-viewer easily (it's internal).
        // But if comment is SCH and we are on PCB, we should try.
        // Assuming user actively manages tabs, or we try `switchPage` which might force SCH.

        if (comment.context === "SCH") {
            if (comment.location.page) {
                // This might auto-switch tab if implemented in viewer
                viewer.switchPage(comment.location.page);
            }
        } else {
            // If PCB, we might not have a switch to PCB method exposed yet
            // Maybe zooming works?
        }

        if (viewer.zoomToLocation) {
            viewer.zoomToLocation(comment.location.x, comment.location.y);
        }
    };

    // Resolving/Replying
    const handleResolveComment = async (commentId: string, resolved: boolean) => {
        const response = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: resolved ? "RESOLVED" : "OPEN" })
        });
        if (response.ok) {
            const updated = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? updated : c));
        }
    };

    const handleReplyComment = async (commentId: string, content: string) => {
        const response = await fetch(`/api/projects/${projectId}/comments/${commentId}/replies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
        });
        if (response.ok) {
            const data = await response.json();
            setComments(prev => prev.map(c => c.id === commentId ? data.comment : c));
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                setComments(prev => prev.filter(c => c.id !== commentId));
            }
        } catch (err) {
            console.error("Failed to delete comment", err);
        }
    };

    // Filtering comments for Overlay
    const overlayComments = comments.filter(c => {
        // Must match context
        if (c.context !== activeContext) return false;

        // If SCH, match page
        if (activeContext === "SCH") {
            const norm = (p: string) => p ? p.split('/').pop() || p : "";
            const cPage = norm(c.location.page || "");
            const aPage = norm(activePage);
            // Root handling
            const isRootC = cPage === "root.kicad_sch" || cPage === "root";
            const isRootA = aPage === "root.kicad_sch" || aPage === "root";

            if (isRootA && isRootC) return true;
            return cPage === aPage;
        }
        return true;
    });

    // Tab Config
    const tabs: { id: VisualizerTab; label: string; icon: any }[] = [
        { id: "ecad", label: "Schematic & PCB", icon: Cpu },
        { id: "3d", label: "3D View", icon: Box },
        { id: "ibom", label: "iBoM", icon: FileText },
    ];

    if (loading) return <div className="flex justify-center items-center h-full">Loading Visualizer...</div>;

    return (
        <div className="flex flex-col h-full bg-background relative selection-none">
            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b px-2 py-1 bg-muted/20">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setActiveTab(tab.id)}
                            className="text-xs h-8"
                        >
                            <Icon className="w-3 h-3 mr-2" />
                            {tab.label}
                        </Button>
                    );
                })}
                <div className="flex-1" />

                {/* Comment Controls */}
                {activeTab === "ecad" && (
                    <>
                        <Button
                            variant={commentMode ? "default" : "ghost"}
                            size="sm"
                            onClick={toggleCommentMode}
                            className={`text-xs h-8 ${commentMode ? "bg-amber-600 text-white hover:bg-amber-700" : ""}`}
                        >
                            <MessageSquarePlus className="w-3 h-3 mr-2" />
                            {commentMode ? "Commenting Mode" : "Add Comment"}
                        </Button>
                        <Button
                            variant={showCommentPanel ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setShowCommentPanel(!showCommentPanel)}
                            className="text-xs h-8 ml-1"
                        >
                            <MessageSquare className="w-3 h-3 mr-2" />
                            Comments
                            <span className="ml-1 bg-muted-foreground/20 px-1 rounded-full text-[10px]">
                                {comments.length}
                            </span>
                        </Button>
                    </>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden">
                {/* ECAD View */}
                <div className={`absolute inset-0 ${activeTab === "ecad" ? "z-10" : "z-0 hidden"}`}>
                    {schematicContent || pcbContent ? (
                        <>
                            <ecad-viewer
                                ref={setViewerRef}
                                style={{ width: '100%', height: '100%' }}
                            >
                                {schematicContent && <EcadBlobWrapper filename="root.kicad_sch" content={schematicContent} />}
                                {subsheets.map(s => <EcadBlobWrapper key={s.filename} filename={s.filename} content={s.content} />)}
                                {pcbContent && <EcadBlobWrapper filename="board.kicad_pcb" content={pcbContent} />}
                            </ecad-viewer>

                            <CommentOverlay
                                comments={overlayComments}
                                viewerRef={viewerRef}
                                onPinClick={() => {
                                    setShowCommentPanel(true);
                                    // optional: focus comment in panel
                                }}
                            />
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>No design files found.</p>
                        </div>
                    )}
                </div>

                {/* 3D View */}
                {activeTab === "3d" && (
                    <div className="absolute inset-0 z-20 bg-background">
                        {modelUrl ? <Model3DViewer modelUrl={modelUrl} /> : <div className="p-10">No 3D Model</div>}
                    </div>
                )}

                {/* iBoM View */}
                {activeTab === "ibom" && (
                    <div className="absolute inset-0 z-20 bg-white">
                        {ibomUrl ? <iframe src={ibomUrl} className="w-full h-full border-0" /> : <div className="p-10">No iBoM Found</div>}
                    </div>
                )}

                {/* Sidebar Overlay */}
                {showCommentPanel && (
                    <div className="absolute top-0 right-0 bottom-0 z-50 animate-in slide-in-from-right">
                        <CommentPanel
                            comments={comments}
                            onClose={() => setShowCommentPanel(false)}
                            onResolve={handleResolveComment}
                            onReply={handleReplyComment}
                            onDelete={handleDeleteComment}
                            onCommentClick={handleCommentNavigate}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
            <CommentForm
                isOpen={showCommentForm}
                onClose={() => setShowCommentForm(false)}
                onSubmit={handleSubmitComment}
                location={pendingLocation}
                context={pendingContext}
                isSubmitting={isSubmittingComment}
            />
        </div>
    );
}
