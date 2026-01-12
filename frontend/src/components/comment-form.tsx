import * as React from "react";
import { useState } from "react";
import { X, Send, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommentContext, CommentLocation } from "@/types/comments";

interface CommentFormProps {
    /** Whether the form is open */
    isOpen: boolean;
    /** Callback to close the form */
    onClose: () => void;
    /** Callback when comment is submitted */
    onSubmit: (content: string) => void;
    /** Location where the comment will be placed */
    location: CommentLocation | null;
    /** Context (PCB or SCH) */
    context: CommentContext;
    /** Whether submission is in progress */
    isSubmitting?: boolean;
}

/**
 * CommentForm - Modal dialog for adding new design review comments.
 * Shows the location (readonly) and allows entering comment text.
 */
export function CommentForm({
    isOpen,
    onClose,
    onSubmit,
    location,
    context,
    isSubmitting = false,
}: CommentFormProps) {
    const [content, setContent] = useState("");

    if (!isOpen || !location) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (content.trim()) {
            onSubmit(content.trim());
            setContent("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            onClose();
        }
        if (e.key === "Enter" && e.metaKey) {
            handleSubmit(e);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Modal */}
            <div
                className="relative bg-background border rounded-lg shadow-xl w-full max-w-md mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold">Add Comment</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Location info */}
                <div className="px-4 py-3 bg-muted/50 border-b">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>
                            {context} · ({location.x.toFixed(2)}, {location.y.toFixed(2)}) mm
                        </span>
                        {location.layer && (
                            <span className="px-2 py-0.5 bg-background rounded text-xs">
                                {location.layer}
                            </span>
                        )}
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4">
                    <textarea
                        autoFocus
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe the issue or leave a note..."
                        className="w-full h-32 p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        disabled={isSubmitting}
                    />

                    <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-muted-foreground">
                            ⌘ + Enter to submit
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={!content.trim() || isSubmitting}
                            >
                                {isSubmitting ? (
                                    "Posting..."
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Post Comment
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
