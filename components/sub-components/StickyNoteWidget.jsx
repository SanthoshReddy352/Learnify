'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PenLine, X, Loader2, Save, Mic, List, AlertCircle, Lightbulb, CheckSquare, Clock, Edit2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveTopicNotes } from '@/lib/actions'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function StickyNoteWidget({ initialNotes = '', topicId, topicTitle }) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Pre-fill with heading if empty
  const defaultNote = initialNotes ? initialNotes : (topicTitle ? `# ${topicTitle}\n\n` : '');
  const [notes, setNotes] = useState(defaultNote)
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(initialNotes ? 'saved' : 'saving') // 'saved', 'saving', 'error'
  const [isRecording, setIsRecording] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const recognitionRef = useRef(null)
  const textareaRef = useRef(null)

  // Debounced save for auto-saving
  useEffect(() => {
    if (notes === initialNotes) return

    const timeoutId = setTimeout(() => {
      handleSave(notes)
    }, 1500) // Auto-save after 1.5s of inactivity

    return () => clearTimeout(timeoutId)
  }, [notes, initialNotes])

  // Optionally listen for initialNotes change from server (if real-time or updated later)
  useEffect(() => {
    if (initialNotes !== null && initialNotes !== undefined && initialNotes !== '') {
      setNotes(initialNotes)
      setSaveStatus('saved')
    }
  }, [initialNotes])

  // Initialize SpeechRecognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const transcript = event.results[i][0].transcript;
              setNotes(prev => {
                const newNotes = prev + (prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '') + transcript + '. ';
                setSaveStatus('saving');
                return newNotes;
              });
            }
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error', event.error);
          setIsRecording(false);
        };
        
        recognitionRef.current.onend = () => {
           setIsRecording(false);
        };
      }
    }
  }, []);

  // Custom event listener for highlighting text
  useEffect(() => {
    const handleAddSnippet = (e) => {
      const { text, color = 'blue' } = e.detail;
      setNotes(prev => {
        const newNotes = prev + (prev.endsWith('\n\n') ? '' : (prev ? '\n\n' : '')) + `> [${color}] ${text}\n\n`;
        setSaveStatus('saving');
        return newNotes;
      });
      setIsOpen(true); 
    };
    window.addEventListener('add-highlight-to-notes', handleAddSnippet);
    return () => window.removeEventListener('add-highlight-to-notes', handleAddSnippet);
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsRecording(true);
          toast.success("Recording started... (max 5 minutes)");
          
          // 5 minute timeout
          setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.stop();
              setIsRecording(false);
              toast.info("Voice recording stopped (5 min limit reached).");
            }
          }, 5 * 60 * 1000);
        } catch (e) {
          console.error(e);
          toast.error("Could not start recording.");
        }
      } else {
        toast.error("Speech recognition is not supported in your browser.");
      }
    }
  };

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Add new lines if needed based on the text context
    const prefix = notes.substring(0, start);
    const suffix = notes.substring(end);
    
    let formattedText = text;
    if (['• ', '⭐ ', '💡 '].includes(text)) {
       const needsNewLine = prefix.length > 0 && !prefix.endsWith('\n');
       formattedText = (needsNewLine ? '\n' : '') + text;
    }
    
    const newNotes = prefix + formattedText + suffix;
    setNotes(newNotes);
    setSaveStatus('saving');
    
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + formattedText.length;
      textarea.focus();
    }, 0);
  };

  const handleSave = async (currentNotes) => {
    setIsSaving(true)
    setSaveStatus('saving')
    try {
      const result = await saveTopicNotes(topicId, currentNotes)
      if (result.success) {
        setSaveStatus('saved')
      } else {
        setSaveStatus('error')
        toast.error('Failed to save notes: ' + result.error)
      }
    } catch (error) {
      setSaveStatus('error')
      toast.error('Failed to save notes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleManualSave = () => {
    handleSave(notes)
  }

  return (
    <>
      {/* Floating Action Button for Collapsed State */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-6 md:bottom-28 md:right-8 h-14 w-14 rounded-full shadow-2xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 z-50 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center border border-slate-300/50 dark:border-slate-700/50"
          aria-label="Open Notes"
        >
          <PenLine className="h-6 w-6" />
        </Button>
      )}

      {/* Expanded Widget */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 md:bottom-28 md:right-8 w-80 md:w-[400px] h-[450px] z-50 flex flex-col shadow-2xl rounded-xl overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300 border border-slate-200/50 dark:border-slate-700/50">
          
          {/* Silver/Blue styling header */}
          <div className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-4 py-3 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 shadow-sm z-10">
            <div className="flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400">
              <PenLine className="h-4 w-4" />
              <span>Learner Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium opacity-80 flex items-center gap-1.5 min-w-[60px] justify-end">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving
                  </>
                )}
                {saveStatus === 'saved' && (
                   <span className="text-green-800 dark:text-green-200">Saved</span>
                )}
                {saveStatus === 'error' && (
                   <span className="text-red-800 dark:text-red-200">Error</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualSave}
                className="h-7 w-7 hover:bg-black/10 dark:hover:bg-white/10 text-current rounded-full"
                title="Save Notes"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 hover:bg-black/10 dark:hover:bg-white/10 text-current rounded-full"
                title="Close Notes"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Format Toolbar */}
          <div className="bg-slate-50 dark:bg-slate-800/80 px-2 py-1.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700/80 z-10 transition-colors">
            {!isPreview ? (
              <div className="flex gap-0.5 overflow-x-auto no-scrollbar mask-fade-right">
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('- [ ] ')} className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0" title="Checkbox">
                  <CheckSquare className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('⏰ Reminder: ')} className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0" title="Reminder">
                  <Clock className="h-4 w-4" />
                </Button>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1 self-center shrink-0" />
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('• ')} className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0" title="Bullet Point">
                  <List className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('⭐ ')} className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0" title="Important">
                  <AlertCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => insertAtCursor('💡 ')} className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded shrink-0" title="Idea">
                  <Lightbulb className="h-4 w-4" />
                </Button>
              </div>
            ) : (
               <div className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2 py-1 flex items-center">
                   <Eye className="h-3.5 w-3.5 mr-1.5" /> Previewing Markdown
               </div>
            )}
            
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {!isPreview && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleRecording} 
                  className={`h-7 w-7 rounded ${isRecording ? 'bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30' : 'text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'}`} 
                  title={isRecording ? "Stop Recording" : "Voice Record (5 min max)"}
                >
                  <Mic className={`h-3.5 w-3.5 ${isRecording ? 'animate-pulse' : ''}`} />
                </Button>
              )}
              
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-0.5 shrink-0" />
              
              <Button
                variant="ghost" 
                size="sm" 
                onClick={() => setIsPreview(!isPreview)} 
                className={`h-7 px-2 text-xs font-medium rounded ${isPreview ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`} 
              >
                {isPreview ? <Edit2 className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                {isPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
          </div>

          {/* Text Area / Preview (Silver aesthetic) */}
          <div className="flex-1 bg-white dark:bg-[#1a1c23] relative overflow-hidden flex flex-col">
             {isPreview ? (
                <div className="flex-1 overflow-y-auto p-5 prose dark:prose-invert prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-a:text-blue-600 dark:prose-a:text-blue-400 max-w-none text-sm leading-relaxed scroll-smooth">
                    {notes ? (
                        <ReactMarkdown 
                           remarkPlugins={[remarkGfm]}
                           components={{
                              blockquote: ({node, ...props}) => {
                                let color = 'blue';
                                let found = false;
                                
                                const processChildren = (children) => {
                                  return React.Children.map(children, child => {
                                    if (typeof child === 'string') {
                                      if (!found) {
                                        const match = child.match(/^\[(blue|green|purple|amber|rose)\]\s*/);
                                        if (match) {
                                          color = match[1];
                                          found = true;
                                          return child.replace(match[0], '');
                                        }
                                      }
                                      return child;
                                    }
                                    if (React.isValidElement(child) && child.props && child.props.children) {
                                      return React.cloneElement(child, {
                                        children: processChildren(child.props.children)
                                      });
                                    }
                                    return child;
                                  });
                                };
                                
                                const modifiedChildren = processChildren(props.children);

                                const colorThemes = {
                                  blue: { border: 'border-blue-500', bg: 'from-blue-500/10', shine: 'via-blue-400/10' },
                                  green: { border: 'border-emerald-500', bg: 'from-emerald-500/10', shine: 'via-emerald-400/10' },
                                  purple: { border: 'border-purple-500', bg: 'from-purple-500/10', shine: 'via-purple-400/10' },
                                  amber: { border: 'border-amber-500', bg: 'from-amber-500/10', shine: 'via-amber-400/10' },
                                  rose: { border: 'border-rose-500', bg: 'from-rose-500/10', shine: 'via-rose-400/10' }
                                };
                                const theme = colorThemes[color] || colorThemes.blue;

                                return (
                                  <blockquote 
                                    className={`not-prose my-4 pl-4 py-3 pr-4 rounded-r-lg border-l-4 ${theme.border} bg-gradient-to-r ${theme.bg} to-transparent italic text-slate-700 dark:text-slate-300 shadow-sm relative overflow-hidden group`} 
                                  >
                                     {/* Animated shine effect */}
                                     <div className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${theme.shine} to-transparent group-hover:animate-[shimmer_2s_infinite]`} />
                                     <div className="relative z-10">
                                       {modifiedChildren}
                                     </div>
                                  </blockquote>
                                )
                              },
                              input: ({node, ...props}) => (
                                <input {...props} className="mr-2 accent-blue-500" />
                              )
                           }}
                        >
                            {notes}
                        </ReactMarkdown>
                    ) : (
                        <p className="text-slate-400 dark:text-slate-500 italic text-center mt-10">Click edit to start writing...</p>
                    )}
                </div>
             ) : (
                 <textarea
                  ref={textareaRef}
                  className="w-full h-full p-5 bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-200 leading-[26px] relative z-10 placeholder:text-slate-400/60 dark:placeholder:text-slate-500/50 scroll-smooth selection:bg-blue-500/20"
                  placeholder="Jot down your learner notes here... Markdown is supported!"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value)
                    setSaveStatus('saving')
                  }}
                  spellCheck="false"
                />
             )}
          </div>
          
          {/* Fold effect corner (visual only) */}
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-tl from-slate-200/50 to-transparent dark:from-slate-800/80 pointer-events-none rounded-tl-xl" />
        </div>
      )}
    </>
  )
}
