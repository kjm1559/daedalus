export interface Document {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  linkedDocumentIds: string[]
  status: 'draft' | 'in-progress' | 'verified' | 'completed'
}

export interface DocumentNode {
  id: string
  title: string
  status: Document['status']
  children: DocumentNode[]
}
