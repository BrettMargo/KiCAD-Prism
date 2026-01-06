export interface FileItem {
    name: string;
    path: string;
    size: number;
    modified_date: string;
    type: string;
    is_dir: boolean;
}

export interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    size: number;
    type: string;
    children: TreeNode[];
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function buildFileTree(files: FileItem[]): TreeNode[] {
    const root: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

    for (const file of sortedFiles) {
        const node: TreeNode = {
            name: file.name,
            path: file.path,
            isDir: file.is_dir,
            size: file.size,
            type: file.type,
            children: []
        };

        nodeMap.set(file.path, node);

        const parentPath = file.path.split('/').slice(0, -1).join('/');

        if (parentPath && nodeMap.has(parentPath)) {
            const parent = nodeMap.get(parentPath)!;
            parent.children.push(node);
        } else {
            root.push(node);
        }
    }

    return root;
}

export function calculateTotalSize(files: FileItem[]): number {
    return files.reduce((sum, file) => sum + file.size, 0);
}
