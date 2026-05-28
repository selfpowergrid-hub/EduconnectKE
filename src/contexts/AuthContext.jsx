import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [schoolConfig, setSchoolConfig] = useState(null);
  const [plan, setPlan] = useState('starter');
  const [isLoading, setIsLoading] = useState(true);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [needsPlanSelection, setNeedsPlanSelection] = useState(false);
  const [role, setRole] = useState(null); // 'admin' | 'teacher' | null
  const [teacherInfo, setTeacherInfo] = useState(null); // { staff_id, full_name, assignments[] }

  const userRef = useRef(null);

  // Keep ref in sync with user state to avoid stale closure in auth listener
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Fetch school data for the authenticated user
  const fetchSchoolForUser = async (authUser) => {
    if (!authUser?.email) return;
    
    try {
      // Look up school by the user's email with a timeout
      const { data, error } = await Promise.race([
        supabase
          .from('school_registrations')
          .select('*')
          .eq('email', authUser.email)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('School lookup timed out')), 15000)
        )
      ]);

      if (error && error.code === 'PGRST116') {
        // Not an admin (no school registered to this email).
        // Try the teacher path: do we have a staff row with auth_user_id = this user?
        const teacher = await loadTeacherContext(authUser);
        if (teacher) return;

        // Neither admin nor teacher — user needs to register a school.
        setRole(null);
        setTeacherInfo(null);
        setNeedsRegistration(true);
        setNeedsPlanSelection(false);
        setSchoolConfig(null);
        setPlan('starter');
        return;
      }

      if (error) throw error;

      if (data) {
        const config = {
          id: data.id,
          schoolName: data.school_name,
          regNumber: data.reg_number,
          county: data.county,
          subCounty: data.sub_county,
          email: data.email,
          phone: data.phone,
          address: data.address,
          schoolType: data.school_type,
          modules: data.activated_modules,
          totalStudents: data.total_students,
          subscriptionCost: data.subscription_cost,
          login_code: data.login_code,
        };
        setSchoolConfig(config);
        setPlan(data.plan || 'starter');
        setRole('admin');
        setTeacherInfo(null);
        setNeedsRegistration(false);
        setNeedsPlanSelection(false);
      }
    } catch (err) {
      console.error('Error fetching school for user:', err);
    }
  };

  // Resolve a teacher's school + assignments from their auth.user
  const loadTeacherContext = async (authUser) => {
    try {
      const { data: staffRow, error: staffErr } = await supabase
        .from('staff')
        .select('id, full_name, school_id, email')
        .eq('auth_user_id', authUser.id)
        .single();
      if (staffErr || !staffRow) return false;

      const { data: schoolRow, error: schoolErr } = await supabase
        .from('school_registrations')
        .select('*')
        .eq('id', staffRow.school_id)
        .single();
      if (schoolErr || !schoolRow) return false;

      const { data: assigns } = await supabase
        .from('teacher_assignments')
        .select('*')
        .eq('teacher_staff_id', staffRow.id);

      setSchoolConfig({
        id: schoolRow.id,
        schoolName: schoolRow.school_name,
        regNumber: schoolRow.reg_number,
        county: schoolRow.county,
        subCounty: schoolRow.sub_county,
        email: schoolRow.email,
        phone: schoolRow.phone,
        address: schoolRow.address,
        schoolType: schoolRow.school_type,
        modules: schoolRow.activated_modules,
        totalStudents: schoolRow.total_students,
        subscriptionCost: schoolRow.subscription_cost,
        login_code: schoolRow.login_code,
      });
      setPlan(schoolRow.plan || 'starter');
      setRole('teacher');
      setTeacherInfo({
        staff_id: staffRow.id,
        full_name: staffRow.full_name,
        email: staffRow.email,
        assignments: assigns || [],
      });
      setNeedsRegistration(false);
      setNeedsPlanSelection(false);
      return true;
    } catch (err) {
      console.error('Teacher context load failed:', err);
      return false;
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    // Safety timeout: if auth takes more than 10 seconds, stop loading
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    // Get the initial session
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchSchoolForUser(s.user).finally(() => {
            setIsLoading(false);
            clearTimeout(timeout);
          });
        } else {
          setIsLoading(false);
          clearTimeout(timeout);
        }
      })
      .catch(err => {
        console.error('Initial session fetch error:', err);
        setIsLoading(false);
        clearTimeout(timeout);
      });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        console.log('Auth event:', event);
        
        // Only show full-screen loader if we are transitioning from unauthenticated to authenticated
        // This prevents the screen from going blank when the tab is refocused and Supabase refreshes the session
        const isNewLogin = !userRef.current && s?.user;
        if (event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && isNewLogin)) {
          setIsLoading(true);
        }

        try {
          setSession(s);
          setUser(s?.user ?? null);
          
          if (s?.user) {
            await fetchSchoolForUser(s.user);
          } else {
            setSchoolConfig(null);
            setPlan('starter');
            setNeedsRegistration(false);
            setNeedsPlanSelection(false);
            setRole(null);
            setTeacherInfo(null);
          }
        } catch (err) {
          console.error('Error in auth state change handler:', err);
        } finally {
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setSchoolConfig(null);
    setPlan('starter');
    setNeedsRegistration(false);
    setNeedsPlanSelection(false);
    setRole(null);
    setTeacherInfo(null);
  };

  const updateSchoolConfig = (config) => {
    setSchoolConfig(config);
    setNeedsRegistration(false);
    setNeedsPlanSelection(false);
  };

  const updatePlan = async (newPlan) => {
    setPlan(newPlan);
    if (schoolConfig?.id) {
      await supabase
        .from('school_registrations')
        .update({ plan: newPlan })
        .eq('id', schoolConfig.id);
    }
  };

  const value = {
    session,
    user,
    schoolConfig,
    plan,
    isLoading,
    needsRegistration,
    needsPlanSelection,
    role,
    teacherInfo,
    signOut,
    updateSchoolConfig,
    updatePlan,
    setNeedsRegistration,
    setNeedsPlanSelection,
    fetchSchoolForUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
