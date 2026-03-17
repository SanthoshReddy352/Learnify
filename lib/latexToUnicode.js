/**
 * Converts legacy LaTeX math notation to clean Unicode.
 * Strips $...$ and $$...$$ delimiters, then converts common LaTeX commands.
 */

const superscripts = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  'n': 'ⁿ', 'x': 'ˣ', 'y': 'ʸ', 'i': 'ⁱ', '+': '⁺', '-': '⁻',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'k': 'ᵏ', 'l': 'ˡ',
  'm': 'ᵐ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ',
  't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'z': 'ᶻ',
}

const subscripts = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  'n': 'ₙ', 'x': 'ₓ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ',
  'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'r': 'ᵣ', 's': 'ₛ',
  'u': 'ᵤ', 'v': 'ᵥ', 'p': 'ₚ', 't': 'ₜ', '+': '₊', '-': '₋',
}

const greekMap = {
  'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
  'epsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ',
  'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ',
  'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ',
  'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ',
  'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
  'Alpha': 'Α', 'Beta': 'Β', 'Gamma': 'Γ', 'Delta': 'Δ',
  'Theta': 'Θ', 'Lambda': 'Λ', 'Pi': 'Π', 'Sigma': 'Σ',
  'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',
  'infty': '∞', 'infinity': '∞',
  'partial': '∂', 'nabla': '∇',
  'forall': '∀', 'exists': '∃',
  'in': '∈', 'notin': '∉',
  'subset': '⊂', 'supset': '⊃',
  'cup': '∪', 'cap': '∩',
  'emptyset': '∅',
  'rightarrow': '→', 'Rightarrow': '⇒',
  'leftarrow': '←', 'Leftarrow': '⇐',
  'leftrightarrow': '↔', 'Leftrightarrow': '⇔',
  'approx': '≈', 'neq': '≠', 'ne': '≠',
  'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥',
  'pm': '±', 'mp': '∓',
  'times': '×', 'cdot': '·', 'div': '÷',
  'sqrt': '√',
  'sum': 'Σ', 'prod': '∏', 'int': '∫',
  'ldots': '…', 'cdots': '⋯', 'dots': '…',
}

function convertSuperscript(str) {
  return str.split('').map(c => superscripts[c] || c).join('')
}

function convertSubscript(str) {
  return str.split('').map(c => subscripts[c] || c).join('')
}

function convertLatexExpr(latex) {
  let s = latex

  // Strip \text{...} → contents
  s = s.replace(/\\text\{([^}]*)\}/g, '$1')
  // Strip \textbf{...} → **contents**
  s = s.replace(/\\textbf\{([^}]*)\}/g, '**$1**')
  // Strip \textit{...} → *contents*
  s = s.replace(/\\textit\{([^}]*)\}/g, '*$1*')
  // Strip \mathrm{...} → contents
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1')
  // Strip \mathbf{...} → contents
  s = s.replace(/\\mathbf\{([^}]*)\}/g, '$1')

  // \frac{a}{b} → (a)/(b)
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')

  // \sqrt[n]{x} → ⁿ√(x)
  s = s.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, (_, n, x) => `${convertSuperscript(n)}√(${x})`)
  // \sqrt{x} → √(x)
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√($1)')

  // Superscripts: ^{...} → Unicode superscript
  s = s.replace(/\^\{([^}]*)\}/g, (_, content) => convertSuperscript(content))
  // Single char superscript: ^x
  s = s.replace(/\^([a-zA-Z0-9])/g, (_, c) => superscripts[c] || `^${c}`)

  // Subscripts: _{...} → Unicode subscript
  s = s.replace(/_\{([^}]*)\}/g, (_, content) => convertSubscript(content))
  // Single char subscript: _x
  s = s.replace(/_([a-zA-Z0-9])/g, (_, c) => subscripts[c] || `_${c}`)

  // Greek letters and symbols: \alpha → α
  s = s.replace(/\\([a-zA-Z]+)/g, (match, cmd) => {
    return greekMap[cmd] || match
  })

  // Clean up remaining backslashes used as spacing: \, \; \! \quad etc
  s = s.replace(/\\[,;!]\s*/g, ' ')
  s = s.replace(/\\quad\s*/g, '  ')
  s = s.replace(/\\qquad\s*/g, '   ')
  
  // Clean up leftover braces
  s = s.replace(/\{/g, '').replace(/\}/g, '')

  return s.trim()
}

export function sanitizeLatex(content) {
  if (!content || typeof content !== 'string') return content

  // Don't process inside code blocks - split and only process non-code parts
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g)
  
  const processed = parts.map((part, i) => {
    // Odd indices are code blocks, skip them
    if (i % 2 === 1) return part

    // Replace display math $$...$$ first
    let s = part.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      return `\n\n**${convertLatexExpr(expr)}**\n\n`
    })

    // Replace inline math $...$
    s = s.replace(/\$([^$\n]+?)\$/g, (_, expr) => {
      return convertLatexExpr(expr)
    })

    return s
  })

  return processed.join('')
}
