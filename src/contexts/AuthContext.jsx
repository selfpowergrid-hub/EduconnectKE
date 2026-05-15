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
        // No school found for this email — user needs to register
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
        };
        setSchoolConfig(config);
        setPlan(data.plan || 'starter');
        setNeedsRegistration(false);
        setNeedsPlanSelection(false);
      }
    } catch (err) {
      console.error('Error fetching school for user:', err);
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
