export type OAuthStatus =
  | { state: 'idle' }
  | { state: 'ready_to_start' }
  | { state: 'waiting_for_login'; url: string }
  | { state: 'creating_api_key' }
  | { state: 'about_to_retry'; nextState: OAuthStatus }
  | { state: 'success'; apiKey: string }
  | {
      state: 'error'
      message: string
      toRetry?: OAuthStatus
    }

export const PASTE_HERE_MSG = 'Paste code here if prompted > '
