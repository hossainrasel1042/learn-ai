'use client';



import { useEffect, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { listChats, type Chat } from '@/lib/chat-api';

export interface ChatSourceSelectProps {
    value: string | null;
    onChange: (chatId: string | null) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;

    id?: string;
}

export function ChatSourceSelect({
    value,
    onChange,
    disabled,
    placeholder = 'Pick a conversation…',
    className,
    id,
}: ChatSourceSelectProps) {
    const [chats, setChats] = useState<Chat[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;



        Promise.resolve().then(() => { if (mounted) setLoading(true); });
        listChats(1, 100)
            .then((res) => { if (mounted) setChats(res?.chats ?? []); })
            .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'load failed'); })
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, []);

    return (
        <div className={className}>
            <Select
                value={value ?? undefined}
                onValueChange={(selectedId) => {
                    const found = chats.find((c) => c.id === selectedId) || null;
                    onChange(found ? found.id : null);
                }}
                disabled={disabled || loading}
            >
                <SelectTrigger className="w-full" id={id}>
                    <SelectValue placeholder={loading ? 'Loading conversations…' : placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {error && (
                        <div className="px-3 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                    {!error && chats.length === 0 && !loading && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                            No conversations yet.
                        </div>
                    )}
                    {chats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.title || 'Untitled conversation'}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export default ChatSourceSelect;
