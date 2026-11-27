
"use client";

import { FileText, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type DocumentItem = {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  createdAt: string;
};

export default function DocumentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiRequest<
        { documents?: DocumentItem[] } | { data?: { documents?: DocumentItem[] } }
      >("/api/documents");

      // Supports both wrapped and unwrapped API responses.
      const payload = "data" in response && response.data ? response.data : response;

      setDocuments(
        Array.isArray(payload?.documents) ? payload.documents : []
      );
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      setError(err instanceof Error ? err.message : "Could not load documents");
      // Existing documents state is preserved on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;

    setError("");
    setMessage("");
    setUploading(true);

    try {
      const allowedExtensions = [".pdf", ".txt", ".md", ".markdown"];

      for (const file of Array.from(files)) {
        const extension = file.name
          .toLowerCase()
          .slice(file.name.lastIndexOf("."));

        if (!allowedExtensions.includes(extension)) {
          throw new Error(`${file.name}: unsupported file type`);
        }

        const formData = new FormData();
        formData.append("file", file);

        await apiRequest("/api/documents", {
          method: "POST",
          body: formData,
        });
      }

      setMessage("Your document upload has been submitted.");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteDocument(id: string) {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      setError("");
      await apiRequest(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((current) => current.filter((doc) => doc._id !== id));
      setMessage("Document deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function formatSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Documents</h1>
          <p>Manage the documents used by your AI knowledge assistant.</p>
        </div>
        <button
          className="button"
          onClick={() => void loadDocuments()}
          disabled={loading}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="upload-zone">
        <FileUp size={32} color="#7c3aed" />
        <h3>Upload knowledge documents</h3>
        <p className="muted">
          Supported formats: PDF, TXT and Markdown
        </p>
        <button
          className="button button-primary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          multiple
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        {uploading && <p className="muted">Please wait while files upload...</p>}
      </div>

      {message && <div className="notice notice-success">{message}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      <section className="panel">
        <h2>Uploaded documents ({documents.length})</h2>

        {loading ? (
          <p className="muted">Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={30} />
            <p>No documents found. Upload your first document above.</p>
          </div>
        ) : (
          documents.map((doc) => (
            <div className="document-row" key={doc._id}>
              <FileText size={21} color="#7c3aed" />
              <div className="row-grow">
                <div className="row-title">{doc.originalName}</div>
                <div className="row-subtitle">
                  {formatSize(doc.size)} ·{" "}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span className={`status status-${doc.status}`}>
                {doc.status}
              </span>
              <button
                className="icon-button button-danger"
                onClick={() => void deleteDocument(doc._id)}
                title="Delete document"
                aria-label={`Delete ${doc.originalName}`}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}
