export type VerificationStatus = 'pending' | 'passed' | 'failed'

export interface VerificationResult {
  id: string
  documentId: string
  status: VerificationStatus
  checks: Array<{
    name: string
    passed: boolean
    message?: string
  }>
  timestamp: string
  verifiedBy?: string
}

export function createVerification(
  documentId: string,
  checks: Array<{ name: string; passed: boolean; message?: string }>
): VerificationResult {
  return {
    id: Date.now().toString(),
    documentId,
    status: checks.every(c => c.passed) ? 'passed' : 'failed',
    checks,
    timestamp: new Date().toISOString()
  }
}

export function verifyDocument(
  documentId: string,
  verificationResults: VerificationResult[]
): VerificationResult | null {
  const latest = verificationResults
    .filter(v => v.documentId === documentId)
    .sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0]
  
  return latest
}

export function isDocumentVerified(documentId: string): boolean {
  // In a real implementation, this would check a database or file system
  return false
}
