import test from 'node:test'
import assert from 'node:assert/strict'
import { createDebugToolbox } from '../src/index.js'

function makeConsole() {
  const calls = []
  const target = {}
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    target[level] = (...args) => calls.push([level, ...args])
  }
  return { target, calls }
}

test('starts without browser globals and restores console on stop', () => {
  const { target, calls } = makeConsole()
  const original = target.log
  const box = createDebugToolbox()
  box.start({ console: target, uni: {} })
  target.log('ready', { ok: true })
  assert.equal(calls.length, 1)
  assert.match(box.snapshot().logs[0].text, /ready/)
  assert.equal(box.start({ console: target, uni: {} }), box)
  box.stop()
  assert.equal(target.log, original)
})

test('records callback requests without changing callbacks or task return', () => {
  const task = { abort() {} }
  const calls = []
  const uni = {
    request(options) {
      calls.push(options)
      options.success({ statusCode: 201, data: { token: 'visible' }, header: { trace: 'abc' } })
      return task
    }
  }
  const original = uni.request
  const box = createDebugToolbox()
  box.start({ uni, console: makeConsole().target })
  let observed = 0
  assert.equal(uni.request({ url: '/orders', method: 'POST', header: { Authorization: 'Bearer abc' }, data: { password: '123' }, success: () => observed++ }), task)
  assert.equal(observed, 1)
  const entry = box.snapshot().requests[0]
  assert.equal(entry.statusCode, 201)
  assert.equal(entry.request.header.Authorization, 'Bearer abc')
  assert.equal(entry.request.data.password, '123')
  assert.equal(entry.response.data.token, 'visible')
  box.stop()
  assert.equal(uni.request, original)
})

test('records promise requests while returning the same promise', async () => {
  const result = Promise.resolve({ statusCode: 200, data: 'ok' })
  const uni = { request: () => result }
  const box = createDebugToolbox().start({ uni, console: makeConsole().target })
  assert.equal(uni.request({ url: '/promise' }), result)
  await result
  await Promise.resolve()
  assert.equal(box.snapshot().requests[0].response.data, 'ok')
  box.stop()
})

test('redaction is off by default and configurable by field', () => {
  const uni = { request(options) { options.success({ statusCode: 200, data: { session: 's1', other: 'ok' } }); return {} } }
  const box = createDebugToolbox().start({ uni, console: makeConsole().target, redact: { keys: ['session'] } })
  uni.request({ url: '/auth', header: { Authorization: 'Bearer abc' }, success() {} })
  const entry = box.snapshot().requests[0]
  assert.equal(entry.request.header.Authorization, 'Bearer abc')
  assert.equal(entry.response.data.session, '[REDACTED]')
  assert.equal(entry.response.data.other, 'ok')
  box.stop()
})

test('system and storage use uni APIs only', () => {
  const data = new Map([['dev-env', { envName: 'test' }]])
  const uni = {
    getSystemInfoSync: () => ({ platform: 'android', model: 'tablet' }),
    getStorageInfoSync: () => ({ keys: [...data.keys()] }),
    getStorageSync: key => data.get(key),
    setStorageSync: (key, value) => data.set(key, value),
    removeStorageSync: key => data.delete(key)
  }
  const box = createDebugToolbox().start({ uni, console: makeConsole().target })
  assert.equal(box.getSystemInfo().platform, 'android')
  assert.deepEqual(box.listStorageKeys(), ['dev-env'])
  assert.deepEqual(box.getStorage('dev-env'), { envName: 'test' })
  box.setStorage('new', 'value')
  assert.equal(box.getStorage('new'), 'value')
  box.removeStorage('new')
  assert.equal(data.has('new'), false)
  box.stop()
})

test('stop leaves a later console wrapper in place', () => {
  const { target } = makeConsole()
  const box = createDebugToolbox().start({ console: target, uni: {} })
  const later = () => {}
  target.log = later
  box.stop()
  assert.equal(target.log, later)
})

test('keeps bounded histories and records rejected requests', async () => {
  const error = new Error('offline')
  const uni = { request: () => Promise.reject(error) }
  const { target } = makeConsole()
  const box = createDebugToolbox().start({ console: target, uni, maxLogs: 2, maxRequests: 1 })
  target.log('a'); target.log('b'); target.log('c')
  assert.deepEqual(box.snapshot().logs.map(item => item.text), ['b', 'c'])
  await assert.rejects(uni.request({ url: '/offline' }), /offline/)
  await Promise.resolve()
  assert.equal(box.snapshot().requests[0].error.message, 'offline')
  box.stop()
})
