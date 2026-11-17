'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
    Chat,
    Message,
    ChatDetail,
    createChat,
    getChat,
    listChats,
    deleteChat,
    sendMessageStream,
    ChatListResponse,
    updateChatTitle,
} from '@/lib/chat-api';
import { describeToolCall } from '@/lib/tool-calls';

interface UseChatOptions {
    chatId?: string;
    onError?: (error: Error) => void;

    onAssistantMessageComplete?: (text: string) => void;

    onChatCreated?: (chatId: string) => void;
}

interface UseChatReturn {

    chat: ChatDetail | null;
    messages: Message[];
    isLoading: boolean;
    isStreaming: boolean;
    streamingContent: string;
    thinkingLogs: string[];

    toolCalls: string[];
    error: Error | null;

    failedMessage: { content: string; canResend: boolean } | null;


    sendMessage: (content: string) => Promise<string | undefined>;
    loadChat: (chatId: string) => Promise<void>;
    createNewChat: (title?: string) => Promise<Chat>;

    resetChat: () => void;
    clearError: () => void;

    retry: () => Promise<void>;
}


export function useChat({ chatId, onError, onAssistantMessageComplete, onChatCreated }: UseChatOptions = {}): UseChatReturn {
    const [chat, setChat] = useState<ChatDetail | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
    const [toolCalls, setToolCalls] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);


    const [failedMessage, setFailedMessage] = useState<
        { content: string; canResend: boolean } | null
    >(null);


    const loadedChatIdRef = useRef<string | undefined>(undefined);


    const sendingRef = useRef(false);


    const activeSendChatIdRef = useRef<string | null>(null);


    const abortControllerRef = useRef<AbortController | null>(null);


    const chatIdRef = useRef<string | undefined>(chatId);
    chatIdRef.current = chatId;


    const loadTokenRef = useRef(0);


    useEffect(() => {











        if (activeSendChatIdRef.current !== chatId) {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        }

        if (chatId) {



            if (loadedChatIdRef.current !== chatId) {
                loadedChatIdRef.current = chatId;
                loadChat(chatId);
            }
        } else if (loadedChatIdRef.current !== undefined) {









            loadedChatIdRef.current = undefined;
            setChat(null);
            setMessages([]);
            setThinkingLogs([]);
            setToolCalls([]);
            setError(null);
            setFailedMessage(null);
        }
    }, [chatId]);




    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        };
    }, []);

    const loadChat = useCallback(async (id: string) => {
        setIsLoading(true);
        setError(null);
        setThinkingLogs([]);
        setToolCalls([]);






        setStreamingContent('');
        setIsStreaming(false);











        const requestToken = ++loadTokenRef.current;

        try {
            const chatData = await getChat(id);
            if (requestToken !== loadTokenRef.current) {

                return;
            }
            setChat(chatData);

            setMessages(chatData.messages);



            setFailedMessage(null);
        } catch (err) {
            if (requestToken !== loadTokenRef.current) return;
            const error = err instanceof Error ? err : new Error('Failed to load chat');
            setError(error);
            onError?.(error);
        } finally {
            if (requestToken === loadTokenRef.current) {
                setIsLoading(false);
            }
        }
    }, [onError]);







    const createNewChat = useCallback(async (title?: string): Promise<Chat> => {
        setIsLoading(true);
        setError(null);
        try {
            const newChat = await createChat(title);


            setChat({ ...newChat, messages: [] } as ChatDetail);
            setMessages([]);
            setThinkingLogs([]);
            setToolCalls([]);
            return newChat;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to create chat');
            setError(error);
            onError?.(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, [onError]);

    const sendMessage = useCallback(async (content: string): Promise<string | undefined> => {



        if (sendingRef.current) return;
        sendingRef.current = true;

        setError(null);



        setFailedMessage(null);

        let activeChat: Chat | ChatDetail | null = chat;















        const targetChatId = chatIdRef.current;
        if (targetChatId && activeChat && activeChat.id !== targetChatId) {
            const error = new Error(
                'Still loading this conversation. Please wait a moment and try again.',
            );
            setError(error);
            onError?.(error);
            sendingRef.current = false;
            return;
        }


        if (!activeChat) {
            try {

















                const newChat = await createChat();
                activeChat = newChat;



                setChat({ ...newChat, messages: [] } as ChatDetail);




                loadedChatIdRef.current = newChat.id;





                onChatCreated?.(newChat.id);
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Failed to create chat');
                setError(error);
                onError?.(error);
                sendingRef.current = false;
                return;
            }
        }


        if (!activeChat) {
            sendingRef.current = false;
            return;
        }




        activeSendChatIdRef.current = activeChat.id;





        const generateId = (): string => {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        };

        const userMessage: Message = {
            id: generateId(),
            chatId: activeChat.id,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsStreaming(true);
        setStreamingContent('');
        setThinkingLogs([]);
        setToolCalls([]);


        const assistantMessageId = generateId();
        let fullContent = '';
        let streamError: Error | null = null;














        const turnToolCalls: { name: string; input: unknown }[] = [];



        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            await sendMessageStream(activeChat.id, content, (event) => {





                if (activeSendChatIdRef.current !== activeChat.id) return;

                if (event.event === 'token' && event.data.content) {
                    fullContent += event.data.content;
                    setStreamingContent(fullContent);
                } else if (event.event === 'tool_call') {



















                    setToolCalls((prev) => [...prev, describeToolCall(event.data.content)]);




                    const raw = event.data.content;
                    let parsed: { name?: unknown; input?: unknown } | null = null;
                    try {
                        const maybe = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (maybe && typeof maybe === 'object') {
                            parsed = maybe as { name?: unknown; input?: unknown };
                        }
                    } catch {
                        parsed = null;
                    }
                    turnToolCalls.push({
                        name: typeof parsed?.name === 'string' ? parsed.name : 'unknown',
                        input: parsed?.input ?? {},
                    });
                } else if (event.event === 'thinking') {
                    setThinkingLogs((prev) => [...prev, event.data.content]);
                } else if (event.event === 'error') {


                    const message =
                        (event.data as { message?: string; content?: string })?.message ||
                        (event.data as { content?: string })?.content ||
                        'Stream error';
                    streamError = new Error(message);
                    setError(streamError);
                } else if (event.event === 'end') {



                    setIsStreaming(false);
                }
            }, controller.signal);













            if (streamError) {
                onError?.(streamError);
                return;
            }




            if (activeSendChatIdRef.current !== activeChat.id) {
                return activeChat.id;
            }


            const assistantMessage: Message = {
                id: assistantMessageId,
                chatId: activeChat.id,
                role: 'assistant',
                content: fullContent,







                toolCalls:
                    turnToolCalls.length > 0 ? { toolCalls: turnToolCalls } : null,
                createdAt: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, assistantMessage]);



            setFailedMessage(null);


            if (onAssistantMessageComplete && fullContent.trim()) {
                try {
                    onAssistantMessageComplete(fullContent);
                } catch (err) {

                    console.warn('[voice] TTS callback failed:', err);
                }
            }

            return activeChat.id;

        } catch (err) {




            const aborted =
                controller.signal.aborted ||
                (err instanceof Error && err.name === 'AbortError');

            if (!aborted) {
                const error = err instanceof Error ? err : new Error('Failed to send message');
                setError(error);
                onError?.(error);











                const rejectedByServer =
                    typeof (error as { status?: unknown }).status === 'number';
                if (rejectedByServer) {
                    setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
                }




















                const status = (error as { status?: unknown }).status;
                const rejectedBeforePersisting =
                    typeof status === 'number' && status >= 400 && status < 500;






                setFailedMessage({ content, canResend: rejectedBeforePersisting });
            }
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
            sendingRef.current = false;



            if (activeSendChatIdRef.current === activeChat.id) {
                setIsStreaming(false);
                setStreamingContent('');
            }
        }
    }, [chat, onError, onAssistantMessageComplete, onChatCreated]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);


    const retry = useCallback(async () => {

        if (failedMessage?.canResend) {
            const content = failedMessage.content;
            setFailedMessage(null);
            setError(null);
            await sendMessage(content);
            return;
        }

        const target = chatIdRef.current;
        if (!target) {


            setError(null);
            return;
        }


        loadedChatIdRef.current = undefined;
        await loadChat(target);
    }, [failedMessage, loadChat, sendMessage]);




    const resetChat = useCallback(() => {
        loadedChatIdRef.current = undefined;


        activeSendChatIdRef.current = null;



        abortControllerRef.current?.abort();
        abortControllerRef.current = null;


        loadTokenRef.current += 1;
        setChat(null);
        setMessages([]);
        setThinkingLogs([]);
        setToolCalls([]);
        setStreamingContent('');



        setIsStreaming(false);
        setError(null);
        setFailedMessage(null);
    }, []);

    return {
        chat,
        messages,
        isLoading,
        isStreaming,
        streamingContent,
        thinkingLogs,
        toolCalls,
        error,
        failedMessage,
        sendMessage,
        loadChat,
        createNewChat,
        resetChat,
        clearError,
        retry,
    };
}

export interface UseChatListOptions {
    pageSize?: number;

    enabled?: boolean;

    onChatDeleted?: (chatId: string) => void;
}

export interface UseChatListReturn {
    chats: Chat[];
    isLoading: boolean;
    error: Error | null;
    page: number;
    totalPages: number;
    loadChats: () => Promise<void>;
    loadMore: () => Promise<void>;
    removeChat: (chatId: string) => Promise<void>;
    renameChat: (chatId: string, newTitle: string) => Promise<void>;
}


export function useChatList({
    pageSize = 20,
    enabled = true,
    onChatDeleted,
}: UseChatListOptions = {}): UseChatListReturn {
    const [chats, setChats] = useState<Chat[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);









    const pageRef = useRef(1);


    const loadingMoreRef = useRef(false);


    const loadChats = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const pagesToLoad = Math.max(1, pageRef.current);
            const responses = await Promise.all(
                Array.from({ length: pagesToLoad }, (_, i) => listChats(i + 1, pageSize))
            );





            const pagesNow = Math.max(1, pageRef.current);
            if (pagesNow > pagesToLoad) {
                const extra = await Promise.all(
                    Array.from(
                        { length: pagesNow - pagesToLoad },
                        (_, i) => listChats(pagesToLoad + i + 1, pageSize),
                    ),
                );
                responses.push(...extra);
            }






            const seen = new Set<string>();
            const merged: Chat[] = [];
            for (const r of responses) {
                for (const c of r.chats) {
                    if (seen.has(c.id)) continue;
                    seen.add(c.id);
                    merged.push(c);
                }
            }
            setChats(merged);
            setTotal(responses[0]?.total ?? 0);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load chats'));
        } finally {
            setIsLoading(false);
        }
    }, [pageSize]);

    const loadMore = useCallback(async () => {




        if (loadingMoreRef.current) return;
        if (chats.length >= total) return;

        loadingMoreRef.current = true;
        setIsLoading(true);

        try {
            const nextPage = pageRef.current + 1;
            const response = await listChats(nextPage, pageSize);

            setChats((prev) => {


                const seen = new Set(prev.map((c) => c.id));
                const fresh = response.chats.filter((c) => !seen.has(c.id));
                return [...prev, ...fresh];
            });
            setTotal(response.total);
            setPage(nextPage);
            pageRef.current = nextPage;
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load more chats'));
        } finally {
            loadingMoreRef.current = false;
            setIsLoading(false);
        }
    }, [chats.length, total, pageSize]);

    const removeChat = useCallback(async (chatId: string) => {
        try {
            await deleteChat(chatId);
            setChats((prev) => prev.filter((c) => c.id !== chatId));
            setTotal((t) => t - 1);




            onChatDeleted?.(chatId);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to delete chat'));
        }
    }, [onChatDeleted]);

    const renameChat = useCallback(async (chatId: string, newTitle: string) => {
        try {
            const updatedChat = await updateChatTitle(chatId, newTitle);
            setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, title: updatedChat.title } : c));
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to rename chat'));
            throw err;
        }
    }, []);


    useEffect(() => {
        if (!enabled) return;
        loadChats();
    }, [loadChats, enabled]);

    return {
        chats,
        isLoading,
        error,
        page,
        totalPages: Math.ceil(total / pageSize),
        loadChats,
        loadMore,
        removeChat,
        renameChat,
    };
}
