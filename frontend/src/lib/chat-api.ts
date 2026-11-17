

import { ApiError, apiFetch } from '@/lib/api';
import { CLIENT_API_BASE_URL } from '@/lib/client-api-base';

const API_BASE_URL = CLIENT_API_BASE_URL;









export interface Chat {
    id: string;
    userId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount?: number;
}

export interface Message {
    id: string;
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Record<string, unknown> | null;
    createdAt: string;
}

export interface ChatDetail extends Chat {
    messages: Message[];
}

export interface ChatListResponse {
    chats: Chat[];
    total: number;
    page: number;

    pageSize: number;
}

export interface StreamEvent {
    event: 'start' | 'token' | 'tool_call' | 'tool_result' | 'end' | 'error' | 'thinking';
    data: { content: string };
}


export async function createChat(title?: string): Promise<Chat> {
    return apiFetch<Chat>('/chat', {
        method: 'POST',
        body: { title },
    });
}


export async function listChats(page = 1, pageSize = 20): Promise<ChatListResponse> {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return apiFetch<ChatListResponse>(`/chat?${qs.toString()}`);
}


export async function getChat(chatId: string): Promise<ChatDetail> {
    return apiFetch<ChatDetail>(`/chat/${chatId}`);
}


export async function deleteChat(chatId: string): Promise<void> {
    await apiFetch<void>(`/chat/${chatId}`, { method: 'DELETE' });
}


export async function updateChatTitle(chatId: string, title: string): Promise<Chat> {
    return apiFetch<Chat>(`/chat/${chatId}/title`, {
        method: 'PATCH',
        body: { title },
    });
}


export async function sendMessageStream(
    chatId: string,
    content: string,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
): Promise<void> {
    const response = await fetch(
        `${API_BASE_URL}/chat/${chatId}/message?stream=true`,
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
            signal,
        }
    );

    if (!response.ok) {


        let detail = 'Failed to send message';
        try {
            const parsed = (await response.json()) as { detail?: string };
            if (parsed && typeof parsed.detail === 'string' && parsed.detail) {
                detail = parsed.detail;
            }
        } catch {

            detail = response.statusText || detail;
        }
        throw new ApiError(detail, response.status);
    }

    if (!response.body) {
        throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {




        let currentEvent = '';
        let dataLines: string[] = [];

        const flushEvent = () => {
            if (!currentEvent || dataLines.length === 0) {
                currentEvent = '';
                dataLines = [];
                return;
            }
            const data = dataLines.join('\n');
            try {
                const parsed = JSON.parse(data);
                onEvent({
                    event: currentEvent as StreamEvent['event'],
                    data: parsed,
                });
            } catch {


            }
            currentEvent = '';
            dataLines = [];
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) {




                flushEvent();
                break;
            }

            buffer += decoder.decode(value, { stream: true });



            const rawLines = buffer.split('\n');
            buffer = rawLines.pop() || '';
            const lines = rawLines.map((l) => l.replace(/\r$/, ''));





            for (const line of lines) {
                if (line === '') {

                    flushEvent();
                } else if (line.startsWith('event:')) {
                    currentEvent = line.slice('event:'.length).trim();
                } else if (line.startsWith('data:')) {


                    let payload = line.slice('data:'.length);
                    if (payload.startsWith(' ')) payload = payload.slice(1);
                    dataLines.push(payload);
                }


            }





        }






        if (buffer) {
            buffer = buffer.replace(/\r$/, '');
            if (buffer) {
                const tailLines = buffer.split('\n');
                for (const line of tailLines) {
                    if (line === '') {

                    } else if (line.startsWith('event:')) {
                        currentEvent = line.slice('event:'.length).trim();
                    } else if (line.startsWith('data:')) {
                        let payload = line.slice('data:'.length);
                        if (payload.startsWith(' ')) payload = payload.slice(1);
                        dataLines.push(payload);
                    }
                }

                flushEvent();
            }
        }
    } finally {



        try {
            await reader.cancel();
        } catch {

        }
        reader.releaseLock();
    }
}


export async function sendMessage(
    chatId: string,
    content: string
): Promise<{ role: string; content: string }> {
    return apiFetch<{ role: string; content: string }>(`/chat/${chatId}/message?stream=false`, {
        method: 'POST',
        body: { content },
    });
}