/**
 * Mention Processor Service
 * Handles @agent and @file mentions through the system reminder infrastructure
 * Designed to integrate naturally with the existing event-driven architecture
 */

import { emitReminderEvent } from './systemReminder'
import { getAvailableAgentTypes } from '../utils/agentLoader'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { getCwd } from '../utils/state'

export interface MentionContext {
  type: 'agent' | 'file'
  mention: string
  resolved: string
  exists: boolean
  metadata?: any
}

export interface ProcessedMentions {
  agents: MentionContext[]
  files: MentionContext[]
  hasAgentMentions: boolean
  hasFileMentions: boolean
}

class MentionProcessorService {
  // Separate patterns for agents and files to avoid conflicts
  private agentPattern = /@(agent-[\w\-]+)/g
  private filePattern = /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g
  private agentCache: Map<string, boolean> = new Map()
  private lastAgentCheck: number = 0
  private CACHE_TTL = 60000 // 1 minute cache

  /**
   * Process mentions in user input and emit appropriate events
   * This follows the event-driven philosophy of system reminders
   */
  public async processMentions(input: string): Promise<ProcessedMentions> {
    const result: ProcessedMentions = {
      agents: [],
      files: [],
      hasAgentMentions: false,
      hasFileMentions: false,
    }

    // Process agent mentions first (more specific pattern)
    const agentMatches = [...input.matchAll(this.agentPattern)]
    
    // Refresh agent cache if needed
    if (agentMatches.length > 0) {
      await this.refreshAgentCache()
    }
    
    for (const match of agentMatches) {
      const agentMention = match[1] // e.g., "agent-simplicity-auditor"
      const agentType = agentMention.replace(/^agent-/, '') // Remove prefix
      
      // Check if this is a valid agent
      if (this.agentCache.has(agentType)) {
        result.agents.push({
          type: 'agent',
          mention: agentMention,
          resolved: agentType,
          exists: true,
        })
        result.hasAgentMentions = true
        
        // Emit agent mention event for system reminder to handle
        emitReminderEvent('agent:mentioned', {
          agentType: agentType,
          originalMention: agentMention,
          timestamp: Date.now(),
        })
      }
    }

    // Process file mentions (but exclude agent mentions)
    const fileMatches = [...input.matchAll(this.filePattern)]
    for (const match of fileMatches) {
      const mention = match[1]
      
      // Skip if this is an agent mention (already processed)
      if (mention.startsWith('agent-')) {
        continue
      }
      
      // Check if it's a file
      const filePath = this.resolveFilePath(mention)
      if (existsSync(filePath)) {
        result.files.push({
          type: 'file',
          mention,
          resolved: filePath,
          exists: true,
        })
        result.hasFileMentions = true
        
        // Emit file mention event for system reminder to handle
        emitReminderEvent('file:mentioned', {
          filePath: filePath,
          originalMention: mention,
          timestamp: Date.now(),
        })
      }
    }

    return result
  }

  // Removed identifyMention method as it's no longer needed with separate processing

  /**
   * Resolve file path relative to current working directory
   */
  private resolveFilePath(mention: string): string {
    if (mention.startsWith('/')) {
      return mention
    }
    return resolve(getCwd(), mention)
  }

  /**
   * Refresh the agent cache periodically
   * This avoids hitting the agent loader on every mention
   */
  private async refreshAgentCache(): Promise<void> {
    const now = Date.now()
    if (now - this.lastAgentCheck < this.CACHE_TTL) {
      return
    }

    try {
      const agents = await getAvailableAgentTypes()
      this.agentCache.clear()
      
      for (const agent of agents) {
        // Store only the agent type without prefix
        this.agentCache.set(agent.agentType, true)
      }
      
      this.lastAgentCheck = now
    } catch (error) {
      console.warn('Failed to refresh agent cache:', error)
      // Keep existing cache on error
    }
  }

  /**
   * Clear caches - useful for testing or reset
   */
  public clearCache(): void {
    this.agentCache.clear()
    this.lastAgentCheck = 0
  }
}

// Export singleton instance
export const mentionProcessor = new MentionProcessorService()

/**
 * Process mentions in user input
 * This is the main API for the mention processor
 */
export const processMentions = (input: string) => 
  mentionProcessor.processMentions(input)

/**
 * Clear mention processor caches
 */
export const clearMentionCache = () =>
  mentionProcessor.clearCache()