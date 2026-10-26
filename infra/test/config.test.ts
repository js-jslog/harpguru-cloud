import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDeployConfig, requireSetting, workloadEnv } from '../lib/config'

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

test('workload stacks are pinned to the configured account, not the signed-in one', () => {
  expect(workloadEnv({ workloadAccountId: '111122223333' })).toEqual({
    account: '111122223333',
    region: 'eu-west-2',
  })
})

test('without the workload account ID, workload stacks fail at synth', () => {
  expect(() => workloadEnv({})).toThrow(/Missing "workloadAccountId"/)
})
