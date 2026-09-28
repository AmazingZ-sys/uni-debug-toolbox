// Import this subpath only in H5 code. It does not read browser globals at module evaluation.
export function installBrowserNetwork(toolbox, host = globalThis) {
  const cleanups = []
  if (typeof host.fetch === 'function') {
    const original = host.fetch
    const wrapped = function (input, init = {}) {
      const capture = toolbox.beginRequest({
        kind: 'fetch', method: init.method || input?.method || 'GET',
        url: typeof input === 'string' ? input : input?.url,
        header: init.headers, data: init.body
      })
      try {
        const result = original.apply(this, arguments)
        result.then(response => {
          try {
            const copy = response.clone?.()
            if (copy?.text) {
              copy.text().then(data => capture.success({ statusCode: response.status, data }), () => capture.success({ statusCode: response.status }))
            } else capture.success({ statusCode: response.status })
          } catch (_) { capture.success({ statusCode: response.status }) }
        }, capture.fail)
        return result
      } catch (error) { capture.fail(error); throw error }
    }
    host.fetch = wrapped
    cleanups.push(() => { if (host.fetch === wrapped) host.fetch = original })
  }

  const prototype = host.XMLHttpRequest?.prototype
  if (prototype?.open && prototype?.send) {
    const open = prototype.open
    const send = prototype.send
    const setRequestHeader = prototype.setRequestHeader
    const meta = new WeakMap()
    const wrappedOpen = function (method, url) {
      meta.set(this, { method, url, header: {} })
      return open.apply(this, arguments)
    }
    const wrappedHeader = function (name, value) {
      const state = meta.get(this)
      if (state) state.header[name] = value
      return setRequestHeader.apply(this, arguments)
    }
    const wrappedSend = function (body) {
      const state = meta.get(this) || { method: 'GET', url: '', header: {} }
      const capture = toolbox.beginRequest({ kind: 'xhr', ...state, data: body })
      this.addEventListener('loadend', () => {
        if (this.status) capture.success({ statusCode: this.status, data: this.responseText })
        else capture.fail({ message: this.statusText || 'Network error' })
      }, { once: true })
      try { return send.apply(this, arguments) }
      catch (error) { capture.fail(error); throw error }
    }
    prototype.open = wrappedOpen
    prototype.send = wrappedSend
    if (setRequestHeader) prototype.setRequestHeader = wrappedHeader
    cleanups.push(() => {
      if (prototype.open === wrappedOpen) prototype.open = open
      if (prototype.send === wrappedSend) prototype.send = send
      if (prototype.setRequestHeader === wrappedHeader) prototype.setRequestHeader = setRequestHeader
    })
  }
  return () => { for (const cleanup of cleanups.reverse()) cleanup() }
}
