/**
 * Agent Mention Detection Service
 * Implements @agent-xxx detection using the system-reminder infrastructure
 */

import { systemReminderService, emitReminderEvent } from './systemReminder'
import { getActiveAgents, getAgentByType } from '../utils/agentLoader'
import { logEvent } from './statsig'

export interface AgentMention {
  type: 'agent_mention'
  agentType: string
  fullMatch: string
  startIndex: number
  endIndex: number
  exists: boolean
}

export interface AgentMentionAttachment {
  type: 'agent_mention'
  uuid: string
  timestamp: string
  content: {
    agentType: string
    originalInput: string
    promptWithoutMention: string
  }
}

class AgentMentionDetectorService {
  // Regex pattern matching original Claude Code format
  private readonly AGENT_MENTION_REGEX = /(^|\s)@(agent-[a-zA-Z0-9-]+)\b/g
  private readonly SIMPLE_AGENT_REGEX = /(^|\s)@([a-zA-Z0-9-]+)\b/g
  
  private detectedMentions = new Map<string, AgentMention[]>()
  private processedInputs = new Set<string>()

  constructor() {
    this.setupEventListeners()
  }

  /**
   * Extract agent mentions from user input
   */
  public async extractMentions(input: string): Promise<AgentMention[]> {
    const mentions: AgentMention[] = []
    
    // Check for @agent-xxx format (original Claude Code)
    const agentMatches = [...input.matchAll(this.AGENT_MENTION_REGEX)]
    
    // Also check for simplified @xxx format
    const simpleMatches = [...input.matchAll(this.SIMPLE_AGENT_REGEX)]
    
    // Get available agents
    const agents = await getActiveAgents()
    const agentTypes = new Set(agents.map(a => a.agentType))
    
    // Process @agent-xxx matches
    for (const match of agentMatches) {
      const agentType = match[2].replace('agent-', '')
      mentions.push({
        type: 'agent_mention',
        agentType,
        fullMatch: match[0].trim(),
        startIndex: match.index!,
        endIndex: match.index! + match[0].length,
        exists: agentTypes.has(agentType)
      })
    }
    
    // Process @xxx matches (if not already caught by agent- pattern)
    for (const match of simpleMatches) {
      const potentialAgent = match[2]
      
      // Skip if already processed as @agent-xxx
      if (!mentions.some(m => m.startIndex === match.index)) {
        // Skip if it looks like a file path (contains / or .)
        if (potentialAgent.includes('/') || potentialAgent.includes('.')) {
          continue
        }
        
        // Check if this is an actual agent
        if (agentTypes.has(potentialAgent)) {
          mentions.push({
            type: 'agent_mention',
            agentType: potentialAgent,
            fullMatch: match[0].trim(),
            startIndex: match.index!,
            endIndex: match.index! + match[0].length,
            exists: true
          })
        }
      }
    }
    
    return mentions.filter(m => m.exists)
  }

  /**
   * Convert mentions to attachments (following Claude Code pattern)
   */
  public async convertToAttachments(
    mentions: AgentMention[], 
    originalInput: string
  ): Promise<AgentMentionAttachment[]> {
    const attachments: AgentMentionAttachment[] = []
    
    for (const mention of mentions) {
      // Remove mention from input to get the actual prompt
      const promptWithoutMention = originalInput
        .replace(mention.fullMatch, '')
        .trim()
      
      attachments.push({
        type: 'agent_mention',
        uuid: this.generateUUID(),
        timestamp: new Date().toISOString(),
        content: {
          agentType: mention.agentType,
          originalInput,
          promptWithoutMention
        }
      })
    }
    
    return attachments
  }

