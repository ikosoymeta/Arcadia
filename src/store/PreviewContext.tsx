import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Artifact } from '../types';

interface PreviewContextType {
  artifacts: Artifact[];
  activeArtifactId: string | null;
  addArtifact: (artifact: Artifact) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  setActiveArtifact: (id: string) => void;
  clearArtifacts: () => void;
}

const PreviewContext = createContext<PreviewContextType | null>(null);

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [artifacts, setArtifactsState] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactIdState] = useState<string | null>(null);

  const addArtifact = useCallback((artifact: Artifact) => {
    setArtifactsState(prev => [...prev, artifact]);
    setActiveArtifactIdState(artifact.id);
    // Auto-expand preview panel when artifacts are added
    document.dispatchEvent(new CustomEvent('arcadia:preview-expand'));
  }, []);

  const setArtifacts = useCallback((arts: Artifact[]) => {
    setArtifactsState(arts);
    if (arts.length > 0) setActiveArtifactIdState(arts[arts.length - 1].id);
  }, []);

  const setActiveArtifact = useCallback((id: string) => {
    setActiveArtifactIdState(id);
  }, []);

  const clearArtifacts = useCallback(() => {
    setArtifactsState([]);
    setActiveArtifactIdState(null);
  }, []);

  return (
    <PreviewContext.Provider value={{
      artifacts,
      activeArtifactId,
      addArtifact,
      setArtifacts,
      setActiveArtifact,
      clearArtifacts,
    }}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider');
  return ctx;
}
