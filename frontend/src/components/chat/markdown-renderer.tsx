'use client';

import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useMemo } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';

import { CodeBlock, InlineCode } from './code-block';
import { MermaidDiagram } from './mermaid-diagram';
import { Callout, Blockquote, CalloutType } from './callout';
import { CopyButton } from './copy-button';
import { SourceCitation } from './source-citation';
import { LinkPreview } from '@/components/ui/link-preview';
import { cn } from '@/lib/utils';
import { markdownSanitizeSchema } from './markdown-sanitize-schema';
import './markdown.css';


const CALLOUT_REGEX = /:::(note|warning|info|tip|danger|success|question)\s*\n([\s\S]*?):::/g;



const SOURCE_CITATION_REGEX = /\[Source:\s*([^\]]+)\]/g;


function preprocessMarkdown(content: string): string {
    let processed = content;


    processed = processed.replace(CALLOUT_REGEX, (_, type, innerContent) => {

        const escapedContent = innerContent.trim();
        return `<div data-callout="${type}">\n\n${escapedContent}\n\n</div>`;
    });





    processed = processed.replace(SOURCE_CITATION_REGEX, (match, payload) => {
        const raw = payload.trim();



        const pipeIndex = raw.indexOf('|');
        const beforePipe = pipeIndex === -1 ? raw : raw.slice(0, pipeIndex);
        const afterPipe = pipeIndex === -1 ? '' : raw.slice(pipeIndex + 1);

        const firstComma = beforePipe.indexOf(',');
        const trimmedFilename =
            firstComma === -1 ? beforePipe.trim() : beforePipe.slice(0, firstComma).trim();
        const trimmedLocation =
            firstComma === -1 ? '' : beforePipe.slice(firstComma + 1).trim();
        const trimmedThirdPart = afterPipe.trim();

        const params = new URLSearchParams();
        params.set('filename', trimmedFilename);
        if (trimmedLocation) params.set('location', trimmedLocation);


        if (trimmedThirdPart) {
            if (trimmedThirdPart.startsWith('http://') || trimmedThirdPart.startsWith('https://')) {
                params.set('fileUrl', trimmedThirdPart);
            } else {
                params.set('excerpt', trimmedThirdPart);
            }
        }



        const citationUrl = `#citation-data:${params.toString()}`;


        const displayText = trimmedLocation
            ? `📎 ${trimmedFilename}, ${trimmedLocation}`
            : `📎 ${trimmedFilename}`;

        return `[${displayText}](${citationUrl})`;
    });

    return processed;
}

interface MarkdownRendererProps {
    content: string;
    className?: string;
    showCopyButton?: boolean;
    isStreaming?: boolean;
    baseImageUrl?: string;
    onViewContent?: (url: string) => void;
}

