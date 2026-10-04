import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_STRINGS } from '@/lib/email/strings'

const root = path.resolve(__dirname, '..')
const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'))
const km = JSON.parse(fs.readFileSync(path.join(root, 'messages/km.json'), 'utf8'))

const flat = (o: any, p = ''): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]],
  )
const E = new Map(flat(en))
const K = new Map(flat(km))

/** ICU argument names and rich-text tags, ignoring plural/select bodies. */
const args = (s: string) =>
  [...s.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]|<\/?([a-z]+)>/g)]
    .map((m) => m[1] ?? `<${m[2]}>`)
    .sort()
    .join('|')

describe('messages: en ↔ km', () => {
  it('have exactly the same keys', () => {
    expect([...E.keys()].filter((k) => !K.has(k))).toEqual([])
    expect([...K.keys()].filter((k) => !E.has(k))).toEqual([])
  })

  it('have no empty values', () => {
    expect([...K.entries()].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([])
  })

  it('use the same placeholders and tags in every pair', () => {
    const bad = [...E.keys()].filter((k) => K.has(k) && args(E.get(k)!) !== args(K.get(k)!))
    expect(bad).toEqual([])
  })

  it('translate rather than copy (Khmer script present unless identical to English)', () => {
    const khmer = /[ក-៿]/
    const bad = [...K.entries()]
      .filter(([k, v]) => v !== E.get(k) && !khmer.test(v))
      .map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('contain no stray scripts from other languages', () => {
    const stray = /[฀-๿Ѐ-ӿ一-鿿]/
    expect([...K.entries()].filter(([, v]) => stray.test(v)).map(([k]) => k)).toEqual([])
  })
})

describe('code → messages', () => {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.name === 'node_modules' || e.name.startsWith('.')
        ? []
        : e.isDirectory()
          ? walk(path.join(d, e.name))
          : /\.tsx?$/.test(e.name)
            ? [path.join(d, e.name)]
            : [],
    )
  const files = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(root, d)))

  it('every literal t("key") resolves to an existing message', () => {
    const missing: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      const vars: Record<string, string> = {}
      for (const m of src.matchAll(
        /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{\s*namespace:\s*)?['"]([\w.]+)['"]/g,
      ))
        vars[m[1]] = m[2]
      for (const [v, ns] of Object.entries(vars)) {
        for (const m of src.matchAll(new RegExp(`\\b${v}(?:\\.rich|\\.raw)?\\(\\s*(['"])([\\w.]+)\\1`, 'g'))) {
          if (!E.has(`${ns}.${m[2]}`)) missing.push(`${path.relative(root, f)}: ${ns}.${m[2]}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('email strings: en ↔ km', () => {
  const shape = (o: any): any =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? shape(v) : typeof v]),
    )
  it('have the same shape', () => {
    expect(shape(EMAIL_STRINGS.km)).toEqual(shape(EMAIL_STRINGS.en))
  })
})
