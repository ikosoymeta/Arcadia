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

// ─── Slide Preview Card ────────────────────────────────────────────────────────

function SlidePreview({ slide, index, total, isTitle, onEdit }: {
  slide: Slide;
  index: number;
  total: number;
  isTitle?: boolean;
  onEdit: (index: number, slide: Slide) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(slide.title);
  const [editBullets, setEditBullets] = useState(slide.bullets.join('\n'));

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
        transition: 'border-color 0.2s, transform 0.15s',
        overflow: 'hidden',
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
          📝 Speaker notes
        </div>
      )}
    </div>
  );
}

// ─── Main Dialog ───────────────────────────────────────────────────────────────

const PRESENTATION_SYSTEM_PROMPT = `You are a professional presentation consultant. When the user provides a topic, create a complete presentation as a JSON object.

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
- Aim for 8-12 slides total
- Make content engaging, professional, and well-structured
- Use a clear narrative arc: hook → context → insights → details → conclusion`;

export function PresentationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeConnection } = useConnection();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [slideCount, setSlideCount] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [error, setError] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setTopic('');
      setAudience('');
      setSlideCount('10');
      setPresentation(null);
      setError('');
      setStreamingText('');
      setGenerating(false);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || !activeConnection) return;
    setGenerating(true);
    setError('');
    setPresentation(null);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    const userPrompt = `Create a professional presentation on: "${topic}"${audience ? `\nTarget audience: ${audience}` : ''}\nNumber of slides: ${slideCount}\n\nReturn ONLY the JSON object, nothing else.`;

    try {
      const result = await sendMessage({
        connection: activeConnection,
        messages: [{ id: 'pres', role: 'user', content: userPrompt, timestamp: Date.now(), model: activeConnection.model }] as Message[],
        systemPrompt: PRESENTATION_SYSTEM_PROMPT,
        enableThinking: false,
        signal: controller.signal,
        onToken: (text: string) => setStreamingText(prev => prev + text),
      });

      // Parse the JSON from the response
      let content = result.content.trim();
      // Strip markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      try {
        const data = JSON.parse(content) as PresentationData;
        if (!data.title || !data.slides || !Array.isArray(data.slides)) {
          throw new Error('Invalid presentation structure');
        }
        setPresentation(data);
      } catch (parseErr) {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]) as PresentationData;
            setPresentation(data);
          } catch {
            setError('Failed to parse presentation data. Please try again.');
          }
        } else {
          setError('Failed to parse presentation data. Please try again.');
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Failed to generate presentation');
      }
    } finally {
      setGenerating(false);
      setStreamingText('');
    }
  }, [topic, audience, slideCount, activeConnection]);

  const handleEditSlide = useCallback((index: number, slide: Slide) => {
    if (!presentation) return;
    const newSlides = [...presentation.slides];
    newSlides[index] = slide;
    setPresentation({ ...presentation, slides: newSlides });
  }, [presentation]);

  const handleExportPptx = useCallback(async () => {
    if (!presentation) return;
    setExporting(true);
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'ArcadIA Editor';
      pptx.title = presentation.title;

      for (const slide of presentation.slides) {
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

      const filename = `${presentation.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').slice(0, 50)}.pptx`;
      await pptx.writeFile({ fileName: filename });
    } catch (err) {
      console.error('PPTX export failed:', err);
      setError('Failed to export PowerPoint. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [presentation]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: '16px',
        border: '1px solid var(--border)', width: '100%', maxWidth: '900px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🎬</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {presentation ? 'Presentation Preview' : 'Create Presentation'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {presentation && (
              <>
                <button
                  onClick={() => { setPresentation(null); setError(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'none', color: 'var(--text-secondary)', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >← Back</button>
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
                  {exporting ? '⏳ Exporting...' : '⬇ Download .pptx'}
                </button>
              </>
            )}
            <button onClick={onClose} style={{
              width: '28px', height: '28px', borderRadius: '6px', border: 'none',
              background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
              fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {!presentation && !generating ? (
            /* ─── Input Form ─── */
            <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Topic *
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
                  onKeyDown={e => { if (e.key === 'Enter' && topic.trim()) handleGenerate(); }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Target Audience (optional)
                </label>
                <input
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  placeholder="e.g., Executive team, Engineering managers, New hires"
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
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Number of Slides
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
                  <option value="5">5 slides (Quick overview)</option>
                  <option value="8">8 slides (Standard)</option>
                  <option value="10">10 slides (Detailed)</option>
                  <option value="15">15 slides (Comprehensive)</option>
                  <option value="20">20 slides (In-depth)</option>
                </select>
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
                  transition: 'all 0.15s', marginTop: '8px',
                }}
              >
                ✦ Generate Presentation
              </button>

              {!activeConnection && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                  Connect to Claude first (Settings → Connection)
                </div>
              )}
            </div>
          ) : generating ? (
            /* ─── Generating State ─── */
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{
                width: '48px', height: '48px', margin: '0 auto 16px',
                border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
              }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Generating your presentation...
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
                Claude is crafting slides for "{topic}"
              </div>
              {streamingText && (
                <div style={{
                  maxWidth: '500px', margin: '0 auto', padding: '12px 16px',
                  background: 'var(--bg-secondary)', borderRadius: '8px',
                  fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'left',
                  maxHeight: '100px', overflow: 'hidden', fontFamily: 'monospace',
                }}>
                  {streamingText.slice(-200)}...
                </div>
              )}
            </div>
          ) : presentation ? (
            /* ─── Slide Preview Grid ─── */
            <div>
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {presentation.title}
                </h2>
                {presentation.subtitle && (
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>{presentation.subtitle}</p>
                )}
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
                  {presentation.slides.length} slides · Click any slide to edit
                </p>
              </div>

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
                {presentation.slides.map((slide, i) => (
                  <SlidePreview
                    key={i}
                    slide={slide}
                    index={i}
                    total={presentation.slides.length}
                    isTitle={slide.layout === 'title' || i === 0}
                    onEdit={handleEditSlide}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
