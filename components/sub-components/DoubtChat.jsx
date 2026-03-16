'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, X, Send, Sparkles, User, Bot, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

import { createPortal } from 'react-dom'

export default function DoubtChat({
    topicId,
    topicTitle,
    subjectTitle,
    contentStatus,
    classroomId = null,
    classroomCourseId = null
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [mounted, setMounted] = useState(false)
    const messagesEndRef = useRef(null)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    // Load history from session storage on mount
    useEffect(() => {
        if (!topicId) return
        const key = `doubt_chat_${topicId}`
        const saved = sessionStorage.getItem(key)
        if (saved) {
            try {
                setMessages(JSON.parse(saved))
            } catch (e) {
                console.error("Failed to parse chat history", e)
            }
        }
    }, [topicId])

    // Save history to session storage on change
    useEffect(() => {
        if (!topicId || messages.length === 0) return
        const key = `doubt_chat_${topicId}`
        sessionStorage.setItem(key, JSON.stringify(messages))
    }, [messages, topicId])

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isOpen])

    // Only render if content is fully generated (passed via props)
    // contentStatus logic: true if generated, false otherwise.
    // The parent determines if content is "generated" enough.
    if (!contentStatus) return null

    const handleSend = async () => {
        if (!input.trim() || loading) return

        const userMsg = { role: 'user', content: input.trim() }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const response = await fetch('/api/doubt-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topicId,
                    message: userMsg.content,
                    history: messages.slice(-10), // Send last 10 messages for context
                    classroomId,
                    classroomCourseId
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get response')
            }

            const aiMsg = { role: 'assistant', content: data.content }
            setMessages(prev => [...prev, aiMsg])

        } catch (error) {
            console.error('Chat error:', error)
            toast.error('Could not get answer: ' + error.message)
            // Remove user message if failed? Or just show error?
            // Let's keep user message but maybe show an error system message
            setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error while processing your request. Please try again." }])
        } finally {
            setLoading(false)
        }
    }

    const clearChat = () => {
        setMessages([])
        sessionStorage.removeItem(`doubt_chat_${topicId}`)
        toast.info('Chat history cleared')
    }



    if (!mounted || !contentStatus) return null

    // Use Portal to ensure it sits on top of everything and isn't affected by parent transforms

    return createPortal(
        <>
            {/* Floating Action Button */}
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 md:bottom-8 md:right-8 h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90 text-white z-[100] animate-in zoom-in slide-in-from-bottom-4 duration-300"
                >
                    <MessageCircle className="h-7 w-7" />
                    <span className="sr-only">Ask AI</span>
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                    </span>
                </Button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <Card className="fixed inset-x-0 bottom-0 md:inset-x-auto md:bottom-8 md:right-8 w-full md:w-[400px] h-[70vh] md:h-[60vh] md:max-h-[600px] z-[110] flex flex-col shadow-2xl border-primary/20 animate-in slide-in-from-bottom-10 fade-in duration-300 overflow-hidden glass rounded-t-2xl md:rounded-xl">
                    <CardHeader className="p-4 border-b border-white/10 bg-primary/5 flex flex-row items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-primary/20 rounded-lg">
                                <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-base font-semibold">Ask AI Tutor</CardTitle>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">{topicTitle}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8 text-muted-foreground hover:text-red-400" title="Clear History">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-black/20">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                                <Bot className="h-12 w-12 mb-2 opacity-20" />
                                <p className="text-sm">Hi! I&apos;ve studied this topic.</p>
                                <p className="text-xs mt-1 opacity-70">Ask me anything about &quot;{topicTitle}&quot;!</p>
                            </div>
                        )}
                        
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white'}`}>
                                        {msg.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                    </div>
                                    <div className={`rounded-2xl px-4 py-2.5 text-sm prose dark:prose-invert prose-p:my-0 prose-pre:my-1 prose-pre:bg-black/30 prose-code:bg-black/30 prose-code:px-1 prose-code:rounded max-w-none break-words ${
                                        msg.role === 'user' 
                                            ? 'bg-primary text-primary-foreground rounded-tr-none' 
                                            : 'bg-white/10 text-foreground rounded-tl-none border border-white/5'
                                    }`}>
                                        <ReactMarkdown 
                                            components={{
                                                p: ({node, ...props}) => <p {...props} className="break-words whitespace-pre-wrap" />
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex gap-2 max-w-[85%]">
                                    <div className="h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="bg-white/10 rounded-2xl rounded-tl-none px-4 py-3 border border-white/5 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-150"></span>
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-300"></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </CardContent>

                    <div className="p-3 bg-background border-t border-white/10 shrink-0">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex items-center gap-2"
                        >
                            <Input 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask a doubt..."
                                disabled={loading}
                                className="bg-white/5 border-white/10 focus-visible:ring-primary h-10"
                            />
                            <Button type="submit" size="icon" disabled={!input.trim() || loading} className="h-10 w-10 shrink-0">
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </Card>
            )}
        </>,
        document.body
    )
}
