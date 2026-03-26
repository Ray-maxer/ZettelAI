import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  Search, Plus, Loader2, X, Check, FileText, Trash2, Link as LinkIcon, 
  XCircle, Folder, Hash, Sparkles, MessageSquare, ArrowRight, Network, FileUp,
  Eye, Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// --- Constants & Colors ---
const COLORS = {
  paper: '#f0ebe0', page: '#f7f3ec', cream: '#ede7d9', card: '#faf8f3',
  border: '#ddd5c5', borderS: '#cec4b2', ink: '#2d2418', inkMid: '#6b5f50',
  inkFade: '#a89880', inkGhost: '#c9bfaf',
  moss: '#4f7259', mossL: '#ddecd9', amber: '#b8732a', amberL: '#f5e4cc',
  clay: '#a85040', clayL: '#f5ddd8', slate: '#5a6680', slateL: '#dde3ed',
  project: '#6366f1', projectL: '#e0e7ff',
  shadow: 'rgba(45,36,24,0.08)', shadowM: 'rgba(45,36,24,0.14)'
};

const TYPES = {
  fleeting: { emoji: '⚡', color: COLORS.slate, light: COLORS.slateL, label: 'Fleeting' },
  literature: { emoji: '📖', color: COLORS.amber, light: COLORS.amberL, label: 'Literature' },
  permanent: { emoji: '🌿', color: COLORS.moss, light: COLORS.mossL, label: 'Permanent' },
  structure: { emoji: '🗂', color: COLORS.clay, light: COLORS.clayL, label: 'Structure' },
  project: { emoji: '🚀', color: COLORS.project, light: COLORS.projectL, label: 'Project' }
};

// --- Helpers ---
const uid = () => Math.random().toString(36).slice(2, 10);
const zkId = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
};

const dbSave = (notes: any[]) => localStorage.setItem("zk-notes-v4", JSON.stringify(notes));
const dbLoad = () => {
  try { return JSON.parse(localStorage.getItem("zk-notes-v4") || "[]"); }
  catch { return []; }
};

const parseJSONResponse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    let cleanText = text.trim();
    const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) cleanText = match[1].trim();
    else {
      const objStart = cleanText.indexOf('{');
      const objEnd = cleanText.lastIndexOf('}');
      if (objStart !== -1 && objEnd !== -1) cleanText = cleanText.substring(objStart, objEnd + 1);
    }
    try { return JSON.parse(cleanText); } 
    catch (err) { 
      console.error("Raw text that failed to parse:", text);
      throw new Error("Failed to parse JSON"); 
    }
  }
};

const SEED_NOTES = [
  {
    id: uid(), zkId: "202401010900", type: "permanent", title: "Emergence in Complex Systems",
    content: "Complex behavior arises from simple rules interacting at scale. No central controller needed — local interactions produce global order.\n\nSee: Conway's Game of Life, ant colonies, neural networks.",
    tags: ["complexity", "emergence", "systems"], links: [], createdAt: Date.now() - 86400000 * 3, summary: "Complex global behavior emerges from simple local rules without central control."
  },
  {
    id: uid(), zkId: "202401020830", type: "literature", title: "Complexity — Melanie Mitchell",
    content: "Key arguments: complex systems exist between order and chaos. Adaptive systems learn via feedback. Information processing is universal across biological and computational systems.",
    tags: ["book", "complexity", "information"], links: [], createdAt: Date.now() - 86400000 * 2, summary: "Overview of complexity science: adaptive systems, feedback loops, edge-of-chaos dynamics."
  }
];
SEED_NOTES[0].links = [{ targetId: SEED_NOTES[1].id, linkType: "EXTENDS" }];

// --- Gemini API ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function callGemini(systemPrompt: string, userMessage: any, maxTokens = 1500, responseSchema?: any) {
  try {
    const config: any = { systemInstruction: systemPrompt, maxOutputTokens: maxTokens };
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }
    const contents = Array.isArray(userMessage) ? userMessage : [{ role: 'user', parts: [{ text: userMessage }] }];
    const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents, config });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

