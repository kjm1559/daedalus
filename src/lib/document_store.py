"""Document store for file-based document storage."""
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from models.data import Document

# Ensure stdout/stderr are UTF-8
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if hasattr(sys.stderr, 'buffer') and sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')


class DocumentStore:
    """File-based document storage with YAML-like frontmatter."""

    def __init__(self, workspace_path: str = "./workspace") -> None:
        self.workspace_path = Path(workspace_path)
        self._ensure_workspace()

    def _ensure_workspace(self) -> None:
        """Create workspace directory if it doesn't exist."""
        self.workspace_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, doc_id: str) -> Path:
        """Get file path for a document."""
        return self.workspace_path / f"{doc_id}.md"

    def _serialize_document(self, doc: Document) -> str:
        """Serialize document to markdown with frontmatter."""
        frontmatter = [
            "---",
            f"id: {doc.id}",
            f"title: {doc.title}",
            f"status: {doc.status.value}",
            f"created_at: {doc.created_at}",
            f"updated_at: {doc.updated_at}",
            f"linked_document_ids: {json.dumps(doc.linked_document_ids)}",
            "---",
            "",
            doc.content,
        ]
        return "\n".join(frontmatter)

    def _parse_document(self, content: str) -> Document:
        """Parse markdown with frontmatter to Document."""
        lines = content.split("\n")
        frontmatter: dict[str, str] = {}
        in_frontmatter = False
        content_lines: list[str] = []

        for line in lines:
            if line == "---":
                in_frontmatter = not in_frontmatter
                continue

            if in_frontmatter and ":" in line:
                key, value = line.split(":", 1)
                frontmatter[key.strip()] = value.strip()
            elif not in_frontmatter:
                content_lines.append(line)

        linked_ids = json.loads(frontmatter.get("linked_document_ids", "[]"))

        return Document(
            id=frontmatter["id"],
            title=frontmatter.get("title", "Untitled"),
            content="\n".join(content_lines).strip(),
            status=frontmatter.get("status", "draft"),
            created_at=frontmatter.get("created_at", ""),
            updated_at=frontmatter.get("updated_at", ""),
            linked_document_ids=linked_ids if isinstance(linked_ids, list) else [],
        )

    async def save_document(self, doc: Document) -> Document:
        """Save a document to file."""
        self._ensure_workspace()
        file_path = self._get_file_path(doc.id)
        content = self._serialize_document(doc)
        file_path.write_text(content, encoding="utf-8")
        return Document(**{**doc.__dict__, "updated_at": doc.updated_at})

    async def load_document(self, doc_id: str) -> Document | None:
        """Load a document from file."""
        file_path = self._get_file_path(doc_id)
        try:
            content = file_path.read_text(encoding="utf-8")
            return self._parse_document(content)
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            return None

    async def list_documents(self) -> list[Document]:
        """List all documents in workspace."""
        self._ensure_workspace()
        docs = []
        for file_path in self.workspace_path.glob("*.md"):
            doc_id = file_path.stem
            doc = await self.load_document(doc_id)
            if doc:
                docs.append(doc)
        return sorted(docs, key=lambda d: d.updated_at, reverse=True)

    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document."""
        file_path = self._get_file_path(doc_id)
        try:
            file_path.unlink()
            return True
        except FileNotFoundError:
            return False

    async def link_documents(self, doc_id1: str, doc_id2: str) -> None:
        """Link two documents."""
        doc1 = await self.load_document(doc_id1)
        doc2 = await self.load_document(doc_id2)
        if not doc1 or not doc2:
            return

        if doc_id2 not in doc1.linked_document_ids:
            doc1.linked_document_ids.append(doc_id2)
        if doc_id1 not in doc2.linked_document_ids:
            doc2.linked_document_ids.append(doc_id1)

        await self.save_document(doc1)
        await self.save_document(doc2)


# Default singleton instance
document_store = DocumentStore(os.environ.get("DAEDALUS_WORKSPACE", "./workspace"))
