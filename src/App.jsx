import React, { useState, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Exams from './pages/Exams';
import Reports from './pages/Reports';
import Marksheets from './pages/Marksheets';
import Fees from './pages/Fees';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import Registration from './pages/Registration';
import ExamEntries from './pages/ExamEntries';
import LoginPage from './pages/LoginPage';
import PlanSelection from './pages/PlanSelection';
import PlanGate from './components/common/PlanGate';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { canAccessNav } from './lib/planConfig';
import logo from './assets/logo.jpg';

// Placeholder for Library
const Library = () => (
  <div style={{ padding: 20 }}>
    <h2 style={{ color: "#1B6B3A" }}>Library Management</h2>
    <p style={{ color: "#8A8FA8" }}>This module is currently being configured for your institution.</p>
  </div>
);

function App() {
  const {
    user, session, schoolConfig, plan, isLoading,
    needsRegistration, needsPlanSelection,
    updateSchoolConfig, updatePlan, signOut,
    setNeedsRegistration, setNeedsPlanSelection,
    fetchSchoolForUser,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchExams();
    }
  }, [schoolConfig?.id]);

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setExamsList(data || []);
    } catch (err) {
      console.error('Error fetching exams:', err);
    }
  };
  
  // Elevated Exam State
  const [examsList, setExamsList] = useState([]);
  const [marksData, setMarksData] = useState({});

  const navigation = [
    { id: "dashboard", label: "Dashboard", component: Dashboard },
    { id: "registration-form", label: "School Registration", component: Registration },
    { id: "school-info", label: "School Info", component: Settings, tab: "school" },
    { id: "streams-dorms", label: "Streams/Dorms", component: Settings, tab: "streams" },
    { id: "students", label: "Students & Admission", component: Students },
    { id: "teachers", label: "Staff & Teachers", component: Staff },
    { id: "exams", label: "Exam Settings", component: Exams, module: "Examinations" },
    { id: "exam-entries", label: "Exam Entries", component: ExamEntries, module: "Examinations" },
    { id: "reports", label: "Report Cards", component: Reports },
    { id: "merit-list", label: "Exam Marksheets", component: Marksheets },
    { id: "subjects", label: "Subjects", component: Settings, tab: "subjects", module: "Examinations" },
    { id: "grading", label: "Grading System", component: Settings, tab: "grading", module: "Examinations" },
    { id: "fees-structure", label: "Fee Structure", component: Settings, tab: "fees" },
    { id: "fees", label: "Fees Management", component: Fees },
    { id: "users", label: "Users Management", component: Settings, tab: "users" },
    { id: "library", label: "Library", component: Library, module: "Library" },
  ];

  const handleRegistrationComplete = async (formData) => {
    console.log("Starting school registration update...", formData);
    try {
      const dbPayload = {
        school_name: formData.schoolName,
        reg_number: formData.regNumber,
        county: formData.county,
        sub_county: formData.subCounty,
        email: user.email,
        phone: formData.phone,
        address: formData.address,
        school_type: formData.schoolType,
        activated_modules: formData.modules,
        plan: plan || 'starter',
        user_id: user.id,
      };

      console.log("Attempting Database Upsert for:", dbPayload.email);
      
      const { error } = await Promise.race([
        supabase.from('school_registrations').upsert([dbPayload], { onConflict: 'email' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout after 30 seconds')), 30000))
      ]);

      if (error) {
        console.error("Supabase Database Error:", error);
        if (error.code === '42501') {
           alert('Permission Denied: Please ensure you ran the SQL script in the Supabase Editor.');
        } else {
           alert('Database Error: ' + error.message);
        }
        throw error;
      }
      
      console.log("Success! Data saved. Verifying...");
      await fetchSchoolForUser(user);
      setActiveTab("dashboard");
    } catch (err) {
      console.error('Final Registration Catch:', err);
      if (err.message === 'Database timeout after 30 seconds') {
        alert('The database is not responding. Please check your internet connection or Supabase project status.');
      }
      throw err;
    }
  };

  const handlePlanSelected = async (planId) => {
    await updatePlan(planId);
    setNeedsPlanSelection(false);
    // If school doesn't exist yet, go to registration
    if (!schoolConfig) {
      setNeedsRegistration(true);
    }
  };

  // Filter navigation based on selected modules AND plan
  const filteredNav = navigation.filter(item => {
    if (!item.module) return true;
    return schoolConfig?.modules?.includes(item.module);
  });

  const activeNavLink = filteredNav.find(n => n.id === activeTab) || filteredNav[0];

  // Check if the active page is allowed by the plan
  const isPageAllowed = canAccessNav(plan, activeTab);

  const ActivePage = activeNavLink?.component || Dashboard;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handlePageChange = (tabId) => {
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f2eb" }}>
        <div className="spinner" style={{ width: 40, height: 40, border: "4px solid #e6dfd8", borderTop: "4px solid #1B6B3A", borderRadius: "50%" }}></div>
      </div>
    );
  }

  // --- Not Authenticated ---
  if (!session) {
    return <LoginPage />;
  }

  // --- Plan Selection (after signup, before registration) ---
  if (needsPlanSelection && !schoolConfig) {
    return <PlanSelection onSelectPlan={handlePlanSelected} />;
  }

  // --- School Registration (no school for this email yet) ---
  if (needsRegistration || !schoolConfig) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f5f2eb',
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* Minimal header with sign out */}
        <div style={{
          padding: '16px 32px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: '1px solid #e6dfd8', background: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="LOGIQ Logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
            <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 20, fontWeight: 700, color: '#2a2421' }}>
              LOGIQ
            </span>
          </div>
          <button onClick={signOut} style={{
            padding: '8px 16px', background: 'none', border: '1px solid #e6dfd8',
            borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#8a8fa8',
            cursor: 'pointer',
          }}>
            Sign Out
          </button>
        </div>
        <Registration
          onComplete={handleRegistrationComplete}
          schoolConfig={null}
          userEmail={user?.email}
        />
      </div>
    );
  }

  // --- Main Dashboard (Authenticated + Registered) ---
  return (
    <div 
      style={{ 
        display: "flex", 
        height: "100vh", 
        width: "100%",
        fontFamily: "'Inter', sans-serif", 
        background: "#f5f2eb", 
        overflow: "hidden",
        position: "relative"
      }}
    >
      {/* Mobile Backdrop */}
      <div 
        className={`overlay-backdrop ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      <Sidebar 
        activeId={activeTab} 
        onNavigate={handlePageChange} 
        schoolConfig={schoolConfig}
        currentPlan={plan}
        userEmail={user?.email}
        onSignOut={signOut}
        isMobile={window.innerWidth <= 768}
        isOpen={isSidebarOpen || isMobileMenuOpen}
        onClose={() => {
          setIsSidebarOpen(false);
          setIsMobileMenuOpen(false);
        }}
      />
      
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header 
          activePageLabel={activeNavLink?.label || 'Dashboard'}
          onMenuClick={toggleMobileMenu}
          userEmail={user?.email}
          currentPlan={plan}
          onSignOut={signOut}
        />
        
        <main 
          className="main-scroll main-content"
          style={{ 
            flex: 1, 
            overflowY: "auto", 
            padding: "32px 40px",
            scrollBehavior: "smooth",
            background: "#f5f2eb",
            fontFamily: "'Inter', sans-serif"
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {isPageAllowed ? (
              <ActivePage 
                schoolConfig={schoolConfig} 
                initialTab={activeNavLink?.tab} 
                examsList={examsList}
                setExamsList={setExamsList}
                marksData={marksData}
                setMarksData={setMarksData}
                currentPlan={plan}
                userEmail={user?.email}
                onComplete={handleRegistrationComplete}
              />
            ) : (
              <PlanGate
                currentPlan={plan}
                requiredPlan={
                  canAccessNav('professional', activeTab) ? 'professional' :
                  canAccessNav('enterprise', activeTab) ? 'enterprise' : 'professional'
                }
                featureName={activeNavLink?.label}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
