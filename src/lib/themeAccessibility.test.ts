import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const styles = readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

function themeVariable(themeSelector: ':root' | ':root.dark', name: string) {
  const selectorStart = styles.indexOf(`${themeSelector} {`)
  const selectorEnd = styles.indexOf('}', selectorStart)
  const block = styles.slice(selectorStart, selectorEnd)
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))

  if (!match) {
    throw new Error(`Missing --${name} in ${themeSelector}`)
  }

  return match[1]
}

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? []
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2])
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe.each([
  ['light', ':root' as const],
  ['dark', ':root.dark' as const],
])('%s theme accessibility', (_name, selector) => {
  it('keeps primary and secondary text readable', () => {
    const surface = themeVariable(selector, 'surface')

    expect(contrastRatio(themeVariable(selector, 'text-dark'), surface)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(themeVariable(selector, 'text-muted'), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the interactive accent distinguishable', () => {
    expect(
      contrastRatio(themeVariable(selector, 'accent'), themeVariable(selector, 'surface')),
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('global accessibility behavior', () => {
  it('provides keyboard focus and reduced-motion rules', () => {
    expect(styles).toContain(':focus-visible')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
