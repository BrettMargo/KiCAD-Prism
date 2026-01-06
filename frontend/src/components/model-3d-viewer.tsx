import { useEffect, useRef } from "react";
import * as OV from "online-3d-viewer";

interface Model3DViewerProps {
    modelUrl: string;
}

export function Model3DViewer({ modelUrl }: Model3DViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<OV.EmbeddedViewer | null>(null);

    useEffect(() => {
        if (!containerRef.current || !modelUrl) return;

        // Clear previous viewer
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }

        // Initialize viewer with dark theme settings
        const viewer = new OV.EmbeddedViewer(containerRef.current, {
            backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
            defaultColor: new OV.RGBColor(200, 200, 200),
        });

        viewer.LoadModelFromUrlList([modelUrl]);
        viewerRef.current = viewer;

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
            viewerRef.current = null;
        };
    }, [modelUrl]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '800px',
                backgroundColor: '#1e1e1e',
                borderRadius: '8px'
            }}
        />
    );
}
