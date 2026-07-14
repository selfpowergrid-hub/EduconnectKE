import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSXLib from 'xlsx';
import { CLASSES, FEE_STRUCTURE, ACADEMIC_GRADES, getClassesByType } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import SchoolCodeCard from '../components/school/SchoolCodeCard';

const Settings = ({ schoolConfig, initialTab }) => {
  const { updateSchoolConfig } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab || "school");
  const [isLoading, setIsLoading] = useState(false);

  // Level → its classes, scoped to what this school actually teaches. Drives
  // the grading-system and fee-structure level/grade pickers.
  const scopedLevelClasses = useMemo(() => {
    const scoped = getClassesByType(schoolConfig?.schoolType);
    return {
      "Pre-Primary": scoped.filter(c => c.id.startsWith("pp")),
      "Primary": scoped.filter(c => c.type === "Primary" && !c.id.startsWith("pp")),
      "Junior Secondary": scoped.filter(c => c.type === "JSS"),
      "Senior Secondary": scoped.filter(c => c.type === "Secondary"),
    };
  }, [schoolConfig?.schoolType]);
  const scopedLevelNames = useMemo(
    () => Object.keys(scopedLevelClasses).filter(l => scopedLevelClasses[l].length > 0),
    [scopedLevelClasses]
  );

  // School Information state
  const [schoolInfo, setSchoolInfo] = useState({
    motto: "",
    vision: "",
    mission: "",
    principal_name: "",
    website: "",
    logo_url: ""
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSchoolInfo();
      fetchStreams();
      fetchDorms();
      fetchSubjects();
      fetchGradingSystems();
      fetchVoteheads();
    }
  }, [schoolConfig?.id]);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolConfig.id);
      if (error) throw error;
      
      // Re-structure data into the subjectsByGrade format
      const subjectsMap = {};
      data.forEach(sub => {
        if (!subjectsMap[sub.level_category]) subjectsMap[sub.level_category] = [];
        subjectsMap[sub.level_category].push({
          id: sub.id,
          name: sub.name,
          code: sub.code,
          type: sub.type
        });
      });
      setSubjectsByGrade(prev => ({ ...prev, ...subjectsMap }));
    } catch (err) {
      console.error('Error fetching subjects:', err);
    }
  };

  const fetchGradingSystems = async () => {
    try {
      const { data, error } = await supabase
        .from('grading_systems')
        .select('*')
        .eq('school_id', schoolConfig.id);
      if (error) throw error;
      setGradesList(data || []);
    } catch (err) {
      console.error('Error fetching grading:', err);
    }
  };

  const fetchSchoolInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('school_information')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"
      if (data) {
        setSchoolInfo(data);
        if (data.logo_url) setLogoPreview(data.logo_url);
      }
    } catch (err) {
      console.error('Error fetching school info:', err);
    }
  };

  const [schoolLevels, setSchoolLevels] = useState({
    primary: schoolConfig?.schoolType === "Primary & JSS" || schoolConfig?.schoolType === "Primary" || schoolConfig?.schoolType === "All Levels",
    senior: schoolConfig?.schoolType === "Secondary" || schoolConfig?.schoolType === "SS" || schoolConfig?.schoolType === "Senior Secondary" || schoolConfig?.schoolType === "All Levels"
  });
  const [logoPreview, setLogoPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Streams & Dorms state
  const [streams, setStreams] = useState([]);
  const [newStreamName, setNewStreamName] = useState("");
  const [newStreamCapacity, setNewStreamCapacity] = useState("");

  const [dorms, setDorms] = useState([]);
  const [newDormName, setNewDormName] = useState("");
  const [newDormCapacity, setNewDormCapacity] = useState("");
  const [newDormGender, setNewDormGender] = useState("Mixed");
  const [streamsExpanded, setStreamsExpanded] = useState(false);
  const [dormsExpanded, setDormsExpanded] = useState(false);

  const fetchStreams = async () => {
    try {
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setStreams(data || []);
    } catch (err) {
      console.error('Error fetching streams:', err);
    }
  };

  const fetchDorms = async () => {
    try {
      const { data, error } = await supabase
        .from('dorms')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setDorms(data || []);
    } catch (err) {
      console.error('Error fetching dorms:', err);
    }
  };

  const handleAddStream = async () => {
    if (!newStreamName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('streams')
        .insert([{
          school_id: schoolConfig.id,
          name: newStreamName,
          capacity: parseInt(newStreamCapacity) || 45
        }])
        .select()
        .single();

      if (error) throw error;
      setStreams(prev => [...prev, data]);
      setNewStreamName("");
      setNewStreamCapacity("");
    } catch (err) {
      alert('Failed to add stream: ' + err.message);
    }
  };

  const handleAddDorm = async () => {
    if (!newDormName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('dorms')
        .insert([{
          school_id: schoolConfig.id,
          name: newDormName,
          capacity: parseInt(newDormCapacity) || 60,
          gender: newDormGender
        }])
        .select()
        .single();

      if (error) throw error;
      setDorms(prev => [...prev, data]);
      setNewDormName("");
      setNewDormCapacity("");
      setNewDormGender("Mixed");
    } catch (err) {
      alert('Failed to add dorm: ' + err.message);
    }
  };

  const handleDeleteStream = async (id) => {
    if (!confirm('Are you sure you want to delete this stream?')) return;
    try {
      const { error } = await supabase
        .from('streams')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setStreams(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete stream: ' + err.message);
    }
  };

  const handleDeleteDorm = async (id) => {
    if (!confirm('Are you sure you want to delete this dorm?')) return;
    try {
      const { error } = await supabase
        .from('dorms')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setDorms(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert('Failed to delete dorm: ' + err.message);
    }
  };

  // Institutional levels → the single school_type value stored on the school.
  const levelsToSchoolType = ({ primary, senior }) => {
    if (primary && senior) return "All Levels";
    if (senior) return "Secondary";
    return "Primary & JSS";
  };

  const handleSaveSchoolInfo = async () => {
    setIsLoading(true);
    try {
      const payload = {
        school_id: schoolConfig.id,
        ...schoolInfo,
        logo_url: logoPreview || schoolInfo.logo_url
      };

      const { error } = await Promise.race([
        supabase.from('school_information').upsert(payload, { onConflict: 'school_id' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout after 15 seconds')), 15000))
      ]);

      if (error) {
        if (error.code === '42501') {
          throw new Error('Permission Denied (RLS): You do not have permission to update this school\'s information.');
        }
        throw error;
      }

      // Persist the institutional levels (school_type) and refresh the in-memory
      // config so every scoped grade dropdown updates immediately.
      const nextSchoolType = levelsToSchoolType(schoolLevels);
      if (nextSchoolType !== schoolConfig.schoolType) {
        const { error: typeErr } = await supabase
          .from('school_registrations')
          .update({ school_type: nextSchoolType })
          .eq('id', schoolConfig.id);
        if (typeErr) throw typeErr;
        updateSchoolConfig({ ...schoolConfig, schoolType: nextSchoolType });
      }

      alert('School information saved successfully!');
    } catch (err) {
      alert('Failed to save school info: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Grading System state
  const [gradingLevel, setGradingLevel] = useState(() => {
    const scoped = getClassesByType(schoolConfig?.schoolType);
    if (scoped.some(c => c.type === "JSS")) return "Junior Secondary";
    if (scoped.some(c => c.type === "Secondary")) return "Senior Secondary";
    if (scoped.some(c => c.type === "Primary" && !c.id.startsWith("pp"))) return "Primary";
    return "Pre-Primary";
  });
  const [selectedGradingGrade, setSelectedGradingGrade] = useState("");
  const [gradingExpanded, setGradingExpanded] = useState(false);
  const [gradesList, setGradesList] = useState([]);

  const [newGrade, setNewGrade] = useState({ grade: "", description: "", min: "", max: "", points: "" });

  const handleAddGrade = async () => {
    if (!newGrade.grade.trim()) return;
    try {
      const payload = {
        school_id: schoolConfig.id,
        school_level: gradingLevel,
        school_grade: selectedGradingGrade || "All",
        grade: newGrade.grade,
        description: newGrade.description,
        min_score: parseInt(newGrade.min) || 0,
        max_score: parseInt(newGrade.max) || 0,
        points: parseInt(newGrade.points) || 0
      };

      const { data, error } = await supabase
        .from('grading_systems')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      
      setGradesList(prev => [...prev, data]);
      setNewGrade({ grade: "", description: "", min: "", max: "", points: "" });
    } catch (err) {
      alert('Failed to add grade: ' + err.message);
    }
  };

  const removeGrade = async (id) => {
    try {
      const { error } = await supabase
        .from('grading_systems')
        .delete()
        .eq('id', id);
      if (error) throw error;

      setGradesList(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      alert('Failed to remove grade: ' + err.message);
    }
  };

  const getBadgeColors = (grade) => {
    const g = grade.toUpperCase();
    if (g.startsWith("EE") || g.startsWith("A") || g === "B+") return { bg: "#E8F5EE", text: "#D4AF37" };
    if (g.startsWith("ME") || g === "B" || g === "B-" || g === "C+") return { bg: "#f5f2eb", text: "#2a2421" };
    if (g.startsWith("AE") || g === "C" || g === "C-" || g === "D+") return { bg: "#FEF0E6", text: "#D35400" };
    return { bg: "#FCE8E8", text: "#C0392B" }; // BE, D, D-, E
  };

  // Subjects state
  const [subjectLevel, setSubjectLevel] = useState(() => {
    const scoped = getClassesByType(schoolConfig?.schoolType);
    if (scoped.some(c => c.type === "Primary" && !c.id.startsWith("pp"))) return "Primary";
    if (scoped.some(c => c.type === "JSS")) return "Junior Secondary";
    if (scoped.some(c => c.type === "Secondary")) return "Senior Secondary";
    return "Pre-Primary";
  });
  const [selectedSubjectGrade, setSelectedSubjectGrade] = useState("");
  const [subjectsExpanded, setSubjectsExpanded] = useState(false);

  // Initialize subjects per grade
  const initialSubjectsByGrade = {};
  CLASSES.forEach(c => {
    if (c.id.startsWith("pp")) initialSubjectsByGrade[c.id] = [
      { id: 1, name: "Language Activities", code: "LANG", type: "Core" },
      { id: 2, name: "Mathematical Activities", code: "MATH", type: "Core" },
      { id: 3, name: "Environmental Activities", code: "ENV", type: "Core" },
      { id: 4, name: "Psychomotor & Creative Activities", code: "PCA", type: "Core" },
      { id: 5, name: "Religious Education", code: "RE", type: "Core" },
    ];
    else if (["p1", "p2", "p3"].includes(c.id)) initialSubjectsByGrade[c.id] = [
      { id: 1, name: "English", code: "ENG", type: "Core" },
      { id: 2, name: "Kiswahili / KSL", code: "KIS", type: "Core" },
      { id: 3, name: "Mathematical Activities", code: "MATH", type: "Core" },
      { id: 4, name: "Environmental Activities", code: "ENV", type: "Core" },
      { id: 5, name: "Movement & Creative Activities", code: "MCA", type: "Core" },
      { id: 6, name: "Religious Education", code: "RE", type: "Core" },
      { id: 7, name: "Indigenous Language", code: "IND", type: "Optional" },
    ];
    else if (["p4", "p5", "p6", "p7", "p8"].includes(c.id)) initialSubjectsByGrade[c.id] = [
      { id: 1, name: "English", code: "ENG", type: "Core" },
      { id: 2, name: "Kiswahili / KSL", code: "KIS", type: "Core" },
      { id: 3, name: "Mathematics", code: "MATH", type: "Core" },
      { id: 4, name: "Science & Technology", code: "SCT", type: "Core" },
      { id: 5, name: "Agriculture & Nutrition", code: "AGN", type: "Core" },
      { id: 6, name: "Social Studies", code: "SST", type: "Core" },
      { id: 7, name: "Religious Education", code: "RE", type: "Core" },
      { id: 8, name: "Creative Arts & Sports", code: "CAS", type: "Core" },
    ];
    else if (c.type === "JSS") initialSubjectsByGrade[c.id] = [
      { id: 1, name: "English", code: "ENG", type: "Core" },
      { id: 2, name: "Kiswahili / KSL", code: "KIS", type: "Core" },
      { id: 3, name: "Mathematics", code: "MATH", type: "Core" },
      { id: 4, name: "Integrated Science", code: "ISC", type: "Core" },
      { id: 5, name: "Health Education", code: "HE", type: "Core" },
      { id: 6, name: "Pre-Tech & Pre-Career Education", code: "PTE", type: "Core" },
      { id: 7, name: "Social Studies", code: "SST", type: "Core" },
      { id: 8, name: "Religious Education", code: "RE", type: "Core" },
      { id: 9, name: "Business Studies", code: "BST", type: "Core" },
    ];
    else if (c.type === "SS") initialSubjectsByGrade[c.id] = [
      { id: 1, name: "English", code: "ENG", type: "Compulsory" },
      { id: 2, name: "Kiswahili / KSL", code: "KIS", type: "Compulsory" },
      { id: 3, name: "Core Mathematics", code: "CMATH", type: "Compulsory" },
      { id: 4, name: "Essential Mathematics", code: "EMATH", type: "Compulsory" },
      { id: 5, name: "Community Service Learning", code: "CSL", type: "Compulsory" },
      { id: 6, name: "Physical Education (PE)", code: "PE", type: "Elective" },
      { id: 7, name: "ICT", code: "ICT", type: "Elective" },
    ];
  });

  const [subjectsByGrade, setSubjectsByGrade] = useState({});
  const [newSubject, setNewSubject] = useState({ name: "", code: "", type: "Core" });

  const handleAddSubject = async () => {
    if (!newSubject.name.trim() || !selectedSubjectGrade) return;
    try {
      const payload = {
        school_id: schoolConfig.id,
        name: newSubject.name,
        code: newSubject.code,
        level_category: selectedSubjectGrade,
        type: newSubject.type
      };

      const { data, error } = await supabase
        .from('subjects')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      
      setSubjectsByGrade(prev => ({
        ...prev,
        [selectedSubjectGrade]: [...(prev[selectedSubjectGrade] || []), {
          id: data.id,
          name: data.name,
          code: data.code,
          type: data.type
        }]
      }));
      
      setNewSubject({ name: "", code: "", type: subjectLevel === "sss" ? "Compulsory" : "Core" });
    } catch (err) {
      alert('Failed to add subject: ' + err.message);
    }
  };

  const removeSubject = async (id, gradeId) => {
    try {
      const { error } = await supabase
        .from('subjects')
        .delete()
        .eq('id', id);
      if (error) throw error;

      setSubjectsByGrade(prev => ({
        ...prev,
        [gradeId]: prev[gradeId].filter(s => s.id !== id)
      }));
    } catch (err) {
      alert('Failed to remove subject: ' + err.message);
    }
  };

  // --- User Management State ---
  const [userTab, setUserTab] = useState("roster"); // 'roster' | 'roles'
  const [systemUsers, setSystemUsers] = useState([
    { id: 1, name: "Admin User", email: "admin@mwanga.ac.ke", role: "System Admin", status: "Active", phases: ["All"] },
    { id: 2, name: "Jane Doe", email: "jdoe@mwanga.ac.ke", role: "Teacher", status: "Active", phases: ["lower_pri", "upper_pri"] },
    { id: 3, name: "John Smith", email: "jsmith@mwanga.ac.ke", role: "Teacher", status: "Suspended", phases: ["jss"] },
    { id: 4, name: "Mary Kamau", email: "mkamau@mwanga.ac.ke", role: "Bursar", status: "Active", phases: ["All"] }
  ]);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "Teacher" });

  const [activeRoleEdit, setActiveRoleEdit] = useState("Teacher");
  const [userRolesConfig, setUserRolesConfig] = useState({
    "System Admin": {
      modules: {
        dashboard: { view: true, edit: true, delete: true },
        students: { view: true, edit: true, delete: true },
        exams: { view: true, edit: true, delete: true },
        reports: { view: true, edit: true, delete: true },
        fees: { view: true, edit: true, delete: true },
        teachers: { view: true, edit: true, delete: true },
        settings: { view: true, edit: true, delete: true }
      },
      phases: ["pp", "lower_pri", "upper_pri", "jss", "sss"]
    },
    "Bursar": {
      modules: {
        dashboard: { view: true, edit: false, delete: false },
        students: { view: true, edit: false, delete: false },
        exams: { view: false, edit: false, delete: false },
        reports: { view: false, edit: false, delete: false },
        fees: { view: true, edit: true, delete: true },
        teachers: { view: true, edit: false, delete: false },
        settings: { view: false, edit: false, delete: false }
      },
      phases: ["pp", "lower_pri", "upper_pri", "jss", "sss"]
    },
    "Teacher": {
      modules: {
        dashboard: { view: true, edit: false, delete: false },
        students: { view: true, edit: false, delete: false },
        exams: { view: true, edit: true, delete: false },
        reports: { view: true, edit: true, delete: false },
        fees: { view: false, edit: false, delete: false },
        teachers: { view: false, edit: false, delete: false },
        settings: { view: false, edit: false, delete: false }
      },
      phases: ["upper_pri"]
    }
  });

  const handleAddUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    setSystemUsers(prev => [...prev, { id: Date.now(), ...newUser, status: "Active", phases: newUser.role === "Teacher" ? ["jss"] : ["All"] }]);
    setNewUser({ name: "", email: "", role: "Teacher" });
  };

  const removeUser = (id) => setSystemUsers(prev => prev.filter(u => u.id !== id));
  
  const toggleUserStatus = (id) => {
    setSystemUsers(prev => prev.map(u => {
      if(u.id === id) return { ...u, status: u.status === "Active" ? "Suspended" : "Active" };
      return u;
    }));
  };

  const handleTogglePermission = (role, moduleKey, actionKey) => {
    setUserRolesConfig(prev => {
      const roleConfig = prev[role];
      const updatedModule = { ...roleConfig.modules[moduleKey], [actionKey]: !roleConfig.modules[moduleKey][actionKey] };
      return {
        ...prev,
        [role]: { ...roleConfig, modules: { ...roleConfig.modules, [moduleKey]: updatedModule } }
      };
    });
  };

  const handleTogglePhase = (role, phaseKey) => {
    setUserRolesConfig(prev => {
      const roleConfig = prev[role];
      const currentPhases = roleConfig.phases;
      const updatedPhases = currentPhases.includes(phaseKey) 
        ? currentPhases.filter(p => p !== phaseKey)
        : [...currentPhases, phaseKey];
      return {
        ...prev,
        [role]: { ...roleConfig, phases: updatedPhases }
      };
    });
  };
  // ------------------------------

  // --- Fee Structure State ---
  // voteheads + feeStructures are loaded from / persisted to Supabase.
  const [voteheads, setVoteheads] = useState([]);
  const [newVotehead, setNewVotehead] = useState({ code: "", description: "", applies_to: "all" });

  // Fee Structure has two sub-tabs: the votehead catalog and level pricing.
  const [feeSubTab, setFeeSubTab] = useState("voteheads");

  // Inline votehead editing (rename / re-scope).
  const [editingVoteheadId, setEditingVoteheadId] = useState(null);
  const [voteheadEdit, setVoteheadEdit] = useState({ code: "", description: "", applies_to: "all" });

  // Human labels for votehead scoping (who gets billed).
  const APPLIES_TO_LABEL = { all: "All students", boarders: "Boarders only", day: "Day scholars only" };
  const APPLIES_TO_BADGE = {
    all: { bg: "#EEF1F4", fg: "#4A4A6A", icon: "👥", text: "All students" },
    boarders: { bg: "#EAF2FA", fg: "#1A5F9C", icon: "🛏", text: "Boarders" },
    day: { bg: "#FEF6E7", fg: "#8A6A1F", icon: "☀", text: "Day scholars" },
  };

  // Pricing is keyed per GRADE × CATEGORY: "g10|all", "g10|<categoryId>", ...
  // Each item: { id (fee_structure id), voteheadId, t1, t2, t3, status }
  const [feeStructures, setFeeStructures] = useState({});
  const [pricingBand, setPricingBand] = useState("sss");   // display grouping
  const [activeGrade, setActiveGrade] = useState("g10");   // the priced grade
  const [activeCategory, setActiveCategory] = useState("all"); // 'all' | category id
  const [feeCategories, setFeeCategories] = useState([]);  // Day/Boarder + specials
  const [feeYear, setFeeYear] = useState(new Date().getFullYear());

  // CBC bands drive the Level -> Grade selection.
  const PRICING_BANDS = {
    pp:        { label: "Pre-Primary",       grades: ["pp1", "pp2"] },
    lower_pri: { label: "Lower Primary",     grades: ["g1", "g2", "g3"] },
    upper_pri: { label: "Upper Primary",     grades: ["g4", "g5", "g6"] },
    jss:       { label: "Junior Secondary",  grades: ["g7", "g8", "g9"] },
    sss:       { label: "Senior Secondary",  grades: ["g10", "g11", "g12", "f3", "f4"] },
  };
  const GRADE_LABELS = {
    pp1: "PP1", pp2: "PP2",
    g1: "Grade 1", g2: "Grade 2", g3: "Grade 3", g4: "Grade 4", g5: "Grade 5", g6: "Grade 6",
    g7: "Grade 7", g8: "Grade 8", g9: "Grade 9", g10: "Grade 10", g11: "Grade 11", g12: "Grade 12",
    f3: "Form 3", f4: "Form 4",
  };
  const CATEGORY_ICON = { day: "☀", boarder: "🛏", special: "⭐" };
  const sheetKey = (grade, cat) => `${grade}|${cat || 'all'}`;

  const fetchVoteheads = async () => {
    try {
      const { data, error } = await supabase
        .from('voteheads')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setVoteheads(data || []);
    } catch (err) {
      console.error('Error fetching voteheads:', err);
    }
  };

  const fetchFeeCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('fee_categories')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      setFeeCategories(data || []);
    } catch (err) {
      console.error('Error fetching fee categories:', err);
    }
  };

  useEffect(() => {
    if (schoolConfig?.id) fetchFeeCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id]);

  // Re-load fee structures whenever the school or selected year changes.
  useEffect(() => {
    if (!schoolConfig?.id) return;
    const fetchFeeStructures = async () => {
      try {
        const { data, error } = await supabase
          .from('fee_structures')
          .select('*')
          .eq('school_id', schoolConfig.id)
          .eq('year', feeYear);
        if (error) throw error;
        const bySheet = {};
        (data || []).forEach(row => {
          const k = sheetKey(row.fee_level, row.category_id);
          (bySheet[k] = bySheet[k] || []).push({
            id: row.id,
            voteheadId: row.votehead_id,
            categoryId: row.category_id || null,
            t1: Number(row.t1),
            t2: Number(row.t2),
            t3: Number(row.t3),
            status: row.status || 'published',
          });
        });
        setFeeStructures(bySheet);
      } catch (err) {
        console.error('Error fetching fee structures:', err);
      }
    };
    fetchFeeStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id, feeYear]);
  const [newFeeItem, setNewFeeItem] = useState({ voteheadId: "", t1: "", t2: "", t3: "" });

  const handleAddVotehead = async () => {
    if (!newVotehead.code.trim() || !newVotehead.description.trim()) return;
    try {
      const { data, error } = await supabase
        .from('voteheads')
        .insert([{
          school_id: schoolConfig.id,
          code: newVotehead.code.trim().toUpperCase(),
          description: newVotehead.description.trim(),
          applies_to: newVotehead.applies_to || 'all',
          display_order: voteheads.length,
        }])
        .select()
        .single();
      if (error) throw error;
      setVoteheads(prev => [...prev, data]);
      setNewVotehead({ code: "", description: "", applies_to: "all" });
    } catch (err) {
      alert(err.code === '23505'
        ? `A votehead with code "${newVotehead.code.toUpperCase()}" already exists.`
        : 'Failed to add votehead: ' + err.message);
    }
  };

  const removeVotehead = async (id) => {
    try {
      // Once a votehead is used in any year's fee structure (or, later, on
      // invoices/payments) it must be archived — not deleted — so history
      // stays intact. Unused voteheads can still be hard-deleted.
      const { count, error: countErr } = await supabase
        .from('fee_structures')
        .select('*', { count: 'exact', head: true })
        .eq('votehead_id', id);
      if (countErr) throw countErr;

      if (count > 0) {
        if (!confirm('This votehead is used in a fee structure, so it will be archived instead of deleted. It stops billing but keeps past records intact. Continue?')) return;
        const { error } = await supabase.from('voteheads').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        setVoteheads(prev => prev.map(v => v.id === id ? { ...v, is_active: false } : v));
      } else {
        if (!confirm('Delete this votehead?')) return;
        const { error } = await supabase.from('voteheads').delete().eq('id', id);
        if (error) throw error;
        setVoteheads(prev => prev.filter(v => v.id !== id));
      }
    } catch (err) {
      alert('Failed to remove votehead: ' + err.message);
    }
  };

  const startEditVotehead = (vh) => {
    setEditingVoteheadId(vh.id);
    setVoteheadEdit({ code: vh.code, description: vh.description, applies_to: vh.applies_to || 'all' });
  };

  const saveVoteheadEdit = async () => {
    const code = voteheadEdit.code.trim().toUpperCase();
    const description = voteheadEdit.description.trim();
    if (!code || !description) { alert('Code and description are required.'); return; }
    try {
      const { error } = await supabase
        .from('voteheads')
        .update({ code, description, applies_to: voteheadEdit.applies_to })
        .eq('id', editingVoteheadId);
      if (error) throw error;
      setVoteheads(prev => prev.map(v => v.id === editingVoteheadId
        ? { ...v, code, description, applies_to: voteheadEdit.applies_to } : v));
      setEditingVoteheadId(null);
    } catch (err) {
      alert(err.code === '23505'
        ? `A votehead with code "${code}" already exists.`
        : 'Failed to save votehead: ' + err.message);
    }
  };

  // Move a votehead up/down. Order controls both display and — crucially —
  // the priority in which a payment clears charges (top = cleared first).
  // We renumber every row's display_order AND priority to its new index so
  // the ordering is consistent with the billing/allocation logic.
  const moveVotehead = async (id, dir) => {
    const active = voteheads.filter(v => v.is_active !== false);
    const idx = active.findIndex(v => v.id === id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= active.length) return;

    const reordered = [...active];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];

    // Optimistic UI: archived rows keep their place at the end.
    const archived = voteheads.filter(v => v.is_active === false);
    setVoteheads([...reordered.map((v, i) => ({ ...v, display_order: i, priority: i })), ...archived]);

    try {
      await Promise.all(reordered.map((v, i) =>
        supabase.from('voteheads').update({ display_order: i, priority: i }).eq('id', v.id)
      ));
    } catch (err) {
      alert('Failed to reorder: ' + err.message);
      fetchVoteheads();
    }
  };

  // votehead id -> how many fee-structure rows (any level/year) reference it.
  const [voteheadUsage, setVoteheadUsage] = useState({});
  useEffect(() => {
    if (!schoolConfig?.id) return;
    (async () => {
      const { data } = await supabase
        .from('fee_structures')
        .select('votehead_id')
        .eq('school_id', schoolConfig.id);
      const counts = {};
      (data || []).forEach(r => { counts[r.votehead_id] = (counts[r.votehead_id] || 0) + 1; });
      setVoteheadUsage(counts);
    })();
  }, [schoolConfig?.id, feeStructures]);

  // The sheet being edited: current grade × current category.
  const activeSheetKey = sheetKey(activeGrade, activeCategory === 'all' ? null : activeCategory);
  const activeSheet = feeStructures[activeSheetKey] || [];
  const sharedSheet = feeStructures[sheetKey(activeGrade, null)] || [];

  // Publish state is per GRADE + YEAR (all its categories together): a grade's
  // structure is "draft" if any of its rows are draft. New rows inherit it.
  const levelIsDraft = Object.entries(feeStructures)
    .filter(([k]) => k.startsWith(`${activeGrade}|`))
    .some(([, items]) => items.some(i => i.status === 'draft'));

  const setLevelStatus = async (newStatus) => {
    try {
      const { error } = await supabase
        .from('fee_structures')
        .update({ status: newStatus })
        .eq('school_id', schoolConfig.id)
        .eq('fee_level', activeGrade)
        .eq('year', feeYear);
      if (error) throw error;
      setFeeStructures(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${activeGrade}|`)) next[k] = next[k].map(i => ({ ...i, status: newStatus }));
        });
        return next;
      });
    } catch (err) {
      alert('Failed to change publish state: ' + err.message);
    }
  };

  const handleAddFeeItem = async () => {
    if (!newFeeItem.voteheadId) return;
    try {
      const catId = activeCategory === 'all' ? null : activeCategory;
      const { data, error } = await supabase
        .from('fee_structures')
        .insert([{
          school_id: schoolConfig.id,
          fee_level: activeGrade,
          category_id: catId,
          votehead_id: newFeeItem.voteheadId,
          year: feeYear,
          t1: parseFloat(newFeeItem.t1) || 0,
          t2: parseFloat(newFeeItem.t2) || 0,
          t3: parseFloat(newFeeItem.t3) || 0,
          status: levelIsDraft ? 'draft' : 'published',
        }])
        .select()
        .single();
      if (error) throw error;
      const item = {
        id: data.id,
        voteheadId: data.votehead_id,
        categoryId: data.category_id || null,
        t1: Number(data.t1),
        t2: Number(data.t2),
        t3: Number(data.t3),
        status: data.status || 'published',
      };
      setFeeStructures(prev => ({
        ...prev,
        [activeSheetKey]: [...(prev[activeSheetKey] || []), item]
      }));
      setNewFeeItem({ voteheadId: "", t1: "", t2: "", t3: "" });
    } catch (err) {
      alert(err.code === '23505'
        ? 'This votehead is already priced on this sheet for this grade and year. Delete it first to change the amounts.'
        : (err.message || '').includes('row-level security')
          ? 'Your sign-in session appears to have expired. Refresh the page (or sign out and back in) and try again.'
          : 'Failed to add fee item: ' + err.message);
    }
  };

  const removeFeeItem = async (id) => {
    try {
      const { error } = await supabase.from('fee_structures').delete().eq('id', id);
      if (error) throw error;
      setFeeStructures(prev => ({
        ...prev,
        [activeSheetKey]: (prev[activeSheetKey] || []).filter(item => item.id !== id)
      }));
    } catch (err) {
      alert('Failed to delete fee item: ' + err.message);
    }
  };

  // Inline editing of a priced row's term amounts.
  const [editingFeeItemId, setEditingFeeItemId] = useState(null);
  const [feeItemEdit, setFeeItemEdit] = useState({ t1: "", t2: "", t3: "" });

  const startEditFeeItem = (item) => {
    setEditingFeeItemId(item.id);
    setFeeItemEdit({ t1: String(item.t1), t2: String(item.t2), t3: String(item.t3) });
  };

  const saveFeeItemEdit = async () => {
    const t1 = parseFloat(feeItemEdit.t1) || 0;
    const t2 = parseFloat(feeItemEdit.t2) || 0;
    const t3 = parseFloat(feeItemEdit.t3) || 0;
    if (t1 < 0 || t2 < 0 || t3 < 0) { alert('Amounts cannot be negative.'); return; }
    try {
      const { error } = await supabase
        .from('fee_structures')
        .update({ t1, t2, t3 })
        .eq('id', editingFeeItemId);
      if (error) throw error;
      setFeeStructures(prev => ({
        ...prev,
        [activeSheetKey]: (prev[activeSheetKey] || []).map(i =>
          i.id === editingFeeItemId ? { ...i, t1, t2, t3 } : i),
      }));
      setEditingFeeItemId(null);
    } catch (err) {
      alert('Failed to save amounts: ' + err.message);
    }
  };

  // "+ New structure": a named special-case category (e.g. "Mid-term joiners").
  const handleAddSpecialCategory = async () => {
    const name = window.prompt('Name the special fee structure (e.g. "Mid-term joiners", "Staff children"):');
    if (name === null) return;
    if (!name.trim() || name.trim().length < 3) { alert('Give it a name of at least 3 characters.'); return; }
    try {
      const { data, error } = await supabase
        .from('fee_categories')
        .insert([{ school_id: schoolConfig.id, name: name.trim(), kind: 'special' }])
        .select()
        .single();
      if (error) throw error;
      setFeeCategories(prev => [...prev, data]);
      setActiveCategory(data.id);
    } catch (err) {
      alert(err.code === '23505'
        ? `A structure named "${name.trim()}" already exists.`
        : 'Failed to create structure: ' + err.message);
    }
  };

  // Effective bill for any (grade, category): shared rows, overridden per
  // votehead by the category's own rows, plus category-only extras.
  const effectiveSheetFor = (grade, cat) => {
    const shared = feeStructures[sheetKey(grade, null)] || [];
    if (cat === 'all') return shared;
    const merged = new Map();
    shared.forEach(i => merged.set(i.voteheadId, { ...i, source: 'shared' }));
    (feeStructures[sheetKey(grade, cat)] || []).forEach(i => merged.set(i.voteheadId, { ...i, source: 'category' }));
    return [...merged.values()];
  };
  const effectiveSheet = effectiveSheetFor(activeGrade, activeCategory);

  // What the pricing grid displays: for a category, the FULL effective bill —
  // inherited shared rows (read-only, overridable) alongside the category's
  // own rows — so the grid always matches the printed report.
  const vhOrderIdx = new Map(voteheads.map((v, i) => [v.id, i]));
  const displaySheet = (activeCategory === 'all'
    ? activeSheet.map(i => ({ ...i, source: 'category' }))
    : effectiveSheet
  ).slice().sort((a, b) => (vhOrderIdx.get(a.voteheadId) ?? 999) - (vhOrderIdx.get(b.voteheadId) ?? 999));

  // Turn an inherited shared row into a category override: copy it onto the
  // category sheet, then open it for editing immediately.
  const overrideInheritedRow = async (item) => {
    try {
      const { data, error } = await supabase
        .from('fee_structures')
        .insert([{
          school_id: schoolConfig.id,
          fee_level: activeGrade,
          category_id: activeCategory,
          votehead_id: item.voteheadId,
          year: feeYear,
          t1: item.t1, t2: item.t2, t3: item.t3,
          status: levelIsDraft ? 'draft' : 'published',
        }])
        .select()
        .single();
      if (error) throw error;
      const newItem = {
        id: data.id, voteheadId: data.votehead_id, categoryId: data.category_id,
        t1: Number(data.t1), t2: Number(data.t2), t3: Number(data.t3),
        status: data.status || 'published',
      };
      setFeeStructures(prev => ({
        ...prev,
        [activeSheetKey]: [...(prev[activeSheetKey] || []), newItem],
      }));
      startEditFeeItem(newItem);
    } catch (err) {
      alert((err.message || '').includes('row-level security')
        ? 'Your sign-in session appears to have expired. Refresh the page and try again.'
        : 'Failed to override: ' + err.message);
    }
  };

  // ---- Fee structure exports: ALL price sheets of the chosen level — the
  //      "All students" sheet plus every category (Boarder / Day Scholar /
  //      specials) that prices anything, labelled, in grade order. Category
  //      sections show the EFFECTIVE bill (inherited shared charges merged in).

  const exportRowsForLevel = () => {
    const vhOrder = new Map(voteheads.map((v, i) => [v.id, i]));
    const mapRows = (items) => items
      .slice()
      .sort((a, b) => (vhOrder.get(a.voteheadId) ?? 999) - (vhOrder.get(b.voteheadId) ?? 999))
      .map(item => {
        const vh = voteheads.find(v => v.id === item.voteheadId);
        return {
          code: vh?.code || '—',
          description: vh?.description || 'Unknown votehead',
          t1: item.t1, t2: item.t2, t3: item.t3,
          total: item.t1 + item.t2 + item.t3,
        };
      });
    const withTotals = (rows) => {
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      return { rows, t1: sum('t1'), t2: sum('t2'), t3: sum('t3'), total: sum('total') };
    };

    const grades = PRICING_BANDS[pricingBand].grades.map(g => {
      const sections = [];
      const shared = feeStructures[sheetKey(g, null)] || [];
      if (shared.length) {
        sections.push({ name: 'All Students', inherits: false, ...withTotals(mapRows(shared)) });
      }
      feeCategories.forEach(c => {
        const own = feeStructures[sheetKey(g, c.id)] || [];
        if (own.length) {
          // Effective bill for this category: shared + overrides + extras.
          sections.push({ name: c.name, inherits: shared.length > 0, ...withTotals(mapRows(effectiveSheetFor(g, c.id))) });
        }
      });
      return { grade: g, label: GRADE_LABELS[g], sections };
    });
    return { grades, levelLabel: PRICING_BANDS[pricingBand].label };
  };

  const handleExportFeeStructureExcel = () => {
    const { grades, levelLabel } = exportRowsForLevel();
    const wb = XLSXLib.utils.book_new();
    grades.forEach(g => {
      const aoa = [
        [`${schoolConfig?.schoolName || 'School'} — Fee Structure ${feeYear}`],
        [`${g.label} · ${levelLabel}`],
        [],
      ];
      if (g.sections.length === 0) {
        aoa.push(['No charges priced for this grade yet.']);
      } else {
        g.sections.forEach(sec => {
          aoa.push([`${sec.name}${sec.inherits ? ' (full bill, incl. shared charges)' : ''}`]);
          aoa.push(['Code', 'Votehead', 'Term 1 (KES)', 'Term 2 (KES)', 'Term 3 (KES)', 'Total (KES)']);
          sec.rows.forEach(r => aoa.push([r.code, r.description, r.t1, r.t2, r.t3, r.total]));
          aoa.push(['', 'TOTAL', sec.t1, sec.t2, sec.t3, sec.total]);
          aoa.push([]);
        });
      }
      const ws = XLSXLib.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSXLib.utils.book_append_sheet(wb, ws, g.label.slice(0, 31));
    });
    const safe = (s) => String(s).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    XLSXLib.writeFile(wb, `fee_structure_${feeYear}_${safe(levelLabel)}.xlsx`);
  };

  const handlePrintFeeStructure = () => {
    const { grades, levelLabel } = exportRowsForLevel();
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the fee structure.'); return; }
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
    const sectionTable = (sec) => `
      <h4>${sec.name}${sec.inherits ? ' <span class="note">(full bill — includes shared charges)</span>' : ''}</h4>
      <table>
        <thead><tr><th>Code</th><th>Votehead</th><th class="num">Term 1</th><th class="num">Term 2</th><th class="num">Term 3</th><th class="num">Total (KES)</th></tr></thead>
        <tbody>
          ${sec.rows.map(r => `<tr><td>${r.code}</td><td>${r.description}</td><td class="num">${fmt(r.t1)}</td><td class="num">${fmt(r.t2)}</td><td class="num">${fmt(r.t3)}</td><td class="num">${fmt(r.total)}</td></tr>`).join('')}
          <tr class="total"><td></td><td>TOTAL</td><td class="num">${fmt(sec.t1)}</td><td class="num">${fmt(sec.t2)}</td><td class="num">${fmt(sec.t3)}</td><td class="num">${fmt(sec.total)}</td></tr>
        </tbody>
      </table>`;
    const gradeBlocks = grades.map(g => `
      <h3>${g.label}</h3>
      ${g.sections.length === 0
        ? '<p class="empty">No charges priced for this grade yet.</p>'
        : g.sections.map(sectionTable).join('')}
    `).join('');
    // School letterhead: logo (base64 from school_information.logo_url),
    // name, contact lines, motto — the printout is an official document.
    const logo = logoPreview || schoolInfo?.logo_url || '';
    const contact1 = [schoolConfig?.address, [schoolConfig?.subCounty, schoolConfig?.county].filter(Boolean).join(', ')]
      .filter(Boolean).join(' · ');
    const contact2 = [
      schoolConfig?.phone ? `Tel: ${schoolConfig.phone}` : '',
      schoolConfig?.email ? `Email: ${schoolConfig.email}` : '',
      schoolInfo?.website || '',
    ].filter(Boolean).join(' · ');
    w.document.write(`<!doctype html><html><head><title>Fee Structure ${feeYear} — ${levelLabel}</title><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 26px; }
      .letterhead { display: flex; align-items: center; gap: 18px; justify-content: center; }
      .letterhead img { width: 74px; height: 74px; object-fit: contain; }
      .lh-text { text-align: center; }
      .lh-text h2 { margin: 0; font-size: 20px; letter-spacing: 0.5px; text-transform: uppercase; }
      .lh-line { color: #333; font-size: 11px; margin-top: 2px; }
      .motto { font-style: italic; color: #555; font-size: 11px; margin-top: 3px; }
      .lh-rule { border: none; border-top: 3px double #333; margin: 10px 0 8px; }
      .sub { text-align: center; color: #333; margin: 0 0 16px; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
      .gen { text-align: center; color: #777; margin: -12px 0 16px; font-size: 10px; }
      h3 { margin: 22px 0 4px; font-size: 15px; border-bottom: 2px solid #333; padding-bottom: 3px; }
      h4 { margin: 12px 0 4px; font-size: 12.5px; color: #1A5F9C; }
      .note { font-weight: normal; color: #777; font-size: 10.5px; }
      table { width: 100%; border-collapse: collapse; page-break-inside: avoid; margin-bottom: 4px; }
      th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
      th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
      .num { text-align: right; font-family: 'Courier New', monospace; }
      .total td { font-weight: bold; background: #fafafa; }
      .empty { color: #777; font-style: italic; font-size: 11.5px; }
      .foot { margin-top: 22px; font-size: 11px; color: #333; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      <div class="letterhead">
        ${logo ? `<img src="${logo}" alt="logo" />` : ''}
        <div class="lh-text">
          <h2>${schoolConfig?.schoolName || 'School'}</h2>
          ${contact1 ? `<div class="lh-line">${contact1}</div>` : ''}
          ${contact2 ? `<div class="lh-line">${contact2}</div>` : ''}
          ${schoolInfo?.motto ? `<div class="motto">“${schoolInfo.motto}”</div>` : ''}
        </div>
      </div>
      <hr class="lh-rule" />
      <p class="sub">OFFICIAL FEE STRUCTURE — ${feeYear} · ${levelLabel.toUpperCase()}</p>
      <p class="gen">All categories · generated ${new Date().toLocaleString()}</p>
      ${gradeBlocks}
      ${schoolInfo?.principal_name ? `<p class="foot">Authorised by: ______________________ &nbsp; ${schoolInfo.principal_name}, Principal</p>` : ''}
      <div class="noprint" style="text-align:center;margin-top:18px;">
        <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };
  // ---------------------------

  const addStream = () => {
    if (!newStreamName.trim()) return;
    setStreams(prev => [...prev, { id: Date.now(), name: newStreamName.trim(), capacity: parseInt(newStreamCapacity) || 40 }]);
    setNewStreamName("");
    setNewStreamCapacity("");
  };

  const removeStream = (id) => setStreams(prev => prev.filter(s => s.id !== id));

  const addDorm = () => {
    if (!newDormName.trim()) return;
    setDorms(prev => [...prev, { id: Date.now(), name: newDormName.trim(), capacity: parseInt(newDormCapacity) || 50, gender: newDormGender }]);
    setNewDormName("");
    setNewDormCapacity("");
    setNewDormGender("Mixed");
  };

  const removeDorm = (id) => setDorms(prev => prev.filter(d => d.id !== id));

  const tabs = [
    { id: "school", label: "School Info", icon: "🏫" },
    { id: "streams", label: "Streams/Dorms", icon: "🏠" },
    { id: "grading", label: "Grading System", icon: "📊" },
    { id: "fees", label: "Fee Structure", icon: "💰" },
    { id: "subjects", label: "Subjects", icon: "📚" },
    { id: "users", label: "Users", icon: "👤" },
  ];

  const handleLevelChange = (level) => {
    setSchoolLevels(prev => {
      const next = { ...prev, [level]: !prev[level] };
      if (!next.primary && !next.senior) {
        alert("A school must teach at least one level.");
        return prev;
      }
      return next;
    });
  };

  const handleLogoUpload = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Compress the image to max 300x300 to keep the base64 string small
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 300;
          let width = img.width;
          let height = img.height;

          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 webp for maximum compression
          const compressedBase64 = canvas.toDataURL('image/webp', 0.8);
          setLogoPreview(compressedBase64);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleLogoUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  /* Shared styles */
  const sectionCardStyle = {
    background: "#FFFFFF",
    border: "1px solid #e6dfd8",
    borderRadius: 16,
    padding: "24px 28px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  };

  const sectionTitleStyle = {
    margin: "0 0 8px",
    fontSize: 18,
    fontWeight: 800,
    color: "#2a2421",
    letterSpacing: "-0.01em",
  };

  const sectionSubtitleStyle = {
    margin: "0 0 28px",
    fontSize: 13,
    color: "#8a8fa8",
    fontWeight: 500,
    lineHeight: 1.5
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px 14px 44px",
    borderRadius: 12,
    border: "1.5px solid #e6dfd8",
    fontSize: 14,
    color: "#2a2421",
    background: "#ffffff",
    outline: "none",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#4A4A6A",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const iconStyle = {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 15,
    opacity: 0.85,
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Settings Content */}
      <div style={{ background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, padding: "28px", overflowY: "auto", flex: 1 }} className="main-scroll">
        {activeTab === "school" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 28,
              paddingBottom: 20,
              borderBottom: "1px solid #e6dfd8",
              flexWrap: "wrap",
              gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>School Configuration</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  Manage your institution's profile, branding, contact details, and academic setup.
                </p>
              </div>
              <button 
                onClick={handleSaveSchoolInfo}
                disabled={isLoading}
                style={{
                  padding: "11px 28px",
                  background: isLoading ? "#8a8fa8" : "linear-gradient(135deg, #D4AF37, #28a05f)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: 13.5,
                  boxShadow: "0 2px 8px rgba(27,107,58,0.25)",
                  transition: "all 0.2s ease",
                  letterSpacing: "0.02em",
                }}
                onMouseEnter={(e) => { if(!isLoading) { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 4px 12px rgba(27,107,58,0.35)"; } }}
                onMouseLeave={(e) => { if(!isLoading) { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 2px 8px rgba(27,107,58,0.25)"; } }}
              >
                {isLoading ? "⌛ Saving..." : "💾 Save Changes"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

              {/* System-assigned school code (read-only) */}
              <SchoolCodeCard code={schoolConfig?.schoolCode} />

              {/* ─── Section 1: School Identity & Branding ─── */}
              <section style={sectionCardStyle}>
                <h4 style={sectionTitleStyle}>🏫 School Identity & Branding</h4>
                <p style={sectionSubtitleStyle}>Define how your school is recognized — name, logo, and motto.</p>

                <div style={{ display: "flex", gap: 40, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {/* Logo Upload */}
                  <div style={{ flexShrink: 0, margin: "0" }}>
                    <label style={{ ...labelStyle, marginBottom: 12 }}>School Logo</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 20,
                        border: isDragging ? "2.5px dashed #D4AF37" : "2px dashed #D0D5DD",
                        background: isDragging ? "#FFF9F6" : "#FAFAFA",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        overflow: "hidden",
                        position: "relative",
                        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)"
                      }}
                    >
                      {logoPreview ? (
                        <>
                          <img src={logoPreview} alt="School Logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }} />
                          <div style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: "rgba(255,255,255,0.9)",
                            color: "#D4AF37",
                            fontSize: 10,
                            fontWeight: 700,
                            textAlign: "center",
                            padding: "8px 0",
                            borderTop: "1px solid #e6dfd8"
                          }}>
                            EDIT LOGO
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
                          <span style={{ fontSize: 11, color: "#8a8fa8", fontWeight: 600, textAlign: "center", lineHeight: 1.4, padding: "0 12px" }}>
                            Upload Institution Logo
                          </span>
                        </>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleLogoUpload(e.target.files[0])}
                      />
                    </div>
                    <p style={{ fontSize: 10.5, color: "#A0A5B8", marginTop: 12, textAlign: "left", maxWidth: 160, lineHeight: 1.5 }}>PNG, JPG or SVG format. Recommended: 512x512px.</p>
                  </div>

                  {/* Name & Motto */}
                  <div style={{ flex: 1, minWidth: "300px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 32px" }}>
                    {/* School Name */}
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={labelStyle}>Full Institution Name</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>🏛️</span>
                        <input
                          type="text"
                          defaultValue={schoolConfig?.schoolName || "My Institution"}
                          placeholder="Enter school name"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {/* Registration Number */}
                    <div>
                      <label style={labelStyle}>MoE Registration No.</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>📜</span>
                        <input
                          type="text"
                          defaultValue={schoolConfig?.regNumber || ""}
                          placeholder="e.g. MOE/PVT/001"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {/* Principal Name */}
                    <div>
                      <label style={labelStyle}>Principal's Name</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>🧑‍🏫</span>
                        <input
                          type="text"
                          value={schoolInfo.principal_name}
                          onChange={(e) => setSchoolInfo({...schoolInfo, principal_name: e.target.value})}
                          placeholder="e.g. Dr. Jane Doe"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {/* School Motto */}
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={labelStyle}>School Motto</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>✨</span>
                        <input
                          type="text"
                          value={schoolInfo.motto}
                          onChange={(e) => setSchoolInfo({...schoolInfo, motto: e.target.value})}
                          placeholder="e.g. Excellence Through Diligence"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {/* Vision */}
                    <div>
                      <label style={labelStyle}>Our Vision</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>🔭</span>
                        <input
                          type="text"
                          value={schoolInfo.vision}
                          onChange={(e) => setSchoolInfo({...schoolInfo, vision: e.target.value})}
                          placeholder="Our long-term goal..."
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {/* Mission */}
                    <div>
                      <label style={labelStyle}>Our Mission</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>🎯</span>
                        <input
                          type="text"
                          value={schoolInfo.mission}
                          onChange={(e) => setSchoolInfo({...schoolInfo, mission: e.target.value})}
                          placeholder="Our daily commitment..."
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ─── Section 2: Contact & Location ─── */}
              <section style={sectionCardStyle}>
                <h4 style={sectionTitleStyle}>📍 Contact & Location</h4>
                <p style={sectionSubtitleStyle}>How parents, students, and stakeholders can reach or locate the school.</p>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 32px" }}>
                  {[
                    { label: "Phone Number", value: "0712345678", icon: "📞", type: "tel" },
                    { label: "Email Address", value: "info@school.ac.ke", icon: "✉️", type: "email" },
                    { label: "Postal Address", value: "P.O. Box 12345 - 00100", icon: "📮", type: "text" },
                    { label: "Physical Location", value: "School Road, Main City", icon: "📍", type: "text" },
                    { label: "County", value: "", icon: "🗺️", type: "text" },
                    { label: "Sub-County", value: "", icon: "🗺️", type: "text" },
                    { label: "Website", value: "www.school.ac.ke", icon: "🌐", type: "url" },
                  ].map(field => (
                    <div key={field.label}>
                      <label style={labelStyle}>{field.label}</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>{field.icon}</span>
                        <input
                          type={field.type}
                          defaultValue={
                            field.label === "Phone Number" ? schoolConfig?.phone :
                            field.label === "Email Address" ? schoolConfig?.email :
                            field.label === "Postal Address" ? schoolConfig?.address :
                            field.label === "County" ? schoolConfig?.county :
                            field.label === "Sub-County" ? schoolConfig?.subCounty :
                            field.value
                          }
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ─── Section 3: Financial & Payments ─── */}
              <section style={sectionCardStyle}>
                <h4 style={sectionTitleStyle}>💳 Financial & Payments</h4>
                <p style={sectionSubtitleStyle}>Payment channels and financial identifiers for the school.</p>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 32px" }}>
                  {[
                    { label: "M-Pesa Paybill Number", value: "", icon: "💸" },
                    { label: "Account Name", value: "", icon: "🏦" },
                    { label: "Bank Name", value: "", icon: "🏛️" },
                    { label: "Bank Account No.", value: "", icon: "💳" },
                  ].map(field => (
                    <div key={field.label}>
                      <label style={labelStyle}>{field.label}</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>{field.icon}</span>
                        <input
                          type="text"
                          defaultValue={field.value}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ─── Section 4: Academic Configuration ─── */}
              <section style={sectionCardStyle}>
                <h4 style={sectionTitleStyle}>📅 Academic Configuration</h4>
                <p style={sectionSubtitleStyle}>Configure terms, academic year, and institutional levels.</p>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 32px", marginBottom: 32 }}>
                  {[
                    { label: "Current Term", value: "Term 1", icon: "📅", options: ["Term 1", "Term 2", "Term 3"] },
                    { label: "Academic Year", value: "2026", icon: "🗓️", options: Array.from({length: 10}, (_, i) => (2024 + i).toString()) },
                  ].map(field => (
                    <div key={field.label}>
                      <label style={labelStyle}>{field.label}</label>
                      <div style={{ position: "relative" }}>
                        <span style={iconStyle}>{field.icon}</span>
                        <select
                          defaultValue={field.value}
                          style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                        >
                          {field.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 10, color: "#8a8fa8" }}>
                          ▼
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Institutional Levels */}
                <div>
                  <label style={{ ...labelStyle, marginBottom: 16 }}>Institutional Levels</label>
                  <div style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                  }}>
                    {[
                      { id: "primary", label: "Primary & JSS", icon: "🟢" },
                      { id: "senior", label: "Senior Secondary", icon: "🟣" },
                    ].map(level => (
                      <label
                        key={level.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          color: schoolLevels[level.id] ? "#D4AF37" : "#6B7280",
                          padding: "12px 24px",
                          borderRadius: 12,
                          border: schoolLevels[level.id] ? "2px solid #D4AF37" : "1.5px solid #e6dfd8",
                          background: schoolLevels[level.id] ? "#FFF9F6" : "#ffffff",
                          transition: "all 0.3s ease",
                          userSelect: "none",
                          boxShadow: schoolLevels[level.id] ? "0 4px 12px rgba(204,120,92,0.1)" : "none"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={schoolLevels[level.id]}
                          onChange={() => handleLevelChange(level.id)}
                          style={{ display: "none" }}
                        />
                        <span style={{ fontSize: 12 }}>{level.icon}</span>
                        {level.label}
                        {schoolLevels[level.id] && (
                          <span style={{ fontSize: 14, marginLeft: 4 }}>✓</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </section>

            </div>
          </div>
        )}

        {activeTab === "streams" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 28,
              paddingBottom: 20,
              borderBottom: "1px solid #e6dfd8",
              flexWrap: "wrap",
              gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>Streams & Dormitories</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  Manage class streams and boarding dormitories for your institution.
                </p>
              </div>
              <button style={{
                padding: "11px 28px",
                background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13.5,
                boxShadow: "0 2px 8px rgba(27,107,58,0.25)",
                transition: "all 0.2s ease",
                letterSpacing: "0.02em",
              }}
                onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 4px 12px rgba(27,107,58,0.35)"; }}
                onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 2px 8px rgba(27,107,58,0.25)"; }}
              >
                💾 Save Changes
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* ─── Class Streams Section ─── */}
              <section style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h4 style={sectionTitleStyle}>📚 Class Streams</h4>
                  <span style={{ fontSize: 12, color: "#8a8fa8", fontWeight: 600, background: "#e6dfd8", padding: "4px 12px", borderRadius: 20 }}>
                    {streams.length} stream{streams.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p style={sectionSubtitleStyle}>Define the streams (e.g., East, West, North) used to divide classes into sections.</p>

                {/* Add Stream Form */}
                <div style={{
                  background: "#f5f2eb",
                  border: "1.5px dashed #D0D5DD",
                  borderRadius: 14,
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 14,
                  flexWrap: "wrap",
                  marginBottom: 20,
                }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={labelStyle}>Stream Name</label>
                    <input
                      type="text"
                      placeholder="e.g. South"
                      value={newStreamName}
                      onChange={(e) => setNewStreamName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addStream()}
                      style={{ ...inputStyle, paddingLeft: 14 }}
                      onFocus={(e) => { e.target.style.borderColor = "#D4AF37"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(27,107,58,0.08)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#e6dfd8"; e.target.style.background = "#f5f2eb"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <label style={labelStyle}>Capacity</label>
                    <input
                      type="number"
                      placeholder="40"
                      value={newStreamCapacity}
                      onChange={(e) => setNewStreamCapacity(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddStream()}
                      style={{ ...inputStyle, paddingLeft: 14 }}
                      onFocus={(e) => { e.target.style.borderColor = "#D4AF37"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(27,107,58,0.08)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#e6dfd8"; e.target.style.background = "#f5f2eb"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <button
                    onClick={handleAddStream}
                    style={{
                      padding: "11px 22px",
                      background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13,
                      boxShadow: "0 2px 6px rgba(27,107,58,0.2)",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
                  >
                    + Add Stream
                  </button>
                </div>

                {/* Collapsible Streams List */}
                {streams.length > 0 && (
                  <div>
                    <div
                      onClick={() => setStreamsExpanded(!streamsExpanded)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        background: "#f5f2eb",
                        border: "1px solid #e6dfd8",
                        borderRadius: streamsExpanded ? "12px 12px 0 0" : 12,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#e6dfd8"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f5f2eb"; }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>
                        📋 View All Streams ({streams.length})
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: "#8a8fa8",
                        transition: "transform 0.25s ease",
                        transform: streamsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        display: "inline-block",
                      }}>
                        ▼
                      </span>
                    </div>
                    {streamsExpanded && (
                      <div style={{ borderRadius: "0 0 12px 12px", border: "1px solid #e6dfd8", borderTop: "none", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                          <thead>
                            <tr style={{ background: "#f5f2eb" }}>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>#</th>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>Stream Name</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>Capacity</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em", width: 50 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {streams.map((stream, idx) => (
                              <tr key={stream.id} style={{ borderTop: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                                <td style={{ padding: "12px 16px", color: "#8a8fa8", fontSize: 12, fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2a2421" }}>
                                  <span style={{ marginRight: 8 }}>📗</span>{stream.name}
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center", color: "#8a8fa8", fontWeight: 600 }}>
                                  <span style={{ background: "#E8F5EE", padding: "3px 10px", borderRadius: 6, fontSize: 12.5, color: "#D4AF37" }}>
                                    {stream.capacity} students
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <button
                                    onClick={() => handleDeleteStream(stream.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: 15,
                                      color: "#c0392b",
                                      opacity: 0.5,
                                      transition: "opacity 0.2s",
                                      padding: "2px 6px",
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = 1}
                                    onMouseLeave={(e) => e.target.style.opacity = 0.5}
                                    title="Remove stream"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ─── Dormitories Section ─── */}
              <section style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h4 style={sectionTitleStyle}>🏠 Dormitories</h4>
                  <span style={{ fontSize: 12, color: "#8a8fa8", fontWeight: 600, background: "#e6dfd8", padding: "4px 12px", borderRadius: 20 }}>
                    {dorms.length} dorm{dorms.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p style={sectionSubtitleStyle}>Manage boarding dormitories, their capacity, and gender assignment.</p>

                {/* Add Dorm Form */}
                <div style={{
                  background: "#f5f2eb",
                  border: "1.5px dashed #D0D5DD",
                  borderRadius: 14,
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 14,
                  flexWrap: "wrap",
                  marginBottom: 20,
                }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={labelStyle}>Dormitory Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kilimanjaro House"
                      value={newDormName}
                      onChange={(e) => setNewDormName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddDorm()}
                      style={{ ...inputStyle, paddingLeft: 14 }}
                      onFocus={(e) => { e.target.style.borderColor = "#D4AF37"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(27,107,58,0.08)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#e6dfd8"; e.target.style.background = "#f5f2eb"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <div style={{ width: 110 }}>
                    <label style={labelStyle}>Capacity</label>
                    <input
                      type="number"
                      placeholder="50"
                      value={newDormCapacity}
                      onChange={(e) => setNewDormCapacity(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddDorm()}
                      style={{ ...inputStyle, paddingLeft: 14 }}
                      onFocus={(e) => { e.target.style.borderColor = "#D4AF37"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(27,107,58,0.08)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#e6dfd8"; e.target.style.background = "#f5f2eb"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <label style={labelStyle}>Gender</label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={newDormGender}
                        onChange={(e) => setNewDormGender(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: 14, appearance: "none", cursor: "pointer" }}
                        onFocus={(e) => { e.target.style.borderColor = "#D4AF37"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(27,107,58,0.08)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#e6dfd8"; e.target.style.background = "#f5f2eb"; e.target.style.boxShadow = "none"; }}
                      >
                        <option value="Boys">Boys</option>
                        <option value="Girls">Girls</option>
                        <option value="Mixed">Mixed</option>
                      </select>
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                    </div>
                  </div>
                  <button
                    onClick={handleAddDorm}
                    style={{
                      padding: "11px 22px",
                      background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13,
                      boxShadow: "0 2px 6px rgba(27,107,58,0.2)",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
                  >
                    + Add Dormitory
                  </button>
                </div>

                {/* Collapsible Dorms List */}
                {dorms.length > 0 && (
                  <div>
                    <div
                      onClick={() => setDormsExpanded(!dormsExpanded)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        background: "#f5f2eb",
                        border: "1px solid #e6dfd8",
                        borderRadius: dormsExpanded ? "12px 12px 0 0" : 12,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#e6dfd8"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f5f2eb"; }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>
                        📋 View All Dormitories ({dorms.length})
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: "#8a8fa8",
                        transition: "transform 0.25s ease",
                        transform: dormsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        display: "inline-block",
                      }}>
                        ▼
                      </span>
                    </div>
                    {dormsExpanded && (
                      <div style={{ borderRadius: "0 0 12px 12px", border: "1px solid #e6dfd8", borderTop: "none", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                          <thead>
                            <tr style={{ background: "#f5f2eb" }}>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>#</th>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>Dormitory Name</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>Capacity</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em" }}>Gender</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, letterSpacing: "0.03em", width: 50 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {dorms.map((dorm, idx) => (
                              <tr key={dorm.id} style={{ borderTop: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                                <td style={{ padding: "12px 16px", color: "#8a8fa8", fontSize: 12, fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2a2421" }}>
                                  <span style={{ marginRight: 8 }}>🏠</span>{dorm.name}
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center", color: "#8a8fa8", fontWeight: 600 }}>
                                  <span style={{ background: "#f5f2eb", padding: "3px 10px", borderRadius: 6, fontSize: 12.5, color: "#2a2421" }}>
                                    {dorm.capacity} beds
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <span style={{
                                    padding: "3px 10px",
                                    borderRadius: 6,
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    background: dorm.gender === "Boys" ? "#f5f2eb" : dorm.gender === "Girls" ? "#F5EEF8" : "#FEF0E6",
                                    color: dorm.gender === "Boys" ? "#2a2421" : dorm.gender === "Girls" ? "#6C3483" : "#D35400",
                                  }}>
                                    {dorm.gender}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <button
                                    onClick={() => handleDeleteDorm(dorm.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: 15,
                                      color: "#c0392b",
                                      opacity: 0.5,
                                      transition: "opacity 0.2s",
                                      padding: "2px 6px",
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = 1}
                                    onMouseLeave={(e) => e.target.style.opacity = 0.5}
                                    title="Remove dormitory"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

            </div>
          </div>
        )}

        {activeTab === "grading" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 24,
              paddingBottom: 20,
              borderBottom: "1px solid #e6dfd8",
              flexWrap: "wrap",
              gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>Grading System</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  CBC-aligned grading scales, categories, and mark boundaries per academic level.
                </p>
              </div>
              <button style={{
                padding: "11px 28px",
                background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13.5,
                boxShadow: "0 2px 8px rgba(27,107,58,0.25)",
                transition: "all 0.2s ease",
              }}
                onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 4px 12px rgba(27,107,58,0.35)"; }}
                onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 2px 8px rgba(27,107,58,0.25)"; }}
              >
                💾 Save Changes
              </button>
            </div>

            {/* Level & Grade Selection Bar */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr", 
              gap: 20, 
              marginBottom: 24, 
              padding: "20px 24px", 
              background: "#fff", 
              border: "1px solid #e6dfd8", 
              borderRadius: 12, 
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)" 
            }}>
              {(() => {
                const GRADES_BY_LEVEL = scopedLevelClasses;
                const selectStyle = {
                  width: "100%", padding: "12px 16px", borderRadius: 8,
                  border: "1px solid #e6dfd8", fontSize: 14, background: "#fff",
                  outline: "none", cursor: "pointer", appearance: "none",
                  fontWeight: 600, color: "#2a2421", boxSizing: "border-box"
                };
                const labelStyle2 = { display: "block", fontSize: 11, fontWeight: 800, color: "#2a2421", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" };
                
                return (
                  <>
                    <div>
                      <label style={labelStyle2}>Academic Level</label>
                      <div style={{ position: "relative" }}>
                        <select
                          value={gradingLevel}
                          onChange={(e) => {
                            setGradingLevel(e.target.value);
                            setSelectedGradingGrade("");
                          }}
                          style={selectStyle}
                        >
                          {scopedLevelNames.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle2}>Grade Scope</label>
                      <div style={{ position: "relative" }}>
                        <select
                          value={selectedGradingGrade}
                          onChange={(e) => setSelectedGradingGrade(e.target.value)}
                          style={selectStyle}
                        >
                          <option value="">Apply to all {gradingLevel} grades</option>
                          {(GRADES_BY_LEVEL[gradingLevel] || []).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Grading System Content */}
            <section style={sectionCardStyle}>
              {/* Dynamic Add Form */}
              <div style={{
                background: "#f5f2eb",
                border: "1.5px dashed #D0D5DD",
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                alignItems: "flex-end",
                gap: 14,
                flexWrap: "wrap",
                marginBottom: 20,
              }}>
                <div style={{ width: 90 }}>
                  <label style={labelStyle}>Grade</label>
                  <input type="text" placeholder="e.g. A" value={newGrade.grade} onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                </div>
                
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={labelStyle}>Comment / Label 💬</label>
                  <input type="text" placeholder="e.g. Excellent — appears on the report card" title="This comment appears against every subject a student scores this grade in, and as the teacher's remark on the report card." value={newGrade.description} onChange={(e) => setNewGrade({ ...newGrade, description: e.target.value })} style={{ ...inputStyle, paddingLeft: 14 }} />
                </div>

                <div style={{ width: 80 }}>
                  <label style={labelStyle}>Min %</label>
                  <input type="number" placeholder="80" value={newGrade.min} onChange={(e) => setNewGrade({ ...newGrade, min: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={labelStyle}>Max %</label>
                  <input type="number" placeholder="100" value={newGrade.max} onChange={(e) => setNewGrade({ ...newGrade, max: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={labelStyle}>Points</label>
                  <input type="number" placeholder="12" value={newGrade.points} onChange={(e) => setNewGrade({ ...newGrade, points: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                </div>

                <button
                  onClick={handleAddGrade}
                  style={{
                    padding: "11px 22px",
                    background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 13,
                    boxShadow: "0 2px 6px rgba(27,107,58,0.2)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
                >
                  + Add Grade
                </button>
              </div>

              {/* Collapsible Grade List */}
              <div style={{ marginBottom: 10 }}>
                <div
                  onClick={() => setGradingExpanded(!gradingExpanded)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 16px", background: "#f5f2eb", border: "1px solid #e6dfd8",
                    borderRadius: gradingExpanded ? "12px 12px 0 0" : 12, cursor: "pointer", transition: "all 0.2s ease", userSelect: "none",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>
                    📋 View Settings
                  </span>
                  <span style={{ fontSize: 12, color: "#8a8fa8", transition: "transform 0.25s", transform: gradingExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                </div>

                {gradingExpanded && (
                  <div style={{ borderRadius: "0 0 12px 12px", border: "1px solid #e6dfd8", borderTop: "none", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ background: "#f5f2eb" }}>
                          <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 80 }}>Grade</th>
                          {gradingLevel !== "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Comment / Label</th>}
                          {gradingLevel === "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Rubric Notes</th>}
                          {gradingLevel !== "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 90 }}>Range %</th>}
                          {(gradingLevel === "g7_g9" || gradingLevel === "g10_g12") && <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 80 }}>Points</th>}
                          <th style={{ padding: "11px 16px", textAlign: "center", width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradesList
                          .filter(g => g.school_level === gradingLevel && g.school_grade === (selectedGradingGrade || "All"))
                          .map((g, idx) => {
                            const badge = getBadgeColors(g.grade);
                            return (
                              <tr key={g.id} style={{ borderTop: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                                <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700 }}>
                                  <span style={{ background: badge.bg, color: badge.text, padding: "4px 10px", borderRadius: 6, fontSize: 13 }}>{g.grade}</span>
                                </td>
                                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2a2421" }}>{g.description}</td>
                                <td style={{ padding: "12px 16px", textAlign: "center", color: "#8a8fa8", fontWeight: 600, fontSize: 12.5 }}>
                                  {g.min_score} – {g.max_score}
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#D4AF37" }}>{g.points}</td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <button onClick={() => removeGrade(g.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b", opacity: 0.5, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.target.style.opacity = 1} onMouseLeave={(e) => e.target.style.opacity = 0.5}>🗑️</button>
                                </td>
                              </tr>
                            );
                          })}
                        {gradesList.filter(g => g.school_level === gradingLevel && g.school_grade === (selectedGradingGrade || "All")).length === 0 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: "center", padding: "30px", color: "#8a8fa8" }}>
                              No grades configured for this level/grade.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* =========================================
            FEE STRUCTURE SECTION
        ========================================= */}
        {activeTab === "fees" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>Fee Structure</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  {feeSubTab === "voteheads"
                    ? "Define the charges your school bills — order them to set how payments clear."
                    : "Set the per-term amount for each charge, by CBC learning level."}
                </p>
              </div>
              <span style={{
                padding: "8px 14px", background: "#f0f9f4", color: "#1B6B3A", borderRadius: 10,
                fontWeight: 600, fontSize: 12.5, border: "1px solid #cdead9", whiteSpace: "nowrap",
              }}>✓ Changes save automatically</span>
            </div>

            {/* Sub-tab navigation */}
            <div style={{ display: "flex", gap: 8, marginBottom: 22, borderBottom: "1px solid #e6dfd8" }}>
              {[
                { id: "voteheads", label: "🧾 Voteheads", count: voteheads.filter(v => v.is_active !== false).length },
                { id: "pricing", label: "🏫 Level Pricing" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFeeSubTab(t.id)}
                  style={{
                    padding: "10px 18px", background: "none", border: "none", cursor: "pointer",
                    fontSize: 14, fontWeight: 700, color: feeSubTab === t.id ? "#1B6B3A" : "#8a8fa8",
                    borderBottom: feeSubTab === t.id ? "2.5px solid #1B6B3A" : "2.5px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}{t.count != null ? ` (${t.count})` : ""}
                </button>
              ))}
            </div>

            {/* ============ TAB 1: VOTEHEADS (charge catalog) ============ */}
            {feeSubTab === "voteheads" && (
            <div style={{ marginBottom: 24 }}>
              {/* Add Votehead Form for populating the dictionary */}
              <div style={{
                background: "#f5f2eb", border: "1.5px dashed #D0D5DD", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap"
              }}>
                <div style={{ width: 120 }}>
                  <label style={labelStyle}>Code</label>
                  <input type="text" placeholder="e.g. TUI" value={newVotehead.code} onChange={(e) => setNewVotehead({ ...newVotehead, code: e.target.value.toUpperCase() })} style={{ ...inputStyle, paddingLeft: 12 }} />
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={labelStyle}>Description</label>
                  <input type="text" placeholder="e.g. Tuition Fee" value={newVotehead.description} onChange={(e) => setNewVotehead({ ...newVotehead, description: e.target.value })} style={{ ...inputStyle, paddingLeft: 14 }} onKeyDown={(e) => e.key === "Enter" && handleAddVotehead()} />
                </div>
                <div style={{ width: 170 }}>
                  <label style={labelStyle}>Applies To</label>
                  <select
                    value={newVotehead.applies_to}
                    onChange={(e) => setNewVotehead({ ...newVotehead, applies_to: e.target.value })}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="all">All students</option>
                    <option value="boarders">Boarders only</option>
                    <option value="day">Day scholars only</option>
                  </select>
                </div>
                <button
                  onClick={handleAddVotehead}
                  style={{
                    padding: "11px 22px", background: "linear-gradient(135deg, #D4AF37, #28a05f)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13, boxShadow: "0 2px 6px rgba(27,107,58,0.2)",
                  }}
                >+ Add Votehead</button>
              </div>

              {/* Votehead catalog — table */}
              {voteheads.length === 0 ? (
                <div style={{ marginTop: 16, padding: 30, textAlign: "center", color: "#8a8fa8", fontSize: 13, background: "#faf9f6", borderRadius: 12, border: "1px solid #e6dfd8" }}>
                  No voteheads yet. Add your first charge above (e.g. Tuition, Lunch, Transport).
                </div>
              ) : (
                <div style={{ marginTop: 16, borderRadius: 12, border: "1px solid #e6dfd8", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead style={{ background: "#f5f2eb", borderBottom: "2px solid #e6dfd8" }}>
                      <tr>
                        <th style={{ padding: "11px 12px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 11, width: 70 }}>ORDER</th>
                        <th style={{ padding: "11px 14px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 11, width: 90 }}>CODE</th>
                        <th style={{ padding: "11px 14px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 11 }}>DESCRIPTION</th>
                        <th style={{ padding: "11px 14px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 11, width: 160 }}>APPLIES TO</th>
                        <th style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 11, width: 90 }}>STATUS</th>
                        <th style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, color: "#8a8fa8", fontSize: 11, width: 130 }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const activeVhs = voteheads.filter(v => v.is_active !== false);
                        const archivedVhs = voteheads.filter(v => v.is_active === false);
                        const ordered = [...activeVhs, ...archivedVhs];
                        return ordered.map((vh, idx) => {
                          const isEditing = editingVoteheadId === vh.id;
                          const archived = vh.is_active === false;
                          const badge = APPLIES_TO_BADGE[vh.applies_to || 'all'];
                          const activeIdx = activeVhs.findIndex(v => v.id === vh.id);
                          const used = voteheadUsage[vh.id] || 0;
                          return (
                            <tr key={vh.id} style={{ borderBottom: "1px solid #f0ece3", background: archived ? "#faf9f6" : (idx % 2 === 0 ? "#fff" : "#fbfaf7"), opacity: archived ? 0.7 : 1 }}>
                              {/* Order controls */}
                              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                {!archived && !isEditing && (
                                  <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
                                    <button onClick={() => moveVotehead(vh.id, -1)} disabled={activeIdx === 0}
                                      title="Move up (clears earlier)"
                                      style={{ border: "none", background: "none", cursor: activeIdx === 0 ? "default" : "pointer", color: activeIdx === 0 ? "#d5cfc4" : "#8a8fa8", fontSize: 11, lineHeight: 1, padding: "1px 4px" }}>▲</button>
                                    <button onClick={() => moveVotehead(vh.id, 1)} disabled={activeIdx === activeVhs.length - 1}
                                      title="Move down (clears later)"
                                      style={{ border: "none", background: "none", cursor: activeIdx === activeVhs.length - 1 ? "default" : "pointer", color: activeIdx === activeVhs.length - 1 ? "#d5cfc4" : "#8a8fa8", fontSize: 11, lineHeight: 1, padding: "1px 4px" }}>▼</button>
                                  </div>
                                )}
                              </td>
                              {/* Code */}
                              <td style={{ padding: "10px 14px" }}>
                                {isEditing ? (
                                  <input value={voteheadEdit.code} onChange={(e) => setVoteheadEdit({ ...voteheadEdit, code: e.target.value.toUpperCase() })} style={{ ...inputStyle, padding: "6px 8px", width: 70 }} />
                                ) : (
                                  <span style={{ fontWeight: 800, color: "#2a2421" }}>{vh.code}</span>
                                )}
                              </td>
                              {/* Description */}
                              <td style={{ padding: "10px 14px" }}>
                                {isEditing ? (
                                  <input value={voteheadEdit.description} onChange={(e) => setVoteheadEdit({ ...voteheadEdit, description: e.target.value })} style={{ ...inputStyle, padding: "6px 8px" }} />
                                ) : (
                                  <span style={{ color: "#2a2421", fontWeight: 500 }}>{vh.description}</span>
                                )}
                                {!isEditing && used > 0 && (
                                  <span style={{ marginLeft: 8, fontSize: 10.5, color: "#8a8fa8" }}>· in {used} level{used === 1 ? "" : "s"}</span>
                                )}
                              </td>
                              {/* Applies To */}
                              <td style={{ padding: "10px 14px" }}>
                                {isEditing ? (
                                  <select value={voteheadEdit.applies_to} onChange={(e) => setVoteheadEdit({ ...voteheadEdit, applies_to: e.target.value })} style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer" }}>
                                    <option value="all">All students</option>
                                    <option value="boarders">Boarders only</option>
                                    <option value="day">Day scholars only</option>
                                  </select>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.fg }}>
                                    {badge.icon} {badge.text}
                                  </span>
                                )}
                              </td>
                              {/* Status */}
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: archived ? "#F5F6F8" : "#E8F5EE", color: archived ? "#8a8fa8" : "#1B6B3A" }}>
                                  {archived ? "Archived" : "Active"}
                                </span>
                              </td>
                              {/* Actions */}
                              <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {isEditing ? (
                                  <>
                                    <button onClick={saveVoteheadEdit} style={{ padding: "5px 12px", background: "#1B6B3A", border: "none", borderRadius: 6, fontSize: 11.5, color: "#fff", fontWeight: 700, cursor: "pointer", marginRight: 6 }}>Save</button>
                                    <button onClick={() => setEditingVoteheadId(null)} style={{ padding: "5px 10px", background: "#fff", border: "1px solid #e6dfd8", borderRadius: 6, fontSize: 11.5, color: "#8a8fa8", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                                  </>
                                ) : archived ? (
                                  <span style={{ fontSize: 11.5, color: "#b8b2a6", fontStyle: "italic" }}>kept for history</span>
                                ) : (
                                  <>
                                    <button onClick={() => startEditVotehead(vh)} title="Edit" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, marginRight: 8, opacity: 0.7 }}>✏️</button>
                                    <button onClick={() => removeVotehead(vh.id)} title={used > 0 ? "Archive (in use)" : "Delete"} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#c0392b", opacity: 0.7 }}>{used > 0 ? "🗄️" : "🗑️"}</button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  <div style={{ padding: "10px 14px", background: "#faf9f6", borderTop: "1px solid #f0ece3", fontSize: 11.5, color: "#8a8fa8" }}>
                    💡 Order matters: when a parent pays, the amount clears charges from the top of this list down.
                  </div>
                </div>
              )}
            </div>
            )}

            {/* ============ TAB 2: LEVEL PRICING ============ */}
            {feeSubTab === "pricing" && (
            <section style={sectionCardStyle}>
              {/* Title row: what you're editing + publish state, exports right */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
               <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                 <h4 style={{ ...sectionTitleStyle, margin: 0 }}>
                   🏫 {GRADE_LABELS[activeGrade]} Fee Structure
                   {activeCategory !== 'all' && (
                     <span style={{ color: "#1A5F9C" }}> · {feeCategories.find(c => c.id === activeCategory)?.name || ''}</span>
                   )}
                 </h4>
                 {Object.keys(feeStructures).some(k => k.startsWith(`${activeGrade}|`)) && (
                   <button
                     onClick={() => setLevelStatus(levelIsDraft ? 'published' : 'draft')}
                     title={levelIsDraft
                       ? 'Draft structures do not bill students. Publish to make them count toward balances.'
                       : 'Published structures bill students. Switch to draft to edit without affecting balances.'}
                     style={{
                       padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                       cursor: "pointer", letterSpacing: "0.03em",
                       border: levelIsDraft ? "1.5px solid #D4AF37" : "1.5px solid #1B6B3A",
                       background: levelIsDraft ? "#FEF6E7" : "#E8F5EE",
                       color: levelIsDraft ? "#8A6A1F" : "#1B6B3A",
                     }}
                   >
                     {levelIsDraft ? '✎ DRAFT — click to publish' : '✓ PUBLISHED'}
                   </button>
                 )}
               </div>
               {/* Level report: every grade in the chosen level, ALL categories
                   (All Students / Boarder / Day Scholar / specials), labelled. */}
               <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                 <button
                   onClick={handlePrintFeeStructure}
                   title={`Print / save as PDF: all ${PRICING_BANDS[pricingBand].label} grades, every category`}
                   style={{ padding: "8px 14px", background: "#1A5F9C", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                 >🖨 Print / PDF</button>
                 <button
                   onClick={handleExportFeeStructureExcel}
                   title={`Download Excel: all ${PRICING_BANDS[pricingBand].label} grades, every category`}
                   style={{ padding: "8px 14px", background: "#1B6B3A", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                 >⬇ Excel</button>
               </div>
              </div>

              {/* One clean filter bar: Year · Level · Grade · Applies To */}
              {(() => {
                const filterLabel = { display: "block", fontSize: 10, fontWeight: 800, color: "#8a8fa8", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
                const filterSelect = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 13, fontWeight: 600, color: "#2a2421", background: "#fff", cursor: "pointer", boxSizing: "border-box", outline: "none" };
                return (
                  <div style={{
                    display: "grid", gridTemplateColumns: "110px 1fr 1fr 1.4fr", gap: 14,
                    padding: "14px 16px", background: "#faf9f6", border: "1px solid #e6dfd8",
                    borderRadius: 12, marginBottom: 18, alignItems: "end",
                  }}>
                    <div>
                      <label style={filterLabel}>Year</label>
                      <select value={feeYear} onChange={(e) => setFeeYear(parseInt(e.target.value))} style={filterSelect}>
                        {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={filterLabel}>Level</label>
                      <select
                        value={pricingBand}
                        onChange={(e) => { setPricingBand(e.target.value); setActiveGrade(PRICING_BANDS[e.target.value].grades[0]); }}
                        style={filterSelect}
                      >
                        {Object.entries(PRICING_BANDS).map(([k, b]) => (
                          <option key={k} value={k}>{b.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={filterLabel}>Grade</label>
                      <select value={activeGrade} onChange={(e) => setActiveGrade(e.target.value)} style={filterSelect}>
                        {PRICING_BANDS[pricingBand].grades.map(g => (
                          <option key={g} value={g}>{GRADE_LABELS[g]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={filterLabel}>Applies To</label>
                      <select
                        value={activeCategory}
                        onChange={(e) => {
                          if (e.target.value === '__new__') { handleAddSpecialCategory(); return; }
                          setActiveCategory(e.target.value);
                        }}
                        style={{ ...filterSelect, borderColor: activeCategory !== 'all' ? "#1A5F9C" : "#e6dfd8", color: activeCategory !== 'all' ? "#1A5F9C" : "#2a2421", fontWeight: 700 }}
                      >
                        {[{ id: 'all', name: 'All students', icon: '👥', kind: null },
                          ...feeCategories.map(c => ({ id: c.id, name: c.name, icon: CATEGORY_ICON[c.kind] || '⭐' }))
                        ].map(c => {
                          const count = (feeStructures[sheetKey(activeGrade, c.id === 'all' ? null : c.id)] || []).length;
                          return (
                            <option key={c.id} value={c.id}>
                              {c.icon} {c.name}{count > 0 ? ` (${count})` : ''}
                            </option>
                          );
                        })}
                        <option value="__new__">＋ New special structure…</option>
                      </select>
                    </div>
                  </div>
                );
              })()}

              {activeCategory !== 'all' && (
                <div style={{ marginBottom: 14, padding: "8px 14px", background: "#FDF9F0", border: "1px solid #EAD9A8", borderRadius: 10, fontSize: 12, color: "#8A6A1F" }}>
                  ⤴ Full bill for <strong>{feeCategories.find(c => c.id === activeCategory)?.name || 'this category'}</strong> — greyed rows are inherited from "All students" (click <strong>Override</strong> to price them differently); ⤴ rows override the shared price.
                </div>
              )}

              {/* Add Fee Item Form */}
              <div style={{
                background: "#f5f2eb", border: "1px solid #C4E1FA", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 20,
              }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={{ ...labelStyle, color: "#2a2421" }}>Select Votehead</label>
                  <select
                    value={newFeeItem.voteheadId}
                    onChange={(e) => setNewFeeItem({ ...newFeeItem, voteheadId: e.target.value })}
                    style={{ ...inputStyle, borderColor: "#C4E1FA" }}
                  >
                    <option value="">-- Choose Votehead --</option>
                    {voteheads.filter(vh => vh.is_active !== false).map(vh => (
                      <option key={vh.id} value={vh.id}>
                        {vh.code} - {vh.description}{vh.applies_to && vh.applies_to !== 'all' ? ` (${APPLIES_TO_LABEL[vh.applies_to]})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ ...labelStyle, color: "#2a2421" }}>Term 1 (KES)</label>
                  <input type="number" placeholder="0" value={newFeeItem.t1} onChange={(e) => setNewFeeItem({ ...newFeeItem, t1: e.target.value })} style={{ ...inputStyle, borderColor: "#C4E1FA" }} />
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ ...labelStyle, color: "#2a2421" }}>Term 2 (KES)</label>
                  <input type="number" placeholder="0" value={newFeeItem.t2} onChange={(e) => setNewFeeItem({ ...newFeeItem, t2: e.target.value })} style={{ ...inputStyle, borderColor: "#C4E1FA" }} />
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ ...labelStyle, color: "#2a2421" }}>Term 3 (KES)</label>
                  <input type="number" placeholder="0" value={newFeeItem.t3} onChange={(e) => setNewFeeItem({ ...newFeeItem, t3: e.target.value })} style={{ ...inputStyle, borderColor: "#C4E1FA" }} />
                </div>
                <button
                  onClick={handleAddFeeItem}
                  style={{
                    padding: "11px 20px", background: "#2a2421", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "background 0.2s"
                  }}
                  onMouseEnter={(e) => e.target.style.background = "#134a7a"}
                  onMouseLeave={(e) => e.target.style.background = "#2a2421"}
                >+ Add</button>
              </div>

              {/* Fee Structure Table */}
              <div style={{ borderRadius: 12, border: "1px solid #e6dfd8", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead style={{ background: "#f5f2eb", borderBottom: "2px solid #e6dfd8" }}>
                    <tr>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 40 }}>#</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Votehead</th>
                      <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 120 }}>Term 1</th>
                      <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 120 }}>Term 2</th>
                      <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 120 }}>Term 3</th>
                      <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#2a2421", fontSize: 12, width: 130, background: "#f0f4f8" }}>Total (KES)</th>
                      <th style={{ padding: "12px 16px", textAlign: "center", width: 110 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displaySheet.length === 0 ? (
                      <tr><td colSpan="7" style={{ textAlign: "center", padding: "30px", color: "#8a8fa8", fontSize: 13 }}>
                        {activeCategory === 'all'
                          ? `No charges priced for ${GRADE_LABELS[activeGrade]} yet — add the first one above.`
                          : `Nothing billed for this category in ${GRADE_LABELS[activeGrade]} yet — price the "All students" sheet or add charges above.`}
                      </td></tr>
                    ) : (
                      displaySheet.map((item, idx) => {
                        const vh = voteheads.find(v => v.id === item.voteheadId);
                        const inherited = item.source === 'shared';
                        const isEditingRow = editingFeeItemId === item.id;
                        const rowTotal = isEditingRow
                          ? (parseFloat(feeItemEdit.t1) || 0) + (parseFloat(feeItemEdit.t2) || 0) + (parseFloat(feeItemEdit.t3) || 0)
                          : item.t1 + item.t2 + item.t3;
                        const overridesShared = activeCategory !== 'all' && sharedSheet.some(sItem => sItem.voteheadId === item.voteheadId);
                        const termCellStyle = { padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#8a8fa8", fontFamily: "monospace", fontSize: 13 };
                        const editInputStyle = { width: 90, padding: "7px 8px", borderRadius: 6, border: "1.5px solid #1A5F9C", fontSize: 13, textAlign: "right", fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
                        return (
                          <tr key={`${item.id}-${item.source || 'own'}`} style={{ borderBottom: "1px solid #e6dfd8", background: inherited ? "#fbfaf7" : (idx % 2 === 0 ? "#fff" : "#f5f2eb"), opacity: inherited ? 0.75 : 1 }}>
                            <td style={{ padding: "12px 16px", color: "#8a8fa8", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: "12px 16px" }}>
                              {vh ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, color: inherited ? "#8a8fa8" : "#2a2421", fontSize: 12 }}>{vh.code}</span>
                                  <span style={{ fontWeight: 600, color: inherited ? "#8a8fa8" : "#2a2421" }}>{vh.description}</span>
                                  {inherited && (
                                    <span title='Priced on the "All students" sheet — this category inherits it as-is' style={{ padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "#EEF1F4", color: "#8a8fa8" }}>
                                      inherited
                                    </span>
                                  )}
                                  {!inherited && overridesShared && (
                                    <span
                                      title={'Overrides the "All students" price for this category'}
                                      style={{ color: "#8A6A1F", fontSize: 13, fontWeight: 800, cursor: "help", lineHeight: 1 }}
                                    >⤴</span>
                                  )}
                                  {vh.applies_to && vh.applies_to !== 'all' && (
                                    <span title={APPLIES_TO_LABEL[vh.applies_to]} style={{
                                      padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                                      background: vh.applies_to === 'boarders' ? "#EAF2FA" : "#FEF6E7",
                                      color: vh.applies_to === 'boarders' ? "#1A5F9C" : "#8A6A1F",
                                    }}>
                                      {vh.applies_to === 'boarders' ? '🛏 Boarders' : '☀ Day'}
                                    </span>
                                  )}
                                  {vh.is_active === false && (
                                    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: "#F5F6F8", color: "#8A8FA8" }}>
                                      Archived — not billing
                                    </span>
                                  )}
                                </div>
                              ) : <span style={{ color: "red" }}>Warning: Deleted Votehead</span>}
                            </td>
                            {isEditingRow ? (
                              <>
                                <td style={{ padding: "8px 16px", textAlign: "right" }}>
                                  <input type="number" value={feeItemEdit.t1} autoFocus
                                    onChange={(e) => setFeeItemEdit({ ...feeItemEdit, t1: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveFeeItemEdit(); if (e.key === "Escape") setEditingFeeItemId(null); }}
                                    style={editInputStyle} />
                                </td>
                                <td style={{ padding: "8px 16px", textAlign: "right" }}>
                                  <input type="number" value={feeItemEdit.t2}
                                    onChange={(e) => setFeeItemEdit({ ...feeItemEdit, t2: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveFeeItemEdit(); if (e.key === "Escape") setEditingFeeItemId(null); }}
                                    style={editInputStyle} />
                                </td>
                                <td style={{ padding: "8px 16px", textAlign: "right" }}>
                                  <input type="number" value={feeItemEdit.t3}
                                    onChange={(e) => setFeeItemEdit({ ...feeItemEdit, t3: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveFeeItemEdit(); if (e.key === "Escape") setEditingFeeItemId(null); }}
                                    style={editInputStyle} />
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={termCellStyle}>{item.t1.toLocaleString()}</td>
                                <td style={termCellStyle}>{item.t2.toLocaleString()}</td>
                                <td style={termCellStyle}>{item.t3.toLocaleString()}</td>
                              </>
                            )}
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: inherited ? "#8a8fa8" : "#D4AF37", background: "#f0f4f8", fontFamily: "monospace", fontSize: 13.5 }}>{rowTotal.toLocaleString()}</td>
                            <td style={{ padding: "12px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                              {inherited ? (
                                <button onClick={() => overrideInheritedRow(item)}
                                  title="Price this votehead differently for this category"
                                  style={{ padding: "5px 12px", background: "#fff", border: "1px solid #8A6A1F", borderRadius: 6, fontSize: 11, color: "#8A6A1F", fontWeight: 700, cursor: "pointer" }}>
                                  Override
                                </button>
                              ) : isEditingRow ? (
                                <>
                                  <button onClick={saveFeeItemEdit} title="Save amounts"
                                    style={{ padding: "5px 12px", background: "#1B6B3A", border: "none", borderRadius: 6, fontSize: 11.5, color: "#fff", fontWeight: 700, cursor: "pointer", marginRight: 6 }}>Save</button>
                                  <button onClick={() => setEditingFeeItemId(null)} title="Discard changes"
                                    style={{ padding: "5px 10px", background: "#fff", border: "1px solid #e6dfd8", borderRadius: 6, fontSize: 11.5, color: "#8a8fa8", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEditFeeItem(item)} title="Edit amounts"
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, marginRight: 8, opacity: 0.7 }}>✏️</button>
                                  <button onClick={() => removeFeeItem(item.id)} title="Remove from this sheet"
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b", opacity: 0.7 }}>🗑️</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* Effective bill totals: for "All students" that's this sheet;
                      for a category it's the MERGED sheet (shared + overrides). */}
                  {effectiveSheet.length > 0 && (() => {
                     const totalT1 = effectiveSheet.reduce((sum, item) => sum + item.t1, 0);
                     const totalT2 = effectiveSheet.reduce((sum, item) => sum + item.t2, 0);
                     const totalT3 = effectiveSheet.reduce((sum, item) => sum + item.t3, 0);
                     const grandTotal = totalT1 + totalT2 + totalT3;
                     const label = activeCategory === 'all'
                       ? 'GRAND TOTALS:'
                       : `${(feeCategories.find(c => c.id === activeCategory)?.name || 'CATEGORY').toUpperCase()} PAYS (incl. inherited):`;
                     return (
                       <tfoot style={{ background: "#2a2421" }}>
                         <tr>
                           <td colSpan="2" style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: "#fff", fontSize: 13, letterSpacing: "1px" }}>{label}</td>
                           <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#C4E1FA", fontFamily: "monospace", fontSize: 13.5 }}>{totalT1.toLocaleString()}</td>
                           <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#C4E1FA", fontFamily: "monospace", fontSize: 13.5 }}>{totalT2.toLocaleString()}</td>
                           <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#C4E1FA", fontFamily: "monospace", fontSize: 13.5 }}>{totalT3.toLocaleString()}</td>
                           <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: "#4ADE80", background: "rgba(0,0,0,0.2)", fontFamily: "monospace", fontSize: 15 }}>{grandTotal.toLocaleString()}</td>
                           <td></td>
                         </tr>
                       </tfoot>
                     );
                  })()}
                </table>
              </div>
            </section>
            )}
          </div>
        )}

        {/* =========================================
            SUBJECTS CONFIGURATION SECION
        ========================================= */}
        {activeTab === "subjects" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 24,
              paddingBottom: 20,
              borderBottom: "1px solid #e6dfd8",
              flexWrap: "wrap",
              gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>Subjects Configuration</h3>
              </div>
              <button style={{
                padding: "11px 28px",
                background: "linear-gradient(135deg, #D4AF37, #28a05f)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13.5,
                boxShadow: "0 2px 8px rgba(27,107,58,0.25)",
                transition: "all 0.2s ease",
              }}
                onMouseEnter={(e) => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 4px 12px rgba(27,107,58,0.35)"; }}
                onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 2px 8px rgba(27,107,58,0.25)"; }}
              >
                💾 Save Changes
              </button>
            </div>

            {/* Level & Grade Dropdowns - matching Exam Settings style */}
            {(() => {
              const GRADES_BY_LEVEL = scopedLevelClasses;
              const selectStyle = {
                width: "100%", padding: "12px 16px", borderRadius: 8,
                border: "1px solid #e6dfd8", fontSize: 14, background: "#fff",
                outline: "none", cursor: "pointer", appearance: "none",
                fontWeight: 600, color: "#2a2421", boxSizing: "border-box"
              };
              const labelStyle2 = { display: "block", fontSize: 11, fontWeight: 800, color: "#2a2421", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" };
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, padding: "20px 24px", background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                  <div>
                    <label style={labelStyle2}>Level</label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={subjectLevel}
                        onChange={(e) => {
                          setSubjectLevel(e.target.value);
                          setSelectedSubjectGrade("");
                          setNewSubject({ name: "", code: "", type: e.target.value === "Senior Secondary" ? "Compulsory" : "Core" });
                        }}
                        style={selectStyle}
                      >
                        {scopedLevelNames.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle2}>Grade</label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={selectedSubjectGrade}
                        onChange={(e) => setSelectedSubjectGrade(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">-- Select Grade --</option>
                        {(GRADES_BY_LEVEL[subjectLevel] || []).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                    </div>
                  </div>
                </div>
              );
            })()}


            {/* Subjects Content Block */}
            <section style={sectionCardStyle}>

              {/* Add Subject Form */}
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "24px",
                display: "grid",
                gridTemplateColumns: "1fr 2.5fr 1.5fr auto",
                gap: 20,
                alignItems: "flex-end",
                marginBottom: 28,
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.01)"
              }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 8, color: "#64748b", fontWeight: 700, fontSize: 11 }}>SUBJECT CODE</label>
                  <input type="text" placeholder="e.g. MATH" value={newSubject.code} onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })} style={{ ...inputStyle, padding: "0 16px", height: "46px" }} />
                </div>
                
                <div>
                  <label style={{ ...labelStyle, marginBottom: 8, color: "#64748b", fontWeight: 700, fontSize: 11 }}>SUBJECT NAME</label>
                  <input type="text" placeholder="e.g. Integrated Science" value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} style={{ ...inputStyle, padding: "0 16px", height: "46px" }} onKeyDown={(e) => e.key === "Enter" && handleAddSubject()} />
                </div>

                <div>
                  <label style={{ ...labelStyle, marginBottom: 8, color: "#64748b", fontWeight: 700, fontSize: 11 }}>TYPE</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={newSubject.type}
                      onChange={(e) => setNewSubject({ ...newSubject, type: e.target.value })}
                      style={{ ...inputStyle, padding: "0 16px", height: "46px", appearance: "none", cursor: "pointer" }}
                    >
                      {subjectLevel === "Senior Secondary" ? (
                        <>
                          <option value="Compulsory">Compulsory</option>
                          <option value="Elective">Elective</option>
                        </>
                      ) : (
                        <>
                          <option value="Core">Core</option>
                          <option value="Optional">Optional</option>
                        </>
                      )}
                    </select>
                    <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                  </div>
                </div>

                <button
                  onClick={handleAddSubject}
                  style={{
                    height: "46px",
                    padding: "0 28px",
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 14,
                    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 6px 16px rgba(16, 185, 129, 0.35)"; }}
                  onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.25)"; }}
                >
                  + Add Subject
                </button>
              </div>

              {/* Render table based on selected grade */}
              {(() => {
                if (!selectedSubjectGrade) return (
                  <div style={{ textAlign: "center", padding: "40px", color: "#8a8fa8" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>☝️</div>
                    <p style={{ margin: 0 }}>Please select a learning phase and a specific grade to manage subjects.</p>
                  </div>
                );

                const currentSubjects = subjectsByGrade[selectedSubjectGrade] || [];
                const gradeName = CLASSES.find(c => c.id === selectedSubjectGrade)?.name || "";

                const renderTable = (listTitle, listData) => (
                  <div style={{ marginBottom: 20 }}>
                    <div
                      onClick={() => setSubjectsExpanded(prev => ({ ...prev, [listTitle]: !prev[listTitle] }))}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 16px", background: "#f5f2eb", border: "1px solid #e6dfd8",
                        borderRadius: (subjectsExpanded[listTitle] ?? true) ? "12px 12px 0 0" : 12, cursor: "pointer", transition: "all 0.2s ease", userSelect: "none",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>
                        📋 {listTitle} ({listData.length})
                      </span>
                      <span style={{ fontSize: 12, color: "#8a8fa8", transition: "transform 0.25s", transform: (subjectsExpanded[listTitle] ?? true) ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                    </div>

                    {(subjectsExpanded[listTitle] ?? true) && (
                      <div style={{ borderRadius: "0 0 12px 12px", border: "1px solid #e6dfd8", borderTop: "none", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                          <thead>
                            <tr style={{ background: "#f5f2eb" }}>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 40 }}>#</th>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 90 }}>Code</th>
                              <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Subject Name</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 120 }}>Type</th>
                              <th style={{ padding: "11px 16px", textAlign: "center", width: 50 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {listData.length === 0 ? (
                               <tr><td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "#8a8fa8", fontSize: 13 }}>No subjects found.</td></tr>
                            ) : listData.map((s, idx) => (
                              <tr key={s.id} style={{ borderTop: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                                <td style={{ padding: "12px 16px", color: "#8a8fa8", fontSize: 12, fontWeight: 600 }}>{idx + 1}</td>
                                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#8a8fa8" }}>{s.code || "-"}</td>
                                <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2a2421" }}>{s.name}</td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <span style={{
                                    padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                    background: (s.type === "Core" || s.type === "Compulsory") ? "#E8F5EE" : "#f5f2eb",
                                    color: (s.type === "Core" || s.type === "Compulsory") ? "#D4AF37" : "#2a2421",
                                  }}>
                                    {s.type}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                  <button onClick={() => removeSubject(s.id, selectedSubjectGrade)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b", opacity: 0.5, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.target.style.opacity = 1} onMouseLeave={(e) => e.target.style.opacity = 0.5}>🗑️</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );

                return renderTable(`Subjects for ${gradeName}`, currentSubjects);
              })()}

            </section>
          </div>
        )}
        {/* =========================================
            USER MANAGEMENT & ROLES SECTION
        ========================================= */}
        {activeTab === "users" && (
          <div>
            {/* Page Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #e6dfd8", flexWrap: "wrap", gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>User Management & Roles</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  Manage staff accounts and configure granular module permissions across learning phases.
                </p>
              </div>
              <button style={{
                padding: "11px 28px", background: "linear-gradient(135deg, #D4AF37, #28a05f)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13.5, boxShadow: "0 2px 8px rgba(27,107,58,0.25)", transition: "all 0.2s ease",
              }}>💾 Save Settings</button>
            </div>

            {/* Internal Pills */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <button
                onClick={() => setUserTab("roster")}
                style={{
                  padding: "10px 24px", background: userTab === "roster" ? "#2a2421" : "#f5f2eb", color: userTab === "roster" ? "#fff" : "#2a2421", border: "none", borderRadius: 30, fontSize: 13.5, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease"
                }}
              >👥 Active User Roster</button>
              <button
                onClick={() => setUserTab("roles")}
                style={{
                  padding: "10px 24px", background: userTab === "roles" ? "#2a2421" : "#f5f2eb", color: userTab === "roles" ? "#fff" : "#2a2421", border: "none", borderRadius: 30, fontSize: 13.5, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease"
                }}
              >⚙️ Roles & Permissions (ACL)</button>
            </div>

            {/* TAB 1: USER ROSTER */}
            {userTab === "roster" && (
              <section style={sectionCardStyle}>
                <h4 style={sectionTitleStyle}>Add New Staff Member</h4>
                <div style={{
                  background: "#f5f2eb", border: "1px solid #e6dfd8", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 24,
                }}>
                  <div style={{ flex: 1.5, minWidth: 200 }}>
                    <label style={labelStyle}>Full Name</label>
                    <input type="text" placeholder="e.g. Samuel Kimani" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} style={{ ...inputStyle, paddingLeft: 12 }} />
                  </div>
                  <div style={{ flex: 1.5, minWidth: 200 }}>
                    <label style={labelStyle}>Email Address</label>
                    <input type="email" placeholder="e.g. skimani@mwanga.ac.ke" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} style={{ ...inputStyle, paddingLeft: 12 }} />
                  </div>
                  <div style={{ width: 160 }}>
                    <label style={labelStyle}>Assign Role</label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                        style={{ ...inputStyle, appearance: "none", cursor: "pointer", paddingLeft: 12 }}
                      >
                        <option value="System Admin">System Admin</option>
                        <option value="Principal">Principal</option>
                        <option value="Bursar">Bursar</option>
                        <option value="Teacher">Teacher</option>
                        <option value="Secretary">Secretary</option>
                      </select>
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                    </div>
                  </div>
                  <button
                    onClick={handleAddUser}
                    style={{
                      padding: "11px 22px", background: "#D4AF37", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "background 0.2s"
                    }}
                  >+ Add User</button>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid #e6dfd8", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead style={{ background: "#f5f2eb", borderBottom: "2px solid #e6dfd8" }}>
                      <tr>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 40 }}>#</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Name & Email</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Role</th>
                        <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Status</th>
                        <th style={{ padding: "12px 16px", textAlign: "center", width: 100 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemUsers.map((u, idx) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid #e6dfd8", background: u.status === "Suspended" ? "#FDF8F8" : (idx % 2 === 0 ? "#fff" : "#f5f2eb") }}>
                          <td style={{ padding: "14px 16px", color: "#8a8fa8", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ fontWeight: 700, color: "#2a2421", fontSize: 14 }}>{u.name}</div>
                            <div style={{ color: "#8a8fa8", fontSize: 12, marginTop: 2 }}>{u.email}</div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ 
                              padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                              background: u.role === "System Admin" ? "#f5f2eb" : "#F4F5F7", 
                              color: u.role === "System Admin" ? "#2a2421" : "#8a8fa8"
                            }}>{u.role}</span>
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <span onClick={() => toggleUserStatus(u.id)} style={{
                              padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              background: u.status === "Active" ? "#E8F5EE" : "#FDF0ED",
                              color: u.status === "Active" ? "#D4AF37" : "#c0392b",
                              border: `1px solid ${u.status === "Active" ? "#C2E5D2" : "#F8D5CE"}`
                            }}>
                              {u.status}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "center" }}>
                            <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b", opacity: 0.6 }} onMouseEnter={(e) => e.target.style.opacity = 1} onMouseLeave={(e) => e.target.style.opacity = 0.6}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 2: ROLES & PERMISSIONS */}
            {userTab === "roles" && (
              <section style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h4 style={sectionTitleStyle}>System Access Matrix</h4>
                    <p style={{ margin: 0, fontSize: 13, color: "#8a8fa8" }}>Configure granular CRUD permissions exactly as needed per role.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                   <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>Editing Role:</label>
                   <select 
                     value={activeRoleEdit}
                     onChange={(e) => setActiveRoleEdit(e.target.value)}
                     style={{ padding: "8px 12px", borderRadius: 8, border: "2px solid #2a2421", fontSize: 13.5, fontWeight: 700, color: "#2a2421", background: "#f5f2eb", cursor: "pointer", outline: "none" }}
                   >
                     {Object.keys(userRolesConfig).map(role => (
                       <option key={role} value={role}>{role}</option>
                     ))}
                   </select>
                 </div>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid #D0D5DD", overflow: "hidden", marginBottom: 24 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead style={{ background: "#F4F5F7", borderBottom: "2px solid #D0D5DD" }}>
                      <tr>
                        <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: 800, color: "#2a2421", fontSize: 13 }}>Module</th>
                        <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>👀 View Access</th>
                        <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>✍️ Create / Edit</th>
                        <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>🗑️ Delete Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userRolesConfig[activeRoleEdit] && Object.entries(userRolesConfig[activeRoleEdit].modules).map(([modKey, perms], idx) => (
                        <tr key={modKey} style={{ borderBottom: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                          <td style={{ padding: "14px 16px", fontWeight: 700, color: "#2a2421", textTransform: "capitalize" }}>{modKey.replace('_', ' ')}</td>
                          {['view', 'edit', 'delete'].map(action => (
                            <td key={action} style={{ padding: "14px 16px", textAlign: "center" }}>
                              <label style={{ display: "inline-flex", cursor: "pointer" }}>
                                <input 
                                  type="checkbox" 
                                  checked={perms[action]} 
                                  onChange={() => handleTogglePermission(activeRoleEdit, modKey, action)}
                                  disabled={activeRoleEdit === "System Admin"} // Admin always true
                                  style={{ width: 16, height: 16, cursor: activeRoleEdit === "System Admin" ? "not-allowed" : "pointer" }}
                                />
                              </label>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Scope Limitations (CBC Phases) */}
                <div style={{ background: "#FDF8ED", border: "1px solid #F4E5CD", borderRadius: 12, padding: "20px" }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#D97706", fontWeight: 800 }}>📌 Phase Enforcement Rules</h4>
                  <p style={{ margin: "0 0 16px", fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
                    Restrict what data this Role can access dynamically based on the CBC Learning Phase. For example, a Teacher assigned only to "Junior Secondary" will not see Upper Primary data in the modules authorized above.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {[
                      { id: "pp", label: "Pre-Primary" },
                      { id: "lower_pri", label: "Lower Primary" },
                      { id: "upper_pri", label: "Upper Primary" },
                      { id: "jss", label: "Junior Secondary (JSS)" },
                      { id: "sss", label: "Senior Secondary (SSS)" }
                    ].map(phase => {
                      const isChecked = userRolesConfig[activeRoleEdit]?.phases.includes(phase.id);
                      const isAdmin = activeRoleEdit === "System Admin";
                      return (
                        <div 
                          key={phase.id} 
                          onClick={() => !isAdmin && handleTogglePhase(activeRoleEdit, phase.id)}
                          style={{
                            padding: "8px 16px", border: `1.5px solid ${isChecked ? "#D97706" : "#e6dfd8"}`, borderRadius: 30, fontSize: 13, fontWeight: 700,
                            background: isChecked ? "#fff" : "#F4F5F7", color: isChecked ? "#D97706" : "#8a8fa8", cursor: isAdmin ? "not-allowed" : "pointer", transition: "all 0.2s", userSelect: "none", opacity: isAdmin ? 0.6 : 1
                          }}
                        >
                          {isChecked ? "☑ " : "☐ "}{phase.label}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </section>
            )}
          </div>
        )}

        {(activeTab !== "school" && activeTab !== "fees" && activeTab !== "streams" && activeTab !== "grading" && activeTab !== "subjects" && activeTab !== "users") && (

          <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8fa8" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
            <div style={{ fontWeight: 600, color: "#8a8fa8" }}>Module Under Construction</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>The {activeTab} settings module is coming soon.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
