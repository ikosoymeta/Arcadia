import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Conversation, Message } from '../types';
import { storage } from '../services/storage';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
  streamingText: string;
}

interface ChatContextType extends ChatState {
  createConversation: (model: string) => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setStreaming: (streaming: boolean) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (text: string) => void;
  getActiveConversation: () => Conversation | undefined;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChatState>(() => ({
    conversations: storage.getConversations(),
    activeConversationId: null,
    isStreaming: false,
    streamingText: '',
  }));

  useEffect(() => {
    storage.saveConversations(state.conversations);
  }, [state.conversations]);

  const createConversation = useCallback((model: string) => {
    const id = crypto.randomUUID();
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
    };
    setState(prev => ({
      ...prev,
      conversations: [conversation, ...prev.conversations],
      activeConversationId: id,
    }));
    return id;
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.filter(c => c.id !== id),
      activeConversationId: prev.activeConversationId === id ? null : prev.activeConversationId,
    }));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));
  }, []);

  const setActiveConversation = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeConversationId: id }));
  }, []);

  const addMessage = useCallback((conversationId: string, message: Message) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c => {
        if (c.id !== conversationId) return c;
        const updated = { ...c, messages: [...c.messages, message], updatedAt: Date.now() };
        // Auto-title from first user message
        if (c.messages.length === 0 && message.role === 'user') {
          updated.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
        }
        return updated;
      }),
    }));
  }, []);

  const setStreaming = useCallback((isStreaming: boolean) => {
    setState(prev => ({ ...prev, isStreaming, streamingText: isStreaming ? '' : prev.streamingText }));
  }, []);

  const setStreamingText = useCallback((streamingText: string) => {
    setState(prev => ({ ...prev, streamingText }));
  }, []);

  const appendStreamingText = useCallback((text: string) => {
    setState(prev => ({ ...prev, streamingText: prev.streamingText + text }));
  }, []);

  const getActiveConversation = useCallback(() => {
    return state.conversations.find(c => c.id === state.activeConversationId);
  }, [state.conversations, state.activeConversationId]);

  return (
    <ChatContext.Provider value={{
      ...state,
      createConversation,
      deleteConversation,
      renameConversation,
      setActiveConversation,
      addMessage,
      setStreaming,
      setStreamingText,
      appendStreamingText,
      getActiveConversation,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
