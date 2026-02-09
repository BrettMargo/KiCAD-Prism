import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { projectNameAPI } from "@/services/project-name-api";

interface ProjectNameEditorProps {
  projectId: string;
  currentName: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (newName: string) => void;
}

export function ProjectNameEditor({ 
  projectId, 
  currentName, 
  isOpen, 
  onClose, 
  onUpdate 
}: ProjectNameEditorProps) {
  const [displayName, setDisplayName] = useState(currentName);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!displayName.trim()) {
      setError('Project name cannot be empty');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await projectNameAPI.updateProjectName(projectId, displayName.trim());
      onUpdate(response.display_name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project name');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(currentName);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Project Name</DialogTitle>
          <DialogDescription>
            Enter a custom name for this project. This will be displayed instead of the folder name.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter project name"
              className="w-full"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCancel}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isUpdating || !displayName.trim()}
            >
              {isUpdating ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
