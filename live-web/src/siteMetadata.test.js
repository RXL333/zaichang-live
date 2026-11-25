import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { expect, it } from 'vitest'

const pageUrl = 'https://rxl333.github.io/zaichang-live/'

function dimensions(path) {
  const png = readFileSync(new URL(path, import.meta.url))
  expect(png.readUInt32BE(0)).toBe(0x89504e47)
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

it('shares site metadata and a brand image for hash-based invitation links', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const { document } = new JSDOM(html, { url: `${pageUrl}#/join/123456789` }).window
  const meta = property => document.querySelector(`meta[property="${property}"]`)?.content

  expect(meta('og:title')).toBe('在场会议')
  expect(meta('og:url')).toBe(pageUrl)
  expect(meta('og:description')).toBe(document.querySelector('meta[name="description"]').content)
  expect(meta('og:image')).toBe(`${pageUrl}zaichang-share.png`)
  expect(dimensions('../public/zaichang-share.png')).toEqual([Number(meta('og:image:width')), Number(meta('og:image:height'))])
  expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('%BASE_URL%favicon.png')
  expect(dimensions('../public/favicon.png')).toEqual([64, 64])
  expect(document.querySelector('meta[name="theme-color"]').content).toBe('#f1f4f2')
})
