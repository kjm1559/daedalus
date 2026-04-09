import { Document } from "@/types/document";
import path from "path";
import fs from "fs/promises";

export class DocumentStore {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.workspacePath);
    } catch {
      await fs.mkdir(this.workspacePath, { recursive: true });
    }
  }

  async saveDocument(doc: Document): Promise<Document> {
    await this.initialize();
    const filePath = this.getFilePath(doc.id);
    const content = this.serializeDocument(doc);

    await fs.writeFile(filePath, content, "utf-8");

    return { ...doc, updatedAt: new Date().toISOString() };
  }

  async loadDocument(id: string): Promise<Document | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.parseDocument(content);
    } catch {
      return null;
    }
  }

  async listDocuments(): Promise<Document[]> {
    await this.initialize();
    try {
      const files = await fs.readdir(this.workspacePath);
      const docFiles = files.filter((f) => f.endsWith(".md"));

      const docs: Document[] = [];
      for (const file of docFiles) {
        const id = file.slice(0, -3);
        const doc = await this.loadDocument(id);
        if (doc) {
          docs.push(doc);
        }
      }

      return docs.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch {
      return [];
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async linkDocuments(docId1: string, docId2: string): Promise<void> {
    const doc1 = await this.loadDocument(docId1);
    const doc2 = await this.loadDocument(docId2);

    if (!doc1 || !doc2) return;

    const links1 = doc1.linkedDocumentIds.includes(docId2)
      ? doc1.linkedDocumentIds
      : [...doc1.linkedDocumentIds, docId2];

    const links2 = doc2.linkedDocumentIds.includes(docId1)
      ? doc2.linkedDocumentIds
      : [...doc2.linkedDocumentIds, docId1];

    await this.saveDocument({ ...doc1, linkedDocumentIds: links1 });
    await this.saveDocument({ ...doc2, linkedDocumentIds: links2 });
  }

  private getFilePath(id: string): string {
    return path.join(this.workspacePath, `${id}.md`);
  }

  private serializeDocument(doc: Document): string {
    const frontmatter = [
      "---",
      `id: ${doc.id}`,
      `title: ${doc.title}`,
      `status: ${doc.status}`,
      `createdAt: ${doc.createdAt}`,
      `updatedAt: ${doc.updatedAt}`,
      `linkedDocumentIds: ${JSON.stringify(doc.linkedDocumentIds)}`,
      "---",
      "",
      doc.content,
    ].join("\n");

    return frontmatter;
  }

  private parseDocument(content: string): Document {
    const lines = content.split("\n");
    const frontmatter: Record<string, string> = {};
    let inFrontmatter = false;

    for (const line of lines) {
      if (line === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }

      if (inFrontmatter && line.includes(":")) {
        const [key, value] = line.split(":", 2);
        frontmatter[key.trim()] = value.trim();
      } else if (!inFrontmatter) {
        if (frontmatter.content) {
          frontmatter.content += "\n" + line;
        } else {
          frontmatter.content = line;
        }
      }
    }

    const linkedIds = frontmatter.linkedDocumentIds
      ? JSON.parse(frontmatter.linkedDocumentIds)
      : [];

    return {
      id: frontmatter.id,
      title: frontmatter.title || "Untitled",
      status: (frontmatter.status as Document["status"]) || "draft",
      createdAt: frontmatter.createdAt,
      updatedAt: frontmatter.updatedAt,
      linkedDocumentIds: Array.isArray(linkedIds) ? linkedIds : [],
      content: frontmatter.content || "",
    };
  }
}

export const documentStore = new DocumentStore(
  process.env.DAEDALUS_WORKSPACE || "./workspace",
);
