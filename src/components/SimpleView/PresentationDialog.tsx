import { useState, useCallback, useRef, useEffect } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { sendMessage } from '../../services/claude';
import type { Message } from '../../types';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Slide {
  title: string;
  bullets: string[];
  notes?: string;
  layout?: 'title' | 'content' | 'two-column' | 'image' | 'closing';
}

interface PresentationData {
  title: string;
  subtitle?: string;
  slides: Slide[];
}

type GenerationStep = 'idle' | 'analyzing' | 'outlining' | 'generating' | 'finalizing' | 'done' | 'error';

interface ResourceLink {
  url: string;
  label: string;
}

const STEP_LABELS: Record<GenerationStep, string> = {
  idle: '',
  analyzing: 'Analyzing your topic and requirements...',
  outlining: 'Creating presentation outline...',
  generating: 'Generating slides...',
  finalizing: 'Polishing and formatting...',
  done: 'Presentation ready!',
  error: 'Something went wrong',
};

const STEP_ORDER: GenerationStep[] = ['analyzing', 'outlining', 'generating', 'finalizing', 'done'];

// ─── Slide Preview Card ────────────────────────────────────────────────────────

function SlidePreview({ slide, index, total, isTitle, onEdit, isNew }: {
  slide: Slide;
  index: number;
  total: number;
  isTitle?: boolean;
  onEdit: (index: number, slide: Slide) => void;
  isNew?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(slide.title);
  const [editBullets, setEditBullets] = useState(slide.bullets.join('\n'));

  useEffect(() => {
    setEditTitle(slide.title);
    setEditBullets(slide.bullets.join('\n'));
  }, [slide]);

  const handleSave = () => {
    onEdit(index, { ...slide, title: editTitle, bullets: editBullets.split('\n').filter(b => b.trim()) });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{
        background: '#1e1e2e', borderRadius: '10px', padding: '20px',
        border: '2px solid var(--accent)', position: 'relative',
        aspectRatio: '16/9', display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', position: 'absolute', top: '8px', right: '12px' }}>
          Slide {index + 1}/{total}
        </div>
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)',
            fontSize: '14px', fontWeight: 700, outline: 'none',
          }}
        />
        <textarea
          value={editBullets}
          onChange={e => setEditBullets(e.target.value)}
          placeholder="One bullet per line"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)',
            fontSize: '12px', outline: 'none', resize: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <button onClick={() => setEditing(false)} style={{
            padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none',
            background: 'var(--accent)', color: 'white', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
          }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        background: isTitle ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' : '#1e1e2e',
        borderRadius: '10px', padding: '20px', cursor: 'pointer',
        border: '1px solid var(--border)', position: 'relative',
        aspectRatio: '16/9', display: 'flex', flexDirection: 'column',
        justifyContent: isTitle ? 'center' : 'flex-start',
        alignItems: isTitle ? 'center' : 'flex-start',
        transition: 'border-color 0.2s, transform 0.15s, opacity 0.5s',
        overflow: 'hidden',
        opacity: isNew ? 0 : 1,
        animation: isNew ? 'slideIn 0.4s ease-out forwards' : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', position: 'absolute', top: '8px', right: '12px' }}>
        {index + 1}/{total} ✎
      </div>
      <div style={{
        fontSize: isTitle ? '16px' : '13px', fontWeight: 700,
        color: 'var(--text-primary)', marginBottom: isTitle ? '8px' : '10px',
        textAlign: isTitle ? 'center' : 'left',
      }}>
        {slide.title}
      </div>
      {!isTitle && slide.bullets.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', listStyle: 'disc' }}>
          {slide.bullets.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
          {slide.bullets.length > 5 && <li style={{ color: 'var(--text-tertiary)' }}>+{slide.bullets.length - 5} more...</li>}
        </ul>
      )}
      {slide.notes && (
        <div style={{ position: 'absolute', bottom: '8px', left: '12px', fontSize: '9px', color: 'var(--text-tertiary)', opacity: 0.6 }}>
          Speaker notes included
        </div>
      )}
    </div>
  );
}

// ─── Progress Stepper ──────────────────────────────────────────────────────────

