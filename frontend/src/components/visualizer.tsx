import { useEffect, useState } from "react";
import * as React from "react";
import { AlertCircle, Cpu, Box, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Model3DViewer } from "./model-3d-viewer";

// Wrapper to inject content via property instead of attribute to avoid size limits/parsing
const EcadBlobWrapper = ({ filename, content }: { filename: string, content: string }) => {
    const ref = React.useRef<HTMLElement>(null);

    React.useLayoutEffect(() => {
        if (ref.current) {
            // "ecad-blob" uses @attribute which syncs property <-> attribute. 
            // Setting property is safer for large content.
            // We cast to any because TS doesn't know about the custom element properties
            (ref.current as any).content = content;
            // We set filename via attribute in JSX for immediate availability, but ensuring property sync here logic doesn't hurt.
            (ref.current as any).filename = filename;
            // console.log(`EcadBlobWrapper: Set content for ${filename} (len: ${content.length})`);
        }
    }, [filename, content]);

    // Pass filename as attribute to ensure it is available in the DOM immediately when ecad-viewer scans children.
    // This fixes a race condition where ecad-viewer might load before useLayoutEffect assigns the property.
    return <ecad-blob ref={ref} filename={filename} />;
};

interface VisualizerProps {
    projectId: string;
}

type VisualizerTab = "ecad" | "3d" | "ibom";

