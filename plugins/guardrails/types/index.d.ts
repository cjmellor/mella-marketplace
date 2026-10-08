declare module 'claude-code' {
  interface PluginState {
    guardrails: {
      lastPrompt: string
      committing: boolean
    }
  }
}
