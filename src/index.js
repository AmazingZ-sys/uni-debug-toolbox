const DEFAULT_REDACT_KEYS = ['authorization', 'cookie', 'set-cookie', 'token', 'access_token', 'refresh_token', 'password', 'secret']
const LEVELS = ['log', 'info', 'warn', 'error', 'debug']

function normalizeOptions(options) {
  const redact = options.redact === true
    ? DEFAULT_REDACT_KEYS
    : options.redact && Array.isArray(options.redact.keys) ? options.redact.keys : []
  return {
    maxLogs: Math.max(1, Number(options.maxLogs) || 200),
    maxRequests: Math.max(1, Number(options.maxRequests) || 100),
    maxValueLength: Math.max(100, Number(options.maxValueLength) || 20000),
    redact: new Set(redact.map(key => String(key).toLowerCase()))
  }
}

function copyValue(value, settings, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > settings.maxValueLength ? `${value.slice(0, settings.maxValueLength)}…` : value
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (typeof value !== 'object') return value
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  if (value instanceof Date) return value.toISOString()
  if (depth >= 6) return '[Max depth]'
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  let result
  if (Array.isArray(value)) {
    result = value.slice(0, 100).map(item => copyValue(item, settings, seen, depth + 1))
  } else {
    result = {}
    for (const key of Object.keys(value).slice(0, 100)) {
      try {
        result[key] = settings.redact.has(key.toLowerCase())
          ? '[REDACTED]'
          : copyValue(value[key], settings, seen, depth + 1)
      } catch (_) {
        result[key] = '[Unreadable]'
      }
    }
  }
  seen.delete(value)
  return result
}

function toText(value) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch (_) { return String(value) }
}

function appendBounded(list, entry, maximum) {
  list.push(entry)
  if (list.length > maximum) list.splice(0, list.length - maximum)
}

export function createDebugToolbox() {
  const logs = []
  const requests = []
  const listeners = new Set()
  let active = false
  let hostUni
  let hostConsole
  let originalConsole = {}
  let wrappedConsole = {}
  let originalNetwork = {}
  let wrappedNetwork = {}
  let app
  let originalErrorHandler
  let settings = normalizeOptions({})
  let nextId = 1

  function emit() {
    for (const listener of listeners) {
      try { listener() } catch (_) { /* observers cannot break the app */ }
    }
  }

  function recordLog(level, values) {
    const args = values.map(value => copyValue(value, settings))
    appendBounded(logs, {
      id: nextId++, time: Date.now(), level,
      args, text: args.map(toText).join(' ')
    }, settings.maxLogs)
    emit()
  }

  function finishRequest(entry, phase, value) {
    if (entry.finished) return
    entry.finished = true
    entry.duration = Date.now() - entry.time
    if (phase === 'success') {
      entry.statusCode = value?.statusCode ?? null
      entry.response = copyValue(value, settings)
    } else {
      entry.error = copyValue(value, settings)
    }
    emit()
  }

  function beginRequest(details) {
    const entry = {
      id: nextId++, time: Date.now(), kind: details.kind,
      method: details.method || 'GET', url: String(details.url || ''),
      request: copyValue({ header: details.header, data: details.data }, settings),
      statusCode: null, duration: null, finished: false
    }
    appendBounded(requests, entry, settings.maxRequests)
    emit()
    return {
      success: value => finishRequest(entry, 'success', value),
      fail: value => finishRequest(entry, 'fail', value)
    }
  }

  function wrapRequest(name) {
    if (typeof hostUni?.[name] !== 'function') return
    const original = hostUni[name]
    originalNetwork[name] = original
    const wrapped = function (options = {}) {
      const capture = beginRequest({
        kind: name, method: options.method || (name === 'uploadFile' ? 'POST' : 'GET'),
        url: options.url, header: options.header, data: options.data ?? options.formData
      })
      const callbacks = ['success', 'fail', 'complete'].some(key => typeof options[key] === 'function')
      let supplied = options
      if (callbacks) {
        supplied = { ...options }
        for (const phase of ['success', 'fail']) {
          if (typeof options[phase] !== 'function') continue
          supplied[phase] = function (result) {
            capture[phase](result)
            return options[phase].apply(this, arguments)
          }
        }
        if (typeof options.complete === 'function') {
          supplied.complete = function (result) {
            capture[result?.statusCode ? 'success' : 'fail'](result)
            return options.complete.apply(this, arguments)
          }
        }
      }
      try {
        const result = original.call(this, supplied)
        if (!callbacks && result && typeof result.then === 'function') {
          result.then(capture.success, capture.fail)
        }
        return result
      } catch (error) {
        capture.fail(error)
        throw error
      }
    }
    wrappedNetwork[name] = wrapped
    hostUni[name] = wrapped
  }

  const api = {
    start(options = {}) {
      if (active) return api
      settings = normalizeOptions(options)
      hostUni = options.uni ?? globalThis.uni
      hostConsole = options.console ?? globalThis.console
      app = options.app
      active = true
      for (const level of LEVELS) {
        if (typeof hostConsole?.[level] !== 'function') continue
        const original = hostConsole[level]
        originalConsole[level] = original
        const wrapped = function (...values) {
          recordLog(level, values)
          return original.apply(this, values)
        }
        wrappedConsole[level] = wrapped
        hostConsole[level] = wrapped
      }
      wrapRequest('request')
      wrapRequest('uploadFile')
      if (app?.config) {
        originalErrorHandler = app.config.errorHandler
        app.config.errorHandler = function (error, instance, info) {
          recordLog('error', [error, info])
          if (originalErrorHandler) return originalErrorHandler.call(this, error, instance, info)
        }
      }
      emit()
      return api
    },
    stop() {
      if (!active) return api
      for (const level of LEVELS) {
        if (originalConsole[level] && hostConsole?.[level] === wrappedConsole[level]) hostConsole[level] = originalConsole[level]
      }
      for (const name of Object.keys(originalNetwork)) {
        if (hostUni?.[name] === wrappedNetwork[name]) hostUni[name] = originalNetwork[name]
      }
      if (app?.config && app.config.errorHandler !== originalErrorHandler) app.config.errorHandler = originalErrorHandler
      originalConsole = {}
      wrappedConsole = {}
      originalNetwork = {}
      wrappedNetwork = {}
      active = false
      emit()
      return api
    },
    get active() { return active },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    snapshot() { return { logs: [...logs], requests: [...requests] } },
    clear(kind) {
      if (!kind || kind === 'logs') logs.length = 0
      if (!kind || kind === 'requests') requests.length = 0
      emit()
    },
    beginRequest,
    recordError(error, info = '') { recordLog('error', [error, info]) },
    getSystemInfo() {
      try { return copyValue(hostUni?.getSystemInfoSync?.() ?? {}, settings) }
      catch (error) { return { error: toText(error) } }
    },
    listStorageKeys() {
      try { return hostUni?.getStorageInfoSync?.()?.keys ?? [] }
      catch (_) { return [] }
    },
    getStorage(key) { return copyValue(hostUni?.getStorageSync?.(key), settings) },
    setStorage(key, value) { hostUni?.setStorageSync?.(key, value); emit() },
    removeStorage(key) { hostUni?.removeStorageSync?.(key); emit() }
  }
  return api
}

export const toolbox = createDebugToolbox()
