class LocalStorageWatcher {
  private static instance: LocalStorageWatcher
  private static originalSetItem = localStorage.setItem
  private static handlers: Record<string, Array<(newValue: any, oldValue: any) => void>> = {}
  private static channel = new BroadcastChannel('localStorage-channel')
  private static isInitialized = false
  private static debug = false
  private static MAX_LISTENERS_PER_KEY = 10

  private constructor() {}

  static getInstance() {
    if (!this.instance) {
      this.instance = new LocalStorageWatcher()
    }
    return this.instance
  }

  static enableDebug() {
    this.debug = true
  }

  private static log(message: string) {
    if (this.debug) {
      console.log(`[LocalStorageWatcher] ${message}`)
    }
  }

  static init() {
    if (this.isInitialized) {
      console.warn('LocalStorageWatcher already initialized')
      return
    }

    localStorage.setItem = (key: string, value: any) => {
      const oldValue = localStorage.getItem(key)
      const stringValue = JSON.stringify(value)

      this.originalSetItem.call(localStorage, key, stringValue)
      
      try {
        this.handleStorageChange(
          key, 
          value, 
          oldValue ? JSON.parse(oldValue) : null
        )

        this.channel.postMessage({
          key,
          newValue: stringValue,
          oldValue
        })
      } catch (error) {
        this.log(`Storage change error: ${error}`)
      }
    }

    this.channel.onmessage = (event) => {
      const { key, newValue, oldValue } = event.data
      this.handleStorageChange(
        key, 
        JSON.parse(newValue), 
        oldValue ? JSON.parse(oldValue) : null
      )
    }

    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.storageArea === localStorage) {
        this.handleStorageChange(
          event.key as string, 
          event.newValue ? JSON.parse(event.newValue) : null, 
          event.oldValue ? JSON.parse(event.oldValue) : null
        )
      }
    })

    this.isInitialized = true
  }

  private static handleStorageChange(key: string, newValue: any, oldValue: any) {
    try {
      if (this.handlers[key]) {
        this.handlers[key].forEach((handler) => {
          try {
            handler(newValue, oldValue)
          } catch (error) {
            this.log(`Handler error for key ${key}: ${error}`)
          }
        })
      }
    } catch (error) {
      this.log(`Storage change error: ${error}`)
    }
  }

  static watch(key: string, handler: (newValue: any, oldValue: any) => void) {
    if (!this.handlers[key]) {
      this.handlers[key] = []
    }

    if (this.handlers[key].length >= this.MAX_LISTENERS_PER_KEY) {
      console.warn(`Exceeded maximum listeners for key ${key}`)
      return
    }

    this.handlers[key].push(handler)
  }

  static watchWithDebounce(
    key: string, 
    handler: (newValue: any, oldValue: any) => void, 
    delay: number = 300
  ) {
    let timeoutId: number

    const debouncedHandler = (newValue: any, oldValue: any) => {
      clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => handler(newValue, oldValue), delay)
    }

    this.watch(key, debouncedHandler)
  }

  static unwatch(key: string) {
    delete this.handlers[key]
  }

  static clearWatchers() {
    this.handlers = {}
  }

  static destroy() {
    this.channel.close()
    this.handlers = {}
    localStorage.setItem = this.originalSetItem
    this.isInitialized = false
  }
}

export default LocalStorageWatcher