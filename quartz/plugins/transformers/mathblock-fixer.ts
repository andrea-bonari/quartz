import { QuartzTransformerPlugin } from "../types"
import fs from "fs"
import path from "path"

export interface Options {
  debug: boolean
}

const defaultOptions: Options = {
  debug: false,
}

export const MathBlockFixer: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  const fixMathBlocks = (content: string, _fileName: string, _ctx: any): string => {
    // Helper function to check if a position is inside a code block
    const isInsideCodeBlock = (content: string, position: number): boolean => {
      const beforeContent = content.substring(0, position)
      const codeBlockMatches = beforeContent.match(/```/g)
      return codeBlockMatches ? codeBlockMatches.length % 2 === 1 : false
    }

    // Fix numbered lists before math blocks, but only outside code blocks
    content = content.replace(/(\d+\.)\s?\$\$/g, (match, p1, offset) => {
      if (isInsideCodeBlock(content, offset)) {
        return match // Don't modify if inside code block
      }
      return p1 + '\n$$$$'
    })

    content = content.replace(/    /g, '\t')
    content = content.replace(/ \t/g, '\t')

    let lines = content.split('\n')
    let insideCallout = false
    let insideTabBlock = false
    let insideDoubleTabBlock = false
    let insideTabbedCallout = false
    let insideTabInCallout = false
    let insideDoubleTabBlockInCallout = false
    let insideCodeBlock = false
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // Toggle insideCodeBlock flag when encountering ```
      if (line.trim().startsWith('```')) {
        insideCodeBlock = !insideCodeBlock
      }

      // Skip lines inside code blocks
      if (insideCodeBlock) {
        continue
      }

      const prefixMatch = line.match(/^(\s*(?:>\s*)*)/)
      const prefix = prefixMatch ? prefixMatch[1] : ""
      const body = line.slice(prefix.length)
      const effectivePrefix = insideCallout && !line.trim().startsWith('>') ? '> ' : prefix

      // Ensure opening $$ starts on a new line
      const openingPos = body.indexOf("$$")
      if (openingPos > -1) {
        const before = body.slice(0, openingPos)
        const beforeWithoutPrefix = before.trim()
        if (beforeWithoutPrefix.length > 0) {
          lines[i] = `${effectivePrefix}${before.trimEnd()}`
          lines.splice(i + 1, 0, `${effectivePrefix}${body.slice(openingPos)}`)
          continue
        }
      }

      // Ensure opening $$ is on its own line and preserve trailing math payload exactly
      if (body.startsWith("$$") && body.trim() !== "$$") {
        const rest = body.slice(2)
        const closePos = rest.indexOf("$$")

        // $$...$$ on one line -> 3 lines
        if (closePos > -1 && rest.slice(closePos + 2).trim().length === 0) {
          const mathContent = rest.slice(0, closePos)
          lines[i] = `${effectivePrefix}$$`
          if (mathContent.length > 0) {
            lines.splice(i + 1, 0, `${effectivePrefix}${mathContent}`, `${effectivePrefix}$$`)
          } else {
            lines.splice(i + 1, 0, `${effectivePrefix}$$`)
          }
          continue
        }

        // $$<content> -> $$ then <content>
        lines[i] = `${effectivePrefix}$$`
        lines.splice(i + 1, 0, `${effectivePrefix}${rest}`)
        continue
      }

      // Ensure closing $$ is on its own line
      if (body.endsWith("$$") && body.trim() !== "$$") {
        const beforeClosing = body.slice(0, -2)
        lines[i] = `${effectivePrefix}${beforeClosing}`
        lines.splice(i + 1, 0, `${effectivePrefix}$$`)
        continue
      }

      // Handle double tabs inside callout
      if (line.startsWith('>\t\t')) {
        insideDoubleTabBlockInCallout = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideDoubleTabBlockInCallout = false
      }
      if (insideDoubleTabBlockInCallout && !line.startsWith('>\t\t') && !/^\>\t\d+\./.test(line.trim()) && !/^\>\t\- /.test(line.trim())) {
        if (line.trim().startsWith('>\t')) {
          lines[i] = '>\t\t' + line.trim().slice(2)
        } else if (line.trim().startsWith('>')) {
          lines[i] = '>\t\t' + line.trim().slice(1)
        } else {
          lines[i] = '>\t\t' + line
        }
        continue
      }

      // Handle double tabs
      if (line.startsWith('\t\t')) {
        insideDoubleTabBlock = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideDoubleTabBlock = false
      }
      if (insideDoubleTabBlock && !line.startsWith('\t\t') && !/^\d+\.(?!\d)/.test(line.trim()) && !/^\t\- /.test(line.trim())) {
        if (line.startsWith('\t')) {
          lines[i] = '\t' + line
        } else {
          lines[i] = '\t\t' + line
        }
        continue
      }

      // Handle tabbed callouts
      if (/^\t ?\>/.test(line)) {
        insideTabbedCallout = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideTabbedCallout = false
      }
      if (!insideTabbedCallout && /^\t ?\>/.test(line.trim())) {
        lines[i] = line.trim().slice(1)
      } else if (insideTabbedCallout && !line.startsWith('\t>')) {
        if (line.trim().startsWith('\t')) {
          lines[i] = '>' + line
        } else if (line.trim().startsWith('>')) {
          lines[i] = '\t' + line
        } else {
          lines[i] = '\t>' + line
        }
        continue
      }

      // Handle tabs in callouts
      if (/^\> ?\t/.test(line) || /^\> ?\d+\./.test(line.trim())) {
        insideTabInCallout = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideTabInCallout = false
      }

      if (insideTabInCallout && /^\> ?\t ?/.test(line)) {
        lines[i] = line.replace(/^\> ?\t ?/, '>\t')
        continue
      }

      if (insideTabInCallout && !/^\> ?\t/.test(line.trim()) && !/^\> ?\t/.test(line) && !/^\> ?\d+\./.test(line.trim()) && !/^\> ?- /.test(line.trim())) {
        if (/^\d+\.(?!\d)/.test(line.trim())) {
          lines[i] = '>' + line
        } else if (line.trim().startsWith('>')) {
          lines[i] = '>\t' + line.trim().slice(1)
        } else {
          lines[i] = '>\t' + line
        }
        continue
      }

      // Handle callouts
      if (line.trim().startsWith('>')) {
        insideCallout = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideCallout = false
      }
      if (insideCallout && !line.trim().startsWith('>')) {
        // Don't modify bullet points - they should remain as bullet points within callouts
        if (line.trim().startsWith('- ')) {
          lines[i] = '> ' + line.trim()
        } else {
          lines[i] = '> ' + line
        }
        continue
      }

      // Handle tabs
      if (/^ ?\t/.test(line) || /^\d+\.(?!\d)/.test(line.trim()) || /^\- /.test(line.trim())) {
        insideTabBlock = true
      } else if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('---') || line.trim().startsWith('```')) {
        insideTabBlock = false
      }
      if (!insideTabBlock && /^ ?\t/.test(line)) {
        lines[i] = line.trim().slice(1)
      } else if (insideTabBlock && !/^ ?\t/.test(line) && !/^\d+\.(?!\d)/.test(line.trim()) && !/^\- /.test(line.trim())) {
        lines[i] = '\t' + line
        continue
      }
    }

    return lines.join('\n')
  }

  const writeDebugFile = (content: string, filePath: string) => {
    const debugDir = path.resolve('mathblock-debug')
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir)
    }
    const debugFilePath = path.join(debugDir, path.basename(filePath))
    fs.writeFileSync(debugFilePath, content, 'utf-8')
  }  

  return {
    name: "MathBlockFixer",
    textTransform(ctx, src) {
      // Get the actual file path from context, fallback to content-based naming
      let fileIdentifier: string
      if (ctx.currentFilePath) {
        fileIdentifier = path.basename(ctx.currentFilePath)
      } else {
        // Fallback to content-based naming if currentFilePath is not available
        fileIdentifier = 'unknown'
        const titleMatch = src.match(/^#\s+(.+)$/m)
        if (titleMatch) {
          fileIdentifier = titleMatch[1].replace(/[^\w\s-]/g, '').trim().substring(0, 50) + '.md'
        } else {
          fileIdentifier = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19) + '.md'
        }
      }

      const content = fixMathBlocks(src.toString(), fileIdentifier, ctx)
      if (opts.debug) {
        writeDebugFile(content, fileIdentifier)
      }
      return content
    },
  }
}