function ProgressStepper({ currentStep, slideProgress }: { currentStep: GenerationStep; slideProgress?: string }) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px' }}>
        {STEP_ORDER.map((step, i) => {
          const isActive = i === currentIdx;
          const isComplete = i < currentIdx;
          return (
            <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                height: '4px', width: '100%', borderRadius: '2px',
                background: isComplete ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                transition: 'background 0.3s',
                position: 'relative', overflow: 'hidden',
              }}>
                {isActive && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, var(--accent) 0%, rgba(99,102,241,0.3) 50%, var(--accent) 100%)',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    backgroundSize: '200% 100%',
                  }} />
                )}
              </div>
              <span style={{
                fontSize: '10px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : isComplete ? 'var(--accent)' : 'var(--text-tertiary)',
                whiteSpace: 'nowrap',
              }}>
                {isComplete ? '✓' : ''} {step === 'analyzing' ? 'Analyze' : step === 'outlining' ? 'Outline' : step === 'generating' ? 'Generate' : step === 'finalizing' ? 'Finalize' : 'Done'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current step description */}
      <div style={{
        textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        {currentStep !== 'done' && currentStep !== 'error' && (
          <div style={{
            width: '14px', height: '14px',
            border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
        )}
        <span>{STEP_LABELS[currentStep]}</span>
        {slideProgress && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{slideProgress}</span>}
      </div>
    </div>
  );
}

// ─── Main Dialog ───────────────────────────────────────────────────────────────

const FAST_MODEL = 'claude-sonnet-4-6';

const PRESENTATION_SYSTEM_PROMPT = `You are a professional presentation consultant. Create a complete presentation as a JSON object.

IMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanation text before or after.

The JSON must follow this exact structure:
{
  "title": "Presentation Title",
  "subtitle": "Optional subtitle",
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Optional speaker notes",
      "layout": "title|content|two-column|closing"
    }
  ]
}

Guidelines:
- First slide should have layout "title" with the presentation title
- Last slide should have layout "closing" with key takeaways or call to action
- Each content slide should have 3-5 concise, impactful bullet points
- Include speaker notes for each slide
- Make content engaging, professional, and well-structured
- Use a clear narrative arc: hook → context → insights → details → conclusion
- Be specific and data-driven, avoid vague generalities`;

export function PresentationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeConnection } = useConnection();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [slideCount, setSlideCount] = useState('10');
  const [resourceLinks, setResourceLinks] = useState<ResourceLink[]>([]);
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [newResourceLabel, setNewResourceLabel] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [slideProgress, setSlideProgress] = useState('');
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [liveSlides, setLiveSlides] = useState<Slide[]>([]);
  const [newSlideIndices, setNewSlideIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slidesEndRef = useRef<HTMLDivElement>(null);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setTopic('');
      setAudience('');
      setKeyMessage('');
      setSlideCount('10');
      setResourceLinks([]);
      setNewResourceUrl('');
      setNewResourceLabel('');
      setAttachedFiles([]);
      setAdditionalNotes('');
      setPresentation(null);
      setLiveSlides([]);
      setNewSlideIndices(new Set());
      setError('');
      setGenerating(false);
      setGenerationStep('idle');
      setSlideProgress('');
      setMinimized(false);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  // Auto-scroll to new slides
  useEffect(() => {
    if (liveSlides.length > 0 && slidesEndRef.current) {
      slidesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [liveSlides.length]);

  // Clear "new" animation after a delay
  useEffect(() => {
    if (newSlideIndices.size > 0) {
      const timer = setTimeout(() => setNewSlideIndices(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [newSlideIndices]);

  const addResource = useCallback(() => {
    if (!newResourceUrl.trim()) return;
    setResourceLinks(prev => [...prev, {
      url: newResourceUrl.trim(),
      label: newResourceLabel.trim() || newResourceUrl.trim(),
    }]);
    setNewResourceUrl('');
    setNewResourceLabel('');
  }, [newResourceUrl, newResourceLabel]);

  const removeResource = useCallback((index: number) => {
    setResourceLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || !activeConnection) return;
    setGenerating(true);
    setError('');
    setPresentation(null);
    setLiveSlides([]);
    setNewSlideIndices(new Set());
    setGenerationStep('analyzing');

    const controller = new AbortController();
    abortRef.current = controller;

    // Build detailed prompt
    let userPrompt = `Create a professional presentation on: "${topic}"`;
    if (audience) userPrompt += `\nTarget audience: ${audience}`;
    if (keyMessage) userPrompt += `\nKey message/objective: ${keyMessage}`;
    userPrompt += `\nNumber of slides: ${slideCount}`;
    if (resourceLinks.length > 0) {
      userPrompt += `\n\nReference resources to incorporate:\n${resourceLinks.map(r => `- ${r.label}: ${r.url}`).join('\n')}`;
    }
    if (attachedFiles.length > 0) {
      userPrompt += `\n\nAttached files for reference: ${attachedFiles.map(f => f.name).join(', ')}`;
      // Read text content from attached files
      for (const file of attachedFiles) {
        if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
          try {
            const text = await file.text();
            if (text.length < 5000) {
              userPrompt += `\n\nContent from ${file.name}:\n${text}`;
            } else {
              userPrompt += `\n\nContent from ${file.name} (truncated):\n${text.slice(0, 5000)}...`;
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }
    if (additionalNotes) userPrompt += `\n\nAdditional notes: ${additionalNotes}`;
    userPrompt += '\n\nReturn ONLY the JSON object, nothing else.';

    // Simulate step progression with timers
    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    stepTimers.push(setTimeout(() => setGenerationStep('outlining'), 2000));
    stepTimers.push(setTimeout(() => setGenerationStep('generating'), 4500));

    let fullText = '';

    try {
      const fastConnection = { ...activeConnection, model: FAST_MODEL };

      const result = await sendMessage({
        connection: fastConnection,
        messages: [{ id: 'pres', role: 'user', content: userPrompt, timestamp: Date.now(), model: FAST_MODEL }] as Message[],
        systemPrompt: PRESENTATION_SYSTEM_PROMPT,
        enableThinking: false,
        signal: controller.signal,
        onToken: (text: string) => {
          fullText += text;
          // Try to parse partial slides as they stream in
          tryParseLiveSlides(fullText);
        },
      });

      stepTimers.forEach(clearTimeout);
      setGenerationStep('finalizing');

      // Parse the final JSON
      let content = result.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      try {
        const data = JSON.parse(content) as PresentationData;
        if (!data.title || !data.slides || !Array.isArray(data.slides)) {
          throw new Error('Invalid presentation structure');
        }
        setPresentation(data);
        setLiveSlides(data.slides);
        setGenerationStep('done');
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]) as PresentationData;
            setPresentation(data);
            setLiveSlides(data.slides);
            setGenerationStep('done');
          } catch {
            setError('Failed to parse presentation data. Please try again.');
            setGenerationStep('error');
          }
        } else {
          setError('Failed to parse presentation data. Please try again.');
          setGenerationStep('error');
        }
      }
    } catch (err: unknown) {
      stepTimers.forEach(clearTimeout);
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Failed to generate presentation');
        setGenerationStep('error');
      }
    } finally {
      setGenerating(false);
    }
  }, [topic, audience, keyMessage, slideCount, resourceLinks, attachedFiles, additionalNotes, activeConnection]);

  // Try to parse slides incrementally from streaming JSON
  const tryParseLiveSlides = useCallback((text: string) => {
    try {
      // Look for complete slide objects in the streaming text
      const slidesMatch = text.match(/"slides"\s*:\s*\[/);
      if (!slidesMatch) return;

      const slidesStart = text.indexOf(slidesMatch[0]) + slidesMatch[0].length;
      const slidesText = text.slice(slidesStart);

      // Find complete slide objects by matching balanced braces
      const slides: Slide[] = [];
      let depth = 0;
      let start = -1;

      for (let i = 0; i < slidesText.length; i++) {
        if (slidesText[i] === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (slidesText[i] === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            try {
              const slideJson = slidesText.slice(start, i + 1);
              const slide = JSON.parse(slideJson) as Slide;
              if (slide.title) slides.push(slide);
            } catch { /* incomplete JSON, skip */ }
            start = -1;
          }
        }
      }

      if (slides.length > 0) {
        setLiveSlides(prev => {
          if (slides.length > prev.length) {
            // Mark new slides for animation
            const newIndices = new Set<number>();
            for (let i = prev.length; i < slides.length; i++) {
              newIndices.add(i);
            }
            setNewSlideIndices(newIndices);
            setSlideProgress(`Slide ${slides.length}/${parseInt(slideCount) || 10}`);
          }
          return slides;
        });
      }
    } catch { /* parsing failed, that's ok during streaming */ }
  }, [slideCount]);

  const handleEditSlide = useCallback((index: number, slide: Slide) => {
    if (presentation) {
      const newSlides = [...presentation.slides];
      newSlides[index] = slide;
      setPresentation({ ...presentation, slides: newSlides });
      setLiveSlides(newSlides);
    } else {
      setLiveSlides(prev => {
        const newSlides = [...prev];
        newSlides[index] = slide;
        return newSlides;
      });
    }
  }, [presentation]);

  const handleExportPptx = useCallback(async () => {
    const data = presentation || (liveSlides.length > 0 ? { title: topic, slides: liveSlides } : null);
    if (!data) return;
    setExporting(true);
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'ArcadIA Editor';
      pptx.title = data.title;

      for (const slide of data.slides) {
        const pptSlide = pptx.addSlide();

        if (slide.layout === 'title') {
          pptSlide.background = { color: '1e1b4b' };
          pptSlide.addText(slide.title, {
            x: 0.5, y: 1.5, w: '90%', h: 1.5,
            fontSize: 36, fontFace: 'Calibri', color: 'FFFFFF',
            bold: true, align: 'center', valign: 'middle',
          });
          if (slide.bullets.length > 0) {
            pptSlide.addText(slide.bullets[0], {
              x: 0.5, y: 3.2, w: '90%', h: 0.8,
              fontSize: 18, fontFace: 'Calibri', color: 'A5B4FC',
              align: 'center', valign: 'middle',
            });
          }
        } else if (slide.layout === 'closing') {
          pptSlide.background = { color: '1e1b4b' };
          pptSlide.addText(slide.title, {
            x: 0.5, y: 0.8, w: '90%', h: 1,
            fontSize: 28, fontFace: 'Calibri', color: 'FFFFFF',
            bold: true, align: 'center',
          });
          if (slide.bullets.length > 0) {
            pptSlide.addText(
              slide.bullets.map(b => ({ text: `• ${b}\n`, options: { fontSize: 16, color: 'C7D2FE', bullet: false } })),
              { x: 1.5, y: 2.2, w: '70%', h: 3, fontFace: 'Calibri', align: 'center', lineSpacing: 28 }
            );
          }
        } else {
          pptSlide.background = { color: '0F172A' };
          pptSlide.addText(slide.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.8,
            fontSize: 24, fontFace: 'Calibri', color: 'FFFFFF', bold: true,
          });
          pptSlide.addShape('rect' as unknown as Parameters<typeof pptSlide.addShape>[0], {
            x: 0.5, y: 1.1, w: 2, h: 0.04, fill: { color: '6366F1' },
          });
          if (slide.bullets.length > 0) {
            pptSlide.addText(
              slide.bullets.map(b => ({
                text: b,
                options: { fontSize: 16, color: 'E2E8F0', bullet: { type: 'bullet' as const }, indentLevel: 0 },
              })),
              { x: 0.7, y: 1.5, w: '85%', h: 4, fontFace: 'Calibri', lineSpacing: 32, valign: 'top' }
            );
          }
        }

        if (slide.notes) {
          pptSlide.addNotes(slide.notes);
        }
      }

      const filename = `${data.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').slice(0, 50)}.pptx`;
      await pptx.writeFile({ fileName: filename });
    } catch (err) {
      console.error('PPTX export failed:', err);
      setError('Failed to export PowerPoint. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [presentation, liveSlides, topic]);

  if (!open) return null;

  const showForm = !generating && !presentation && liveSlides.length === 0;
  const showProgress = generating;
  const showPreview = liveSlides.length > 0;
  const isDone = generationStep === 'done' || (presentation !== null && !generating);

  // ─── Minimized floating pill ─────────────────────────────────────────
  if (minimized) {
    return (
      <>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        `}</style>
        <div
          onClick={() => setMinimized(false)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '16px', padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            cursor: 'pointer', transition: 'all 0.2s',
            maxWidth: '360px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <span style={{ fontSize: '18px' }}>🎬</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isDone ? 'Presentation Ready' : generating ? 'Creating Presentation...' : topic || 'Presentation'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              {generating && !isDone ? (
                <>
                  <div style={{
                    width: '10px', height: '10px',
                    border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <span>{STEP_LABELS[generationStep]}</span>
                  {slideProgress && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{slideProgress}</span>}
                </>
              ) : isDone ? (
                <span style={{ color: 'var(--accent)' }}>{liveSlides.length} slides ready — click to view</span>
              ) : (
                <span>Click to resume</span>
              )}
            </div>
          </div>
          {generating && !isDone && (
            <div style={{
              width: '60px', height: '4px', borderRadius: '2px',
              background: 'var(--bg-tertiary)', overflow: 'hidden', flexShrink: 0,
            }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                background: 'linear-gradient(90deg, var(--accent) 0%, rgba(99,102,241,0.3) 50%, var(--accent) 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
                width: `${Math.min(100, (STEP_ORDER.indexOf(generationStep) / (STEP_ORDER.length - 1)) * 100)}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={e => { if (e.target === e.currentTarget && !generating) onClose(); }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: '16px',
        border: '1px solid var(--border)', width: '100%', maxWidth: showPreview ? '1100px' : '600px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        transition: 'max-width 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🎬</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isDone ? 'Presentation Ready' : generating ? 'Creating Presentation...' : 'Create Presentation'}
            </span>
            {generating && (
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', fontWeight: 500,
              }}>
                Using Sonnet 4
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isDone && (
              <>
                <button
                  onClick={() => { setPresentation(null); setLiveSlides([]); setError(''); setGenerationStep('idle'); }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'none', color: 'var(--text-secondary)', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >New Presentation</button>
                <button
                  onClick={handleExportPptx}
                  disabled={exporting}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                    background: exporting ? 'var(--bg-tertiary)' : 'var(--accent)',
                    color: 'white', fontSize: '12px', cursor: exporting ? 'wait' : 'pointer',
                    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {exporting ? 'Exporting...' : 'Download .pptx'}
                </button>
              </>
            )}
            {generating && (
              <>
                <button
                  onClick={() => setMinimized(true)}
                  title="Minimize — continue working while presentation generates"
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'none', color: 'var(--text-secondary)', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >⤓ Minimize</button>
                <button
                  onClick={() => { if (abortRef.current) abortRef.current.abort(); setGenerating(false); setGenerationStep('error'); }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >Cancel</button>
              </>
            )}
            {!generating && (
              <button onClick={onClose} style={{
                width: '28px', height: '28px', borderRadius: '6px', border: 'none',
                background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            )}
          </div>
        </div>

        {/* Progress Stepper */}
        {showProgress && <ProgressStepper currentStep={generationStep} slideProgress={slideProgress} />}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {showForm ? (
            /* ─── Input Form ─── */
            <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Topic */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Presentation Topic *
                </label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g., Q1 2025 Business Review, AI in Healthcare, Product Launch Strategy"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  autoFocus
                />
              </div>

              {/* Key Message */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Key Message / Objective
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px' }}>optional</span>
                </label>
                <input
                  value={keyMessage}
                  onChange={e => setKeyMessage(e.target.value)}
                  placeholder="e.g., We need to increase investment in AI by 30% to stay competitive"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {/* Audience + Slide Count row */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                    Target Audience
                    <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px' }}>optional</span>
                  </label>
                  <input
                    value={audience}
                    onChange={e => setAudience(e.target.value)}
                    placeholder="e.g., Executive team, Investors"
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                <div style={{ width: '160px', flexShrink: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                    Slides
                  </label>
                  <select
                    value={slideCount}
                    onChange={e => setSlideCount(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="5">5 (Quick)</option>
                    <option value="8">8 (Standard)</option>
                    <option value="10">10 (Detailed)</option>
                    <option value="15">15 (In-depth)</option>
                    <option value="20">20 (Comprehensive)</option>
                  </select>
                </div>
              </div>

              {/* Resource Links */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Reference Resources
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px' }}>URLs to incorporate</span>
                </label>
                {resourceLinks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {resourceLinks.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', fontSize: '12px',
                      }}>
                        <span style={{ color: 'var(--accent)', flexShrink: 0 }}>🔗</span>
                        <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.label}
                        </span>
                        <button onClick={() => removeResource(i)} style={{
                          background: 'none', border: 'none', color: 'var(--text-tertiary)',
                          cursor: 'pointer', fontSize: '14px', padding: '0 4px', flexShrink: 0,
                        }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={newResourceUrl}
                    onChange={e => setNewResourceUrl(e.target.value)}
                    placeholder="Paste URL..."
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: '8px',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    onKeyDown={e => { if (e.key === 'Enter') addResource(); }}
                  />
                  <input
                    value={newResourceLabel}
                    onChange={e => setNewResourceLabel(e.target.value)}
                    placeholder="Label (optional)"
                    style={{
                      width: '140px', padding: '8px 12px', borderRadius: '8px',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    onKeyDown={e => { if (e.key === 'Enter') addResource(); }}
                  />
                  <button onClick={addResource} disabled={!newResourceUrl.trim()} style={{
                    padding: '8px 14px', borderRadius: '8px', border: 'none',
                    background: newResourceUrl.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: 'white', fontSize: '13px', cursor: newResourceUrl.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 600, flexShrink: 0,
                  }}>Add</button>
                </div>
              </div>

              {/* File Attachments */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Attachments
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px' }}>presentations, images, documents</span>
                </label>
                {attachedFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {attachedFiles.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)', fontSize: '12px',
                      }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          {f.name.match(/\.(pptx?|key)$/i) ? '📊' : f.name.match(/\.(png|jpg|jpeg|gif|svg)$/i) ? '🖼' : '📄'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                          {(f.size / 1024).toFixed(0)}KB
                        </span>
                        <button onClick={() => removeFile(i)} style={{
                          background: 'none', border: 'none', color: 'var(--text-tertiary)',
                          cursor: 'pointer', fontSize: '12px', padding: '0 2px',
                        }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pptx,.ppt,.key,.pdf,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.svg"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '8px 14px', borderRadius: '8px',
                    border: '1px dashed var(--border)', background: 'none',
                    color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
                    width: '100%', textAlign: 'center',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'none'; }}
                >
                  + Attach files (presentations, images, documents)
                </button>
              </div>

              {/* Additional Notes */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Additional Instructions
                  <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px' }}>optional</span>
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={e => setAdditionalNotes(e.target.value)}
                  placeholder="e.g., Include a comparison chart on slide 3, use data from Q4 report, emphasize cost savings..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '10px',
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444', fontSize: '13px',
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || !activeConnection}
                style={{
                  padding: '12px 24px', borderRadius: '10px', border: 'none',
                  background: !topic.trim() || !activeConnection ? 'var(--bg-tertiary)' : 'var(--accent)',
                  color: 'white', fontSize: '14px', fontWeight: 600, cursor: !topic.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', marginTop: '4px',
                }}
              >
                Generate Presentation
              </button>

              {!activeConnection && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  Connect to Claude first (Settings → Connection)
                </div>
              )}
            </div>
          ) : null}

          {/* Live Slide Preview (shows during generation AND after completion) */}
          {showPreview && (
            <div>
              {isDone && (
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    {presentation?.title || topic}
                  </h2>
                  {presentation?.subtitle && (
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>{presentation.subtitle}</p>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
                    {liveSlides.length} slides · Click any slide to edit · Download as .pptx when ready
                  </p>
                </div>
              )}

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444', fontSize: '13px',
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '14px',
              }}>
                {liveSlides.map((slide, i) => (
                  <SlidePreview
                    key={i}
                    slide={slide}
                    index={i}
                    total={liveSlides.length}
                    isTitle={slide.layout === 'title' || i === 0}
                    onEdit={handleEditSlide}
                    isNew={newSlideIndices.has(i)}
                  />
                ))}
                {generating && (
                  <div style={{
                    background: 'var(--bg-secondary)', borderRadius: '10px',
                    border: '1px dashed var(--border)', aspectRatio: '16/9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '24px', height: '24px', margin: '0 auto 8px',
                        border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                      }} />
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        Next slide...
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Prominent download CTA when done */}
              {isDone && (
                <div style={{
                  marginTop: '24px', padding: '20px', borderRadius: '12px',
                  background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Your presentation is ready with {liveSlides.length} slides
                  </div>
                  <button
                    onClick={handleExportPptx}
                    disabled={exporting}
                    style={{
                      padding: '10px 24px', borderRadius: '10px', border: 'none',
                      background: exporting ? 'var(--bg-tertiary)' : 'var(--accent)',
                      color: 'white', fontSize: '14px', cursor: exporting ? 'wait' : 'pointer',
                      fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {exporting ? (
                      <>
                        <span style={{
                          width: '14px', height: '14px',
                          border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
                          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                          display: 'inline-block',
                        }} />
                        Exporting...
                      </>
                    ) : (
                      <>⬇ Download .pptx</>
                    )}
                  </button>
                </div>
              )}
              <div ref={slidesEndRef} />
            </div>
          )}

          {/* Generating but no slides yet */}
          {generating && liveSlides.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: '48px', height: '48px', margin: '0 auto 16px',
                border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
              }} />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Preparing your presentation...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
