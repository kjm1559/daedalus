import { Document } from '@/types/document'
import { VerificationResult } from '@/lib/verification'

export type WorkflowState = 'planning' | 'executing' | 'verifying' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  documentId?: string
  verificationResultId?: string
  dependencies: string[]
  createdAt: string
  completedAt?: string
}

export interface Workflow {
  id: string
  title: string
  state: WorkflowState
  tasks: Task[]
  currentTaskId?: string
  documents: Document[]
  verificationResults: VerificationResult[]
  createdAt: string
  updatedAt: string
}

export function createWorkflow(title: string): Workflow {
  const id = Date.now().toString()
  const now = new Date().toISOString()
  
  return {
    id,
    title,
    state: 'planning',
    tasks: [],
    documents: [],
    verificationResults: [],
    createdAt: now,
    updatedAt: now
  }
}

export function addTask(
  workflow: Workflow,
  task: Omit<Task, 'id' | 'createdAt' | 'status' | 'dependencies'>
): Workflow {
  const newTask: Task = {
    ...task,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    dependencies: task.dependencies || []
  }
  
  return updateWorkflow(workflow, {
    tasks: [...workflow.tasks, newTask]
  })
}

export function updateTask(
  workflow: Workflow,
  taskId: string,
  updates: Partial<Task>
): Workflow {
  const newTasks = workflow.tasks.map(task =>
    task.id === taskId ? { ...task, ...updates } : task
  )
  
  return updateWorkflow(workflow, { tasks: newTasks })
}

export function completeTask(
  workflow: Workflow,
  taskId: string
): Workflow {
  const task = workflow.tasks.find(t => t.id === taskId)
  if (!task) return workflow
  
  return updateTask(workflow, taskId, {
    status: 'completed',
    completedAt: new Date().toISOString()
  })
}

export function updateWorkflow(
  workflow: Workflow,
  updates: Partial<Workflow>
): Workflow {
  return {
    ...workflow,
    ...updates,
    updatedAt: new Date().toISOString()
  }
}

export function getNextTask(workflow: Workflow): Task | null {
  if (workflow.state !== 'executing') return null
  
  const currentTask = workflow.tasks.find(t => t.id === workflow.currentTaskId)
  
  if (currentTask?.status === 'completed') {
    const pendingTasks = workflow.tasks.filter(
      t => t.status === 'pending' && t.dependencies.every(depId => {
        const dep = workflow.tasks.find(t => t.id === depId)
        return dep?.status === 'completed'
      })
    )
    
    if (pendingTasks.length > 0) {
      return pendingTasks[0]
    }
    
    if (workflow.tasks.every(t => t.status === 'completed')) {
      return null
    }
  }
  
  return currentTask || null
}

export function canExecuteTask(task: Task, workflow: Workflow): boolean {
  if (task.status !== 'pending') return false
  
  return task.dependencies.every(depId => {
    const dep = workflow.tasks.find(t => t.id === depId)
    return dep?.status === 'completed'
  })
}

export function startWorkflow(workflow: Workflow): Workflow {
  return updateWorkflow(workflow, {
    state: 'executing',
    currentTaskId: workflow.tasks.find(t => t.status === 'pending')?.id
  })
}

export function completeWorkflow(workflow: Workflow): Workflow {
  const allCompleted = workflow.tasks.every(t => t.status === 'completed')
  
  if (allCompleted) {
    return updateWorkflow(workflow, {
      state: 'completed'
    })
  }
  
  return workflow
}
