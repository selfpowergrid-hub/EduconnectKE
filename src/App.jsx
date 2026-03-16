import React, { useState } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Exams from './pages/Exams';
import Reports from './pages/Reports';
import Fees from './pages/Fees';
import Staff from './pages/Staff';
import Settings from './pages/Settings';

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navigation = [
    { id: "dashboard", label: "Dashboard", component: Dashboard },
    { id: "students", label: "Students & Admission", component: Students },
    { id: "exams", label: "Examinations", component: Exams },
    { id: "reports", label: "Report Cards", component: Reports },
    { id: "fees", label: "Fees Management", component: Fees },
    { id: "teachers", label: "Staff & Teachers", component: Staff },
    { id: "settings", label: "School Settings", component: Settings },
  ];

  const activeNavLink = navigation.find(n => n.id === activeTab) || navigation[0];
  const ActivePage = activeNavLink.component;

  return (
    <div 
      style={{ 
        display: "flex", 
        height: "100vh", 
        fontFamily: "'DM Sans', sans-serif", 
        background: "#F0F2F5", 
        overflow: "hidden" 
      }}
    >
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarOpen} 
        setIsCollapsed={setIsSidebarOpen} 
      />
      
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header activeTabLabel={activeNavLink.label} />
        
        <main 
          style={{ 
            flex: 1, 
            overflowY: "auto", 
            padding: "20px 24px",
            scrollBehavior: "smooth"
          }}
          className="main-scroll"
        >
          <ActivePage />
        </main>
      </div>
    </div>
  );
}

export default App;
