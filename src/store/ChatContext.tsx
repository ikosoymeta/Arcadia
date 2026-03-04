import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Conversation, Message, Folder, Checkpoint, ChatMode, CoworkTask, CoworkStep, ConversationStreamingState } from '../types';
import { storage } from '../services/storage';

const DEFAULT_STREAMING: ConversationStreamingState = {
  isStreaming: false,
  streamingText: '',
  streamingReasoning: '',
};

interface ChatState {
  conversations: Conversation[];
  folders: Folder[];
  activeConversationId: string | null;
  streamingStates: Record<string, ConversationStreamingState>;
  chatMode: ChatMode;
  globalInstructions: string;
  coworkTasks: CoworkTask[];
  activeCoworkTaskId: string | null;
}

interface ChatContextType {
  // State
  conversations: Conversation[];
  folders: Folder[];
  activeConversationId: string | null;
  chatMode: ChatMode;
  globalInstructions: string;
  coworkTasks: CoworkTask[];
  activeCoworkTaskId: string | null;

  // Derived backward-compatible streaming state (from active conversation)
  isStreaming: boolean;
  streamingText: string;
  streamingReasoning: string;

  // Per-conversation streaming
  getStreamingState: (conversationId: string) => ConversationStreamingState;
  isConversationStreaming: (conversationId: string) => boolean;
  setStreaming: (conversationId: string, streaming: boolean) => void;
  appendStreamingText: (conversationId: string, text: string) => void;
  setStreamingReasoning: (conversationId: string, text: string) => void;
  appendStreamingReasoning: (conversationId: string, text: string) => void;
  setAbortController: (conversationId: string, controller: AbortController | null) => void;
  abortConversationStream: (conversationId: string) => string;

