import { Document } from '@/types/document'

export function createDocument(
  title: string,
  content: string = ''
): Document {
  const id = Date.now().toString()
  const now = new Date().toISOString()
  
  return {
    id,
    title,
    content,
    createdAt: now,
    updatedAt: now,
    linkedDocumentIds: [],
    status: 'draft'
  }
}

export function updateDocument(
  document: Document,
  updates: Partial<Document>
): Document {
  return {
    ...document,
    ...updates,
    updatedAt: new Date().toISOString()
  }
}

export function linkDocuments(
  fromDoc: Document,
  toDoc: Document
): { fromDoc: Document; toDoc: Document } {
  const fromLinkedIds = fromDoc.linkedDocumentIds.includes(toDoc.id)
    ? fromDoc.linkedDocumentIds
    : [...fromDoc.linkedDocumentIds, toDoc.id]
  
  const toLinkedIds = toDoc.linkedDocumentIds.includes(fromDoc.id)
    ? toDoc.linkedDocumentIds
    : [...toDoc.linkedDocumentIds, fromDoc.id]
  
  return {
    fromDoc: updateDocument(fromDoc, { linkedDocumentIds: fromLinkedIds }),
    toDoc: updateDocument(toDoc, { linkedDocumentIds: toLinkedIds })
  }
}

export function findDocumentById(
  documents: Document[],
  id: string
): Document | undefined {
  return documents.find(doc => doc.id === id)
}

export function buildDocumentTree(
  documents: Document[]
): DocumentNode[] {
  const map = new Map<string, DocumentNode>()
  
  // Initialize all nodes
  documents.forEach(doc => {
    map.set(doc.id, {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      children: []
    })
  })
  
  // Build relationships
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
  
  // Return root nodes (documents with no incoming links)
  const rootedNodes: DocumentNode[] = []
  const hasIncomingLink = new Set<string>()
  
  documents.forEach(doc => {
    doc.linkedDocumentIds.forEach(linkId => {
      hasIncomingLink.add(linkId)
    })
  })
  
  documents.forEach(doc => {
    if (!hasIncomingLink.has(doc.id)) {
      rootedNodes.push(map.get(doc.id)!)
    }
  })
  
  return rootedNodes
}
