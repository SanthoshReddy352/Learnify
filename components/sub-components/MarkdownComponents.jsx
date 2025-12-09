import CodeBlock from '@/components/sub-components/CodeBlock'

const MarkdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="text-2xl md:text-3xl font-bold mt-6 md:mt-10 mb-4 md:mb-6 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent inline-block pb-2 border-b border-white/10 w-full" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-lg md:text-2xl font-bold mt-6 md:mt-8 mb-3 md:mb-4 text-foreground flex items-center gap-2 group" {...props}>
      <div className="h-6 w-1 md:h-8 md:w-1 bg-primary rounded-full shrink-0" />
      {props.children}
    </h2>
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-lg md:text-xl font-semibold mt-5 md:mt-6 mb-2 md:mb-3 text-foreground/90 pl-3 md:pl-4 border-l-2 border-primary/30" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mb-4 md:mb-6 leading-relaxed text-muted-foreground text-base md:text-lg" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="list-disc list-outside ml-4 md:ml-6 space-y-2 md:space-y-3 my-4 md:my-6 text-muted-foreground marker:text-primary" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal list-outside ml-4 md:ml-6 space-y-2 md:space-y-3 my-4 md:my-6 text-muted-foreground marker:text-primary list-decimal" {...props} />
  ),
  li: ({ node, ...props }) => (
    <li className="[&>p]:!my-0 [&>p]:!inline pl-1 md:pl-0" {...props}>
      {props.children}
    </li>
  ),
  code: CodeBlock,
  pre: ({ node, ...props }) => (
    <pre className="!bg-transparent !p-0 !m-0 !rounded-none !border-none !shadow-none !ring-0 overflow-visible" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote className="my-8 pl-6 border-l-4 border-primary bg-primary/5 py-4 pr-4 rounded-r-xl italic text-lg text-muted-foreground" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-white/10 shadow-lg">
      <table className="w-full text-left border-collapse bg-white/5" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border-b border-white/10 p-4 font-semibold text-foreground bg-white/5" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-white/5 p-4 text-muted-foreground/90 tabular-nums" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a className="text-primary hover:text-primary/80 transition-colors underline decoration-primary/30 underline-offset-4 hover:decoration-primary" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  hr: ({ node, ...props }) => (
    <hr className="my-10 border-white/10" {...props} />
  ),
  img: ({ node, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rounded-xl border border-white/10 shadow-lg my-8 w-full object-cover" alt={props.alt} {...props} />
  )
}

export default MarkdownComponents
