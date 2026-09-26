import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDeployConfig, requireSetting } from '../lib/config'

const writeConfig = (contents: object): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'deploy-config-')), 'c.json')
  writeFileSync(path, JSON.stringify(contents))
  return path
}

test('a missing config file reads as empty rather than failing', () => {
  expect(readDeployConfig('/nonexistent/deploy.local.json')).toEqual({})
})

test('a present setting is returned', () => {
  const config = readDeployConfig(writeConfig({ alertEmail: 'a@b.c' }))
  expect(requireSetting(config, 'alertEmail')).toBe('a@b.c')
})

test('a missing setting fails loudly and says how to fix it', () => {
  expect(() => requireSetting({}, 'alertEmail')).toThrow(
    /Missing "alertEmail".*deploy\.local\.example\.json/
  )
})
