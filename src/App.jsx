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
import TeacherAllocations from './pages/TeacherAllocations';
import LoginPage from './pages/LoginPage';
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
    role, teacherInfo,
    updateSchoolConfig, updatePlan, signOut,
    setNeedsRegistration, setNeedsPlanSelection,
    fetchSchoolForUser,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Focus mode is page-local — reset it whenever the user switches pages
  useEffect(() => { setFocusMode(false); }, [activeTab]);

  // State for metrics
  const [studentCount, setStudentCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchExams();
      fetchMetrics();
    }
  }, [schoolConfig?.id]);

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setExamsList(data || []);
    } catch (err) {
      console.error('Error fetching exams:', err);
    }
  };

  const fetchMetrics = async () => {
    try {
      // Fetch student count
      const { count: sCount, error: sError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolConfig.id);
      
      if (sError) throw sError;
      setStudentCount(sCount || 0);

      // Fetch staff count
      const { count: stCount, error: stError } = await supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolConfig.id);
      
      if (stError) throw stError;
      setStaffCount(stCount || 0);
    } catch (err) {
      console.error('Error fetching metrics:', err);
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
    { id: "teacher-allocations", label: "Teacher Allocations", component: TeacherAllocations },
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
      const students = parseInt(formData.totalStudents) || 0;
      const cost = students <= 300 
        ? students * 35 
        : (300 * 35) + (students - 300) * 20;

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
        plan: 'enterprise',
        user_id: user.id,
        total_students: students,
        subscription_cost: cost,
      };

      // First-time onboarding: honour the school code the admin picked at
      // signup. On subsequent saves we leave login_code untouched so a code
      // changed later (via Teacher Allocations) is not clobbered.
      if (!schoolConfig?.login_code) {
        const chosen = user?.user_metadata?.school_login_code;
        if (chosen) dbPayload.login_code = chosen;
      }

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



  // Teachers see only a narrow subset of pages.
  const TEACHER_ALLOWED_NAV = new Set([
    'students',       // read-only, scoped to their classes
    'exam-entries',   // their subject + classes only
    'reports',        // read-only, their classes
    'merit-list',     // read-only, their classes
  ]);

  // Filter navigation based on role, selected modules, AND plan
  const filteredNav = navigation.filter(item => {
    if (role === 'teacher' && !TEACHER_ALLOWED_NAV.has(item.id)) return false;
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

      {!focusMode && (
        <Sidebar
          activeId={activeTab}
          onNavigate={handlePageChange}
          schoolConfig={schoolConfig}
          currentPlan={plan}
          userEmail={user?.email}
          onSignOut={signOut}
          isMobile={window.innerWidth <= 768}
          isOpen={isSidebarOpen || isMobileMenuOpen}
          role={role}
          onClose={() => {
            setIsSidebarOpen(false);
            setIsMobileMenuOpen(false);
          }}
        />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!focusMode && (
          <Header
            activePageLabel={activeNavLink?.label || 'Dashboard'}
            onMenuClick={toggleMobileMenu}
            userEmail={user?.email}
            currentPlan={plan}
            onSignOut={signOut}
            studentCount={studentCount}
          />
        )}

        <main
          className="main-scroll main-content"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: focusMode ? "12px 16px" : "32px 40px",
            scrollBehavior: "smooth",
            background: "#f5f2eb",
            fontFamily: "'Inter', sans-serif"
          }}
        >
          <div style={{ maxWidth: focusMode ? '100%' : 1200, margin: "0 auto" }}>
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
                studentCount={studentCount}
                staffCount={staffCount}
                role={role}
                teacherInfo={teacherInfo}
                focusMode={focusMode}
                setFocusMode={setFocusMode}
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
