import React, { useState, useRef, useEffect } from 'react';
import { CLASSES, FEE_STRUCTURE, ACADEMIC_GRADES } from '../data/mockData';
import { supabase } from '../lib/supabase';

const Settings = ({ schoolConfig, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || "school");
  const [isLoading, setIsLoading] = useState(false);

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
      
      const pp_g3 = data.filter(g => g.level_group === "pp_g3");
      const g4_g6 = data.filter(g => g.level_group === "g4_g6");
      const g7_g9 = data.filter(g => g.level_group === "g7_g9");
      const g10_g12 = data.filter(g => g.level_group === "g10_g12");
      
      if (pp_g3.length) setGradesPPG3(pp_g3);
      if (g4_g6.length) setGradesG4G6(g4_g6);
      if (g7_g9.length) setGradesG7G9(g7_g9);
      if (g10_g12.length) setGradesG10G12(g10_g12);
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
      if (data) setSchoolInfo(data);
    } catch (err) {
      console.error('Error fetching school info:', err);
    }
  };

  const [schoolLevels, setSchoolLevels] = useState({
    primary: schoolConfig?.schoolType === "Primary & JSS" || schoolConfig?.schoolType === "Primary",
    senior: schoolConfig?.schoolType === "Secondary" || schoolConfig?.schoolType === "SS"
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

  const handleSaveSchoolInfo = async () => {
    setIsLoading(true);
    try {
      const payload = {
        school_id: schoolConfig.id,
        ...schoolInfo
      };

      const { error } = await supabase
        .from('school_information')
        .upsert(payload, { onConflict: 'school_id' });

      if (error) throw error;
      alert('School information saved successfully!');
    } catch (err) {
      alert('Failed to save school info: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Grading System state
  const [gradingLevel, setGradingLevel] = useState("pp_g3");
  const [gradingExpanded, setGradingExpanded] = useState(false);

  const [gradesPPG3, setGradesPPG3] = useState([]);
  const [gradesG4G6, setGradesG4G6] = useState([]);
  const [gradesG7G9, setGradesG7G9] = useState([]);
  const [gradesG10G12, setGradesG10G12] = useState([]);

  const [newGrade, setNewGrade] = useState({ grade: "", label: "", description: "", min: "", max: "", points: "" });

  const handleAddGrade = async () => {
    if (!newGrade.grade.trim()) return;
    try {
      const payload = {
        school_id: schoolConfig.id,
        level_group: gradingLevel,
        grade: newGrade.grade,
        label: newGrade.label,
        min_score: parseInt(newGrade.min) || 0,
        max_score: parseInt(newGrade.max) || 0,
        points: parseInt(newGrade.points) || 0,
        remarks: newGrade.description
      };

      const { data, error } = await supabase
        .from('grading_systems')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      
      if (gradingLevel === "pp_g3") setGradesPPG3(prev => [...prev, data]);
      if (gradingLevel === "g4_g6") setGradesG4G6(prev => [...prev, data]);
      if (gradingLevel === "g7_g9") setGradesG7G9(prev => [...prev, data]);
      if (gradingLevel === "g10_g12") setGradesG10G12(prev => [...prev, data]);
      
      setNewGrade({ grade: "", label: "", description: "", min: "", max: "", points: "" });
    } catch (err) {
      alert('Failed to add grade: ' + err.message);
    }
  };

  const removeGrade = async (id, level) => {
    try {
      const { error } = await supabase
        .from('grading_systems')
        .delete()
        .eq('id', id);
      if (error) throw error;

      if (level === "pp_g3") setGradesPPG3(prev => prev.filter(g => g.id !== id));
      if (level === "g4_g6") setGradesG4G6(prev => prev.filter(g => g.id !== id));
      if (level === "g7_g9") setGradesG7G9(prev => prev.filter(g => g.id !== id));
      if (level === "g10_g12") setGradesG10G12(prev => prev.filter(g => g.id !== id));
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
  const [subjectLevel, setSubjectLevel] = useState("jss");
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
  const [voteheads, setVoteheads] = useState([
    { id: 1, code: "TUI", description: "Tuition Fee" },
    { id: 2, code: "BDI", description: "Boarding Fee" },
    { id: 3, code: "TRN", description: "Transport" },
    { id: 4, code: "EXM", description: "Examination" },
  ]);
  const [newVotehead, setNewVotehead] = useState({ code: "", description: "" });
  const [voteheadsExpanded, setVoteheadsExpanded] = useState(false);

  // Mapping of fees by level: "pp", "lower_pri", "upper_pri", "jss", "sss"
  const [feeStructures, setFeeStructures] = useState({
    "jss": [
      { id: 101, voteheadId: 1, t1: 15000, t2: 12000, t3: 10000 },
      { id: 102, voteheadId: 2, t1: 20000, t2: 20000, t3: 15000 },
      { id: 103, voteheadId: 4, t1: 2000, t2: 2000, t3: 2000 },
    ]
  });
  const [activeFeeLevel, setActiveFeeLevel] = useState("jss");
  const [newFeeItem, setNewFeeItem] = useState({ voteheadId: "", t1: "", t2: "", t3: "" });

  const handleAddVotehead = () => {
    if (!newVotehead.code.trim() || !newVotehead.description.trim()) return;
    setVoteheads(prev => [...prev, { id: Date.now(), ...newVotehead }]);
    setNewVotehead({ code: "", description: "" });
  };


  const handleAddFeeItem = () => {
    if (!newFeeItem.voteheadId) return;
    const item = {
      id: Date.now(),
      voteheadId: parseInt(newFeeItem.voteheadId),
      t1: parseFloat(newFeeItem.t1) || 0,
      t2: parseFloat(newFeeItem.t2) || 0,
      t3: parseFloat(newFeeItem.t3) || 0,
    };
    setFeeStructures(prev => ({
      ...prev,
      [activeFeeLevel]: [...(prev[activeFeeLevel] || []), item]
    }));
    setNewFeeItem({ voteheadId: "", t1: "", t2: "", t3: "" });
  };

  const removeFeeItem = (id) => {
    setFeeStructures(prev => ({
      ...prev,
      [activeFeeLevel]: prev[activeFeeLevel].filter(item => item.id !== id)
    }));
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
    setSchoolLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const handleLogoUpload = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setLogoPreview(e.target.result);
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

            {/* Level Tabs */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, overflowX: "auto", paddingBottom: 8 }}>
              {[{ id: "pp_g3", label: "PP1 – Grade 3", icon: "🧒", c: gradesPPG3.length },
                { id: "g4_g6", label: "Grade 4–6 (KPSEA)", icon: "📘", c: gradesG4G6.length },
                { id: "g7_g9", label: "Grade 7–9 (KJSEA)", icon: "📗", c: gradesG7G9.length },
                { id: "g10_g12", label: "Grade 10–12 (KCSE)", icon: "📕", c: gradesG10G12.length }
              ].map(level => (
                <button
                  key={level.id}
                  onClick={() => { setGradingLevel(level.id); setGradingExpanded(false); setNewGrade({ grade: "", label: "", description: "", min: "", max: "", points: "" }); }}
                  style={{
                    padding: "10px 18px",
                    background: gradingLevel === level.id ? "#D4AF37" : "#fff",
                    color: gradingLevel === level.id ? "#fff" : "#8a8fa8",
                    border: gradingLevel === level.id ? "1px solid #D4AF37" : "1px solid #e6dfd8",
                    borderRadius: 30,
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.2s",
                    whiteSpace: "nowrap"
                  }}
                  onMouseEnter={(e) => { if (gradingLevel !== level.id) e.target.style.background = "#f5f2eb"; }}
                  onMouseLeave={(e) => { if (gradingLevel !== level.id) e.target.style.background = "#fff"; }}
                >
                  <span>{level.icon}</span>
                  {level.label}
                  <span style={{
                    background: gradingLevel === level.id ? "rgba(255,255,255,0.2)" : "#e6dfd8",
                    color: gradingLevel === level.id ? "#fff" : "#8a8fa8",
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 11
                  }}>{level.c}</span>
                </button>
              ))}
            </div>

            {/* Info Banner */}
            <div style={{
              background: "#f5f2eb",
              border: "1px solid #C4E1FA",
              borderRadius: 12,
              padding: "14px 20px",
              marginBottom: 24,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <div>
                <h4 style={{ margin: "0 0 4px", fontSize: 13.5, color: "#2a2421", fontWeight: 700 }}>
                  {gradingLevel === "pp_g3" && "Observation Rubric (Formative Assessment)"}
                  {gradingLevel === "g4_g6" && "4-Level Competency Scale (KPSEA)"}
                  {gradingLevel === "g7_g9" && "8-Point Achievement Levels (KJSEA)"}
                  {gradingLevel === "g10_g12" && "8-Point Achievement Levels (Senior School)"}
                </h4>
                <p style={{ margin: 0, fontSize: 12.5, color: "#3B75A7", lineHeight: 1.5 }}>
                  {gradingLevel === "pp_g3" && "Pre-primary to Grade 3 uses purely formative assessment based on observation. There are no national exams, marks, or rankings, only qualitative rubric descriptions."}
                  {gradingLevel === "g4_g6" && "Grade 4–6 incorporates the first national assessment (KPSEA). It uses a 4-level EE/ME/AE/BE scale. Learners are not ranked."}
                  {gradingLevel === "g7_g9" && "Junior Secondary is pivotal. It uses an 8-point scale (EE1 down to BE2) ensuring every learner is recognized with at least 1 point. No zero marks exist."}
                  {gradingLevel === "g10_g12" && "Senior Secondary follows the same competency-based 8-point scale (EE1 down to BE2) as JSS, focusing on holistic development and specialized pathways."}
                </p>
              </div>
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
                  <input type="text" placeholder="e.g. EE" value={newGrade.grade} onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                </div>
                
                {gradingLevel !== "pp_g3" && (
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <label style={labelStyle}>Description / Label</label>
                    <input type="text" placeholder="e.g. Exceeding Expectations" value={newGrade.label} onChange={(e) => setNewGrade({ ...newGrade, label: e.target.value })} style={{ ...inputStyle, paddingLeft: 14 }} />
                  </div>
                )}

                {gradingLevel === "pp_g3" && (
                  <div style={{ flex: 3, minWidth: 250 }}>
                    <label style={labelStyle}>Rubric Notes</label>
                    <input type="text" placeholder="Learner surpasses expected level..." value={newGrade.description} onChange={(e) => setNewGrade({ ...newGrade, description: e.target.value })} style={{ ...inputStyle, paddingLeft: 14 }} />
                  </div>
                )}

                {gradingLevel !== "pp_g3" && (
                  <>
                    <div style={{ width: 80 }}>
                      <label style={labelStyle}>Min %</label>
                      <input type="number" placeholder="76" value={newGrade.min} onChange={(e) => setNewGrade({ ...newGrade, min: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                    </div>
                    <div style={{ width: 80 }}>
                      <label style={labelStyle}>Max %</label>
                      <input type="number" placeholder="100" value={newGrade.max} onChange={(e) => setNewGrade({ ...newGrade, max: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                    </div>
                  </>
                )}

                {(gradingLevel === "g7_g9" || gradingLevel === "g10_g12") && (
                  <div style={{ width: 80 }}>
                    <label style={labelStyle}>Points</label>
                    <input type="number" placeholder="8" value={newGrade.points} onChange={(e) => setNewGrade({ ...newGrade, points: e.target.value })} style={{ ...inputStyle, paddingLeft: 12, textAlign: "center" }} />
                  </div>
                )}

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
                          {gradingLevel !== "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Label</th>}
                          {gradingLevel === "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, color: "#8a8fa8", fontSize: 12 }}>Rubric Notes</th>}
                          {gradingLevel !== "pp_g3" && <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 90 }}>Range %</th>}
                          {(gradingLevel === "g7_g9" || gradingLevel === "g10_g12") && <th style={{ padding: "11px 16px", textAlign: "center", fontWeight: 700, color: "#8a8fa8", fontSize: 12, width: 80 }}>Points</th>}
                          <th style={{ padding: "11px 16px", textAlign: "center", width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(gradingLevel === "pp_g3" ? gradesPPG3 : gradingLevel === "g4_g6" ? gradesG4G6 : gradingLevel === "g7_g9" ? gradesG7G9 : gradesG10G12).map((g, idx) => {
                          const badge = getBadgeColors(g.grade);
                          return (
                            <tr key={g.id} style={{ borderTop: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                              <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700 }}>
                                <span style={{ background: badge.bg, color: badge.text, padding: "4px 10px", borderRadius: 6, fontSize: 13 }}>{g.grade}</span>
                              </td>
                              {gradingLevel !== "pp_g3" && <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2a2421" }}>{g.label}</td>}
                              {gradingLevel === "pp_g3" && <td style={{ padding: "12px 16px", color: "#6A6A8A", fontSize: 13 }}>{g.description}</td>}
                              {gradingLevel !== "pp_g3" && (
                                <td style={{ padding: "12px 16px", textAlign: "center", color: "#8a8fa8", fontWeight: 600, fontSize: 12.5 }}>
                                  {g.min} – {g.max}
                                </td>
                              )}
                              {(gradingLevel === "g7_g9" || gradingLevel === "g10_g12") && (
                                <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#D4AF37" }}>{g.points}</td>
                              )}
                              <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                <button onClick={() => removeGrade(g.id, gradingLevel)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b", opacity: 0.5, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.target.style.opacity = 1} onMouseLeave={(e) => e.target.style.opacity = 0.5}>🗑️</button>
                              </td>
                            </tr>
                          );
                        })}
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
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #e6dfd8", flexWrap: "wrap", gap: 16,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: "#2a2421", fontWeight: 800, letterSpacing: "-0.02em" }}>Fee Structure</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#8a8fa8", lineHeight: 1.5 }}>
                  Manage global Voteheads and map fee structures to CBC learning levels.
                </p>
              </div>
              <button style={{
                padding: "11px 28px", background: "linear-gradient(135deg, #D4AF37, #28a05f)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13.5, boxShadow: "0 2px 8px rgba(27,107,58,0.25)", transition: "all 0.2s ease",
              }}>💾 Save Changes</button>
            </div>

            {/* 1. VOTEHEADS MANAGEMENT (Hidden List/Dictionary) */}
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
                <button
                  onClick={handleAddVotehead}
                  style={{
                    padding: "11px 22px", background: "linear-gradient(135deg, #D4AF37, #28a05f)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13, boxShadow: "0 2px 6px rgba(27,107,58,0.2)",
                  }}
                >+ Add Votehead</button>
              </div>
            </div>

            {/* 2. DYNAMIC FEE STRUCTURE (BY LEVEL) */}
            <section style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                 <h4 style={sectionTitleStyle}>🏫 Level-Specific Fee Structure</h4>
                 <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                   <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8fa8" }}>Select Level:</label>
                   <select 
                     value={activeFeeLevel}
                     onChange={(e) => setActiveFeeLevel(e.target.value)}
                     style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 13, fontWeight: 600, color: "#2a2421", background: "#f5f2eb", cursor: "pointer" }}
                   >
                     <option value="pp">Pre-Primary (PP1–PP2)</option>
                     <option value="lower_pri">Lower Primary (G1–G3)</option>
                     <option value="upper_pri">Upper Primary (G4–G6)</option>
                     <option value="jss">Junior Secondary (G7–G9)</option>
                     <option value="sss">Senior Secondary (G10–G12)</option>
                   </select>
                 </div>
              </div>

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
                    {voteheads.map(vh => (
                      <option key={vh.id} value={vh.id}>{vh.code} - {vh.description}</option>
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
                      <th style={{ padding: "12px 16px", textAlign: "center", width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!feeStructures[activeFeeLevel] || feeStructures[activeFeeLevel].length === 0) ? (
                      <tr><td colSpan="7" style={{ textAlign: "center", padding: "30px", color: "#8a8fa8", fontSize: 13 }}>No fee items added for this level.</td></tr>
                    ) : (
                      feeStructures[activeFeeLevel].map((item, idx) => {
                        const vh = voteheads.find(v => v.id === item.voteheadId);
                        const rowTotal = item.t1 + item.t2 + item.t3;
                        return (
                          <tr key={item.id} style={{ borderBottom: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#f5f2eb" }}>
                            <td style={{ padding: "12px 16px", color: "#8a8fa8", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: "12px 16px" }}>
                              {vh ? (
                                <div>
                                  <span style={{ fontWeight: 700, color: "#2a2421", marginRight: 8, fontSize: 12 }}>{vh.code}</span>
                                  <span style={{ fontWeight: 600, color: "#2a2421" }}>{vh.description}</span>
                                </div>
                              ) : <span style={{ color: "red" }}>Warning: Deleted Votehead</span>}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#8a8fa8", fontFamily: "monospace", fontSize: 13 }}>{item.t1.toLocaleString()}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#8a8fa8", fontFamily: "monospace", fontSize: 13 }}>{item.t2.toLocaleString()}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "#8a8fa8", fontFamily: "monospace", fontSize: 13 }}>{item.t3.toLocaleString()}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#D4AF37", background: "#f0f4f8", fontFamily: "monospace", fontSize: 13.5 }}>{rowTotal.toLocaleString()}</td>
                            <td style={{ padding: "12px 16px", textAlign: "center" }}>
                               <button onClick={() => removeFeeItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#c0392b" }}>🗑️</button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* Dynamic Vertical Footer Totals */}
                  {feeStructures[activeFeeLevel] && feeStructures[activeFeeLevel].length > 0 && (() => {
                     const totalT1 = feeStructures[activeFeeLevel].reduce((sum, item) => sum + item.t1, 0);
                     const totalT2 = feeStructures[activeFeeLevel].reduce((sum, item) => sum + item.t2, 0);
                     const totalT3 = feeStructures[activeFeeLevel].reduce((sum, item) => sum + item.t3, 0);
                     const grandTotal = totalT1 + totalT2 + totalT3;
                     return (
                       <tfoot style={{ background: "#2a2421" }}>
                         <tr>
                           <td colSpan="2" style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800, color: "#fff", fontSize: 13, letterSpacing: "1px" }}>GRAND TOTALS:</td>
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

            {/* Level & Grade Selector */}
            <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: "#8a8fa8" }}>1. Learning Phase:</label>
                <div style={{ position: "relative", width: 240 }}>
                  <select
                    value={subjectLevel}
                    onChange={(e) => {
                      setSubjectLevel(e.target.value);
                      setSubjectsExpanded(false);
                      setSelectedSubjectGrade(""); // Reset grade when phase changes
                      setNewSubject({ name: "", code: "", type: e.target.value === "sss" ? "Compulsory" : "Core" });
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #D0D5DD",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#2a2421",
                      background: "#f5f2eb",
                      appearance: "none",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                    }}
                  >
                    <option value="pp">👦 Pre-Primary (PP1–PP2)</option>
                    <option value="lower_pri">🎒 Lower Primary (G1–G3)</option>
                    <option value="upper_pri">📚 Upper Primary (G4–G8)</option>
                    <option value="jss">🏫 Junior Secondary (G7–G9)</option>
                    <option value="sss">🎓 Senior Secondary (G10–G12)</option>
                  </select>
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 13.5, fontWeight: 700, color: "#8a8fa8" }}>2. Specific Grade:</label>
                <div style={{ position: "relative", width: 200 }}>
                  <select
                    value={selectedSubjectGrade}
                    onChange={(e) => setSelectedSubjectGrade(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #D0D5DD",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#2a2421",
                      background: "#f5f2eb",
                      appearance: "none",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                    }}
                  >
                    <option value="">-- Select Grade --</option>
                    {CLASSES.filter(c => {
                      if (subjectLevel === "pp") return c.id.startsWith("pp");
                      if (subjectLevel === "lower_pri") return ["p1", "p2", "p3"].includes(c.id);
                      if (subjectLevel === "upper_pri") return ["p4", "p5", "p6", "p7", "p8"].includes(c.id);
                      if (subjectLevel === "jss") return c.type === "JSS";
                      if (subjectLevel === "sss") return c.type === "SS";
                      return false;
                    }).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                </div>
              </div>
            </div>


            {/* Subjects Content Block */}
            <section style={sectionCardStyle}>

              {/* Add Subject Form */}
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
                <div style={{ width: 100 }}>
                  <label style={labelStyle}>Code</label>
                  <input type="text" placeholder="e.g. MATH" value={newSubject.code} onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })} style={{ ...inputStyle, paddingLeft: 12 }} />
                </div>
                
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={labelStyle}>Subject Name</label>
                  <input type="text" placeholder="e.g. Integrated Science" value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} style={{ ...inputStyle, paddingLeft: 14 }} onKeyDown={(e) => e.key === "Enter" && handleAddSubject()} />
                </div>

                <div style={{ width: 140 }}>
                  <label style={labelStyle}>Type</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={newSubject.type}
                      onChange={(e) => setNewSubject({ ...newSubject, type: e.target.value })}
                      style={{ ...inputStyle, paddingLeft: 14, appearance: "none", cursor: "pointer" }}
                    >
                      {subjectLevel === "sss" ? (
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
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 11, color: "#8a8fa8" }}>▼</span>
                  </div>
                </div>

                <button
                  onClick={handleAddSubject}
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
