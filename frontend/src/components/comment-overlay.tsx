import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { CheckCircle } from "lucide-react";
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
        // Check if the viewer has the helper method we added
        if (!viewer.getScreenLocation) return;

        const rect = viewer.getBoundingClientRect();
        const newPositions = new Map<string, PinPosition>();

        for (const comment of comments) {
            const screenPos = viewer.getScreenLocation(
                comment.location.x,
                comment.location.y
            );

            if (!screenPos) continue;

            // Check if position is within visible viewport
            if (!screenPos) continue;

            const visible =
                screenPos.x >= 0 &&
                screenPos.x <= rect.width &&
                screenPos.y >= 0 &&
                screenPos.y <= rect.height;

            newPositions.set(comment.id, { x: screenPos.x, y: screenPos.y, visible });
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
        viewer.addEventListener("mouseup", handleViewChange);
        viewer.addEventListener("wheel", handleViewChange);
        window.addEventListener("resize", handleViewChange);

        // Initial position update
        updatePositions();

        // Poll for updates (fallback for events we might miss)
        const interval = setInterval(updatePositions, 50);

        return () => {
            viewer.removeEventListener("kicanvas:mousemove", handleViewChange);
            viewer.removeEventListener("panzoom", handleViewChange);
            viewer.removeEventListener("mouseup", handleViewChange);
            viewer.removeEventListener("wheel", handleViewChange);
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
                        className="absolute pointer-events-auto cursor-pointer transform -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: position.x,
                            top: position.y,
                        }}
                        onClick={() => onPinClick?.(comment)}
                        title={`${comment.author}: ${comment.content.slice(0, 50)}`}
                    >
                        <div
                            className={`
                                group relative flex items-center justify-center
                                w-6 h-6 rounded-full shadow-md border-2 border-white
                                transition-transform hover:scale-125
                                ${isResolved ? "bg-green-500" : "bg-primary"}
                            `}
                        >
                            {/* Icon */}
                            {isResolved ? (
                                <CheckCircle className="w-3 h-3 text-white" />
                            ) : (
                                <span className="text-white text-[10px] font-bold">
                                    {comment.replies.length > 0 ? comment.replies.length + 1 : "!"}
                                </span>
                            )}

                            {/* Pulse effect for open comments */}
                            {!isResolved && (
                                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-20 animate-ping"></span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