// --- Main App Component ---
export default function App() {
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ type: 'all', value: 'all' });
  const [loaded, setLoaded] = useState(false);
  
  // AI Synthesis State
  const [synthPrompt, setSynthPrompt] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = dbLoad();
    if (saved.length > 0) {
      setNotes(saved);
      setSelectedId(saved[0].id);
    } else {
      setNotes(SEED_NOTES);
      setSelectedId(SEED_NOTES[0].id);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) dbSave(notes);
  }, [notes, loaded]);

  const activeNote = notes.find(n => n.id === selectedId);

  const updateNote = (updated: any) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  const createNote = () => {
    const newNote = {
      id: uid(), zkId: zkId(), type: "fleeting", title: "", content: "",
      summary: "", tags: [], links: [], createdAt: Date.now()
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedId(newNote.id);
    setSearch("");
  };

  const deleteNote = (id: string) => {
    setNotes(prev => {
      const filtered = prev.filter(n => n.id !== id);
      return filtered.map(n => ({ ...n, links: n.links.filter((l: any) => l.targetId !== id) }));
    });
    if (selectedId === id) setSelectedId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type;
        
        const systemPrompt = "You are an expert knowledge extractor. Extract the key information from the provided document or image. Break down the information into multiple atomic, self-contained notes (Zettelkasten style). Format the content as structured markdown, including math formulas in LaTeX (e.g., $$ E=mc^2 $$ or $ \\alpha $) if applicable. Return an array of notes. Return ONLY valid JSON.";
        const userPrompt = "Please extract atomic notes from this file.";
        
        const schema = {
          type: Type.OBJECT,
          properties: {
            notes: {
              type: Type.ARRAY,
              description: "A list of atomic notes extracted from the document. Break large documents into multiple focused, self-contained notes.",
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "A concise title based on the content" },
                  content: { type: Type.STRING, description: "The extracted content, well-structured in markdown, including LaTeX math if applicable" },
                  summary: { type: Type.STRING, description: "A one-sentence summary" },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  type: { type: Type.STRING, description: "One of: fleeting, literature, permanent, structure, project" }
                }
              }
            }
          }
        };

        const contents = [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64Data, mimeType } },
              { text: userPrompt }
            ]
          }
        ];

        const config: any = { 
          systemInstruction: systemPrompt, 
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: schema
        };

        try {
          const response = await ai.models.generateContent({ model: "gemini-3.1-pro-preview", contents, config });
          if (response && response.text) {
            let data: any;
            try {
              data = parseJSONResponse(response.text);
            } catch (parseErr) {
              console.error("JSON Parse Error. Raw response:", response.text);
              // Fallback: create a single note with the raw text
              data = {
                notes: [{
                  title: file.name,
                  content: response.text,
                  summary: "Failed to parse structured data.",
                  tags: ["error", "raw-extraction"],
                  type: "fleeting"
                }]
              };
            }
            
            let notesArray = [];
            if (data.notes && Array.isArray(data.notes)) {
              notesArray = data.notes;
            } else if (data.title && data.content) {
              notesArray = [data]; // Fallback if it returned a single note instead of an array
            } else {
              notesArray = [{
                title: file.name,
                content: "Could not extract notes. Invalid format returned.",
                summary: "Error",
                tags: ["error"],
                type: "fleeting"
              }];
            }
            
            let attachedImage = undefined;
            // If it's an image, store it separately
            if (mimeType.startsWith('image/')) {
              attachedImage = `data:${mimeType};base64,${base64Data}`;
            }

            const newNotes = notesArray.map((n: any, index: number) => ({
              id: uid(), zkId: zkId() + String(index).padStart(2, '0'), 
              type: Object.keys(TYPES).includes(n.type) ? n.type : "fleeting",
              title: n.title || `${file.name} (${index + 1})`,
              content: n.content || "",
              summary: n.summary || "",
              tags: Array.isArray(n.tags) ? n.tags : [],
              links: [],
              image: index === 0 ? attachedImage : undefined, // Attach image only to the first note
              createdAt: Date.now() + index
            }));
            
            setNotes(prev => [...newNotes, ...prev]);
            setSelectedId(newNotes[0].id);
            setFilter({ type: 'all', value: 'all' });
          }
        } catch (err) {
          console.error("Gemini Extraction Error:", err);
          alert("Failed to extract notes. Please try again.");
        }
        setIsExtracting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File processing failed", error);
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSynthesize = async () => {
    if (!synthPrompt.trim()) return;
    setIsSynthesizing(true);
    
    const systemPrompt = "You are a Zettelkasten AI assistant. Synthesize a new project or concept note based on the user's prompt by extracting and combining relevant information from the provided knowledge base. Return ONLY valid JSON.";
    const notesContext = notes.map(n => `[${n.id}] ${n.title}\n${n.content}`).join('\n---\n');
    const userPrompt = `Project Prompt: ${synthPrompt}\n\nKnowledge Base:\n${notesContext}`;
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "A concise title for the new project/synthesis" },
        content: { type: Type.STRING, description: "The synthesized content, well-structured and comprehensive" },
        summary: { type: Type.STRING, description: "A one-sentence summary" },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        sourceIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "IDs of the notes that were heavily referenced" }
      }
    };

    const res = await callGemini(systemPrompt, userPrompt, 2000, schema);
    if (res) {
      try {
        let data: any;
        try {
          data = parseJSONResponse(res);
        } catch (parseErr) {
          console.error("JSON Parse Error. Raw response:", res);
          data = {
            title: "Synthesized Project",
            content: res,
            summary: "Failed to parse structured data.",
            tags: ["error", "raw-synthesis"],
            sourceIds: []
          };
        }
        const newNote = {
          id: uid(), zkId: zkId(), type: "project",
          title: data.title || "New Project",
          content: data.content || "",
          summary: data.summary || "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          links: (Array.isArray(data.sourceIds) ? data.sourceIds : []).map((id: string) => ({ targetId: id, linkType: "SYNTHESIZED_FROM" })),
          createdAt: Date.now()
        };
        setNotes(prev => [newNote, ...prev]);
        setSelectedId(newNote.id);
        setSynthPrompt("");
        setFilter({ type: 'all', value: 'all' });
      } catch (e) {
        console.error("Synthesis failed", e);
      }
    }
    setIsSynthesizing(false);
  };

  // Fuzzy Search & Filtering
  const filteredNotes = notes.filter(n => {
    // 1. Filter by Type/Tag
    if (filter.type === 'type' && n.type !== filter.value) return false;
    if (filter.type === 'tag' && !n.tags.includes(filter.value)) return false;
    
    // 2. Fuzzy Search
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchContent = n.content.toLowerCase().includes(q);
      const matchTags = n.tags.some((t: string) => t.toLowerCase().includes(q));
      const matchZkId = n.zkId.includes(q);
      if (!matchTitle && !matchContent && !matchTags && !matchZkId) return false;
    }
    return true;
  });

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags))).sort();

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: COLORS.paper, color: COLORS.ink, fontFamily: "'DM Sans', sans-serif", overflowX: 'auto' }}>
      
      {/* LEFT PANE: Explorer & Navigation */}
      <div style={{ width: 'clamp(180px, 20vw, 260px)', background: COLORS.cream, borderRight: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ color: COLORS.moss }}>✦</span> ZettelAI
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createNote} style={{ flex: 1, padding: '10px', borderRadius: 8, background: COLORS.moss, color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={18} /> New
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isExtracting} style={{ padding: '10px 14px', borderRadius: 8, background: COLORS.card, color: COLORS.ink, border: `1px solid ${COLORS.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, cursor: isExtracting ? 'default' : 'pointer', opacity: isExtracting ? 0.6 : 1 }}>
              {isExtracting ? <Loader2 size={18} className="spin" /> : <FileUp size={18} />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*,application/pdf" 
              style={{ display: 'none' }} 
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Folders */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkFade, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Library</div>
            <div 
              onClick={() => setFilter({ type: 'all', value: 'all' })}
              style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: filter.type === 'all' ? COLORS.card : 'transparent', fontWeight: filter.type === 'all' ? 600 : 400, color: filter.type === 'all' ? COLORS.ink : COLORS.inkMid }}
            >
              <Folder size={16} /> All Notes
            </div>
            {Object.entries(TYPES).map(([k, v]) => (
              <div 
                key={k} onClick={() => setFilter({ type: 'type', value: k })}
                style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: filter.type === 'type' && filter.value === k ? COLORS.card : 'transparent', fontWeight: filter.type === 'type' && filter.value === k ? 600 : 400, color: filter.type === 'type' && filter.value === k ? COLORS.ink : COLORS.inkMid }}
              >
                <span>{v.emoji}</span> {v.label}
              </div>
            ))}
          </div>

          {/* Tags */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.inkFade, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map((t: any) => (
                <span 
                  key={t} onClick={() => setFilter({ type: 'tag', value: t })}
                  style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, cursor: 'pointer', background: filter.type === 'tag' && filter.value === t ? COLORS.moss : COLORS.border, color: filter.type === 'tag' && filter.value === t ? 'white' : COLORS.inkMid }}
                >
                  #{t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* AI Project Synthesizer */}
        <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, background: COLORS.card }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.project, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> AI Project Synthesis
          </div>
          <textarea
            value={synthPrompt}
            onChange={e => setSynthPrompt(e.target.value)}
            placeholder="Describe a new project to synthesize from your notes..."
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${COLORS.borderS}`, background: 'white', fontSize: 13, resize: 'vertical', minHeight: 70, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}
          />
          <button 
            onClick={handleSynthesize} disabled={isSynthesizing || !synthPrompt.trim()} 
            style={{ width: '100%', padding: '8px', borderRadius: 8, background: COLORS.project, color: 'white', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: (isSynthesizing || !synthPrompt.trim()) ? 'default' : 'pointer', opacity: (isSynthesizing || !synthPrompt.trim()) ? 0.7 : 1 }}
          >
            {isSynthesizing ? <Loader2 size={16} className="spin" /> : 'Synthesize'}
          </button>
        </div>
      </div>

      {/* MIDDLE PANE: Note List */}
      <div style={{ width: 'clamp(220px, 25vw, 320px)', background: COLORS.page, borderRight: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: COLORS.inkFade }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Fuzzy search..."
              style={{ width: '100%', padding: '8px 32px', borderRadius: 8, border: `1px solid ${COLORS.borderS}`, background: 'white', color: COLORS.ink, fontSize: 14 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: 'absolute', right: 8, top: 10, background: 'none', border: 'none', color: COLORS.inkFade, cursor: 'pointer' }}>
                <X size={16} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: COLORS.inkFade, marginTop: 12, fontWeight: 500 }}>
            {filteredNotes.length} notes found
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredNotes.map(n => (
            <div
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              style={{
                padding: 16, borderRadius: 12, cursor: 'pointer',
                background: selectedId === n.id ? 'white' : 'transparent',
                border: `1px solid ${selectedId === n.id ? COLORS.borderS : 'transparent'}`,
                boxShadow: selectedId === n.id ? `0 2px 8px ${COLORS.shadow}` : 'none',
                transition: 'all .15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{(TYPES as any)[n.type].emoji}</span>
                <div style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: 15, color: COLORS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.title || "Untitled"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: COLORS.inkMid, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 8, lineHeight: 1.4 }}>
                {n.summary || n.content}
              </div>
              <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
                {n.tags.slice(0, 3).map((t: string) => (
                  <span key={t} style={{ fontSize: 10, background: COLORS.border, padding: '2px 6px', borderRadius: 4, color: COLORS.inkMid }}>#{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANE: Editor */}
      <div style={{ flex: 1, minWidth: 280, background: COLORS.card, overflowY: 'auto', position: 'relative' }}>
        {activeNote ? (
          <Editor 
            note={activeNote} 
            updateNote={updateNote} 
            deleteNote={deleteNote} 
            allNotes={notes}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.inkFade, fontFamily: "'Lora', serif", fontSize: 18, fontStyle: 'italic' }}>
            Select a note or create a new one.
          </div>
        )}
      </div>

    </div>
  );
}

// --- Editor Component ---
function Editor({ note, updateNote, deleteNote, allNotes }: { note: any, updateNote: any, deleteNote: any, allNotes: any[] }) {
  const t = (TYPES as any)[note.type];
  const [saved, setSaved] = useState(false);
  
  // AI Edit State
  const [aiInstruction, setAiInstruction] = useState("");
  const [retentionRate, setRetentionRate] = useState(70);
  const [aiEditing, setAiEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');
  const [showAiPanel, setShowAiPanel] = useState(() => Date.now() - note.createdAt < 10000);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const insertMathBlock = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const currentContent = note.content || "";
    const before = currentContent.substring(0, start);
    const after = currentContent.substring(end);
    const mathBlock = "\n$$\n\n$$\n";
    const newContent = before + mathBlock + after;
    updateNote({ ...note, content: newContent });
    
    // Set cursor position inside the block
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + 4, start + 4);
      }
    }, 10);
  };

  const handleAIEdit = async () => {
    if (!aiInstruction.trim()) return;
    setAiEditing(true);
    
    const systemPrompt = "You are an expert editor and Zettelkasten assistant. Edit the user's note based on their instruction. Return ONLY the updated raw content. Do not include markdown code blocks unless they are part of the actual note content. Do not include conversational filler.";
    const userPrompt = `Instruction: ${aiInstruction}
Retention Rate: ${retentionRate}% (0% means you can completely rewrite and restructure it to fit the instruction. 100% means you must keep the original text exactly as is, only fixing minor typos or appending the requested info).

Original Content:
${note.content}`;

    const res = await callGemini(systemPrompt, userPrompt, 1500);
    if (res) {
      updateNote({ ...note, content: res.trim() });
      setAiInstruction("");
    }
    setAiEditing(false);
  };

  // Calculate Backlinks (Incoming links)
  const backlinks = allNotes.filter(n => n.links.some((l: any) => l.targetId === note.id));

  return (
    <div style={{ maxWidth: 840, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(TYPES).map(([k, v]) => (
            <button
              key={k} onClick={() => updateNote({ ...note, type: k })}
              style={{
                padding: '4px 12px', borderRadius: 16, border: `1px solid ${k === note.type ? v.color : COLORS.borderS}`,
                background: k === note.type ? v.color : 'transparent',
                color: k === note.type ? 'white' : COLORS.inkMid,
                fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all .15s'
              }}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: t.color, color: 'white', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {saved ? <><Check size={16} /> Saved</> : 'Save'}
          </button>
          <button onClick={() => deleteNote(note.id)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${COLORS.borderS}`, background: 'transparent', color: COLORS.clay, cursor: 'pointer' }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: COLORS.inkMid, fontFamily: "'DM Sans', sans-serif" }}>
        ZK ID: {note.zkId} • {new Date(note.createdAt).toLocaleString()}
      </div>

      <input
        value={note.title}
        onChange={e => updateNote({ ...note, title: e.target.value })}
        placeholder="Note Title"
        style={{ width: '100%', background: 'transparent', border: 'none', fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(24px, 4vw, 36px)', color: COLORS.ink, outline: 'none' }}
      />

      {/* Attached Image */}
      {note.image && (
        <div style={{ position: 'relative', width: '100%', borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.cream, display: 'flex', justifyContent: 'center' }}>
          <img src={note.image} alt="Attached" style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 12 }} />
          <button 
            onClick={() => updateNote({ ...note, image: undefined })}
            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setViewMode('edit')} 
              style={{ padding: '6px 14px', borderRadius: 8, background: viewMode === 'edit' ? COLORS.moss : 'transparent', color: viewMode === 'edit' ? 'white' : COLORS.inkMid, border: `1px solid ${viewMode === 'edit' ? COLORS.moss : COLORS.borderS}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, transition: 'all .15s' }}
            >
              <Edit3 size={14} /> Edit
            </button>
            <button 
              onClick={() => setViewMode('preview')} 
              style={{ padding: '6px 14px', borderRadius: 8, background: viewMode === 'preview' ? COLORS.moss : 'transparent', color: viewMode === 'preview' ? 'white' : COLORS.inkMid, border: `1px solid ${viewMode === 'preview' ? COLORS.moss : COLORS.borderS}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, transition: 'all .15s' }}
            >
              <Eye size={14} /> Preview
            </button>
            {viewMode === 'edit' && (
              <button 
                onClick={insertMathBlock} 
                style={{ padding: '6px 14px', borderRadius: 8, background: 'transparent', color: COLORS.inkMid, border: `1px solid ${COLORS.borderS}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, transition: 'all .15s' }}
                title="Insert Math Block"
              >
                <Hash size={14} /> Insert Math
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowAiPanel(!showAiPanel)} 
            style={{ padding: '6px 14px', borderRadius: 8, background: showAiPanel ? COLORS.mossL : 'transparent', color: COLORS.moss, border: `1px solid ${COLORS.moss}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, transition: 'all .15s' }}
          >
            <Sparkles size={14} /> Edit with AI
          </button>
        </div>

        {viewMode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={note.content}
            onChange={e => updateNote({ ...note, content: e.target.value })}
            placeholder="Start writing manually, or use AI to edit... (Markdown and LaTeX supported)"
            style={{
              width: '100%', minHeight: 300, background: 'white', border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 24, fontFamily: "'Lora', serif", fontSize: 16, lineHeight: 1.6,
              color: COLORS.ink, resize: 'vertical', boxShadow: `inset 0 2px 4px ${COLORS.shadow}`, outline: 'none'
            }}
          />
        ) : (
          <div 
            className="markdown-body" 
            style={{
              width: '100%', minHeight: 300, background: 'white', border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: 24, fontFamily: "'Lora', serif", fontSize: 16, lineHeight: 1.6,
              color: COLORS.ink, overflowY: 'auto', boxShadow: `inset 0 2px 4px ${COLORS.shadow}`
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {note.content || "*Empty note*"}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* AI Edit & Chat Panel */}
      {showAiPanel && (
        <div style={{ background: COLORS.mossL, padding: 20, borderRadius: 12, border: `1px solid ${COLORS.moss}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.moss, fontWeight: 600, marginBottom: 12 }}>
            <MessageSquare size={18} /> Edit with AI
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <textarea 
              value={aiInstruction} 
              onChange={e => setAiInstruction(e.target.value)}
              placeholder="Tell AI how to edit this note (e.g., 'Make it more concise', 'Translate to Traditional Chinese', 'Expand on the second paragraph')..."
              style={{ width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${COLORS.moss}`, background: 'white', resize: 'vertical', minHeight: 80, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 250 }}>
                <span style={{ fontSize: 13, color: COLORS.moss, fontWeight: 600, whiteSpace: 'nowrap' }}>Retention Rate:</span>
                <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.5)', padding: 4, borderRadius: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Rewrite (0%)', value: 0 },
                    { label: 'Loose (30%)', value: 30 },
                    { label: 'Balanced (70%)', value: 70 },
                    { label: 'Strict (100%)', value: 100 }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setRetentionRate(opt.value)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: retentionRate === opt.value ? COLORS.moss : 'transparent',
                        color: retentionRate === opt.value ? 'white' : COLORS.moss,
                        transition: 'all .15s'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={handleAIEdit} disabled={aiEditing || !aiInstruction.trim()} 
                style={{ padding: '10px 20px', borderRadius: 8, background: COLORS.moss, color: 'white', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: (aiEditing || !aiInstruction.trim()) ? 'default' : 'pointer', opacity: (aiEditing || !aiInstruction.trim()) ? 0.7 : 1 }}
              >
                {aiEditing ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
                Apply Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata: Tags & Connections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 16 }}>
        
        {/* Tags */}
        <div style={{ background: 'white', padding: 20, borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMid, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hash size={14} /> Tags
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {note.tags.map((t: string) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, background: COLORS.cream, padding: '4px 10px', borderRadius: 16, fontSize: 13, border: `1px solid ${COLORS.borderS}` }}>
                #{t}
                <button onClick={() => updateNote({ ...note, tags: note.tags.filter((tag: string) => tag !== t) })} style={{ background: 'none', border: 'none', color: COLORS.inkMid, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <input
              placeholder="+ Add tag..."
              onKeyDown={e => {
                if (e.key === 'Enter' && e.currentTarget.value) {
                  const val = e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  if (val && !note.tags.includes(val)) updateNote({ ...note, tags: [...note.tags, val] });
                  e.currentTarget.value = '';
                }
              }}
              style={{ background: 'transparent', border: 'none', fontSize: 13, color: COLORS.ink, width: 100, outline: 'none' }}
            />
          </div>
        </div>

        {/* Connections */}
        <div style={{ background: 'white', padding: 20, borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMid, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Network size={14} /> Relationships
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Outgoing Links */}
            {note.links.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.inkFade, marginBottom: 4 }}>Links To:</div>
                {note.links.map((l: any, i: number) => {
                  const target = allNotes.find(n => n.id === l.targetId);
                  if (!target) return null;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px dashed ${COLORS.border}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.moss, background: COLORS.mossL, padding: '2px 6px', borderRadius: 4 }}>{l.linkType}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(TYPES as any)[target.type].emoji} {target.title}</span>
                      <button onClick={() => updateNote({ ...note, links: note.links.filter((_: any, idx: number) => idx !== i) })} style={{ background: 'none', border: 'none', color: COLORS.inkFade, cursor: 'pointer' }}>
                        <XCircle size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Incoming Links (Backlinks) */}
            {backlinks.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.inkFade, marginBottom: 4, marginTop: 4 }}>Referenced By:</div>
                {backlinks.map((b: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px dashed ${COLORS.border}` }}>
                    <ArrowRight size={12} color={COLORS.inkFade} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(TYPES as any)[b.type].emoji} {b.title}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Add Link */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select id="new-link-type" style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${COLORS.borderS}`, background: COLORS.cream, fontSize: 12, outline: 'none' }}>
                <option value="EXTENDS">EXTENDS</option>
                <option value="SUPPORTS">SUPPORTS</option>
                <option value="REFERENCES">REFERENCES</option>
              </select>
              <input 
                placeholder="Search note to link..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    const q = e.currentTarget.value.toLowerCase();
                    const match = allNotes.find(n => n.id !== note.id && n.title.toLowerCase().includes(q));
                    if (match && !note.links.some((l: any) => l.targetId === match.id)) {
                      const type = (document.getElementById('new-link-type') as HTMLSelectElement).value;
                      updateNote({ ...note, links: [...note.links, { targetId: match.id, linkType: type }] });
                      e.currentTarget.value = '';
                    }
                  }
                }}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${COLORS.borderS}`, background: 'white', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
