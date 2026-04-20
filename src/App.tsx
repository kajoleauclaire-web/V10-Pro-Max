import { useState, useEffect, useRef } from 'react';

const SYSTEM_PROMPT = `You are V10 PRO MAX — an ultra-cinematic AI video prompt engine with 9 active systems.

When given a topic/scene idea, output a COMPLETE production package:

## OUTPUT FORMAT (strict JSON only):
{
  "hook": "One-line viral hook for caption",
  "logline": "Scene logline (20 words max)",
  "imagePrompt": "Detailed Midjourney/Gemini image prompt",
  "videoPrompt": "Detailed Grok/Veo video prompt with all cinematic controls",
  "sceneBreakdown": [
    { "sec": "0-3", "action": "...", "hook": "movement hook" },
    { "sec": "3-7", "action": "...", "hook": "impact hook" },
    { "sec": "7-12", "action": "...", "hook": "camera hook" },
    { "sec": "12-18", "action": "...", "hook": "emotion hook" },
    { "sec": "18-24", "action": "...", "hook": "environment reaction" },
    { "sec": "24-30", "action": "...", "hook": "micro tension" }
  ],
  "cameraSystem": {
    "type": "orbit|handheld|push-in|dolly",
    "lens": "50mm cinematic",
    "movement": "description",
    "lighting": "description"
  },
  "characterLock": {
    "face": "identity description",
    "outfit": "exact outfit",
    "bodyPhysics": "physics notes"
  },
  "physicsNotes": "gravity, foot contact, weight shift, environmental reactions",
  "errorKiller": ["NO spring/spiral", "NO energy lines", "NO random objects", "NO hand glitch", "NO floating"],
  "soundDesign": ["footsteps", "breathing", "wind", "impact sounds"],
  "microDetails": ["reflection behavior", "timing delay", "background lag", "environmental reaction"],
  "kungfuSystem": null,
  "caption": "Platform caption with hooks",
  "hashtags": "#VillageToone #CinematicAI ...",
  "thumbnailText": "Bold thumbnail overlay text"
}

## SYSTEM 9 — KUNGFU MODE (only activate when fightMode=true):
When fightMode is true, populate "kungfuSystem" with:
{
  "style": "Wing Chun|Shaolin|Wushu|Mixed",
  "stanceNotes": "grounded stance description, weight distribution",
  "strikeSequence": ["1-move-at-a-time descriptions, e.g. short straight punch to body"],
  "balanceRule": "every strike includes: stance → weight shift → recovery",
  "cinematicFlow": "how camera follows the martial movement",
  "negativeRules": ["NO flying kick", "NO spinning combo", "NO anime exaggeration", "NO unrealistic jump", "NO slow-motion abuse"]
}
AND upgrade the videoPrompt to include:
- Timestamped fight choreography (0.0s–1.5s, 1.5s–3.0s, etc.)
- 1 move at a time — never combo spam
- Each move: attack → land → stabilize
- Style stays grounded, physics-correct, cinematic NOT anime
- Characters are ANTHROPOMORPHIC ANIMALS ONLY — never humans

RULES (always):
- Character = humanoid cat-hybrid (Village Toone style) unless told otherwise
- Always cinematic, always emotional, always viral
- Physics must be perfect — gravity, weight, contact
- Every 10 seconds must contain 6-7 retention hooks
- NO AI artifacts in prompts — explicitly block them
- Output ONLY valid JSON, no markdown, no extra text`;

const GENRES = [
  'Action',
  'Drama',
  'Romance',
  'Thriller',
  'Comedy',
  'Survival',
  'Mystery',
];
const STYLES = [
  'Urban NYC',
  'Forest Wild',
  'Rooftop Chase',
  'Subway Drama',
  'Rainy Night',
  'Neon City',
];
const EMOTIONS = ['Tension', 'Joy', 'Grief', 'Rivalry', 'Hope', 'Fear', 'Awe'];

