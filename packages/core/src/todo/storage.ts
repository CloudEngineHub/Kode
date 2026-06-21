import { getSessionState, setSessionState } from '#core/utils/sessionState'
import {
  readAgentData,
  resolveAgentId,
  writeAgentData,
} from '#core/utils/agentStorage'
import type {
  TodoItem,
  TodoQuery,
  TodoStorageConfig,
  TodoMetrics,
} from './types'

const TODO_STORAGE_KEY = 'todos'
const TODO_CONFIG_KEY = 'todoConfig'

const DEFAULT_CONFIG: TodoStorageConfig = {
  maxTodos: 100,
  autoArchiveCompleted: false,
  sortBy: 'status',
  sortOrder: 'desc',
}

let todoCache: TodoItem[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5000

let metrics: TodoMetrics = {
  totalOperations: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastOperation: 0,
}

function invalidateCache(): void {
  todoCache = null
  cacheTimestamp = 0
}

function updateMetrics(cacheHit: boolean = false): void {
  metrics = {
    ...metrics,
    totalOperations: metrics.totalOperations + 1,
    lastOperation: Date.now(),
    cacheHits: metrics.cacheHits + (cacheHit ? 1 : 0),
    cacheMisses: metrics.cacheMisses + (cacheHit ? 0 : 1),
  }
}

function isTodoArray(value: unknown): value is TodoItem[] {
  return Array.isArray(value)
}

function normalizeTodo(todo: TodoItem): TodoItem {
  return {
    ...todo,
    activeForm: todo.activeForm || todo.content,
  }
}

export function getTodoMetrics(): TodoMetrics {
  return { ...metrics }
}

export function getTodos(agentId?: string): TodoItem[] {
  const resolvedAgentId = resolveAgentId(agentId)
  const now = Date.now()

  if (agentId) {
    updateMetrics(false)
    const agentTodos = readAgentData<TodoItem[]>(resolvedAgentId) || []
    return agentTodos.map(normalizeTodo)
  }

  if (todoCache && now - cacheTimestamp < CACHE_TTL) {
    updateMetrics(true)
    return todoCache.map(normalizeTodo)
  }

  updateMetrics(false)
  const sessionTodos = getSessionState(TODO_STORAGE_KEY)
  const todos = isTodoArray(sessionTodos) ? sessionTodos : []

  todoCache = [...todos].map(normalizeTodo)
  cacheTimestamp = now

  return todoCache
}

export function setTodos(todos: TodoItem[], agentId?: string): void {
  const resolvedAgentId = resolveAgentId(agentId)
  const config = getTodoConfig()
  const existingTodos = getTodos(agentId)

  if (todos.length > config.maxTodos) {
    throw new Error(
      `Todo limit exceeded. Maximum ${config.maxTodos} todos allowed.`,
    )
  }

  let processedTodos = todos
  if (config.autoArchiveCompleted) {
    processedTodos = todos.filter(todo => todo.status !== 'completed')
  }

  const updatedTodos = processedTodos.map(todo => {
    const existingTodo = existingTodos.find(existing => existing.id === todo.id)

    return {
      ...todo,
      activeForm: todo.activeForm || todo.content,
      updatedAt: Date.now(),
      createdAt: todo.createdAt || Date.now(),
      previousStatus:
        existingTodo?.status !== todo.status
          ? existingTodo?.status
          : todo.previousStatus,
    }
  })

  if (agentId) {
    writeAgentData(resolvedAgentId, updatedTodos)
    updateMetrics(false)
    return
  }

  setSessionState(TODO_STORAGE_KEY, updatedTodos)
  invalidateCache()
  updateMetrics(false)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getTodoConfig(): TodoStorageConfig {
  const raw = getSessionState(TODO_CONFIG_KEY)
  const stored = isRecord(raw) ? raw : {}
  return { ...DEFAULT_CONFIG, ...(stored as Partial<TodoStorageConfig>) }
}

export function setTodoConfig(config: Partial<TodoStorageConfig>): void {
  const currentConfig = getTodoConfig()
  const newConfig = { ...currentConfig, ...config }

  setSessionState(TODO_CONFIG_KEY, newConfig)

  if (config.sortBy || config.sortOrder) {
    const todos = getTodos()
    setTodos(todos)
  }
}

export function addTodo(
  todo: Omit<TodoItem, 'createdAt' | 'updatedAt'>,
): TodoItem[] {
  const todos = getTodos()
  if (todos.some(existing => existing.id === todo.id)) {
    throw new Error(`Todo with ID '${todo.id}' already exists`)
  }

  const newTodo: TodoItem = {
    ...todo,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const updatedTodos = [...todos, newTodo]
  setTodos(updatedTodos)
  return updatedTodos
}

export function updateTodo(id: string, updates: Partial<TodoItem>): TodoItem[] {
  const todos = getTodos()
  const existingTodo = todos.find(todo => todo.id === id)
  if (!existingTodo) {
    throw new Error(`Todo with ID '${id}' not found`)
  }

  const updatedTodos = todos.map(todo =>
    todo.id === id ? { ...todo, ...updates, updatedAt: Date.now() } : todo,
  )

  setTodos(updatedTodos)
  return updatedTodos
}

export function deleteTodo(id: string): TodoItem[] {
  const todos = getTodos()
  const todoExists = todos.some(todo => todo.id === id)
  if (!todoExists) {
    throw new Error(`Todo with ID '${id}' not found`)
  }

  const updatedTodos = todos.filter(todo => todo.id !== id)
  setTodos(updatedTodos)
  return updatedTodos
}

export function clearTodos(): void {
  setTodos([])
}

export function getTodoById(id: string): TodoItem | undefined {
  const todos = getTodos()
  return todos.find(todo => todo.id === id)
}

export function getTodosByStatus(status: TodoItem['status']): TodoItem[] {
  const todos = getTodos()
  return todos.filter(todo => todo.status === status)
}

export function getTodosByPriority(priority: TodoItem['priority']): TodoItem[] {
  const todos = getTodos()
  return todos.filter(todo => todo.priority === priority)
}

export function queryTodos(query: TodoQuery): TodoItem[] {
  const todos = getTodos()

  return todos.filter(todo => {
    if (query.status && !query.status.includes(todo.status)) {
      return false
    }

    if (query.priority && !query.priority.includes(todo.priority)) {
      return false
    }

    if (
      query.contentMatch &&
      !todo.content.toLowerCase().includes(query.contentMatch.toLowerCase())
    ) {
      return false
    }

    if (query.tags && todo.tags) {
      const hasMatchingTag = query.tags.some(tag => todo.tags!.includes(tag))
      if (!hasMatchingTag) return false
    }

    if (query.dateRange) {
      const todoDate = new Date(todo.createdAt || 0)
      if (query.dateRange.from && todoDate < query.dateRange.from) return false
      if (query.dateRange.to && todoDate > query.dateRange.to) return false
    }

    return true
  })
}

export function getTodoStatistics() {
  const todos = getTodos()
  const currentMetrics = getTodoMetrics()

  return {
    total: todos.length,
    byStatus: {
      pending: todos.filter(t => t.status === 'pending').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
    },
    byPriority: {
      high: todos.filter(t => t.priority === 'high').length,
      medium: todos.filter(t => t.priority === 'medium').length,
      low: todos.filter(t => t.priority === 'low').length,
    },
    metrics: currentMetrics,
    cacheEfficiency:
      currentMetrics.totalOperations > 0
        ? Math.round(
            (currentMetrics.cacheHits / currentMetrics.totalOperations) * 100,
          )
        : 0,
  }
}

export function optimizeTodoStorage(): void {
  invalidateCache()

  const todos = getTodos()
  const validTodos = todos.filter(
    todo =>
      todo.id &&
      todo.content &&
      todo.activeForm &&
      ['pending', 'in_progress', 'completed'].includes(todo.status) &&
      ['high', 'medium', 'low'].includes(todo.priority),
  )

  if (validTodos.length !== todos.length) {
    setTodos(validTodos)
  }
}
