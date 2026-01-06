import { Project } from "@/types/project";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Box } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProjectCardProps {
    project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
    const navigate = useNavigate();

    // Construct full URL for thumbnail if it exists
    const thumbnailUrl = project.thumbnail_url
        ? project.thumbnail_url
        : null;

    return (
        <Card
            className="overflow-hidden hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border shadow-sm"
            onClick={() => navigate(`/project/${project.id}`)}
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
                <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="backdrop-blur-sm bg-background/80 border text-[10px]">
                        Git
                    </Badge>
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
