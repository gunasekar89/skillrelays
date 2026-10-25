import { Navigate, Route, Routes } from "react-router-dom";
import { Bot, FileText, GraduationCap, LayoutDashboard, Mic, NotebookPen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import Home from "./pages/Home";
import Login from "./pages/Login";
import StudentDashboard from "./pages/student/Dashboard";
import MockInterview from "./pages/student/MockInterview";
import Results from "./pages/student/Results";
import OrgDashboard from "./pages/enterprise/Dashboard";
import KtSession from "./pages/enterprise/KtSession";
import Content from "./pages/enterprise/Content";
import Learn from "./pages/enterprise/Learn";
import Assistant from "./pages/enterprise/Assistant";
import Notes from "./pages/Notes";

const studentNav = [
  { to: "/student", label: "Home", icon: <LayoutDashboard />, end: true },
  { to: "/student/notes", label: "My notes", icon: <NotebookPen /> },
  // Kept from the interview-first version; the student product is now study-first.
  { to: "/student/interview", label: "Speaking practice", icon: <Mic /> },
];

const enterpriseNav = [
  { to: "/enterprise", label: "Dashboard", icon: <LayoutDashboard />, end: true },
  { to: "/enterprise/kt", label: "KT Sessions", icon: <Mic /> },
  { to: "/enterprise/content", label: "Training Content", icon: <FileText /> },
  { to: "/enterprise/assistant", label: "AI Assistant", icon: <Bot /> },
  { to: "/enterprise/notes", label: "AI Notes", icon: <NotebookPen /> },
  { to: "/enterprise/learn", label: "Employee Quiz", icon: <GraduationCap /> },
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell nav={studentNav} user={{ name: "Sneha", role: "Student" }} context="Student" />}>
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/interview" element={<MockInterview />} />
        <Route path="/student/results" element={<Results />} />
        <Route path="/student/notes" element={<Notes />} />
      </Route>
      <Route element={<AppShell nav={enterpriseNav} user={{ name: "Rajesh", role: "Org Admin" }} context="Acme Technologies" />}>
        <Route path="/enterprise" element={<OrgDashboard />} />
        <Route path="/enterprise/kt" element={<KtSession />} />
        <Route path="/enterprise/content" element={<Content />} />
        <Route path="/enterprise/assistant" element={<Assistant />} />
        <Route path="/enterprise/notes" element={<Notes />} />
        <Route path="/enterprise/learn" element={<Learn />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