  // Conversation management
  createConversation: (model: string, folderId?: string | null) => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string) => void;
  clearActiveConversation: () => void;
  addMessage: (conversationId: string, message: Message) => void;
  getActiveConversation: () => Conversation | undefined;
  togglePin: (id: string) => void;
  setVisibility: (id: string, visibility: 'private' | 'team' | 'public') => void;
  generateShareUrl: (id: string) => string;
  importConversation: (conv: Conversation) => void;
  moveToFolder: (conversationId: string, folderId: string | null) => void;
  addCheckpoint: (conversationId: string, label: string) => void;
  restoreCheckpoint: (conversationId: string, checkpointId: string) => void;
  createFolder: (name: string, parentId?: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleFolderExpand: (id: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setGlobalInstructions: (instructions: string) => void;
  setFolderInstructions: (folderId: string, instructions: string) => void;
  getFolderInstructions: (folderId: string) => string;
  createCoworkTask: (title: string, conversationId: string, steps: Omit<CoworkStep, 'id'>[]) => string;
  updateCoworkTaskStatus: (taskId: string, status: CoworkTask['status']) => void;
  updateCoworkStepStatus: (taskId: string, stepId: string, status: CoworkStep['status'], detail?: string) => void;
  setActiveCoworkTask: (taskId: string | null) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChatState>(() => ({
    conversations: storage.getConversations(),
    folders: storage.getFolders(),
    activeConversationId: null,
    streamingStates: {},
    chatMode: (localStorage.getItem('arcadia-chat-mode') as ChatMode) || 'chat',
    globalInstructions: localStorage.getItem('arcadia-global-instructions') || '',
    coworkTasks: [],
    activeCoworkTaskId: null,
  }));

  // Abort controllers live in a ref (mutable, not part of render state)
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  // Debounce conversation saves during streaming to avoid blocking the main thread.
  useEffect(() => {
    const anyStreaming = Object.values(state.streamingStates).some(s => s.isStreaming);
    if (anyStreaming) {
      storage.debouncedSaveConversations(state.conversations);
    } else {
      storage.saveConversations(state.conversations);
    }
  }, [state.conversations, state.streamingStates]);

  useEffect(() => {
    storage.saveFolders(state.folders);
  }, [state.folders]);

  // ─── Per-Conversation Streaming Methods ──────────────────────────────────────

  const getStreamingState = useCallback((conversationId: string): ConversationStreamingState => {
    return state.streamingStates[conversationId] ?? DEFAULT_STREAMING;
  }, [state.streamingStates]);

  const isConversationStreaming = useCallback((conversationId: string): boolean => {
    return state.streamingStates[conversationId]?.isStreaming ?? false;
  }, [state.streamingStates]);

  const setStreaming = useCallback((conversationId: string, streaming: boolean) => {
    setState(prev => {
      const newStates = { ...prev.streamingStates };
      if (streaming) {
        newStates[conversationId] = {
          isStreaming: true,
          streamingText: '',
          streamingReasoning: '',
        };
      } else {
        delete newStates[conversationId];
      }
      return { ...prev, streamingStates: newStates };
    });
  }, []);

  const appendStreamingText = useCallback((conversationId: string, text: string) => {
    setState(prev => {
      const existing = prev.streamingStates[conversationId];
      if (!existing) return prev;
      return {
        ...prev,
        streamingStates: {
          ...prev.streamingStates,
          [conversationId]: { ...existing, streamingText: existing.streamingText + text },
        },
      };
    });
  }, []);

  const setStreamingReasoning = useCallback((conversationId: string, text: string) => {
    setState(prev => {
      const existing = prev.streamingStates[conversationId];
      if (!existing) return prev;
      return {
        ...prev,
        streamingStates: {
          ...prev.streamingStates,
          [conversationId]: { ...existing, streamingReasoning: text },
        },
      };
    });
  }, []);

  const appendStreamingReasoning = useCallback((conversationId: string, text: string) => {
    setState(prev => {
      const existing = prev.streamingStates[conversationId];
      if (!existing) return prev;
      return {
        ...prev,
        streamingStates: {
          ...prev.streamingStates,
          [conversationId]: { ...existing, streamingReasoning: existing.streamingReasoning + text },
        },
      };
    });
  }, []);

  const setAbortController = useCallback((conversationId: string, controller: AbortController | null) => {
    if (controller) {
      abortControllersRef.current[conversationId] = controller;
    } else {
      delete abortControllersRef.current[conversationId];
    }
  }, []);

  const abortConversationStream = useCallback((conversationId: string): string => {
    const partialText = state.streamingStates[conversationId]?.streamingText ?? '';
    const controller = abortControllersRef.current[conversationId];
    if (controller) {
      controller.abort();
      delete abortControllersRef.current[conversationId];
    }
    return partialText;
  }, [state.streamingStates]);

  // ─── Conversation Management ─────────────────────────────────────────────────

  const createConversation = useCallback((model: string, folderId: string | null = null) => {
    const id = crypto.randomUUID();
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      folderId,
      isPinned: false,
      visibility: 'private',
      ownerId: 'local-user',
      ownerName: 'You',
      collaborators: [],
      checkpoints: [],
      tags: [],
    };
    setState(prev => ({
      ...prev,
      conversations: [conversation, ...prev.conversations],
      activeConversationId: id,
    }));
    return id;
  }, []);

  const deleteConversation = useCallback((id: string) => {
    // Abort any active stream for this conversation
    const controller = abortControllersRef.current[id];
    if (controller) {
      controller.abort();
      delete abortControllersRef.current[id];
    }
    setState(prev => {
      const newStates = { ...prev.streamingStates };
      delete newStates[id];
      return {
        ...prev,
        conversations: prev.conversations.filter(c => c.id !== id),
        activeConversationId: prev.activeConversationId === id ? null : prev.activeConversationId,
        streamingStates: newStates,
      };
    });
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

  const clearActiveConversation = useCallback(() => {
    setState(prev => ({ ...prev, activeConversationId: null }));
  }, []);

  const addMessage = useCallback((conversationId: string, message: Message) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c => {
        if (c.id !== conversationId) return c;
        const updated = { ...c, messages: [...c.messages, message], updatedAt: Date.now() };
        if (c.messages.length === 0 && message.role === 'user') {
          updated.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
        }
        return updated;
      }),
    }));
  }, []);

  const getActiveConversation = useCallback(() => {
    return state.conversations.find(c => c.id === state.activeConversationId);
  }, [state.conversations, state.activeConversationId]);

  const togglePin = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c =>
        c.id === id ? { ...c, isPinned: !c.isPinned, updatedAt: Date.now() } : c
      ),
    }));
  }, []);

  const setVisibility = useCallback((id: string, visibility: 'private' | 'team' | 'public') => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c =>
        c.id === id ? { ...c, visibility, updatedAt: Date.now() } : c
      ),
    }));
  }, []);

  const generateShareUrl = useCallback((id: string) => {
    const base = import.meta.env.BASE_URL || '/';
    const url = `${window.location.origin}${base}shared/${id}`;
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c =>
        c.id === id ? { ...c, shareUrl: url, visibility: c.visibility === 'private' ? 'team' : c.visibility } : c
      ),
    }));
    return url;
  }, []);

  const importConversation = useCallback((conv: Conversation) => {
    setState(prev => {
      if (prev.conversations.some(c => c.id === conv.id)) {
        return { ...prev, activeConversationId: conv.id };
      }
      return {
        ...prev,
        conversations: [conv, ...prev.conversations],
        activeConversationId: conv.id,
      };
    });
  }, []);

  const moveToFolder = useCallback((conversationId: string, folderId: string | null) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c =>
        c.id === conversationId ? { ...c, folderId, updatedAt: Date.now() } : c
      ),
    }));
  }, []);

  const addCheckpoint = useCallback((conversationId: string, label: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c => {
        if (c.id !== conversationId) return c;
        const checkpoint: Checkpoint = {
          id: crypto.randomUUID(),
          label,
          messageIndex: c.messages.length,
          timestamp: Date.now(),
          createdBy: 'You',
        };
        return { ...c, checkpoints: [...c.checkpoints, checkpoint], updatedAt: Date.now() };
      }),
    }));
  }, []);

  const restoreCheckpoint = useCallback((conversationId: string, checkpointId: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(c => {
        if (c.id !== conversationId) return c;
        const cp = c.checkpoints.find(ch => ch.id === checkpointId);
        if (!cp) return c;
        return { ...c, messages: c.messages.slice(0, cp.messageIndex), updatedAt: Date.now() };
      }),
    }));
  }, []);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    const id = crypto.randomUUID();
    const folder: Folder = { id, name, parentId, createdAt: Date.now(), isExpanded: true };
    setState(prev => ({ ...prev, folders: [...prev.folders, folder] }));
    return id;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setState(prev => ({
      ...prev,
      folders: prev.folders.map(f => f.id === id ? { ...f, name } : f),
    }));
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      folders: prev.folders.filter(f => f.id !== id),
      conversations: prev.conversations.map(c =>
        c.folderId === id ? { ...c, folderId: null } : c
      ),
    }));
  }, []);

  const toggleFolderExpand = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      folders: prev.folders.map(f =>
        f.id === id ? { ...f, isExpanded: !f.isExpanded } : f
      ),
    }));
  }, []);

  const setChatMode = useCallback((chatMode: ChatMode) => {
    localStorage.setItem('arcadia-chat-mode', chatMode);
    setState(prev => ({ ...prev, chatMode }));
  }, []);

  const setGlobalInstructions = useCallback((instructions: string) => {
    localStorage.setItem('arcadia-global-instructions', instructions);
    setState(prev => ({ ...prev, globalInstructions: instructions }));
  }, []);

  const setFolderInstructions = useCallback((folderId: string, instructions: string) => {
    setState(prev => ({
      ...prev,
      folders: prev.folders.map(f =>
        f.id === folderId ? { ...f, instructions } : f
      ),
    }));
  }, []);

  const getFolderInstructions = useCallback((folderId: string) => {
    return state.folders.find(f => f.id === folderId)?.instructions || '';
  }, [state.folders]);

  const createCoworkTask = useCallback((title: string, conversationId: string, steps: Omit<CoworkStep, 'id'>[]) => {
    const id = crypto.randomUUID();
    const task: CoworkTask = {
      id,
      title,
      status: 'planning',
      steps: steps.map(s => ({ ...s, id: crypto.randomUUID() })),
      createdAt: Date.now(),
      conversationId,
    };
    setState(prev => ({
      ...prev,
      coworkTasks: [task, ...prev.coworkTasks],
      activeCoworkTaskId: id,
    }));
    return id;
  }, []);

  const updateCoworkTaskStatus = useCallback((taskId: string, status: CoworkTask['status']) => {
    setState(prev => ({
      ...prev,
      coworkTasks: prev.coworkTasks.map(t =>
        t.id === taskId ? { ...t, status, completedAt: status === 'completed' ? Date.now() : t.completedAt } : t
      ),
    }));
  }, []);

  const updateCoworkStepStatus = useCallback((taskId: string, stepId: string, status: CoworkStep['status'], detail?: string) => {
    setState(prev => ({
      ...prev,
      coworkTasks: prev.coworkTasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          steps: t.steps.map(s => {
            if (s.id !== stepId) return s;
            return {
              ...s,
              status,
              detail: detail || s.detail,
              startedAt: status === 'in_progress' ? Date.now() : s.startedAt,
              completedAt: status === 'completed' ? Date.now() : s.completedAt,
            };
          }),
        };
      }),
    }));
  }, []);

  const setActiveCoworkTask = useCallback((taskId: string | null) => {
    setState(prev => ({ ...prev, activeCoworkTaskId: taskId }));
  }, []);

  // ─── Derived backward-compatible streaming properties ────────────────────────

  const activeStreamState = state.activeConversationId
    ? state.streamingStates[state.activeConversationId] ?? DEFAULT_STREAMING
    : DEFAULT_STREAMING;

  return (
    <ChatContext.Provider value={{
      // State
      conversations: state.conversations,
      folders: state.folders,
      activeConversationId: state.activeConversationId,
      chatMode: state.chatMode,
      globalInstructions: state.globalInstructions,
      coworkTasks: state.coworkTasks,
      activeCoworkTaskId: state.activeCoworkTaskId,

      // Derived streaming state for active conversation (backward compat)
      isStreaming: activeStreamState.isStreaming,
      streamingText: activeStreamState.streamingText,
      streamingReasoning: activeStreamState.streamingReasoning,

      // Per-conversation streaming
      getStreamingState,
      isConversationStreaming,
      setStreaming,
      appendStreamingText,
      setStreamingReasoning,
      appendStreamingReasoning,
      setAbortController,
      abortConversationStream,

      // Conversation management
      createConversation,
      deleteConversation,
      renameConversation,
      setActiveConversation,
      clearActiveConversation,
      addMessage,
      getActiveConversation,
      togglePin,
      setVisibility,
      generateShareUrl,
      importConversation,
      moveToFolder,
      addCheckpoint,
      restoreCheckpoint,
      createFolder,
      renameFolder,
      deleteFolder,
      toggleFolderExpand,
      setChatMode,
      setGlobalInstructions,
      setFolderInstructions,
      getFolderInstructions,
      createCoworkTask,
      updateCoworkTaskStatus,
      updateCoworkStepStatus,
      setActiveCoworkTask,
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
