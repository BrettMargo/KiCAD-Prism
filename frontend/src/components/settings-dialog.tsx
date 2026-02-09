import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { GitBranch, Copy, FileCode } from "lucide-react";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SettingsTab = "git" | "general";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>("git");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden flex h-[600px]">
                {/* Sidebar */}
                <div className="w-64 bg-muted/30 border-r p-4 flex flex-col gap-2">
                    <div className="mb-4 px-2">
                        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                        <p className="text-sm text-muted-foreground">Manage your workspace</p>
                    </div>

                    <Button
                        variant={activeTab === "git" ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setActiveTab("git")}
                    >
                        <GitBranch className="mr-2 h-4 w-4" />
                        Git & SSH
                    </Button>

                    <Button
                        variant={activeTab === "general" ? "secondary" : "ghost"}
                        className="justify-start opacity-50 cursor-not-allowed"
                        title="Coming soon"
                    >
                        <FileCode className="mr-2 h-4 w-4" />
                        General
                    </Button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === "git" && <GitSettings />}
                    {activeTab === "general" && (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            General settings coming soon.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function GitSettings() {
    const [sshKey, setSshKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [email] = useState("kicad-prism@example.com"); // Hardcoded for now or fetch from user profile if available

    const fetchSshKey = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/settings/ssh-key");
            if (res.ok) {
                const data = await res.json();
                setSshKey(data.public_key);
            }
        } catch (err) {
            console.error("Failed to fetch SSH key", err);
            toast.error("Failed to load SSH key settings");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSshKey();
    }, []);

    const generateKey = async () => {
        if (!confirm("This will overwrite any existing SSH key. Continue?")) return;

        setGenerating(true);
        try {
            const res = await fetch("/api/settings/ssh-key/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                const data = await res.json();
                setSshKey(data.public_key);
                toast.success("New SSH key generated successfully");
            } else {
                const err = await res.json();
                toast.error(err.detail || "Failed to generate SSH key.");
            }
        } catch (err) {
            toast.error("An error occurred while connecting to the backend.");
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = () => {
        if (sshKey) {
            navigator.clipboard.writeText(sshKey);
            toast.success("SSH Key copied to clipboard");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Git Configuration</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your SSH keys for authenticating with Git providers like GitHub and GitLab.
                </p>
            </div>

            <div className="space-y-4 border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base">SSH Key</Label>
                        <p className="text-sm text-muted-foreground">
                            Your public SSH key for identifying this workspace.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={generateKey}
                        disabled={generating}
                    >
                        {generating ? "Generating..." : "Generate New Key"}
                    </Button>
                </div>

                {loading ? (
                    <div className="h-24 bg-muted animate-pulse rounded-md" />
                ) : sshKey ? (
                    <div className="relative">
                        <Textarea
                            readOnly
                            value={sshKey}
                            className="font-mono text-xs resize-none h-24 bg-muted/50 pr-10"
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={copyToClipboard}
                            title="Copy to clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground italic border border-dashed p-4 rounded-md text-center">
                        No SSH key found. Click "Generate New Key" to create one.
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <h4 className="text-sm font-medium">Setup Instructions</h4>

                <div className="grid gap-4 md:grid-cols-2">
                    {/* GitHub Instructions */}
                    <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center text-white">
                                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                            </div>
                            <span className="font-semibold">GitHub</span>
                        </div>
                        <ol className="text-sm text-muted-foreground list-decimal pl-4 space-y-1">
                            <li>Copy the SSH key above.</li>
                            <li>Go to <a href="https://github.com/settings/ssh/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub SSH Settings</a>.</li>
                            <li>Click "New SSH Key".</li>
                            <li>Paste the key and save.</li>
                        </ol>
                    </div>

                    {/* GitLab Instructions */}
                    <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-orange-600 flex items-center justify-center text-white">
                                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .41.26l2.47 7.6h8.6l2.47-7.6A.43.43 0 0 1 19.18 2a.42.42 0 0 1 .11.16l2.44 7.51 1.22 3.78a.84.84 0 0 1-.3.94z" /></svg>
                            </div>
                            <span className="font-semibold">GitLab</span>
                        </div>
                        <ol className="text-sm text-muted-foreground list-decimal pl-4 space-y-1">
                            <li>Copy the SSH key above.</li>
                            <li>Go to <a href="https://gitlab.com/-/profile/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitLab SSH Keys</a>.</li>
                            <li>Paste the key into the "Key" field.</li>
                            <li>Click "Add key".</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
