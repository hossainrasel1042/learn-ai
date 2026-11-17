'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChat, useChatList } from '@/hooks/use-chat';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';
import {
    ChatHeader,
    ChatMessageList,
    ChatInput,
    ChatError,
} from '@/components/chat/chat-components';
import { ChatSidebar, MobileChatSidebar } from '@/components/chat/chat-sidebar';

import { ContentViewerModal } from '@/components/chat/content-viewer-modal';

import { Suspense } from 'react';

const VOICE_MODE_KEY = 'learnai.voiceMode';

function ChatContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const chatId = searchParams.get('id') || undefined;


    const [viewContentUrl, setViewContentUrl] = useState<string | undefined>(undefined);


    const { speak, cancel: cancelSpeech } = useSpeechSynthesis();


    const [voiceMode, setVoiceMode] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            const raw = window.localStorage.getItem(VOICE_MODE_KEY);
            return raw !== null ? raw === '1' : false;
        } catch {
            return false;
        }
    });




    const voiceModeRef = useRef(voiceMode);
    useEffect(() => {
        voiceModeRef.current = voiceMode;
    }, [voiceMode]);

    const toggleVoiceMode = useCallback(() => {






        const next = !voiceModeRef.current;
        setVoiceMode(next);
        try {
            window.localStorage.setItem(VOICE_MODE_KEY, next ? '1' : '0');
        } catch {

        }
        if (!next) cancelSpeech();
    }, [cancelSpeech]);

    const handleAssistantComplete = useCallback(
        (text: string) => {
            if (voiceModeRef.current) speak(text);
        },
        [speak],
    );










    const handleChatCreated = useCallback(
        (newChatId: string) => {
            router.push(`/dashboard?id=${newChatId}`, { scroll: false });
        },
        [router],
    );

    const {
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
        resetChat,
        retry,
    } = useChat({
        chatId,
        onAssistantMessageComplete: handleAssistantComplete,
        onChatCreated: handleChatCreated,
    });

    const handleNewChat = useCallback(() => {






        resetChat();
        router.push('/dashboard');
    }, [resetChat, router]);






    const handleChatDeleted = useCallback(
        (deletedId: string) => {
            if (deletedId !== chatId) return;
            resetChat();
            router.push('/dashboard');
        },
        [chatId, resetChat, router],
    );







    const chatList = useChatList({ onChatDeleted: handleChatDeleted });
    const { loadChats } = chatList;




    const wasStreamingRef = useRef(false);
    useEffect(() => {
        if (wasStreamingRef.current && !isStreaming) {


            const timer = setTimeout(() => {
                loadChats();
            }, 500);
            wasStreamingRef.current = !!isStreaming;
            return () => clearTimeout(timer);
        }
        wasStreamingRef.current = !!isStreaming;
    }, [isStreaming, loadChats]);












    useEffect(() => {
        if (!chatId) return;
        loadChats();
    }, [chatId, loadChats]);

    const handleSelectChat = useCallback((id: string) => {
        router.push(`/dashboard?id=${id}`);
    }, [router]);

    const handleSendMessage = useCallback(async (content: string) => {

        cancelSpeech();



        await sendMessage(content);
    }, [sendMessage, cancelSpeech]);

    const handleViewContent = useCallback((url: string) => {
        setViewContentUrl(url);
    }, []);

    return (
        <div className="flex h-[calc(100vh-65px)] bg-background">

            <div className="hidden md:block w-72 border-r border-border shrink-0">
                <ChatSidebar
                    currentChatId={chatId}
                    onSelectChat={handleSelectChat}
                    onNewChat={handleNewChat}
                    chatList={chatList}
                />
            </div>


            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <ChatHeader
                    title={chat?.title}
                    onNewChat={handleNewChat}
                    mobileSidebar={
                        <MobileChatSidebar
                            currentChatId={chatId}
                            onSelectChat={handleSelectChat}
                            onNewChat={handleNewChat}
                            chatList={chatList}
                        />
                    }
                />


                <ChatMessageList
                    messages={messages}
                    isStreaming={isStreaming}
                    streamingContent={streamingContent}
                    thinkingLogs={thinkingLogs}
                    toolCalls={toolCalls}
                    isLoading={isLoading}
                    onViewContent={handleViewContent}
                    onSuggestionClick={handleSendMessage}
                />


                {error && (
                    <ChatError
                        error={error}
                        onRetry={retry}
                    />
                )}


                <ChatInput
                    onSend={handleSendMessage}
                    isStreaming={isStreaming}
                    isLoading={isLoading}
                    failedMessage={failedMessage}
                    voiceMode={voiceMode}
                    onVoiceModeChange={toggleVoiceMode}
                />


                <ContentViewerModal
                    open={!!viewContentUrl}
                    onOpenChange={(open) => !open && setViewContentUrl(undefined)}
                    contentUrl={viewContentUrl}
                    title="Generated Content"
                />
            </div>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="flex h-[calc(100vh-4rem)] items-center justify-center">Loading...</div>}>
            <ChatContent />
        </Suspense>
    );
}
