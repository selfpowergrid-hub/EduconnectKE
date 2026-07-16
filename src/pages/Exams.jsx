import React, { useState, useEffect, useMemo } from 'react';
import { STUDENTS, getClassesByType, SUBJECTS_BY_LEVEL, COMPETENCY_GRADES, defaultGradesFor } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { LEVELS, gradesByLevelForSchool } from '../lib/schoolLevels';

const getGradeLevel = (classId) => {
  if (classId.startsWith("p")) return "upper_primary"; // p1-p8
  if (classId.startsWith("g")) return "jss"; // g7-g9
  if (classId.startsWith("f")) return "senior"; // f1-f4
  return "upper_primary";
};

const Exams = ({ schoolConfig, examsList, setExamsList }) => {
  // Tab State: 'listings' | 'options' | 'entry'
  const [activeTab, setActiveTab] = useState("listings");

  // Levels/grades scoped to what this school actually teaches.
  const GRADES_BY_LEVEL = useMemo(
    () => gradesByLevelForSchool(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );

  const currentTypeClasses = useMemo(() => {
    return getClassesByType(schoolConfig?.schoolType);
  }, [schoolConfig]);

  // --- Exam Listings State ---
  // Received as props from App.jsx
  const [newExam, setNewExam] = useState({ name: "", subject: "Mathematics", weight: "", total_marks: "100", order: "" });

  const [filterLevel, setFilterLevel] = useState(() => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0]);
  const [filterGrade, setFilterGrade] = useState(() => Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0][0]);
  const [filterTerm, setFilterTerm] = useState("Term 1");

  // Sync filterGrade when filterLevel changes
  useEffect(() => {
    setFilterGrade((GRADES_BY_LEVEL[filterLevel] || [])[0]);
    fetchGradingSystems();
  }, [filterLevel]);

  useEffect(() => {
    fetchGradingSystems();
    // Grading is scoped to Level + Grade (term-independent by design), so it
    // refreshes whenever either of those changes — but not on Term change.
    // schoolConfig?.id is included because on a fresh page load it arrives
    // asynchronously AFTER mount; without it here the initial fetch bails out
    // (no school id yet) and the saved config never loads until navigation.
  }, [filterGrade, filterLevel, schoolConfig?.id]);

  const fetchGradingSystems = async () => {
    if (!schoolConfig?.id) return;
    setIsGradingLoading(true);
    try {
      const { data, error } = await supabase
        .from('grading_systems')
        .select('*')
        .eq('school_id', schoolConfig.id);
      
      if (error) throw error;

      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
      };
      const gid = gradeIdMap[filterGrade];

      // Filter for specific grade or fall back to level
      let filtered = data.filter(g => g.school_grade === (filterGrade || "All"));
      if (filtered.length === 0) {
        filtered = data.filter(g => g.school_grade === "All" && g.school_level === filterLevel);
      }

      // Map from DB schema to customGrades state
      filtered = filtered.map(g => ({
        ...g,
        label: g.description, // map description to label for state
      }));

      // If still empty, use the built-in defaults for this grade
      // (Form 3/4 → A–E scale; PP1–Grade 12 → competency scale).
      if (filtered.length === 0) {
        filtered = defaultGradesFor(filterGrade).map(g => ({ ...g, label: g.description }));
      }

      setCustomGrades(filtered);
      setEditingGradeIdx(null);
      setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
    } catch (err) {
      console.error('Error fetching grades:', err);
    } finally {
      setIsGradingLoading(false);
    }
  };

  const filteredExams = useMemo(() => {
    const gradeIdMap = {
      "PP1": "pp1", "PP2": "pp2",
      "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
      "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
      "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
    };
    const targetGid = gradeIdMap[filterGrade];
    return examsList.filter(e => e.level_id === targetGid && e.term === filterTerm);
  }, [examsList, filterGrade, filterTerm]);

  // Removed newExam grade sync since it uses global scope now

  const [subjectGrading, setSubjectGrading] = useState({});
  // gradingScope removed in favor of global grading

  const [selectedSubjectForGrading, setSelectedSubjectForGrading] = useState("");
  const [newGradeEntry, setNewGradeEntry] = useState({ code: "", label: "", min: "", max: "", points: "" });
  const [editingGradeIdx, setEditingGradeIdx] = useState(null); // index into customGrades being edited via the entry form
  const [customGrades, setCustomGrades] = useState([]);
  const [isGradingLoading, setIsGradingLoading] = useState(false);

  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);

  const levelToSubjectKey = {
    "Pre-Primary": "ecde",
    "Primary": "upper_primary",
    "Junior Secondary": "jss",
    "Senior Secondary": "senior"
  };
  
  const currentSubjects = useMemo(() => {
    return SUBJECTS_BY_LEVEL[levelToSubjectKey[filterLevel]] || [];
  }, [filterLevel]);

  // --- Exam Options State ---
  const [examOptions, setExamOptions] = useState({
    weighting: { cat1: 30, cat2: 30, endterm: 40 },
    maxMarks: 100,
    gradingScale: "cbc_standard" // cbc_standard | kcse_standard
  });

  const [selectedClass, setSelectedClass] = useState(currentTypeClasses[0]?.id || "");
  const [selectedStream, setSelectedStream] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  // const [marksData, setMarksData] = useState({}); // Moved to ExamEntries.jsx

  const gradeLevel = getGradeLevel(selectedClass);
  const availableSubjects = useMemo(() => SUBJECTS_BY_LEVEL[gradeLevel] || [], [gradeLevel]);
  
  // Set initial subject when class changes or if not set
  useEffect(() => {
    if (availableSubjects.length > 0 && (!selectedSubject || !availableSubjects.includes(selectedSubject))) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  const students = useMemo(() => {
    return STUDENTS.filter(s => s.gradeId === selectedClass && s.stream === selectedStream);
  }, [selectedClass, selectedStream]);

  // --- Edit Exam Modal State ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditModal = (exam) => {
    // Reverse map the level_id to the human-readable grade name
    const idToGradeMap = {
      "pp1": "PP1", "pp2": "PP2",
      "g1": "Grade 1", "g2": "Grade 2", "g3": "Grade 3", "g4": "Grade 4", "g5": "Grade 5", "g6": "Grade 6",
      "g7": "Grade 7", "g8": "Grade 8", "g9": "Grade 9",
      "g10": "Grade 10", "g11": "Grade 11", "g12": "Grade 12", "f3": "Form 3", "f4": "Form 4"
    };
    
    // Find the Level based on the Grade — use the full level map so an exam
    // for a grade outside this school's current scope still resolves.
    let detectedLevel = "Primary";
    const gradeName = idToGradeMap[exam.level_id];
    for (const [lvl, grades] of Object.entries(LEVELS)) {
      if (grades.includes(gradeName)) {
        detectedLevel = lvl;
        break;
      }
    }

    setEditingExam({
      ...exam,
      level: detectedLevel,
      grade: gradeName,
      weight: exam.weight || 0,
      total_marks: exam.total_marks || 100,
      order: exam.display_order || 1,
      _originalLevelId: exam.level_id,
      _originalTerm: exam.term,
      _originalOrder: exam.display_order || 1
    });
    setShowEditModal(true);
  };

  const handleUpdateExam = async () => {
    if (!editingExam.name.trim()) return;
    setIsSavingEdit(true);
    try {
      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
      };

      const newLevelId = gradeIdMap[editingExam.grade];
      const newTerm = editingExam.term;
      const scopeChanged = newLevelId !== editingExam._originalLevelId || newTerm !== editingExam._originalTerm;

      const newScopeSiblings = examsList.filter(e =>
        e.id !== editingExam.id && e.level_id === newLevelId && e.term === newTerm
      );
      const requested = parseInt(editingExam.order);
      const maxAllowed = newScopeSiblings.length + 1;
      const newOrder = Number.isFinite(requested) && requested > 0
        ? Math.min(requested, maxAllowed)
        : maxAllowed;

      // Compute sibling shifts
      const updates = [];
      if (scopeChanged) {
        newScopeSiblings.forEach(e => {
          if ((e.display_order || 0) >= newOrder) {
            updates.push({ id: e.id, display_order: (e.display_order || 0) + 1 });
          }
        });
      } else if (newOrder !== editingExam._originalOrder) {
        const oldOrder = editingExam._originalOrder;
        if (newOrder < oldOrder) {
          // moving up: bump items in [newOrder, oldOrder-1] down by +1
          newScopeSiblings.forEach(e => {
            const o = e.display_order || 0;
            if (o >= newOrder && o < oldOrder) updates.push({ id: e.id, display_order: o + 1 });
          });
        } else {
          // moving down: bump items in [oldOrder+1, newOrder] up by -1
          newScopeSiblings.forEach(e => {
            const o = e.display_order || 0;
            if (o > oldOrder && o <= newOrder) updates.push({ id: e.id, display_order: o - 1 });
          });
        }
      }

      if (updates.length > 0) {
        const results = await Promise.all(updates.map(u =>
          supabase.from('exams').update({ display_order: u.display_order }).eq('id', u.id)
        ));
        const firstErr = results.find(r => r.error);
        if (firstErr) throw firstErr.error;
      }

      const payload = {
        name: editingExam.name,
        term: newTerm,
        level: editingExam.level,
        level_id: newLevelId,
        weight: parseInt(editingExam.weight) || 0,
        total_marks: parseInt(editingExam.total_marks) || 100,
        status: editingExam.status,
        display_order: newOrder
      };

      const { error } = await supabase
        .from('exams')
        .update(payload)
        .eq('id', editingExam.id);

      if (error) throw error;

      const updatedIds = new Map(updates.map(u => [u.id, u.display_order]));
      setExamsList(prev => {
        const next = prev.map(e => {
          if (e.id === editingExam.id) return { ...e, ...payload };
          if (updatedIds.has(e.id)) return { ...e, display_order: updatedIds.get(e.id) };
          return e;
        });
        return [...next].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      });
      setShowEditModal(false);
      alert('Exam updated successfully!');
    } catch (err) {
      alert('Failed to update exam: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getGrade = (score, level) => {
    // Both JSS and Senior now use the competency-based 8-point scale
    const scale = COMPETENCY_GRADES;
    for (const g of scale) {
      if (score >= g.min) return g;
    }
    return scale[scale.length - 1];
  };

  // --- Excel Grid Logic ---
  const termExams = useMemo(() => 
    examsList.filter(e => e.term === selectedTerm), 
    [examsList, selectedTerm]
  );



  const handleAddExam = async () => {
    if (!newExam.name.trim()) return;
    try {
      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
      };
      const gid = gradeIdMap[filterGrade];

      const scopeExams = examsList.filter(e => e.level_id === gid && e.term === filterTerm);
      const nextOrder = scopeExams.reduce((max, e) => Math.max(max, e.display_order || 0), 0) + 1;
      const requested = parseInt(newExam.order);
      const chosenOrder = Number.isFinite(requested) && requested > 0
        ? Math.min(requested, nextOrder)
        : nextOrder;

      // Push down existing siblings at or after the chosen slot
      const toBump = scopeExams.filter(e => (e.display_order || 0) >= chosenOrder);
      if (toBump.length > 0) {
        const bumpResults = await Promise.all(toBump.map(e =>
          supabase.from('exams').update({ display_order: (e.display_order || 0) + 1 }).eq('id', e.id)
        ));
        const bumpErr = bumpResults.find(r => r.error);
        if (bumpErr) throw bumpErr.error;
      }

      const payload = {
        school_id: schoolConfig.id,
        name: newExam.name,
        term: filterTerm,
        year: new Date().getFullYear(),
        level: filterLevel,
        level_id: gid,
        weight: parseInt(newExam.weight) || 0,
        total_marks: parseInt(newExam.total_marks) || 100,
        status: "Upcoming",
        display_order: chosenOrder
      };

      const { data, error } = await supabase
        .from('exams')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setExamsList(prev => {
        const bumpedIds = new Set(toBump.map(e => e.id));
        const next = prev.map(e => bumpedIds.has(e.id) ? { ...e, display_order: (e.display_order || 0) + 1 } : e);
        next.push(data);
        return [...next].sort((a, b) => {
          if (a.school_id !== b.school_id) return 0;
          return (a.display_order || 0) - (b.display_order || 0);
        });
      });
      setNewExam({ ...newExam, name: "", weight: "", total_marks: "100", order: "" });
      alert('Exam registered successfully!');
    } catch (err) {
      alert('Failed to register exam: ' + err.message);
    }
  };

  const updateExam = async (id, field, value) => {
    try {
      // Note: Our DB schema uses 'name', 'term', 'status' etc. 
      // The mock used 'weight' which we'll need to handle or map if needed.
      const { error } = await supabase
        .from('exams')
        .update({ [field]: value })
        .eq('id', id);
      
      if (error) throw error;
      setExamsList(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    } catch (err) {
      console.error('Error updating exam:', err);
    }
  };

  // gradesOverride: optional explicit list to persist (used by "Load Default
  // Settings", where state hasn't flushed yet). When absent, saves the current
  // on-screen list plus any grade still typed in the entry form.
  const handleSaveGrading = async (gradesOverride) => {
    const usingOverride = Array.isArray(gradesOverride);
    setIsGradingLoading(true);
    try {
      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
      };
      const gid = gradeIdMap[filterGrade];
      const targetGroup = gid || filterLevel;

      if (!schoolConfig?.id) {
        throw new Error('School is still loading — please wait a moment and try again.');
      }

      // 1. Delete existing for this group first (to perform a clean replacement)
      const { error: delError } = await supabase
        .from('grading_systems')
        .delete()
        .eq('school_id', schoolConfig.id)
        .eq('school_level', filterLevel)
        .eq('school_grade', filterGrade || "All");

      if (delError) throw delError;

      // 2. Fold in whatever is typed in the entry form but not yet added, so
      //    Save never silently drops the grade the user is looking at.
      //    (Users often type a grade and hit Save without clicking Add first.)
      let effectiveGrades = usingOverride ? [...gradesOverride] : [...customGrades];
      if (!usingOverride && newGradeEntry.code && newGradeEntry.min) {
        const pending = {
          grade: newGradeEntry.code,
          label: newGradeEntry.label,
          min_score: parseInt(newGradeEntry.min) || 0,
          max_score: parseInt(newGradeEntry.max) || 100,
          points: parseInt(newGradeEntry.points) || 0
        };
        if (editingGradeIdx !== null && effectiveGrades[editingGradeIdx]) {
          effectiveGrades[editingGradeIdx] = { ...effectiveGrades[editingGradeIdx], ...pending };
        } else {
          effectiveGrades.push(pending);
        }
      }

      // 3. Prepare payload
      const records = effectiveGrades.map(g => ({
        school_id: schoolConfig.id,
        school_level: filterLevel,
        school_grade: filterGrade || "All",
        grade: g.grade || g.code,
        description: g.label,
        min_score: parseInt(g.min_score || g.min) || 0,
        max_score: parseInt(g.max_score || g.max) || 100,
        points: parseInt(g.points) || 0
      }));

      if (records.length > 0) {
        // .select() so we can VERIFY the rows actually persisted. Under RLS a
        // blocked insert can return no error but zero rows; without this we'd
        // falsely report success and the config would be gone on refresh.
        const { data: inserted, error } = await supabase
          .from('grading_systems')
          .insert(records)
          .select();
        if (error) throw error;
        if (!inserted || inserted.length !== records.length) {
          throw new Error(
            `Save was not persisted (expected ${records.length} grade${records.length === 1 ? '' : 's'}, database stored ${inserted?.length || 0}). ` +
            `You may not have permission to edit this school's grading system.`
          );
        }
      }

      // 4. Re-read from the DB so the on-screen list reflects the true saved
      //    state (also confirms readback works for this scope).
      await fetchGradingSystems();

      alert('Grading configuration saved successfully!');
    } catch (err) {
      alert('Failed to save grading: ' + err.message);
    } finally {
      setIsGradingLoading(false);
    }
  };

  // Replace the current scope's grading with the app's built-in defaults
  // (Form 3/4 → A–E scale, PP1–Grade 12 → competency scale) and save.
  const handleLoadDefaults = async () => {
    const scopeName = filterGrade || filterLevel;
    const ok = window.confirm(
      `Load the default grading settings for ${scopeName}?\n\n` +
      `⚠️ WARNING: everything currently entered for ${scopeName} will be REPLACED by the defaults and saved immediately. This cannot be undone.`
    );
    if (!ok) return;

    const defaults = defaultGradesFor(filterGrade).map(g => ({ ...g, label: g.description }));
    setCustomGrades(defaults);
    setEditingGradeIdx(null);
    setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
    await handleSaveGrading(defaults);
  };

  const moveExam = async (exam, direction) => {
    const siblings = examsList
      .filter(e => e.level_id === exam.level_id && e.term === exam.term)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const idx = siblings.findIndex(e => e.id === exam.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const neighbour = siblings[swapIdx];

    const a = { id: exam.id, order: neighbour.display_order };
    const b = { id: neighbour.id, order: exam.display_order };

    try {
      const [r1, r2] = await Promise.all([
        supabase.from('exams').update({ display_order: a.order }).eq('id', a.id),
        supabase.from('exams').update({ display_order: b.order }).eq('id', b.id),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      setExamsList(prev => {
        const next = prev.map(e => {
          if (e.id === a.id) return { ...e, display_order: a.order };
          if (e.id === b.id) return { ...e, display_order: b.order };
          return e;
        });
        return [...next].sort((x, y) => (x.display_order || 0) - (y.display_order || 0));
      });
    } catch (err) {
      alert('Failed to reorder: ' + err.message);
    }
  };

  const removeExam = async (id) => {
    if (!confirm('Are you sure you want to delete this exam?')) return;
    try {
      const { error } = await supabase
        .from('exams')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      setExamsList(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      alert('Failed to delete exam: ' + err.message);
    }
  };

  // Shared Styles
  const activeColor = "#D4AF37";
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 800, color: "#2a2421", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputStyle = { width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 14, background: "#fff", outline: "none", transition: "all 0.2s ease", boxSizing: "border-box" };
  const sectionCardStyle = { background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* Toolbar: Navigation Tabs (left) + Scope Filters (right) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "nowrap" }}>
          {[
            { id: "listings", label: "Exam Listings", icon: "📅" },
            { id: "options", label: "Weighting & Grading", icon: "⚙️" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "14px 26px",
                background: activeTab === tab.id ? activeColor : "#fff",
                color: activeTab === tab.id ? "#fff" : "#2a2421",
                border: activeTab === tab.id ? "none" : "1px solid #e6dfd8",
                borderRadius: 30,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                boxShadow: activeTab === tab.id ? "0 2px 6px rgba(212,175,55,0.35)" : "0 1px 2px rgba(0,0,0,0.03)"
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #e6dfd8", borderRadius: 30, padding: "10px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#2a2421", letterSpacing: "0.04em" }}>LEVEL</span>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12, fontWeight: 600, border: "1px solid #e6dfd8", background: "#faf8f5" }}>
              {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
            </select>
          </div>
          <div style={{ width: 1, height: 22, background: "#e6dfd8" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#2a2421", letterSpacing: "0.04em" }}>GRADE</span>
            <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12, fontWeight: 600, border: "1px solid #e6dfd8", background: "#faf8f5" }}>
              {(GRADES_BY_LEVEL[filterLevel] || []).map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ width: 1, height: 22, background: "#e6dfd8" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#2a2421", letterSpacing: "0.04em" }}>TERM</span>
            <select value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12, fontWeight: 600, border: "1px solid #e6dfd8", background: "#faf8f5" }}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
            </select>
          </div>
        </div>
      </div>

      {/* 1. EXAM LISTINGS TAB */}
      {activeTab === "listings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Add Exam Form */}
          <section style={sectionCardStyle}>
            <h4 style={{ margin: "0 0 28px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Register New Examination</h4>

            {/* ROW 1: Order, Exam Name, Cut Off Mark, Register Button */}
            {(() => {
              const gradeIdMap = {
                "PP1": "pp1", "PP2": "pp2",
                "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
                "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
                "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
              };
              const scopeGid = gradeIdMap[filterGrade];
              const scopeCount = examsList.filter(e => e.level_id === scopeGid && e.term === filterTerm).length;
              const nextOrderPlaceholder = String(scopeCount + 1);
              return (
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 2fr 1fr 1.2fr",
              gap: 20,
              alignItems: "flex-end"
            }}>
              <div>
                <label style={labelStyle}>Order #</label>
                <input
                  type="number"
                  min="1"
                  placeholder={nextOrderPlaceholder}
                  value={newExam.order}
                  onChange={(e) => setNewExam({...newExam, order: e.target.value})}
                  style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }}
                  title={`Leave blank to append at position ${nextOrderPlaceholder}. Enter a lower number to insert and push others down.`}
                />
              </div>
              <div>
                <label style={labelStyle}>Exam Name</label>
                <input type="text" placeholder="e.g. End of Term 1" value={newExam.name} onChange={(e) => setNewExam({...newExam, name: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Marks Out Of</label>
                <input type="number" min="1" placeholder="100" value={newExam.total_marks} onChange={(e) => setNewExam({...newExam, total_marks: e.target.value})} style={inputStyle} title="What the exam is graded against (e.g. 30, 50, 100). Independent of other exams." />
              </div>
              <div>
                <button
                  onClick={handleAddExam}
                  style={{ 
                    width: "100%",
                    height: 46, 
                    background: activeColor, 
                    color: "#fff", 
                    border: "none", 
                    borderRadius: 10, 
                    fontSize: 14, 
                    fontWeight: 700, 
                    cursor: "pointer", 
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 12px rgba(204, 120, 92, 0.2)"
                  }}
                >
                  <span style={{ fontSize: 16 }}>+</span> Register Examination
                </button>
              </div>
            </div>
              );
            })()}
          </section>

          {/* Exams Selection & Editable Grid */}
          <section style={{ ...sectionCardStyle, padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
              <h4 style={{ margin: 0, fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Manage Active Examinations</h4>
            </div>

            <div className="table-container" style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
                  <tr>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>EXAMINATION NAME</th>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>TERM</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>MARKS OUT OF</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>STATUS</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((exam, idx) => (
                    <tr key={exam.id} style={{ borderBottom: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "12px 18px", fontWeight: 700, color: "#2a2421" }}>
                        <span style={{ display: "inline-block", minWidth: 22, marginRight: 8, color: "#8A8FA8", fontWeight: 700, fontSize: 12 }}>
                          {idx + 1}.
                        </span>
                        {exam.name}
                      </td>
                      <td style={{ padding: "12px 18px", color: "#4A4A6A" }}>
                        {exam.term}
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "center", fontWeight: 800, color: activeColor }}>
                        / {exam.total_marks || 100}
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "center" }}>
                        <select
                          value={exam.status}
                          onChange={(e) => updateExam(exam.id, 'status', e.target.value)}
                          style={{
                            padding: "4px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, border: "none", outline: "none", cursor: "pointer",
                            background: exam.status === "Published" || exam.status === "Completed" ? "#ebf5ee" : exam.status === "Ongoing" ? "#fff9e6" : "#f4f5f7",
                            color: exam.status === "Published" || exam.status === "Completed" ? "#1B6B3A" : exam.status === "Ongoing" ? "#D97706" : "#8A8FA8"
                          }}
                        >
                          <option value="Upcoming">Upcoming</option>
                          <option value="Ongoing">Ongoing</option>
                          <option value="Completed">Completed</option>
                          <option value="Published">Published</option>
                        </select>
                      </td>
                      <td style={{ padding: "10px 18px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
                          <button
                            onClick={() => moveExam(exam, 'up')}
                            disabled={idx === 0}
                            style={{ background: "none", border: "none", cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 14, color: idx === 0 ? "#d4d4d4" : "#1A5F9C", padding: 2 }}
                            title="Move up"
                          >▲</button>
                          <button
                            onClick={() => moveExam(exam, 'down')}
                            disabled={idx === filteredExams.length - 1}
                            style={{ background: "none", border: "none", cursor: idx === filteredExams.length - 1 ? "not-allowed" : "pointer", fontSize: 14, color: idx === filteredExams.length - 1 ? "#d4d4d4" : "#1A5F9C", padding: 2 }}
                            title="Move down"
                          >▼</button>
                          <button
                            onClick={() => openEditModal(exam)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
                            title="Edit Exam"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              alert("To enter marks, please select 'Exam Entries' from the sidebar and filter for this exam.");
                            }}
                            style={{ background: "#f5f2eb", border: "1px solid #e6dfd8", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#1B6B3A", cursor: "pointer" }}
                          >
                            ENTRIES
                          </button>
                          <button onClick={() => removeExam(exam.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6 }} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredExams.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>No examinations found for this selection.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* 2. EXAM OPTIONS TAB */}
      {activeTab === "options" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 24 }}>
            <section style={sectionCardStyle}>
              <h4 style={{ margin: "0 0 20px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Percentage Contributions</h4>
              <div className="table-container" style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
                    <tr>
                      <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>EXAMINATION NAME</th>
                      <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>PERCENTAGE CONTRIBUTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExams.map((exam, idx) => (
                      <tr key={exam.id} style={{ borderBottom: "1px solid #F0F2F5", background: idx % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                        <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>
                          {exam.name}
                          <span style={{ marginLeft: 8, fontSize: 11, color: "#8A8FA8", fontWeight: 600 }}>
                            (out of {exam.total_marks || 100})
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px", textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <input 
                              type="number" 
                              value={exam.weight} 
                              onChange={(e) => updateExam(exam.id, 'weight', e.target.value)}
                              style={{ border: "1.5px solid #E8EAF0", borderRadius: 8, padding: "6px 10px", width: 80, textAlign: "center", fontWeight: 800, color: "#1B6B3A", fontSize: 14, outline: "none" }}
                            />
                            <span style={{ fontWeight: 700, color: "#8A8FA8" }}>%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredExams.length === 0 && (
                      <tr>
                        <td colSpan="2" style={{ padding: "30px", textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>No examinations found for this selection.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 16px", background: "#F1F5F9", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", whiteSpace: "nowrap", fontSize: 14, color: "#475569", fontWeight: 700 }}>
                  <span>Cumulative Total:</span>
                  <span style={{
                    padding: "6px 14px", borderRadius: 8,
                    background: filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0) === 100 ? "#1B6B3A" : "#D97706",
                    color: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                  }}>
                    {filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0)}%
                  </span>
                </div>
                <div style={{ borderTop: "1px solid #DDE3EB", marginTop: 12, paddingTop: 10, fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>
                  {filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0) === 100
                    ? "✅ Weighting is balanced and ready for report cards."
                    : "⚠️ Total must equal 100% for correct calculations."}
                </div>
              </div>
            </section>

            <section style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Grading System Configuration</h4>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#8A8FA8", fontWeight: 500 }}>
                    Scope: <span style={{ color: "#1A1A2E", fontWeight: 700 }}>{filterGrade || filterLevel}</span> · applies to <span style={{ color: "#1A1A2E", fontWeight: 700 }}>all terms</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={handleLoadDefaults}
                    disabled={isGradingLoading}
                    title="Replace the current grading list with the app's default settings"
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#B45309", border: "1px solid #F0D9B5", cursor: isGradingLoading ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                  >↺ Default Settings</button>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F1F5F9", padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#1B6B3A", whiteSpace: "nowrap" }}>
                    <span>🌍 All Terms</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {false && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Select Subject to Configure</label>
                    <select 
                      style={inputStyle} 
                      value={selectedSubjectForGrading || ""} 
                      onChange={(e) => setSelectedSubjectForGrading(e.target.value)}
                    >
                      <option value="">-- Choose Subject --</option>
                      {currentSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                  </div>
                )}

                {true && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {/* Add Grade Form Row */}
                    <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E8EAF0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "flex-end" }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>Grade</label>
                          <input type="text" placeholder="e.g. EE" value={newGradeEntry.code} onChange={(e) => setNewGradeEntry({...newGradeEntry, code: e.target.value})} style={{ ...inputStyle, padding: "9px 12px", fontSize: 13 }} />
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>Description / Label</label>
                          <input type="text" placeholder="e.g. Exceeding Expectations" value={newGradeEntry.label} onChange={(e) => setNewGradeEntry({...newGradeEntry, label: e.target.value})} style={{ ...inputStyle, padding: "9px 12px", fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>Min %</label>
                          <input type="number" placeholder="0" value={newGradeEntry.min} onChange={(e) => setNewGradeEntry({...newGradeEntry, min: e.target.value})} style={{ ...inputStyle, padding: "9px 12px", fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>Max %</label>
                          <input type="number" placeholder="100" value={newGradeEntry.max} onChange={(e) => setNewGradeEntry({...newGradeEntry, max: e.target.value})} style={{ ...inputStyle, padding: "9px 12px", fontSize: 13 }} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10, marginBottom: 6 }}>Points</label>
                          <input type="number" placeholder="0" value={newGradeEntry.points} onChange={(e) => setNewGradeEntry({...newGradeEntry, points: e.target.value})} style={{ ...inputStyle, padding: "9px 12px", fontSize: 13 }} />
                        </div>
                        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                          <button
                            onClick={() => {
                               if (!newGradeEntry.code || !newGradeEntry.min) return;
                               const entry = {
                                 grade: newGradeEntry.code,
                                 label: newGradeEntry.label,
                                 min_score: parseInt(newGradeEntry.min) || 0,
                                 max_score: parseInt(newGradeEntry.max) || 100,
                                 points: parseInt(newGradeEntry.points) || 0
                               };
                               if (editingGradeIdx !== null) {
                                 setCustomGrades(customGrades.map((g, i) => i === editingGradeIdx ? { ...g, ...entry } : g));
                                 setEditingGradeIdx(null);
                               } else {
                                 setCustomGrades([...customGrades, { ...entry, id: Date.now() }]);
                               }
                               setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
                            }}
                            style={{
                              height: 38,
                              flex: 1,
                              background: editingGradeIdx !== null ? "#1A5F9C" : "#1B6B3A",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: editingGradeIdx !== null ? "0 2px 8px rgba(26, 95, 156, 0.2)" : "0 2px 8px rgba(27, 107, 58, 0.2)"
                            }}
                          >{editingGradeIdx !== null ? "✓ Update Grade" : "+ Add Grade to System"}</button>
                          {editingGradeIdx !== null && (
                            <button
                              onClick={() => {
                                setEditingGradeIdx(null);
                                setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
                              }}
                              style={{ height: 38, padding: "0 18px", background: "#fff", color: "#4A4A6A", border: "1px solid #E8EAF0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            >Cancel</button>
                          )}
                          <button
                            onClick={handleSaveGrading}
                            disabled={isGradingLoading}
                            style={{ height: 38, flex: 1, background: isGradingLoading ? "#8a8fa8" : "#1A5F9C", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isGradingLoading ? "not-allowed" : "pointer", boxShadow: "0 2px 8px rgba(26, 95, 156, 0.2)" }}
                          >{isGradingLoading ? "Saving..." : "💾 Save Grading Configuration"}</button>
                        </div>
                        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#8A8FA8", fontWeight: 500, marginTop: -6 }}>
                          💡 This grading system persists across all terms for {filterGrade || filterLevel}.
                        </div>
                      </div>
                    </div>

                    {/* View Settings Section */}
                    <div style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden" }}>
                      <div 
                        onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
                        style={{ padding: "12px 18px", background: "#fff", borderBottom: isSettingsCollapsed ? "none" : "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A2E", display: "flex", alignItems: "center", gap: 8 }}>
                          <span>📖</span> View Settings
                        </div>
                        <span style={{ fontSize: 10, color: "#8A8FA8" }}>{isSettingsCollapsed ? "▼" : "▲"}</span>
                      </div>
                      
                      {!isSettingsCollapsed && (
                        <div className="table-scroll" style={{ maxHeight: 220, overflowY: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid #E8EAF0" }}>
                                <th style={{ textAlign: "left", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}>Grade</th>
                                <th style={{ textAlign: "left", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}>Label</th>
                                <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}>Range %</th>
                                <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}>Points</th>
                                <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700, position: "sticky", top: 0, background: "#F8FAFC", zIndex: 1 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {customGrades.map((g, idx) => (
                                <tr key={g.id || idx} style={{ borderBottom: "1px solid #F1F5F9", background: editingGradeIdx === idx ? "#EBF3FB" : "transparent" }}>
                                  <td style={{ padding: "12px 18px" }}>
                                    <span style={{
                                      padding: "4px 10px", borderRadius: 6, fontWeight: 800, fontSize: 11,
                                      background: g.bg || "#F1F5F9", color: g.color || "#4A4A6A"
                                    }}>{g.grade || g.code}</span>
                                  </td>
                                  <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A1A2E" }}>{g.label}</td>
                                  <td style={{ padding: "12px 18px", textAlign: "center", fontWeight: 700, color: "#4A4A6A" }}>{g.min_score ?? g.min} - {g.max_score || g.max || 100}</td>
                                  <td style={{ padding: "12px 18px", textAlign: "center", fontWeight: 800, color: "#1A5F9C" }}>{g.points || "-"}</td>
                                  <td style={{ padding: "12px 18px", textAlign: "center", whiteSpace: "nowrap" }}>
                                    <button
                                      onClick={() => {
                                        setEditingGradeIdx(idx);
                                        setNewGradeEntry({
                                          code: g.grade || g.code || "",
                                          label: g.label || "",
                                          min: String(g.min_score ?? g.min ?? ""),
                                          max: String(g.max_score ?? g.max ?? ""),
                                          points: String(g.points ?? "")
                                        });
                                      }}
                                      title="Edit this grade"
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8FA8", fontSize: 14, marginRight: 6 }}
                                    >✏️</button>
                                    <button
                                      onClick={() => {
                                        setCustomGrades(customGrades.filter((_, i) => i !== idx));
                                        if (editingGradeIdx === idx) {
                                          setEditingGradeIdx(null);
                                          setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
                                        } else if (editingGradeIdx !== null && editingGradeIdx > idx) {
                                          setEditingGradeIdx(editingGradeIdx - 1);
                                        }
                                      }}
                                      title="Delete this grade"
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8FA8", fontSize: 14 }}
                                    >🗑️</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </section>
          </div>
        </div>
      )}

      {/* 3. EDIT EXAM MODAL */}
      {showEditModal && editingExam && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(42, 36, 33, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", width: "90%", maxWidth: 600, borderRadius: 16, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f2eb" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2a2421" }}>✏️ Edit Examination Details</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8a8fa8" }}>&times;</button>
            </div>
            
            <div style={{ padding: "32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div style={{ gridColumn: "span 2", display: "flex", gap: 16, alignItems: "flex-end" }}>
                <div style={{ width: 100, flexShrink: 0 }}>
                  <label style={labelStyle}>Order #</label>
                  <input
                    type="number"
                    min="1"
                    value={editingExam.order}
                    onChange={(e) => setEditingExam({...editingExam, order: e.target.value})}
                    style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }}
                    title="Position of this exam in the listing. Changing it will shift other exams accordingly."
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Exam Name</label>
                  <input type="text" value={editingExam.name} onChange={(e) => setEditingExam({...editingExam, name: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Level</label>
                <select value={editingExam.level} onChange={(e) => setEditingExam({...editingExam, level: e.target.value})} style={inputStyle}>
                  {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Grade</label>
                <select value={editingExam.grade} onChange={(e) => setEditingExam({...editingExam, grade: e.target.value})} style={inputStyle}>
                  {(GRADES_BY_LEVEL[editingExam.level] || LEVELS[editingExam.level] || []).map(g => <option key={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Term</label>
                <select value={editingExam.term} onChange={(e) => setEditingExam({...editingExam, term: e.target.value})} style={inputStyle}>
                  <option>Term 1</option>
                  <option>Term 2</option>
                  <option>Term 3</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Marks Out Of</label>
                <input type="number" min="1" value={editingExam.total_marks} onChange={(e) => setEditingExam({...editingExam, total_marks: e.target.value})} style={inputStyle} title="What the exam is graded against (e.g. 30, 50, 100)." />
              </div>

              <div>
                <label style={labelStyle}>Status</label>
                <select value={editingExam.status} onChange={(e) => setEditingExam({...editingExam, status: e.target.value})} style={inputStyle}>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Ongoing">Ongoing</option>
                  <option value="Completed">Completed</option>
                  <option value="Published">Published</option>
                </select>
              </div>

            </div>

            <div style={{ padding: "20px 32px", background: "#f9f7f2", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => setShowEditModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e6dfd8", background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button 
                onClick={handleUpdateExam}
                disabled={isSavingEdit}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: isSavingEdit ? "#8a8fa8" : activeColor, color: "#fff", fontSize: 13, fontWeight: 600, cursor: isSavingEdit ? "not-allowed" : "pointer" }}
              >
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Exams;
