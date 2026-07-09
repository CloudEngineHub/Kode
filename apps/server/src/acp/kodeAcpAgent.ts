import type { JsonRpcPeer } from './jsonrpc'
import type * as Protocol from './protocol'

import {
  handleAuthenticate,
  handleInitialize,
} from './agent/handlers/initialize'
import {
  handleSessionCancel,
  handleSessionLoad,
  handleSessionNew,
  handleSessionSetMode,
} from './agent/handlers/sessions'
import { handleSessionPrompt } from './agent/handlers/prompt'
import type { SessionState } from './agent/types'
import { AcpSessionManager } from './sessionManager'

export type KodeAcpAgentOptions = {
  sessionManager?: AcpSessionManager<SessionState>
}

export class KodeAcpAgent {
  private clientCapabilities: Protocol.ClientCapabilities = {}
  private readonly sessionManager: AcpSessionManager<SessionState>

  constructor(
    private readonly peer: JsonRpcPeer,
    options: KodeAcpAgentOptions = {},
  ) {
    this.sessionManager =
      options.sessionManager ?? new AcpSessionManager<SessionState>()
    this.registerMethods()
  }

  private registerMethods(): void {
    this.peer.registerMethod('initialize', this.onInitialize.bind(this))
    this.peer.registerMethod('authenticate', this.onAuthenticate.bind(this))
    this.peer.registerMethod('session/new', this.onSessionNew.bind(this))
    this.peer.registerMethod('session/load', this.onSessionLoad.bind(this))
    this.peer.registerMethod('session/prompt', this.onSessionPrompt.bind(this))
    this.peer.registerMethod(
      'session/set_mode',
      this.onSessionSetMode.bind(this),
    )
    this.peer.registerMethod('session/cancel', this.onSessionCancel.bind(this))
  }

  private onInitialize(params: unknown): Protocol.InitializeResponse {
    return handleInitialize({
      params,
      setClientCapabilities: caps => {
        this.clientCapabilities = caps
      },
    })
  }

  private onAuthenticate(): Protocol.AuthenticateResponse {
    return handleAuthenticate()
  }

  private onSessionNew(params: unknown): Promise<Protocol.NewSessionResponse> {
    return handleSessionNew({
      peer: this.peer,
      sessionManager: this.sessionManager,
      params,
    })
  }

  private onSessionLoad(
    params: unknown,
  ): Promise<Protocol.LoadSessionResponse> {
    return handleSessionLoad({
      peer: this.peer,
      sessionManager: this.sessionManager,
      params,
    })
  }

  private onSessionSetMode(
    params: unknown,
  ): Promise<Protocol.SetSessionModeResponse> {
    return handleSessionSetMode({
      peer: this.peer,
      sessionManager: this.sessionManager,
      params,
    })
  }

  private onSessionCancel(params: unknown): Promise<void> {
    return handleSessionCancel({ sessionManager: this.sessionManager, params })
  }

  private onSessionPrompt(params: unknown): Promise<Protocol.PromptResponse> {
    return handleSessionPrompt({
      peer: this.peer,
      sessionManager: this.sessionManager,
      params,
    })
  }
}
