import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { MessageCircle, CheckCircle } from "lucide-react";
import type { Comment } from "@/types/comments";

interface CommentOverlayProps {
    /** List of comments to display */
    comments: Comment[];
    /** Reference to the ecad-viewer element for coordinate transforms */
    viewerRef: React.RefObject<HTMLElement>;
    /** Callback when a comment pin is clicked */
    onPinClick?: (comment: Comment) => void;
    /** Whether to show resolved comments (dimmed) */
    showResolved?: boolean;
}

interface PinPosition {
    x: number;
    y: number;
    visible: boolean;
}

/**
 * CommentOverlay renders comment pin markers as an overlay on top of the ecad-viewer.
 * Pins are positioned using world-to-screen coordinate transforms and stay
 * attached to their board locations during pan/zoom.
 */
export function CommentOverlay({
    comments,
    viewerRef,
    onPinClick,
    showResolved = true,
}: CommentOverlayProps) {
    const [pinPositions, setPinPositions] = useState<Map<string, PinPosition>>(new Map());

    /**
     * Update pin positions based on current viewer transform
     */
    const updatePositions = useCallback(() => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current as any;
        // Access the board or schematic app's viewer
        const boardApp = viewer.querySelector?.("kc-board-app");
        const schApp = viewer.querySelector?.("kc-schematic-app");
        const activeViewer = boardApp?.viewer || schApp?.viewer;

        if (!activeViewer?.worldToScreen) return;

        const rect = viewerRef.current.getBoundingClientRect();
        const newPositions = new Map<string, PinPosition>();

        for (const comment of comments) {
            const screenPos = activeViewer.worldToScreen(
                comment.location.x,
                comment.location.y
            );

            // Check if position is within visible viewport
            const x = screenPos.x - rect.left;
            const y = screenPos.y - rect.top;
            const visible = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;

            newPositions.set(comment.id, { x, y, visible });
        }

        setPinPositions(newPositions);
    }, [comments, viewerRef]);

    // Update positions on any viewer interaction
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Listen for pan/zoom events
        const handleViewChange = () => {
            requestAnimationFrame(updatePositions);
        };

        // Listen to various events that might change the view
        viewer.addEventListener("kicanvas:mousemove", handleViewChange);
        viewer.addEventListener("panzoom", handleViewChange);
        window.addEventListener("resize", handleViewChange);

        // Initial position update
        updatePositions();

        // Poll for updates (fallback for events we might miss)
        const interval = setInterval(updatePositions, 100);

        return () => {
            viewer.removeEventListener("kicanvas:mousemove", handleViewChange);
            viewer.removeEventListener("panzoom", handleViewChange);
            window.removeEventListener("resize", handleViewChange);
            clearInterval(interval);
        };
    }, [viewerRef, updatePositions]);

    // Filter comments based on showResolved
    const visibleComments = showResolved
        ? comments
        : comments.filter((c) => c.status === "OPEN");

    return (
        <div
            className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 100 }}
        >
            {visibleComments.map((comment) => {
                const position = pinPositions.get(comment.id);
                if (!position || !position.visible) return null;

                const isResolved = comment.status === "RESOLVED";

                return (
                    <div
                        key={comment.id}
                        className="absolute pointer-events-auto cursor-pointer transform -translate-x-1/2 -translate-y-full"
                        style={{
                            left: position.x,
                            top: position.y,
                        }}
                        onClick={() => onPinClick?.(comment)}
                        title={`${comment.author}: ${comment.content.slice(0, 50)}${comment.content.length > 50 ? "..." : ""}`}
                    >
                        <div
                            className={`
                                flex items-center justify-center
                                w-8 h-8 rounded-full shadow-lg
                                transition-all duration-200 hover:scale-110
                                ${isResolved
                                    ? "bg-green-500/70 text-white"
                                    : "bg-blue-500 text-white"
                                }
                            `}
                        >
                            {isResolved ? (
                                <CheckCircle className="w-4 h-4" />
                            ) : (
                                <MessageCircle className="w-4 h-4" />
                            )}
                        </div>
                        {/* Pin tail */}
                        <div
                            className={`
                                absolute left-1/2 -bottom-1 transform -translate-x-1/2
                                w-0 h-0 border-l-4 border-r-4 border-t-4
                                border-l-transparent border-r-transparent
                                ${isResolved ? "border-t-green-500/70" : "border-t-blue-500"}
                            `}
                        />
                        {/* Reply count badge */}
                        {comment.replies.length > 0 && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                {comment.replies.length}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
