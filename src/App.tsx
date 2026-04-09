import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Workspace from "@/pages/Workspace";
import DocumentView from "@/pages/DocumentView";
import SessionSelector from "@/pages/SessionSelector";
import SessionWorkspace from "@/pages/SessionWorkspace";
import { WorkflowEngine } from "@/lib/workflowEngine";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/workspace/:docId" element={<DocumentView />} />
          <Route path="/sessions" element={<SessionSelector />} />
          <Route path="/session/:sessionId" element={<SessionWorkspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
