'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { cleanCodeContent } from './CodeBlock'

const MiniMarkdownComponents = {
  p: ({ node, ...props }) => <p className="mb-4 text-base md:text-lg text-foreground/90 leading-relaxed last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <span className="font-bold text-primary" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 text-left space-y-2 text-muted-foreground" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 text-left space-y-2 text-muted-foreground" {...props} />,
  li: ({ node, ...props }) => <li className="marker:text-primary" {...props} />,
  code: ({ node, inline, children, ...props }) => {
    const codeContent = cleanCodeContent(children)
    const isShortSnippet = !codeContent.includes('\n') && codeContent.length < 60
    
    return (inline || isShortSnippet)
      ? <code className="bg-primary/10 text-primary px-1 rounded text-sm font-mono break-words whitespace-pre-wrap" {...props}>{codeContent}</code> 
      : <code className="block bg-muted/50 p-2 rounded-md text-sm font-mono my-2 whitespace-pre-wrap text-left border border-border" {...props}>{codeContent}</code>
  },
}

const Flashcard = ({ front, back, isFlipped, onFlip }) => {
  return (
    <div 
      className="relative w-full h-[450px] sm:h-96 cursor-pointer group perspective-1000"
      onClick={onFlip}
    >
      <div className={`relative w-full h-full duration-700 transform-style-3d transition-all ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front Face */}
        <div className="absolute inset-0 w-full h-full backface-hidden">
          <Card className="h-full flex flex-col items-center justify-center p-5 sm:p-8 glass-card border-primary/20 hover:border-primary/50 transition-colors shadow-2xl shadow-primary/5">
            <div className="absolute top-4 left-4 text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-widest opacity-50">
              Question
            </div>
            <CardContent className="text-center p-0 w-full">
               <div className="mb-4 sm:mb-6 mx-auto w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
               </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight break-words px-2">
                {front}
              </h3>
              <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-muted-foreground animate-pulse">
                Click or Press Space to Flip
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Back Face */}
        <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180">
          <Card className="h-full flex flex-col p-5 sm:p-8 bg-card border border-primary/30 shadow-2xl shadow-primary/10 relative">
             <div className="absolute top-4 left-4 text-[10px] sm:text-xs font-mono text-primary uppercase tracking-widest opacity-70 z-10">
              Answer
            </div>
            <CardContent className="text-center p-0 h-full overflow-y-auto flex flex-col justify-center w-full pt-6">
              <div className="w-full text-left sm:text-center">
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={MiniMarkdownComponents}
                >
                    {back}
                </ReactMarkdown>
              </div>
            </CardContent>
             {/* Scroll Indicator Gradient */}
             <div className="absolute bottom-0 left-0 right-0 h-6 sm:h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Flashcard
