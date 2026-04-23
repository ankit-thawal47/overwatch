type EventHandler = (data: unknown) => void

interface WsEvent {
  event: string
  data: unknown
}

class WsClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private url: string
  private shouldReconnect = true

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.reconnectDelay = 1000
      }

      this.ws.onmessage = (evt) => {
        try {
          const msg: WsEvent = JSON.parse(evt.data)
          const handlers = this.handlers.get(msg.event)
          if (handlers) {
            handlers.forEach((h) => h(msg.data))
          }
          // Also fire wildcard handlers
          const wildcards = this.handlers.get('*')
          if (wildcards) {
            wildcards.forEach((h) => h(msg))
          }
        } catch {
          // ignore parse errors
        }
      }

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000)
      this.connect()
    }, this.reconnectDelay)
  }

  onEvent(eventName: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set())
    }
    this.handlers.get(eventName)!.add(handler)
    return () => {
      this.handlers.get(eventName)?.delete(handler)
    }
  }

  destroy() {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.ws?.close()
  }
}

// Determine WebSocket URL — always use the same host/port the page loaded from
// so Vite's dev-server proxy (/ws → :8080) works on both localhost and LAN IPs
function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

let client: WsClient | null = null

export function getWsClient(): WsClient {
  if (!client) {
    client = new WsClient(getWsUrl())
  }
  return client
}

export { WsClient }