export function Visualizer({ projectId }: VisualizerProps) {
    const [activeTab, setActiveTab] = useState<VisualizerTab>("ecad");
    // We store the CONTENT of the files, not just URLs, to bypass loader issues
    const [schematicContent, setSchematicContent] = useState<string | null>(null);
    const [subsheets, setSubsheets] = useState<{ filename: string, content: string }[]>([]);
    const [pcbContent, setPcbContent] = useState<string | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);
    const [ibomUrl, setIbomUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchFileContent = async () => {
            setLoading(true);
            const baseUrl = `/api/projects/${projectId}`;

            // Fetch schematic content
            try {
                const response = await fetch(`${baseUrl}/schematic`);
                if (response.ok) {
                    const text = await response.text();
                    console.log("Visualizer: Loaded schematic content", text.slice(0, 50));
                    setSchematicContent(text);

                    // Fetch subsheets
                    try {
                        const subsheetsRes = await fetch(`${baseUrl}/schematic/subsheets`);
                        if (subsheetsRes.ok) {
                            const data = await subsheetsRes.json();
                            if (data.files && data.files.length > 0) {
                                const subsheetPromises = data.files.map(async (f: any) => {
                                    const res = await fetch(f.url);
                                    const content = await res.text();

                                    // Try to get proper relative path/filename
                                    // If the API provides 'name' or 'path', use it. 
                                    // Otherwise, we check if the URL contains "Subsheets" and preserve that structure.
                                    let filename = f.name || f.path || f.url.split('/').pop() || "subsheet.kicad_sch";

                                    // Heuristic: If we don't have a path, and it's a subsheet, it might need to be in "Subsheets/"
                                    // But typically the root schematic refers to exactly what is in the .kicad_sch file.
                                    // We should look at the "Schematic File" property in the root sheet? No, we can't parse it easily here.
                                    // Let's assume standard KiCAD structure: if the file was in Subsheets/, correct name is needed.
                                    // For now, let's just make sure it has the extension.
                                    if (!filename.endsWith('.kicad_sch')) filename += '.kicad_sch';

                                    // Hack: If the project structure implies subsheets are in a folder, we might need to prepend.
                                    // For JTYU-OBC, user mentioned "Subsheets directory".
                                    if (!filename.includes('/') && f.url.includes('Subsheets')) {
                                        filename = `Subsheets/${filename}`;
                                    }

                                    return { filename, content };
                                });
                                const loadedSubsheets = await Promise.all(subsheetPromises);
                                setSubsheets(loadedSubsheets);
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to load subsheets", err);
                    }
                } else {
                    setError(prev => ({ ...prev, schematic: "Schematic file not found" }));
                }
            } catch (err) {
                setError(prev => ({ ...prev, schematic: "Failed to load schematic" }));
            }

            // Fetch PCB content
            try {
                const response = await fetch(`${baseUrl}/pcb`);
                if (response.ok) {
                    const text = await response.text();
                    console.log("Visualizer: Loaded PCB content", text.slice(0, 50));
                    setPcbContent(text);
                }
            } catch (err) {
                setError(prev => ({ ...prev, pcb: "PCB file not found" }));
            }

            // Fetch 3D model (still using URL for this one as it's binary/blob managed by Online3DViewer)
            try {
                const response = await fetch(`${baseUrl}/3d-model`);
                if (response.ok) {
                    setModelUrl(`${baseUrl}/3d-model`);
                }
            } catch (err) {
                setError(prev => ({ ...prev, model: "3D model not found" }));
            }

            // Fetch iBoM
            try {
                const response = await fetch(`${baseUrl}/ibom`);
                if (response.ok) {
                    setIbomUrl(`${baseUrl}/ibom`);
                }
            } catch (err) {
                setError(prev => ({ ...prev, ibom: "iBoM file not found" }));
            }

            setLoading(false);
        };

        fetchFileContent();
    }, [projectId]);

    const tabs: { id: VisualizerTab; label: string; icon: any }[] = [
        { id: "ecad", label: "Schematic & PCB", icon: Cpu },
        { id: "3d", label: "3D View", icon: Box },
        { id: "ibom", label: "iBoM", icon: FileText },
    ];

    if (loading) {
        return <div className="flex items-center justify-center h-96">Loading visualizer...</div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tab Bar */}
            <div className="flex gap-2 border-b mb-4">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "default" : "ghost"}
                            className="rounded-b-none"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon className="h-4 w-4 mr-2" />
                            {tab.label}
                        </Button>
                    );
                })}
            </div>

            {/* Viewer Area */}
            <div className="flex-1 min-h-0 bg-background">
                {/* ECAD Tab */}
                <div className={activeTab === "ecad" ? "h-full" : "hidden"}>
                    {(schematicContent || pcbContent) ? (
                        <ecad-viewer
                            key={`${projectId}-ecad`}
                            style={{
                                width: '100%',
                                height: '100%'
                            }}
                        >
                            {/* Inject Root Schematic */}
                            {schematicContent && (
                                <EcadBlobWrapper filename="root.kicad_sch" content={schematicContent} />
                            )}

                            {/* Inject Subsheets */}
                            {subsheets.map((sheet) => (
                                <EcadBlobWrapper key={sheet.filename} filename={sheet.filename} content={sheet.content} />
                            ))}

                            {/* Inject PCB */}
                            {pcbContent && (
                                <EcadBlobWrapper filename="board.kicad_pcb" content={pcbContent} />
                            )}
                        </ecad-viewer>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                            <AlertCircle className="h-12 w-12 mb-4" />
                            <p>No ECAD files found</p>
                            <div className="text-sm mt-2 text-center">
                                {error.schematic && <p>Schematic: {error.schematic}</p>}
                                {error.pcb && <p>PCB: {error.pcb}</p>}
                                {!error.schematic && !error.pcb && <p>Ensure .kicad_sch or .kicad_pcb files exist</p>}
                            </div>
                        </div>
                    )}
                </div>

                {/* 3D Tab */}
                <div className={activeTab === "3d" ? "h-full" : "hidden"}>
                    {modelUrl ? (
                        <Model3DViewer modelUrl={modelUrl} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                            <AlertCircle className="h-12 w-12 mb-4" />
                            <p>3D model not available</p>
                            <p className="text-sm mt-2">Generate a .glb file in Design-Outputs/3DModel/</p>
                        </div>
                    )}
                </div>

                {/* iBoM Tab */}
                <div className={activeTab === "ibom" ? "h-full" : "hidden"}>
                    {ibomUrl ? (
                        <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border shadow-sm">
                            <iframe
                                src={ibomUrl}
                                className="w-full h-full border-0"
                                title="Interactive BoM"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground bg-slate-50 border border-dashed rounded-lg">
                            <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                            <p className="font-medium">Interactive BoM not found</p>
                            <p className="text-sm mt-1">Generate an iBoM HTML file using KiCAD InteractiveHtmlBom plugin</p>
                            <p className="text-xs mt-4 text-slate-400">Place it in Design-Outputs/ directory</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
