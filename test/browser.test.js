import test from 'node:test'
import assert from 'node:assert/strict'
import { createDebugToolbox } from '../src/index.js'
import { installBrowserNetwork } from '../src/browser.js'

test('browser adapter is optional and restores fetch', async () => {
  const box = createDebugToolbox()
  const original = () => Promise.resolve({ status: 204, clone: () => ({ text: () => Promise.resolve('saved') }) })
  const host = { fetch: original }
  const uninstall = installBrowserNetwork(box, host)
  const response = await host.fetch('/health', { method: 'POST', headers: { Authorization: 'raw' }, body: 'ping' })
  await Promise.resolve()
  assert.equal(response.status, 204)
  assert.equal(box.snapshot().requests[0].request.header.Authorization, 'raw')
  assert.equal(box.snapshot().requests[0].response.data, 'saved')
  uninstall()
  assert.equal(host.fetch, original)
})