  /**
   * Process user input and detect mentions
   */
  public async processInput(input: string): Promise<{
    hasMentions: boolean
    mentions: AgentMention[]
    attachments: AgentMentionAttachment[]
    shouldTriggerAgent: boolean
  }> {
    // Avoid reprocessing same input
    const inputHash = this.hashInput(input)
    if (this.processedInputs.has(inputHash)) {
      return {
        hasMentions: false,
        mentions: [],
        attachments: [],
        shouldTriggerAgent: false
      }
    }
    
    // Extract mentions
    const mentions = await this.extractMentions(input)
    
    if (mentions.length === 0) {
      return {
        hasMentions: false,
        mentions: [],
        attachments: [],
        shouldTriggerAgent: false
      }
    }
    
    // Convert to attachments
    const attachments = await this.convertToAttachments(mentions, input)
    
    // Mark as processed
    this.processedInputs.add(inputHash)
    this.detectedMentions.set(inputHash, mentions)
    
    // Emit detection event through system reminder service
    emitReminderEvent('agent:mention_detected', {
      mentions,
      attachments,
      originalInput: input,
      timestamp: Date.now()
    })
    
    // Log analytics
    logEvent('agent_mention_detected', {
      count: mentions.length,
      agentTypes: mentions.map(m => m.agentType).join(','),
      inputLength: input.length,
      timestamp: Date.now()
    })
    
    return {
      hasMentions: true,
      mentions,
      attachments,
      shouldTriggerAgent: mentions.length > 0
    }
  }

  /**
   * Generate system reminder for agent mention
   */
  public generateMentionReminder(
    agentType: string,
    prompt: string
  ): string {
    return `<system-reminder>
Agent mention detected: @${agentType}
The user is requesting to use the ${agentType} agent.
You should use the Task tool with subagent_type="${agentType}" to fulfill this request.
Original prompt: ${prompt}
</system-reminder>`
  }

  /**
   * Check if input contains potential agent mentions
   */
  public hasPotentialMentions(input: string): boolean {
    return input.includes('@agent-') || 
           (input.includes('@') && /\s@[a-zA-Z0-9-]+/.test(input))
  }

  /**
   * Get suggested agents based on input patterns
   */
  public async suggestAgents(input: string): Promise<string[]> {
    const suggestions: string[] = []
    const agents = await getActiveAgents()
    
    // Pattern-based suggestions
    const patterns = [
      { pattern: /\b(architecture|design|harmony)\b/i, agent: 'dao-qi-harmony-designer' },
      { pattern: /\b(code|write|implement)\b/i, agent: 'code-writer' },
      { pattern: /\b(search|find|locate)\b/i, agent: 'search-specialist' },
      { pattern: /\b(test|testing|spec)\b/i, agent: 'test-writer' },
      { pattern: /\b(status|prompt|line)\b/i, agent: 'statusline-setup' },
      { pattern: /\b(style|format|output)\b/i, agent: 'output-style-setup' }
    ]
    
    for (const { pattern, agent } of patterns) {
      if (pattern.test(input) && agents.some(a => a.agentType === agent)) {
        suggestions.push(agent)
      }
    }
    
    return [...new Set(suggestions)]
  }

  private setupEventListeners(): void {
    // Listen for session events
    systemReminderService.addEventListener('session:startup', () => {
      this.resetSession()
    })
    
    // Listen for agent execution events
    systemReminderService.addEventListener('agent:executed', (context) => {
      // Clear processed inputs for this agent to allow re-mentioning
      const { agentType } = context
      for (const [hash, mentions] of this.detectedMentions) {
        if (mentions.some(m => m.agentType === agentType)) {
          this.processedInputs.delete(hash)
        }
      }
    })
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  private hashInput(input: string): string {
    // Simple hash for deduplication
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
  }

  public resetSession(): void {
    this.detectedMentions.clear()
    this.processedInputs.clear()
  }
}

// Export singleton instance
export const agentMentionDetector = new AgentMentionDetectorService()

// Convenience exports
export const extractAgentMentions = (input: string) => 
  agentMentionDetector.extractMentions(input)

export const processAgentMentions = (input: string) =>
  agentMentionDetector.processInput(input)

export const hasPotentialAgentMentions = (input: string) =>
  agentMentionDetector.hasPotentialMentions(input)

export const suggestAgentsForInput = (input: string) =>
  agentMentionDetector.suggestAgents(input)

export const generateAgentMentionReminder = (agentType: string, prompt: string) =>
  agentMentionDetector.generateMentionReminder(agentType, prompt)