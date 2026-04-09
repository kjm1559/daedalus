import { cn } from '@/lib/utils/cn'

export interface DocumentCardProps {
  document: {
    id: string
    title: string
    status: 'draft' | 'in-progress' | 'verified' | 'completed'
    updatedAt: string
  }
  onClick: (id: string) => void
  onStatusChange?: (id: string, status: DocumentCardProps['document']['status']) => void
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'in-progress': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  verified: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  completed: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
}

export function DocumentCard({ 
  document, 
  onClick, 
  onStatusChange 
}: DocumentCardProps) {
  return (
    <div
      className={cn(
        'p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer bg-white dark:bg-gray-800',
        'hover:border-blue-500'
      )}
      onClick={() => onClick(document.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate flex-1">
          {document.title}
        </h3>
        <span
          className={cn(
            'px-2 py-1 rounded-full text-xs font-medium',
            statusColors[document.status]
          )}
        >
          {document.status.replace('-', ' ')}
        </span>
      </div>
      
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Updated {new Date(document.updatedAt).toLocaleDateString()}
      </div>
      
      {onStatusChange && (
        <div className="mt-3 flex gap-2">
          {(['draft', 'in-progress', 'verified', 'completed'] as const).map(status => (
            <button
              key={status}
              onClick={(e) => {
                e.stopPropagation()
                onStatusChange(document.id, status)
              }}
              className={cn(
                'px-2 py-1 text-xs rounded',
                document.status === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