export function MarkdownRenderer({
    content,
    className,
    showCopyButton = false,
    isStreaming = false,
    baseImageUrl,
    onViewContent
}: MarkdownRendererProps) {

    const processedContent = useMemo(() => {
        return preprocessMarkdown(content);
    }, [content]);


    const components: Components = useMemo(() => ({

        h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-border">
                {children}
            </h1>
        ),
        h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-5 mb-3 pb-1.5 border-b border-border/50">
                {children}
            </h2>
        ),
        h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
        ),
        h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-3 mb-2">{children}</h4>
        ),
        h5: ({ children }) => (
            <h5 className="text-sm font-semibold mt-3 mb-1">{children}</h5>
        ),
        h6: ({ children }) => (
            <h6 className="text-xs font-semibold mt-3 mb-1">{children}</h6>
        ),


        p: ({ children }) => (
            <p className="my-2 leading-relaxed">{children}</p>
        ),


        code: ({ className: codeClassName, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : undefined;
            const codeString = String(children).replace(/\n$/, '');


            const isInline = !codeClassName && !codeString.includes('\n');

            if (isInline) {
                return <InlineCode>{children}</InlineCode>;
            }


            if (language === 'mermaid') {
                if (isStreaming) {

                    return (
                        <div className="my-4 p-4 rounded-lg bg-muted/50 border border-dashed border-muted-foreground/30">
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <div className="animate-pulse">📊</div>
                                <span>Mermaid diagram (will render when complete)...</span>
                            </div>
                            <pre className="mt-2 text-xs text-muted-foreground overflow-hidden">
                                <code>{codeString.slice(0, 100)}...</code>
                            </pre>
                        </div>
                    );
                }
                return <MermaidDiagram chart={codeString} />;
            }


            return <CodeBlock language={language}>{codeString}</CodeBlock>;
        },


        pre: ({ children }) => <>{children}</>,


        a: ({ href, children }) => {

            if (href?.startsWith('#citation-data:')) {
                try {


                    const paramsString = href.replace('#citation-data:', '');
                    const p = new URLSearchParams(paramsString);

                    const filename = p.get('filename') || '';
                    const location = p.get('location') || undefined;
                    const excerpt = p.get('excerpt') || undefined;
                    const fileUrl = p.get('fileUrl') || undefined;

                    return (
                        <SourceCitation
                            filename={filename}
                            location={location}
                            contentExcerpt={excerpt}
                            fileUrl={fileUrl}
                            onViewContent={onViewContent}
                        />
                    );
                } catch (e) {

                    console.error('Failed to parse citation URL', e);
                    return <span>{children}</span>;
                }
            }


            if (href?.startsWith('view-content://')) {
                return (
                    <a
                        href={href}
                        onClick={(e) => {
                            e.preventDefault();
                            onViewContent?.(href);
                        }}
                        className="text-primary font-medium hover:underline cursor-pointer inline-flex items-center gap-1.5"
                    >
                        {children}
                        <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                );
            }

            const isExternal = href?.startsWith('http');


            if (isExternal && !isStreaming) {
                return (
                    <LinkPreview
                        url={href || ''}
                        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-1"
                    >
                        {children}
                        <ExternalLinkIcon className="h-3 w-3" />
                    </LinkPreview>
                );
            }

            return (
                <a
                    href={href}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-1"
                >
                    {children}
                    {isExternal && <ExternalLinkIcon className="h-3 w-3" />}
                </a>
            );
        },


        ul: ({ children }) => (
            <ul className="list-disc ml-6 my-3 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
            <ol className="list-decimal ml-6 my-3 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
        ),


        blockquote: ({ children }) => (
            <Blockquote>{children}</Blockquote>
        ),


        table: ({ children }) => (
            <div className="overflow-x-auto my-4">
                <table className="w-full border-collapse text-sm">
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
            <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                {children}
            </tr>
        ),
        th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold border border-border">
                {children}
            </th>
        ),
        td: ({ children }) => (
            <td className="px-4 py-2 border border-border">{children}</td>
        ),


        hr: () => <hr className="my-6 border-t border-border" />,


        img: ({ src, alt }) => {

            let finalSrc = src;
            if (baseImageUrl && typeof src === 'string' && !src.startsWith('http') && !src.startsWith('data:')) {

                const cleanSrc = src.startsWith('./') ? src.substring(2) : src;
                finalSrc = `${baseImageUrl}${cleanSrc}`;
            }

            return (
                <img
                    src={finalSrc}
                    alt={alt || ''}
                    className="max-w-full h-auto rounded-lg my-4 border border-border/50 shadow-sm"
                    loading="lazy"
                />
            );
        },


        strong: ({ children }) => (
            <strong className="font-bold">{children}</strong>
        ),
        em: ({ children }) => (
            <em className="italic">{children}</em>
        ),
        del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
        ),


        div: ({ node, children, ...props }) => {
            const calloutType = (node?.properties?.dataCallout as CalloutType) ||
                (props as Record<string, unknown>)['data-callout'] as CalloutType;

            if (calloutType) {
                return <Callout type={calloutType}>{children}</Callout>;
            }
            return <div {...props}>{children}</div>;
        },


        span: ({ node, children, ...props }) => {
            const nodeProps = node?.properties || {};
            const classNameProp = nodeProps.className;


            const classNames = Array.isArray(classNameProp)
                ? classNameProp.join(' ')
                : (classNameProp as string || '');


            if (classNames.includes('source-citation')) {
                const filename = nodeProps.dataSource as string || '';
                const location = nodeProps.dataLocation as string || undefined;
                const excerpt = nodeProps.dataExcerpt as string || undefined;

                return (
                    <SourceCitation
                        filename={filename}
                        location={location}
                        contentExcerpt={excerpt}
                        onViewContent={onViewContent}
                    />
                );
            }

            return <span {...props}>{children}</span>;
        },
    }), [isStreaming, baseImageUrl, onViewContent]);

    return (
        <div className={cn('markdown-content relative', className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[
                    rehypeRaw,






                    [rehypeSanitize, markdownSanitizeSchema],
                ]}
                components={components}
            >
                {processedContent}
            </ReactMarkdown>

            {showCopyButton && (
                <div className="absolute top-0 right-0">
                    <CopyButton text={content} variant="text" />
                </div>
            )}
        </div>
    );
}
