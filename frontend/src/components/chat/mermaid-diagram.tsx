'use client';

import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';
import { AlertCircle, RefreshCw } from 'lucide-react';





let mermaidInitialized = false;

function initializeMermaid() {
    if (mermaidInitialized) return;

    const isDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;

    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
        flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
        },
        sequence: {
            useMaxWidth: true,
        },
    });
    mermaidInitialized = true;
}

interface MermaidDiagramProps {
    chart: string;
    className?: string;
}


function sanitizeMermaidChart(chart: string): string {
    const lines = chart.split('\n');
    const sanitizedLines = lines.map(line => {
        let sanitized = line;


        sanitized = sanitized.replace(/\[([^\]]+)\]/g, (match, content) => {
            let fixed = content;

            fixed = fixed.replace(/\(([^)]*)\)/g, ' $1 ');

            fixed = fixed.replace(/[<>]/g, '');

            fixed = fixed.replace(/\s*=\s*/g, ' equals ');

            fixed = fixed.replace(/\s+/g, ' ').trim();
            return `[${fixed}]`;
        });


        sanitized = sanitized.replace(/\{([^}]+)\}/g, (match, content) => {
            let fixed = content;

            fixed = fixed.replace(/\(([^)]*)\)/g, ' $1 ');

            fixed = fixed.replace(/[<>]/g, '');

            fixed = fixed.replace(/\s+/g, ' ').trim();
            return `{${fixed}}`;
        });


        sanitized = sanitized.replace(/\|([^|]+)\|/g, (match, content) => {
            let fixed = content;

            fixed = fixed.replace(/[<>{}[\]()]/g, '');
            fixed = fixed.replace(/\s+/g, ' ').trim();
            return `|${fixed}|`;
        });

        return sanitized;
    });
    return sanitizedLines.join('\n');
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const uniqueId = useId().replace(/:/g, '-');

    const renderDiagram = async () => {
        if (!chart.trim()) {
            setError('Empty diagram');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            initializeMermaid();


            const sanitizedChart = sanitizeMermaidChart(chart.trim());



            try {
                await mermaid.parse(sanitizedChart);
            } catch (parseErr) {

                setError('Invalid diagram syntax');
                setIsLoading(false);
                return;
            }

            const id = `mermaid-${uniqueId}-${Date.now()}`;
            const { svg: renderedSvg } = await mermaid.render(id, sanitizedChart);
            setSvg(renderedSvg);


            document.querySelectorAll('#d' + id).forEach(el => el.remove());
        } catch (err) {



            document.querySelectorAll(`[id^="mermaid-${uniqueId}-"]`).forEach(el => {
                if (el.closest('.mermaid-container') === null &&
                    el.tagName !== 'DIV' ||
                    el.classList.contains('error-icon')) {
                    el.remove();
                }
            });
            console.error('Mermaid render error:', err);
            setError('Failed to render diagram');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        renderDiagram();










        return () => {

            document.querySelectorAll(`[id^="mermaid-${uniqueId}-"]`).forEach(el => el.remove());
            document.querySelectorAll('.error-icon').forEach(el => {
                if (!el.closest('.mermaid-container')) {
                    el.remove();
                }
            });
        };
    }, [chart]);

    if (isLoading) {
        return (
            <div className={cn(
                'mermaid-container my-4 p-8 rounded-lg bg-muted/50 border',
                'flex items-center justify-center',
                className
            )}>
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Rendering diagram...</span>
            </div>
        );
    }

    if (error) {

        return (
            <div className={cn(
                'mermaid-container my-4 rounded-lg bg-[#1e1e1e] overflow-hidden',
                className
            )}>
                
                <div className="flex justify-between items-center px-4 py-2 bg-[#2d2d2d] border-b border-[#404040]">
                    <span className="text-xs font-mono text-muted-foreground uppercase">
                        mermaid (source)
                    </span>
                    <CopyButton text={chart} />
                </div>

                
                <pre className="p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-[#d4d4d4] whitespace-pre">
                        {chart}
                    </code>
                </pre>
            </div>
        );
    }

    return (
        <div className={cn(
            'mermaid-container my-4 rounded-lg bg-muted/30 border overflow-hidden',
            className
        )}>
            
            <div className="flex justify-between items-center px-4 py-2 bg-muted/50 border-b">
                <span className="text-xs font-mono text-muted-foreground uppercase">
                    Mermaid Diagram
                </span>
                <CopyButton text={chart} />
            </div>

            
            <div
                ref={containerRef}
                className="p-4 overflow-x-auto flex justify-center"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    );
}
