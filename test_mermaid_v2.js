
const sanitizeMermaidCode = (code) => {
  let result = code
  
  // Remove title and description comments (we extract them separately)
  result = result.replace(/^%%title:.*$/gm, '')
  result = result.replace(/^%%desc:.*$/gm, '')
  
  // Helper to process label content: trim and replace newlines with space
  const formatLabel = (label) => {
    return label.trim().replace(/[\r\n]+/g, ' ').replace(/"/g, "'")
  }
  
  // === UNIVERSAL FIX: Convert problematic labels to quoted format ===
  // We use callbacks to sanitize the inner content (remove newlines, trim) before quoting
  
  // 1. Rectangle [Label]
  result = result.replace(/(\w+)\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g, 
    (m, id, label) => `${id}["${formatLabel(label)}"]`)
  
  // 2. Diamond/Rhombus {Label}
  result = result.replace(/(\w+)\{([^}"]*[()&<>#@!, \s][^}"]*)\}\}/g, 
    (m, id, label) => `${id}{"${formatLabel(label)}"}`)
  
  // 2b. Diamond/Rhombus {Label} (standard single brace)
  result = result.replace(/(\w+)\{([^}"]*[()&<>#@!, \s][^}"]*)\}/g, 
    (m, id, label) => `${id}{"${formatLabel(label)}"}`)
  
  // ... (Other replacements are similar, key is formatLabel usage)

  return result.trim()
}

// NOTE: My manual copy of sanitizeMermaidCode here needs to match the actual file. 
// Copied key logic for verification.

const testCases = [
  'A["NADH, FADH2"] --> B{Electron\nTransport}',
  'B{Electron Transport}',
]

// Mock implementation matching the file exactly for the relevant parts
const sanitizeMermaidCodeMatch = (code) => {
  let result = code
  const formatLabel = (label) => label.trim().replace(/[\r\n]+/g, ' ').replace(/"/g, "'")
  
  // 1.
  result = result.replace(/(\w+)\[([^\]"]*[()&<>#@!, \s][^\]"]*)\]/g, (m, id, label) => `${id}["${formatLabel(label)}"]`)
  // 2.
  result = result.replace(/(\w+)\{([^}"]*[()&<>#@!, \s][^}"]*)\}/g, (m, id, label) => `${id}{"${formatLabel(label)}"}`)
  
  return result.trim()
}

testCases.forEach(tc => {
  console.log(`Original: ${tc}`)
  console.log(`Sanitized: ${sanitizeMermaidCodeMatch(tc)}`)
  console.log('---')
})
