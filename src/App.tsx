import { Routes, Route, Navigate } from "react-router-dom";
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatRoutes } from "@/pages/ChatRoutes";

export default function App() {
  return (
    <ChatProvider>
      <Routes>
        <Route path="/chat/*" element={<ChatRoutes />} />
        <Route path="*" element={<Navigate to="/chat/new" replace />} />
      </Routes>
    </ChatProvider>
  );
}
