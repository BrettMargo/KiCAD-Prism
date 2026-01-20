import { useState } from 'react';
import { X, MessageSquare, CheckCircle, Circle, Send, Reply as ReplyIcon, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Comment } from '../types/comments';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

interface CommentPanelProps {
    comments: Comment[];
    onClose: () => void;
    onResolve: (commentId: string, resolved: boolean) => void;
    onReply: (commentId: string, content: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onCommentClick: (comment: Comment) => void;
}

export function CommentPanel({
    comments,
    onClose,
    onResolve,
    onReply,
    onDelete,
    onCommentClick
}: CommentPanelProps) {
    const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

    const filteredComments = comments.filter(c => {
        if (filter === 'ALL') return true;
        return c.status === filter;
    });

    return (
        <div className="flex flex-col h-full bg-background border-l w-80 shadow-xl z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    <h2 className="font-semibold">Comments</h2>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        {comments.length}
                    </Badge>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Filters */}
            <div className="flex p-2 gap-2 border-b bg-muted/30">
                <FilterButton
                    active={filter === 'ALL'}
                    onClick={() => setFilter('ALL')}
                    label="All"
                />
                <FilterButton
                    active={filter === 'OPEN'}
                    onClick={() => setFilter('OPEN')}
                    label="Open"
                />
                <FilterButton
                    active={filter === 'RESOLVED'}
                    onClick={() => setFilter('RESOLVED')}
                    label="Resolved"
                />
            </div>

            {/* Comments List */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                    {filteredComments.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-8">
                            No comments found.
                        </div>
                    ) : (
                        <>
                            {filteredComments.filter(c => c.context === 'SCH').length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1 py-1 bg-muted/30 rounded text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Schematic
                                    </div>
                                    <div className="space-y-3">
                                        {filteredComments.filter(c => c.context === 'SCH').map(comment => (
                                            <CommentCard
                                                key={comment.id}
                                                comment={comment}
                                                onResolve={onResolve}
                                                onReply={onReply}
                                                onDelete={onDelete}
                                                onClick={() => onCommentClick(comment)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredComments.filter(c => c.context === 'PCB').length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1 py-1 bg-muted/30 rounded text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        PCB Layout
                                    </div>
                                    <div className="space-y-3">
                                        {filteredComments.filter(c => c.context === 'PCB').map(comment => (
                                            <CommentCard
                                                key={comment.id}
                                                comment={comment}
                                                onResolve={onResolve}
                                                onReply={onReply}
                                                onDelete={onDelete}
                                                onClick={() => onCommentClick(comment)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function FilterButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'bg-transparent text-muted-foreground hover:bg-muted'
                }`}
        >
            {label}
        </button>
    );
}

interface CommentCardProps {
    comment: Comment;
    onResolve: (id: string, resolved: boolean) => void;
    onReply: (id: string, content: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClick: () => void;
}

function CommentCard({ comment, onResolve, onReply, onDelete, onClick }: CommentCardProps) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyContent, setReplyContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const handleReply = async () => {
        if (!replyContent.trim()) return;
        setIsSubmitting(true);
        try {
            await onReply(comment.id, replyContent);
            setReplyContent('');
            setIsReplying(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isResolved = comment.status === 'RESOLVED';

    return (
        <div className={`border rounded-lg bg-card text-card-foreground shadow-sm transition-all ${isResolved ? 'opacity-70' : ''}`}>
            {/* Card Header */}
            <div
                className="p-3 cursor-pointer hover:bg-muted/50 rounded-t-lg"
                onClick={(e) => {
                    // Don't trigger if clicking buttons
                    if ((e.target as HTMLElement).closest('button')) return;
                    onClick();
                }}
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{comment.author}</span>
                        {comment.elementRef && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1">
                                {comment.elementRef}
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {new Date(comment.timestamp).toLocaleDateString()}
                    </span>
                </div>

                <p className="text-sm mb-3 whitespace-pre-wrap">{comment.content}</p>

                <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setIsReplying(!isReplying)}
                        >
                            <ReplyIcon className="w-3 h-3 mr-1" />
                            Reply
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Are you sure you want to delete this comment?")) {
                                    onDelete(comment.id);
                                }
                            }}
                        >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${isResolved ? 'text-green-600' : 'text-muted-foreground'}`}
                        onClick={() => onResolve(comment.id, !isResolved)}
                    >
                        {isResolved ? (
                            <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Resolved
                            </>
                        ) : (
                            <>
                                <Circle className="w-3 h-3 mr-1" />
                                Resolve
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Replies Section */}
            {(comment.replies.length > 0 || isReplying) && (
                <div className="bg-muted/20 border-t p-3 space-y-3">
                    {/* Existing Replies */}
                    {comment.replies.length > 0 && (
                        <div className="space-y-3">
                            <div
                                className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none"
                                onClick={() => setExpanded(!expanded)}
                            >
                                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {comment.replies.length} replies
                            </div>

                            {expanded && comment.replies.map((reply, idx) => (
                                <div key={idx} className="pl-2 border-l-2 border-muted text-sm relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-medium text-xs">{reply.author}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(reply.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground">{reply.content}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Reply Input */}
                    {isReplying && (
                        <div className="flex items-end gap-2 mt-2 pt-2 animate-in fade-in slide-in-from-top-1">
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="Write a reply..."
                                className="flex-1 min-h-[60px] p-2 text-sm border rounded bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleReply();
                                    }
                                }}
                            />
                            <Button
                                size="icon"
                                className="h-8 w-8 mb-0.5"
                                disabled={isSubmitting || !replyContent.trim()}
                                onClick={handleReply}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
