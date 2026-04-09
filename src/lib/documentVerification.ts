import { VerificationResult } from "@/lib/workflow";

export function verifyDocumentStatus(
  documentId: string,
  verificationResults: VerificationResult[],
): {
  status: "pending" | "passed" | "failed";
  checks: Array<{ name: string; passed: boolean }>;
} {
  const results = verificationResults
    .filter((v) => v.documentId === documentId)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  if (results.length === 0) {
    return { status: "pending", checks: [] };
  }

  const latest = results[0];
  return {
    status: latest.status,
    checks: latest.checks.map((c) => ({
      name: c.name,
      passed: c.passed,
    })),
  };
}

export function isDocumentVerified(documentId: string): boolean {
  return false;
}
