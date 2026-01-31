import { Project } from "@/types/project";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Box, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProjectCardProps {
    project: Project;
    compact?: boolean;
    onClick?: () => void;
    onDelete?: () => void;
    showDelete?: boolean;
}

export function ProjectCard({ project, compact, onClick, onDelete, showDelete }: ProjectCardProps) {
    const navigate = useNavigate();

    const thumbnailUrl = project.thumbnail_url ? project.thumbnail_url : null;

    const handleClick = () => {
        if (onClick) {
            onClick();
        } else {
            navigate(`/project/${project.id}`);
        }
    };

    if (compact) {
        return (
            <Card
                className="overflow-hidden hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border shadow-sm"
                onClick={handleClick}
            >
                <div className="flex items-center gap-3 p-3">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt={project.name} className="w-full h-full object-cover" />
                        ) : (
                            <Box className="h-6 w-6 opacity-20" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-medium text-sm truncate">{project.name}</h3>
                        <p className="text-xs text-muted-foreground">{project.last_modified}</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card
            className="overflow-hidden hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border shadow-sm"
            onClick={handleClick}
        >
            <div className="aspect-video w-full overflow-hidden bg-muted relative border-b">
                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={project.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/30">
                        <Box className="h-10 w-10 opacity-20" />
                    </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                    <Badge variant="secondary" className="backdrop-blur-sm bg-background/80 border text-[10px]">
                        Git
                    </Badge>
                    {showDelete && onDelete && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            <CardContent className="p-4">
                <h3 className="font-semibold text-lg tracking-tight mb-1 group-hover:text-primary transition-colors truncate">
                    {project.name}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {project.description || "No description available."}
                </p>
            </CardContent>

            <CardFooter className="p-4 pt-0 border-t-0 text-[11px] text-muted-foreground flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Updated {project.last_modified}</span>
            </CardFooter>
        </Card>
    );
}
