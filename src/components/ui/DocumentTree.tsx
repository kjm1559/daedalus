import { cn } from '@/lib/utils/cn'
import { Document } from '@/types/document'

export interface DocumentTreeProps {
  documents: Document[]
  selectedDocumentId?: string
  onSelect?: (id: string) => void
}

interface TreeNode {
  id: string
  title: string
  status: Document['status']
  children: TreeNode[]
}

function buildTree(documents: Document[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  
  documents.forEach(doc => {
    map.set(doc.id, {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      children: []
    })
  })
  
  documents.forEach(doc => {
    const node = map.get(doc.id)
    if (node) {
      doc.linkedDocumentIds.forEach(linkId => {
        const linkedNode = map.get(linkId)
        if (linkedNode) {
          node.children.push(linkedNode)
        }
      })
    }
  })
  
  const rootNodes: TreeNode[] = []
  const hasIncoming = new Set<string>()
  
  documents.forEach(doc => {
    doc.linkedDocumentIds.forEach(linkId => hasIncoming.add(linkId))
  })
  
  documents.forEach(doc => {
    if (!hasIncoming.has(doc.id)) {
      rootNodes.push(map.get(doc.id)!)
    }
  })
  
  return rootNodes
}

function TreeNodeView({ 
  node, 
  selectedId, 
  onSelect, 
  level = 0 
}: { 
  node: TreeNode 
  selectedId?: string 
  onSelect?: (id: string) => void 
  level?: number 
}) {
  return (
    <div className="ml-4">
      <div
        className={cn(
          'flex items-center py-2 px-3 rounded cursor-pointer transition-colors',
          node.id === selectedId
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
        )}
        style={{ marginLeft: `${level * 16}px` }}
        onClick={() => onSelect?.(node.id)}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full mr-2',
            node.status === 'completed' ? 'bg-green-500' :
            node.status === 'verified' ? 'bg-green-400' :
            node.status === 'in-progress' ? 'bg-blue-500' :
            'bg-gray-400'
          )}
        />
        <span className="truncate flex-1">{node.title}</span>
      </div>
      
      {node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TreeNodeView
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DocumentTree({ 
  documents, 
  selectedDocumentId, 
  onSelect 
}: DocumentTreeProps) {
  const tree = buildTree(documents)
  
  if (tree.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No documents yet
      </div>
    )
  }
  
  return (
    <div className="py-4">
      {tree.map(node => (
        <TreeNodeView
          key={node.id}
          node={node}
          selectedId={selectedDocumentId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