export default function V10ProMax() {
  const [topic, setTopic] = useState('');
  const [genre, setGenre] = useState('Action');
  const [style, setStyle] = useState('Urban NYC');
  const [emotion, setEmotion] = useState('Tension');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('video');
  const [copied, setCopied] = useState(null);
  const [particles, setParticles] = useState([]);
  const [fightMode, setFightMode] = useState(false);
  const [fightStyle, setFightStyle] = useState('Wing Chun');
  const canvasRef = useRef(null);

  useEffect(() => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.5 + 0.2,
    }));
    setParticles(pts);
  }, []);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const userPrompt = `Topic: "${topic}"
Genre: ${genre}
Visual Style: ${style}
Core Emotion: ${emotion}
fightMode: ${fightMode}
${fightMode ? `Preferred Fight Style: ${fightStyle}` : ''}

Generate the full V10 PRO MAX production package. Village Toone character universe. Output JSON only.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      const data = await res.json();
      const text = data.content?.map((b) => b.text || '').join('') || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
    } catch (err) {
      setError('Generation failed. Check connection or try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, id }) => (
    <button
      onClick={() => copy(text, id)}
      style={{
        background: copied === id ? '#00ff88' : 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: copied === id ? '#000' : '#aaa',
        padding: '4px 12px',
        borderRadius: '4px',
        fontSize: '11px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: "'DM Mono', monospace",
        letterSpacing: '0.05em',
      }}
    >
      {copied === id ? 'COPIED' : 'COPY'}
    </button>
  );

  const tabs = [
    { id: 'video', label: 'VIDEO PROMPT' },
    { id: 'image', label: 'IMAGE PROMPT' },
    { id: 'scenes', label: 'SCENE MAP' },
    { id: 'systems', label: 'SYSTEMS' },
    ...(result?.kungfuSystem ? [{ id: 'kungfu', label: '🥋 KUNGFU' }] : []),
    { id: 'package', label: 'SOCIAL PKG' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050508',
        fontFamily: "'DM Mono', 'Courier New', monospace",
        color: '#e8e8e8',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated grid background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `
          linear-gradient(rgba(255,80,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,80,0,0.04) 1px, transparent 1px)
        `,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background: '#ff5000',
            opacity: p.opacity,
            pointerEvents: 'none',
            animation: `float ${8 / p.speed}s ease-in-out infinite alternate`,
          }}
        />
      ))}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        @keyframes float { from { transform: translateY(0px); } to { transform: translateY(-20px); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 20px rgba(255,80,0,0.3); } 50% { box-shadow: 0 0 40px rgba(255,80,0,0.7); } }
        .tab-btn { transition: all 0.2s; }
        .tab-btn:hover { background: rgba(255,80,0,0.15) !important; }
        .gen-btn:hover { transform: scale(1.02); box-shadow: 0 0 60px rgba(255,80,0,0.6) !important; }
        .gen-btn:active { transform: scale(0.98); }
        textarea:focus { outline: none; border-color: rgba(255,80,0,0.6) !important; }
        select:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: rgba(255,80,0,0.4); border-radius: 2px; }
      `}</style>

      <div
        style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div
            style={{
              fontSize: '11px',
              letterSpacing: '0.4em',
              color: '#ff5000',
              marginBottom: '8px',
              animation: 'pulse 3s ease-in-out infinite',
            }}
          >
            VILLAGE TOONE PRODUCTION ENGINE
          </div>
          <h1
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(52px, 10vw, 96px)',
              letterSpacing: '0.08em',
              margin: 0,
              background:
                'linear-gradient(135deg, #ffffff 0%, #ff5000 50%, #ff9500 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1,
            }}
          >
            V10 PRO MAX
          </h1>
          <div
            style={{
              fontSize: '11px',
              letterSpacing: '0.3em',
              color: '#555',
              marginTop: '8px',
            }}
          >
            ULTRA-CINEMATIC AI VIDEO ENGINE · {fightMode ? '9' : '8'} SYSTEMS
            ACTIVE
          </div>

          {/* System indicators */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              marginTop: '20px',
              flexWrap: 'wrap',
            }}
          >
            {[
              'CINEMA CTRL',
              'CHAR LOCK',
              'HOOK ENGINE',
              'PHYSICS',
              'ERROR KILL',
              'EMOTION',
              'SOUND',
              'MICRO-DETAIL',
              ...(fightMode ? ['🥋 KUNGFU'] : []),
            ].map((s) => (
              <div
                key={s}
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.2em',
                  padding: '3px 8px',
                  border: `1px solid ${
                    s.includes('KUNGFU')
                      ? 'rgba(255,200,0,0.5)'
                      : 'rgba(255,80,0,0.3)'
                  }`,
                  borderRadius: '2px',
                  color: s.includes('KUNGFU') ? '#ffcc00' : '#ff5000',
                  background: s.includes('KUNGFU')
                    ? 'rgba(255,200,0,0.08)'
                    : 'rgba(255,80,0,0.05)',
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '28px',
            marginBottom: '24px',
            animation: 'glow 4s ease-in-out infinite',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.3em',
              color: '#ff5000',
              marginBottom: '16px',
            }}
          >
            SCENE INPUT
          </div>

          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Describe your scene... e.g. 'Darius runs across Brooklyn Bridge rooftop at night, rain falling, chased by shadows'"
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: '#e8e8e8',
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.7',
              resize: 'vertical',
              minHeight: '80px',
              boxSizing: 'border-box',
              fontFamily: "'DM Mono', monospace",
              transition: 'border-color 0.2s',
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '16px',
              flexWrap: 'wrap',
            }}
          >
            {[
              {
                label: 'GENRE',
                value: genre,
                setter: setGenre,
                options: GENRES,
              },
              {
                label: 'STYLE',
                value: style,
                setter: setStyle,
                options: STYLES,
              },
              {
                label: 'EMOTION',
                value: emotion,
                setter: setEmotion,
                options: EMOTIONS,
              },
            ].map(({ label, value, setter, options }) => (
              <div key={label} style={{ flex: 1, minWidth: '140px' }}>
                <div
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.3em',
                    color: '#666',
                    marginBottom: '6px',
                  }}
                >
                  {label}
                </div>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    color: '#e8e8e8',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer',
                  }}
                >
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* KungFu Mode Toggle */}
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: fightMode
                ? 'rgba(255,200,0,0.06)'
                : 'rgba(0,0,0,0.2)',
              border: `1px solid ${
                fightMode ? 'rgba(255,200,0,0.25)' : 'rgba(255,255,255,0.06)'
              }`,
              borderRadius: '4px',
              transition: 'all 0.3s',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => setFightMode((f) => !f)}
              style={{
                background: fightMode
                  ? 'linear-gradient(135deg, #ffcc00, #ff8800)'
                  : 'rgba(255,255,255,0.06)',
                border: `1px solid ${
                  fightMode ? '#ffcc00' : 'rgba(255,255,255,0.1)'
                }`,
                borderRadius: '3px',
                color: fightMode ? '#000' : '#666',
                padding: '6px 14px',
                fontSize: '10px',
                letterSpacing: '0.25em',
                fontFamily: "'DM Mono', monospace",
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {fightMode ? '🥋 KUNGFU ON' : '🥋 KUNGFU OFF'}
            </button>

            {fightMode ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['Wing Chun', 'Shaolin', 'Wushu', 'Mixed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFightStyle(s)}
                    style={{
                      background:
                        fightStyle === s
                          ? 'rgba(255,200,0,0.2)'
                          : 'transparent',
                      border: `1px solid ${
                        fightStyle === s
                          ? 'rgba(255,200,0,0.5)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      borderRadius: '3px',
                      color: fightStyle === s ? '#ffcc00' : '#555',
                      padding: '4px 10px',
                      fontSize: '9px',
                      letterSpacing: '0.2em',
                      fontFamily: "'DM Mono', monospace",
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: '10px',
                  color: '#444',
                  letterSpacing: '0.15em',
                }}
              >
                ACTIVATE FOR CINEMATIC MARTIAL ARTS MODE
              </div>
            )}
          </div>

          <button
            className="gen-btn"
            onClick={generate}
            disabled={loading || !topic.trim()}
            style={{
              width: '100%',
              marginTop: '20px',
              padding: '16px',
              background: loading
                ? 'rgba(255,80,0,0.2)'
                : fightMode
                ? 'linear-gradient(135deg, #ffcc00, #ff8800)'
                : 'linear-gradient(135deg, #ff5000, #ff9500)',
              border: 'none',
              borderRadius: '4px',
              color: loading ? '#ff5000' : '#000',
              fontSize: '13px',
              letterSpacing: '0.3em',
              fontFamily: "'DM Mono', monospace",
              fontWeight: '500',
              cursor: loading || !topic.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: fightMode
                ? '0 0 40px rgba(255,200,0,0.3)'
                : '0 0 40px rgba(255,80,0,0.3)',
            }}
          >
            {loading
              ? `▶ GENERATING — ${fightMode ? '9' : '8'} SYSTEMS ACTIVE...`
              : fightMode
              ? `🥋 GENERATE V10 KUNGFU PACKAGE — ${fightStyle.toUpperCase()}`
              : '▶ GENERATE V10 PRO MAX PACKAGE'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,0,0,0.3)',
              borderRadius: '4px',
              padding: '16px',
              color: '#ff6666',
              fontSize: '12px',
              marginBottom: '24px',
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            {/* Hook Banner */}
            <div
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,80,0,0.15), rgba(255,149,0,0.05))',
                border: '1px solid rgba(255,80,0,0.3)',
                borderRadius: '8px',
                padding: '20px 24px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  letterSpacing: '0.3em',
                  color: '#ff5000',
                  marginBottom: '8px',
                }}
              >
                VIRAL HOOK
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '0.1em',
                  color: '#fff',
                }}
              >
                {result.hook}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginTop: '8px',
                  fontStyle: 'italic',
                }}
              >
                {result.logline}
              </div>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '16px',
                overflowX: 'auto',
              }}
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className="tab-btn"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '8px 14px',
                    background:
                      activeTab === t.id
                        ? 'rgba(255,80,0,0.2)'
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      activeTab === t.id
                        ? 'rgba(255,80,0,0.5)'
                        : 'rgba(255,255,255,0.08)'
                    }`,
                    borderRadius: '4px',
                    color: activeTab === t.id ? '#ff5000' : '#666',
                    fontSize: '9px',
                    letterSpacing: '0.2em',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '24px',
              }}
            >
              {activeTab === 'video' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.3em',
                        color: '#ff5000',
                      }}
                    >
                      VIDEO PROMPT — GROK / VEO
                    </div>
                    <CopyBtn text={result.videoPrompt} id="video" />
                  </div>
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '4px',
                      padding: '16px',
                      fontSize: '12px',
                      lineHeight: '1.8',
                      color: '#ccc',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {result.videoPrompt}
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.3em',
                        color: '#ff5000',
                        marginBottom: '12px',
                      }}
                    >
                      CAMERA SYSTEM
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                      }}
                    >
                      {Object.entries(result.cameraSystem || {}).map(
                        ([k, v]) => (
                          <div
                            key={k}
                            style={{
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '4px',
                              padding: '10px 12px',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '9px',
                                color: '#555',
                                letterSpacing: '0.2em',
                                marginBottom: '4px',
                              }}
                            >
                              {k.toUpperCase()}
                            </div>
                            <div style={{ fontSize: '11px', color: '#bbb' }}>
                              {v}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'image' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.3em',
                        color: '#ff5000',
                      }}
                    >
                      IMAGE PROMPT — MIDJOURNEY / GEMINI
                    </div>
                    <CopyBtn text={result.imagePrompt} id="image" />
                  </div>
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '4px',
                      padding: '16px',
                      fontSize: '12px',
                      lineHeight: '1.8',
                      color: '#ccc',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {result.imagePrompt}
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.3em',
                        color: '#ff5000',
                        marginBottom: '12px',
                      }}
                    >
                      CHARACTER LOCK
                    </div>
                    {Object.entries(result.characterLock || {}).map(
                      ([k, v]) => (
                        <div
                          key={k}
                          style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '8px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            fontSize: '12px',
                          }}
                        >
                          <span
                            style={{
                              color: '#555',
                              minWidth: '120px',
                              fontSize: '10px',
                              letterSpacing: '0.1em',
                            }}
                          >
                            {k.replace(/([A-Z])/g, ' $1').toUpperCase()}
                          </span>
                          <span style={{ color: '#bbb' }}>{v}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'scenes' && (
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: '#ff5000',
                      marginBottom: '16px',
                    }}
                  >
                    SCENE HOOK MAP — 6 RETENTION HOOKS
                  </div>
                  {(result.sceneBreakdown || []).map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 1fr auto',
                        gap: '16px',
                        padding: '14px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        alignItems: 'start',
                      }}
                    >
                      <div
                        style={{
                          background: 'rgba(255,80,0,0.1)',
                          border: '1px solid rgba(255,80,0,0.2)',
                          borderRadius: '3px',
                          padding: '4px 6px',
                          fontSize: '10px',
                          color: '#ff5000',
                          textAlign: 'center',
                          fontFamily: "'Bebas Neue', sans-serif",
                          letterSpacing: '0.1em',
                        }}
                      >
                        {s.sec}s
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#ccc',
                          lineHeight: '1.6',
                        }}
                      >
                        {s.action}
                      </div>
                      <div
                        style={{
                          fontSize: '9px',
                          color: '#ff9500',
                          letterSpacing: '0.1em',
                          whiteSpace: 'nowrap',
                          background: 'rgba(255,149,0,0.08)',
                          padding: '3px 8px',
                          borderRadius: '2px',
                          border: '1px solid rgba(255,149,0,0.2)',
                        }}
                      >
                        {s.hook}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'systems' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  {[
                    {
                      title: 'PHYSICS ENGINE',
                      items: [result.physicsNotes],
                      color: '#00ccff',
                    },
                    {
                      title: 'ERROR KILLER',
                      items: result.errorKiller || [],
                      color: '#ff4444',
                    },
                    {
                      title: 'SOUND DESIGN',
                      items: result.soundDesign || [],
                      color: '#00ff88',
                    },
                    {
                      title: 'MICRO DETAILS',
                      items: result.microDetails || [],
                      color: '#ff9500',
                    },
                  ].map(({ title, items, color }) => (
                    <div
                      key={title}
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${color}22`,
                        borderRadius: '6px',
                        padding: '16px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '9px',
                          letterSpacing: '0.25em',
                          color,
                          marginBottom: '12px',
                        }}
                      >
                        {title}
                      </div>
                      {items.map((item, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: '11px',
                            color: '#aaa',
                            padding: '4px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{ color, opacity: 0.6, fontSize: '8px' }}
                          >
                            ▸
                          </span>
                          {item}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'kungfu' && result?.kungfuSystem && (
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: '#ffcc00',
                      marginBottom: '20px',
                    }}
                  >
                    🥋 KUNGFU SYSTEM —{' '}
                    {result.kungfuSystem.style?.toUpperCase()}
                  </div>

                  {/* Stance + Balance */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '20px',
                    }}
                  >
                    {[
                      {
                        label: 'STANCE NOTES',
                        value: result.kungfuSystem.stanceNotes,
                      },
                      {
                        label: 'BALANCE RULE',
                        value: result.kungfuSystem.balanceRule,
                      },
                      {
                        label: 'CINEMATIC FLOW',
                        value: result.kungfuSystem.cinematicFlow,
                      },
                      { label: 'STYLE', value: result.kungfuSystem.style },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        style={{
                          background: 'rgba(255,200,0,0.04)',
                          border: '1px solid rgba(255,200,0,0.15)',
                          borderRadius: '4px',
                          padding: '12px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            color: '#ffcc00',
                            letterSpacing: '0.2em',
                            marginBottom: '6px',
                            opacity: 0.7,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#ccc',
                            lineHeight: '1.6',
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Strike Sequence */}
                  <div style={{ marginBottom: '20px' }}>
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.25em',
                        color: '#ffcc00',
                        marginBottom: '12px',
                        opacity: 0.8,
                      }}
                    >
                      STRIKE SEQUENCE
                    </div>
                    {(result.kungfuSystem.strikeSequence || []).map(
                      (strike, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '14px',
                            padding: '10px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            alignItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              background: 'rgba(255,200,0,0.12)',
                              border: '1px solid rgba(255,200,0,0.3)',
                              borderRadius: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: '#ffcc00',
                              flexShrink: 0,
                              fontFamily: "'Bebas Neue', sans-serif",
                            }}
                          >
                            {i + 1}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#ccc',
                              lineHeight: '1.6',
                            }}
                          >
                            {strike}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Negative Rules */}
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.25em',
                        color: '#ff4444',
                        marginBottom: '12px',
                      }}
                    >
                      NEGATIVE RULES — ERROR KILLER
                    </div>
                    <div
                      style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
                    >
                      {(result.kungfuSystem.negativeRules || []).map((r, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: '10px',
                            color: '#ff6666',
                            background: 'rgba(255,0,0,0.06)',
                            border: '1px solid rgba(255,0,0,0.2)',
                            borderRadius: '3px',
                            padding: '4px 10px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'package' && (
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.3em',
                      color: '#ff5000',
                      marginBottom: '16px',
                    }}
                  >
                    SOCIAL MEDIA PACKAGE
                  </div>

                  {[
                    { label: 'CAPTION', text: result.caption, id: 'caption' },
                    {
                      label: 'HASHTAGS',
                      text: result.hashtags,
                      id: 'hashtags',
                    },
                    {
                      label: 'THUMBNAIL TEXT',
                      text: result.thumbnailText,
                      id: 'thumb',
                    },
                  ].map(({ label, text, id }) => (
                    <div key={id} style={{ marginBottom: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            letterSpacing: '0.25em',
                            color: '#666',
                          }}
                        >
                          {label}
                        </div>
                        <CopyBtn text={text} id={id} />
                      </div>
                      <div
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '4px',
                          padding: '14px',
                          fontSize: '12px',
                          color: '#ccc',
                          lineHeight: '1.7',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '48px',
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: '#333',
          }}
        >
          V10 PRO MAX · VILLAGE TOONE PRODUCTION ENGINE · NORTHSTAR TRADE LINKS
          LLC
        </div>
      </div>
    </div>
  );
}
