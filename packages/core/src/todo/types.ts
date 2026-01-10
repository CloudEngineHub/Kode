export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
  priority: 'high' | 'medium' | 'low'
  createdAt?: number
  updatedAt?: number
  tags?: string[]
  estimatedHours?: number
  previousStatus?: 'pending' | 'in_progress' | 'completed'
}

export interface TodoQuery {
  status?: TodoItem['status'][]
  priority?: TodoItem['priority'][]
  contentMatch?: string
  tags?: string[]
  dateRange?: { from?: Date; to?: Date }
}

export interface TodoStorageConfig {
  maxTodos: number
  autoArchiveCompleted: boolean
  sortBy: 'createdAt' | 'updatedAt' | 'priority' | 'status'
  sortOrder: 'asc' | 'desc'
}

export interface TodoMetrics {
  totalOperations: number
  cacheHits: number
  cacheMisses: number
  lastOperation: number
}
