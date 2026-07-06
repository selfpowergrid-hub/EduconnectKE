import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Registration from './pages/Registration';
import LoginPage from './pages/LoginPage';
import ParentPortal from './pages/parent/ParentPortal';
import PlanGate from './components/common/PlanGate';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { canAccessNav } from './lib/planConfig';
import { MODULES, modulesForUser, navForModule, flatItemsForModule } from './lib/modules';
import logo from './assets/logo.jpg';

function App() {
  const {
    user, session, schoolConfig, plan, isLoading,
    needsRegistration, needsPlanSelection,
    role, teacherInfo,
    updateSchoolConfig, updatePlan, signOut,
    setNeedsRegistration, setNeedsPlanSelection,
    fetchSchoolForUser,
  } = useAuth();

  // Parent portal "session" — parents have no Supabase auth user; their lookup
  // result lives in sessionStorage for the tab and takes over the whole screen.
  const [parentSession, setParentSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('parent_session') || 'null'); }
    catch { return null; }
  });

  const handleParentLogin = (data) => {
    sessionStorage.setItem('parent_session', JSON.stringify(data));
    setParentSession(data);
  };

  const handleParentSignOut = () => {
    sessionStorage.removeItem('parent_session');
    setParentSession(null);
  };

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

  // --- Module shells ---
  // Which interface the user is in. Admin spans all modules and can switch;
  // other staff get exactly the module their app_role maps to (teacher ->
  // examination, bursar/accountant/auditor -> accounting).
  const navRole = role === 'teacher' ? (teacherInfo?.app_role || 'teacher') : 'admin';

  const availableModules = useMemo(
    () => modulesForUser({
      role: navRole,
      appRole: teacherInfo?.app_role,
      activatedModules: schoolConfig?.modules,
    }),
    [navRole, teacherInfo, schoolConfig?.modules]
  );

  const [activeModule, setActiveModule] = useState(() => localStorage.getItem('active_module') || null);

  // Keep the active module valid for whoever is signed in.
  useEffect(() => {
    if (!availableModules.length) return;
    if (!activeModule || !availableModules.includes(activeModule)) {
      setActiveModule(availableModules[0]);
    }
  }, [availableModules, activeModule]);

  const moduleKey = (activeModule && availableModules.includes(activeModule))
    ? activeModule
    : (availableModules[0] || 'examination');
  const moduleAccent = MODULES[moduleKey]?.accent || '#1B6B3A';

  const switchModule = (m) => {
    if (!availableModules.includes(m)) return;
    setActiveModule(m);
    localStorage.setItem('active_module', m);
    setActiveTab('dashboard');
  };

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



  // Nav for the active module, scoped to the user's role (registry handles the
  // module/role filtering that used to live here and in the Sidebar).
  const { dashboard: dashboardItem, sections: navSections } = navForModule(moduleKey, navRole);
  const flatItems = flatItemsForModule(moduleKey, navRole);
  const activeNavLink = flatItems.find(n => n.id === activeTab) || dashboardItem;

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

  // --- Parent Portal (separate from the admin/teacher Supabase session) ---
  // Checked before the auth spinner so parents never wait on Supabase auth init.
  if (parentSession) {
    return <ParentPortal data={parentSession} onSignOut={handleParentSignOut} />;
  }

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
    return <LoginPage onParentLogin={handleParentLogin} />;
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
          dashboardItem={dashboardItem}
          navSections={navSections}
          accent={moduleAccent}
          availableModules={availableModules}
          activeModule={moduleKey}
          onSwitchModule={switchModule}
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
