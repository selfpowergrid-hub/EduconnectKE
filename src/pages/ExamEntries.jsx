import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { LEVELS, GRADE_NAME_TO_CODE, GRADE_CODE_TO_NAME, gradesByLevelForSchool } from '../lib/schoolLevels';
import { defaultGradesFor } from '../data/mockData';

const levelToSubjectKey = {
  "Pre-Primary": "ecde",
  "Primary": "upper_primary",
  "Junior Secondary": "jss",
  "Senior Secondary": "senior"
};

const getGradeId = (gradeName) => GRADE_NAME_TO_CODE[gradeName];

// Lookup over the full map — resolving an existing student's grade must work
// even if it falls outside the school's configured levels.
const gradeNameToLevel = (gradeName) => {
  for (const [lvl, grades] of Object.entries(LEVELS)) {
    if (grades.includes(gradeName)) return lvl;
  }
  return null;
};

const ExamEntries = ({ schoolConfig, examsList, marksData, setMarksData, role, teacherInfo, focusMode, setFocusMode }) => {
  const isTeacher = role === 'teacher';
  const assignments = teacherInfo?.assignments || [];
  // Levels/grades scoped to what this school actually teaches.
  const GRADES_BY_LEVEL = useMemo(
    () => gradesByLevelForSchool(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );
  const [filterBarHidden, setFilterBarHidden] = useState(false);
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Filters State
  const [entryLevel, setEntryLevel] = useState(() => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0]);
  const [entryGrade, setEntryGrade] = useState(() => Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0][0]);
  const [entryStream, setEntryStream] = useState("All");
  const [entrySubject, setEntrySubject] = useState("");
  const [entryTerm, setEntryTerm] = useState("Term 1");
  const [rowHeight, setRowHeight] = useState(28);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [totalDrafts, setTotalDrafts] = useState(0);
  // View mode
  const [viewMode, setViewMode] = useState("class"); // "class" or "student"
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentViewMarks, setStudentViewMarks] = useState({}); // { subjectId: { examId: score } }
  // Both views share one "unsaved" flag (hasUnsavedChanges) and one draft
  // namespace (marks_draft_*) so edits in either view stay in sync.

  const activeColor = "#D4AF37";
  const labelStyle = { display: "block", fontSize: 10, fontWeight: 800, color: "#2a2421", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 13, background: "#fff", outline: "none", transition: "all 0.2s ease" };

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSubjects();
      fetchGrades();
      fetchStreams();
    }
  }, [schoolConfig?.id]);

  const fetchStreams = async () => {
    const { data } = await supabase.from('streams').select('*').eq('school_id', schoolConfig.id);
    setDbStreams(data || []);
  };

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('*').eq('school_id', schoolConfig.id);
    setDbSubjects(data || []);
  };

  const fetchGrades = async () => {
    const { data } = await supabase.from('grading_systems').select('*').eq('school_id', schoolConfig.id);
    setDbGrades(data || []);
  };

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
    }
  }, [entryGrade, entryStream, schoolConfig?.id]);

  useEffect(() => {
    if (schoolConfig?.id && entrySubject && viewMode === "class") {
      fetchMarks();
    }
  }, [entryGrade, entryStream, entrySubject, entryTerm, schoolConfig?.id, viewMode]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const checkAllDrafts = () => {
    if (!schoolConfig?.id) return;
    const keys = Object.keys(localStorage);
    const draftKeys = keys.filter(k => k.startsWith(`marks_draft_${schoolConfig.id}_`));
    setTotalDrafts(draftKeys.length);
  };

  useEffect(() => {
    checkAllDrafts();
  }, [schoolConfig?.id, hasUnsavedChanges]);

  // One-time migration: Student View used to store drafts under its own
  // sv_draft_{school}_{grade}_{term}_{studentId} = { subjectId: { examId } }
  // namespace. Fold any leftovers into the shared per-subject marks_draft_
  // keys so previously-typed marks aren't lost after the unification.
  useEffect(() => {
    if (!schoolConfig?.id) return;
    const svPrefix = `sv_draft_${schoolConfig.id}_`;
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(svPrefix));
    if (oldKeys.length === 0) return;
    oldKeys.forEach(oldKey => {
      try {
        const rest = oldKey.slice(svPrefix.length).split('_'); // [grade, term, studentId]
        const studentId = rest[rest.length - 1];
        const grade = rest[0], term = rest[1];
        const bySubject = JSON.parse(localStorage.getItem(oldKey) || '{}');
        Object.keys(bySubject).forEach(subjectId => {
          const newKey = `marks_draft_${schoolConfig.id}_${grade}_${term}_${subjectId}`;
          let merged = {};
          try { merged = JSON.parse(localStorage.getItem(newKey) || '{}'); } catch { merged = {}; }
          merged[studentId] = { ...(merged[studentId] || {}), ...bySubject[subjectId] };
          localStorage.setItem(newKey, JSON.stringify(merged));
        });
      } catch (e) { console.error('sv_draft migration failed for', oldKey, e); }
      localStorage.removeItem(oldKey);
    });
    setHasUnsavedChanges(true);
    checkAllDrafts();
  }, [schoolConfig?.id]);

  // --- Cloud sync of ALL drafted classes -----------------------------------
  // Drafts live in localStorage keyed marks_draft_{school}_{grade}_{term}_{subjectId}
  // (grade/term names never contain underscores), so every drafted class can
  // be synced from here without navigating to it. Runs silently when the
  // connection is available, or with feedback when the banner is clicked.
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const syncAllDrafts = async (silent = false) => {
    if (!schoolConfig?.id || isSyncingAll) return;
    const prefix = `marks_draft_${schoolConfig.id}_`;
    const draftKeys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    if (draftKeys.length === 0) return;
    if (!navigator.onLine) {
      if (!silent) alert('No internet connection — drafts stay saved on this device and will sync automatically when you are back online.');
      return;
    }

    setIsSyncingAll(true);
    let synced = 0;
    const failures = [];
    try {
      for (const key of draftKeys) {
        try {
          const [gradeName, termName, subjectId] = key.slice(prefix.length).split('_');
          const gid = getGradeId(gradeName);
          const draft = JSON.parse(localStorage.getItem(key) || '{}');

          const records = [];
          Object.keys(draft).forEach(studentId => {
            Object.keys(draft[studentId] || {}).forEach(examId => {
              const score = draft[studentId][examId];
              if (score === '' || score === null || score === undefined) return;
              const exam = examsList.find(e => e.id === examId);
              records.push({
                student_id: studentId,
                exam_id: examId,
                score,
                subject_id: subjectId || null,
                level_id: gid,
                term: exam?.term || termName,
                year: exam?.year || new Date().getFullYear()
              });
            });
          });

          if (records.length > 0) {
            const { error } = await supabase
              .from('marks')
              .upsert(records, { onConflict: 'exam_id,student_id,subject_id,level_id,term,year' });
            if (error) throw error;
          }

          localStorage.removeItem(key);
          synced++;

          // If the class currently open was among the synced drafts, its
          // pending-changes flag is now stale.
          const currentSubject = currentSubjectRow();
          if (gradeName === entryGrade && termName === entryTerm && currentSubject?.id === subjectId) {
            setHasUnsavedChanges(false);
          }
        } catch (err) {
          failures.push(err.message);
        }
      }
    } finally {
      setIsSyncingAll(false);
      // If every draft was pushed, both views are fully in sync with the cloud.
      const remaining = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      if (remaining.length === 0) setHasUnsavedChanges(false);
      checkAllDrafts();
    }

    if (!silent) {
      if (failures.length === 0) {
        alert(`✓ ${synced} class${synced === 1 ? '' : 'es'} synced to the cloud successfully.`);
      } else {
        alert(`Synced ${synced} class${synced === 1 ? '' : 'es'}; ${failures.length} failed: ${failures[0]}`);
      }
    }
  };

  // Keep a ref so the listeners below always call the latest version.
  const syncAllDraftsRef = useRef(syncAllDrafts);
  syncAllDraftsRef.current = syncAllDrafts;

  // Auto-sync silently: shortly after edits pause, when the connection comes
  // back, and once on page load — so with good internet, data flows to the
  // cloud on its own and the banner clears itself.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const t = setTimeout(() => {
      if (navigator.onLine) syncAllDraftsRef.current(true);
    }, 4000);
    return () => clearTimeout(t);
  }, [hasUnsavedChanges, marksData, studentViewMarks]);

  useEffect(() => {
    const onOnline = () => syncAllDraftsRef.current(true);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    const t = setTimeout(() => {
      if (navigator.onLine) syncAllDraftsRef.current(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [schoolConfig?.id]);

  const fetchStudents = async () => {
    const gid = getGradeId(entryGrade);
    let query = supabase.from('students').select('*').eq('school_id', schoolConfig.id).eq('level_id', gid);
    if (entryStream !== "All") {
      query = query.eq('stream_id', entryStream);
    }
    const { data } = await query;
    setStudents(data || []);
  };

  // Resolve the selected subject WITHIN the selected grade. Several grades
  // share subject names (e.g. MATHEMATICS exists in Form 3 AND Grade 4), so a
  // name-only lookup can return another grade's subject id and silently
  // read/write the wrong marks rows.
  const currentSubjectRow = () => {
    const gid = getGradeId(entryGrade);
    return dbSubjects.find(s => s.level_category === gid && s.name === entrySubject);
  };

  const fetchMarks = async () => {
    if (!entryExams.length || !entrySubject) return;

    const subject = currentSubjectRow();
    if (!subject) return;

    const { data } = await supabase
      .from('marks')
      .select('*')
      .in('exam_id', entryExams.map(e => e.id))
      .eq('subject_id', subject.id);
    
    let formatted = {};
    data?.forEach(m => {
      if (!formatted[m.student_id]) formatted[m.student_id] = {};
      formatted[m.student_id][m.exam_id] = m.score;
    });

    if (schoolConfig?.id) {
      const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
      const draft = localStorage.getItem(cacheKey);
      if (draft) {
        try {
          const parsedDraft = JSON.parse(draft);
          Object.keys(parsedDraft).forEach(studentId => {
            if (!formatted[studentId]) formatted[studentId] = {};
            formatted[studentId] = { ...formatted[studentId], ...parsedDraft[studentId] };
          });
        } catch(e) {
          console.error("Failed to parse draft marks", e);
        }
      }
      // Reflect the GLOBAL draft state (any subject/either view), not just this
      // subject's, so the "unsaved" flag agrees with the banner count.
      const anyDrafts = Object.keys(localStorage).some(k => k.startsWith(`marks_draft_${schoolConfig.id}_`));
      setHasUnsavedChanges(anyDrafts);
    }

    setMarksData(formatted);
  };

  // Levels/grades/streams a teacher is allowed to pick from. Admin = no restriction.
  const teacherAllowed = useMemo(() => {
    if (!isTeacher) return null;
    const levels = new Set();
    const gradesByLevel = {};
    const streamsByGrade = {};       // grade name -> Set of stream_id|null
    const subjectsByGrade = {};      // grade name -> Set of subject_id
    assignments.forEach(a => {
      const gName = GRADE_CODE_TO_NAME[a.level_id];
      if (!gName) return;
      const lvl = gradeNameToLevel(gName);
      if (!lvl) return;
      levels.add(lvl);
      (gradesByLevel[lvl] = gradesByLevel[lvl] || new Set()).add(gName);
      (streamsByGrade[gName] = streamsByGrade[gName] || new Set()).add(a.stream_id || null);
      (subjectsByGrade[gName] = subjectsByGrade[gName] || new Set()).add(a.subject_id);
    });
    return { levels, gradesByLevel, streamsByGrade, subjectsByGrade };
  }, [isTeacher, assignments]);

  // Snap level/grade selections to something the teacher is allowed to see
  useEffect(() => {
    if (!teacherAllowed) return;
    const allowedLevels = [...teacherAllowed.levels];
    if (allowedLevels.length === 0) return;
    if (!teacherAllowed.levels.has(entryLevel)) {
      setEntryLevel(allowedLevels[0]);
      return;
    }
    const allowedGrades = [...(teacherAllowed.gradesByLevel[entryLevel] || [])];
    if (allowedGrades.length === 0) return;
    if (!teacherAllowed.gradesByLevel[entryLevel].has(entryGrade)) {
      setEntryGrade(allowedGrades[0]);
    }
  }, [teacherAllowed, entryLevel, entryGrade]);

  const entryAvailableSubjects = useMemo(() => {
    const gid = getGradeId(entryGrade);
    const all = dbSubjects.filter(s => s.level_category === gid);
    if (!isTeacher) return all.map(s => s.name);
    const allowedSubjectIds = teacherAllowed?.subjectsByGrade[entryGrade] || new Set();
    return all.filter(s => allowedSubjectIds.has(s.id)).map(s => s.name);
  }, [dbSubjects, entryGrade, isTeacher, teacherAllowed]);

  useEffect(() => {
    if (entryAvailableSubjects.length > 0 && !entryAvailableSubjects.includes(entrySubject)) {
      setEntrySubject(entryAvailableSubjects[0]);
    } else if (entryAvailableSubjects.length === 0) {
      setEntrySubject("");
    }
  }, [entryAvailableSubjects]);

  const entryExams = useMemo(() => {
    const gid = getGradeId(entryGrade);
    return examsList.filter(e => 
      e.term === entryTerm && e.level_id === gid
    );
  }, [examsList, entryTerm, entryGrade]);

  const entryStudents = students;

  const handleScoreChange = (studentId, examId, value) => {
    const exam = examsList.find(e => e.id === examId);
    const maxAllowed = exam?.total_marks || 100;
    let val = parseInt(value) || 0;
    if (val > maxAllowed) val = maxAllowed;
    if (val < 0) val = 0;
    setMarksData(prev => {
      const next = {
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [examId]: val
        }
      };
      
      const subject = currentSubjectRow();
      if (schoolConfig?.id && subject) {
        const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
        localStorage.setItem(cacheKey, JSON.stringify(next));
      }
      
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveMarks = async () => {
    setIsLoading(true);
    try {
      const gid = getGradeId(entryGrade);
      const subjectRow = currentSubjectRow();

      const records = [];
      Object.keys(marksData).forEach(studentId => {
        Object.keys(marksData[studentId]).forEach(examId => {
          const exam = examsList.find(e => e.id === examId);
          records.push({
            student_id: studentId,
            exam_id: examId,
            score: marksData[studentId][examId],
            subject_id: subjectRow?.id || null,
            level_id: gid,
            term: exam?.term || entryTerm,
            year: exam?.year || new Date().getFullYear()
          });
        });
      });

      if (records.length === 0) return;

      const { error } = await supabase
        .from('marks')
        .upsert(records, { onConflict: 'exam_id,student_id,subject_id,level_id,term,year' });

      if (error) throw error;
      
      // Clear draft
      const subject = currentSubjectRow();
      if (schoolConfig?.id && subject) {
        const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
        localStorage.removeItem(cacheKey);
      }
      setHasUnsavedChanges(false);

      alert('Marks saved successfully!');
    } catch (err) {
      alert('Failed to save marks: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getGrade = (score) => {
    const gid = getGradeId(entryGrade);

    // Filter scale for specific grade first, then fall back to level
    let scale = dbGrades.filter(g => g.level_group === gid);
    if (scale.length === 0) {
      scale = dbGrades.filter(g => g.level_group === entryLevel);
    }

    if (scale.length === 0) {
      // Built-in defaults: Form 3/4 → A–E scale, everything else → competency.
      scale = defaultGradesFor(entryGrade);
    }
    
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return { code: g.grade, color: g.color || "#2a2421", bg: g.bg || "#fff" };
    }
    return { code: "-", color: "#8a8fa8", bg: "#fff" };
  };

  // === STUDENT VIEW LOGIC ===
  const svSubjects = useMemo(() => {
    const gid = getGradeId(entryGrade);
    return dbSubjects.filter(s => s.level_category === gid);
  }, [dbSubjects, entryGrade]);

  const svFilteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      s.adm_no?.toString().includes(q) ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const fetchStudentViewMarks = async (student) => {
    if (!student || !entryExams.length || !svSubjects.length) return;
    const { data } = await supabase
      .from('marks')
      .select('*')
      .eq('student_id', student.id)
      .in('exam_id', entryExams.map(e => e.id))
      .in('subject_id', svSubjects.map(s => s.id));

    const formatted = {};
    data?.forEach(m => {
      if (!formatted[m.subject_id]) formatted[m.subject_id] = {};
      formatted[m.subject_id][m.exam_id] = m.score;
    });

    // Overlay unsaved edits from the SHARED per-subject draft keys (the same
    // ones Class View writes), so a mark typed in either view shows here.
    if (schoolConfig?.id) {
      let anyDraft = false;
      svSubjects.forEach(sub => {
        const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${sub.id}`;
        const draft = localStorage.getItem(cacheKey);
        if (!draft) return;
        try {
          const forStudent = JSON.parse(draft)[student.id];
          if (forStudent && Object.keys(forStudent).length) {
            formatted[sub.id] = { ...(formatted[sub.id] || {}), ...forStudent };
            anyDraft = true;
          }
        } catch (e) { console.error(e); }
      });
      if (anyDraft) setHasUnsavedChanges(true);
    }
    setStudentViewMarks(formatted);
  };

  useEffect(() => {
    if (viewMode === "student" && selectedStudent && entryExams.length) {
      fetchStudentViewMarks(selectedStudent);
    }
  }, [selectedStudent, entryExams, svSubjects, viewMode]);

  const handleSvScoreChange = (subjectId, examId, value) => {
    const exam = examsList.find(e => e.id === examId);
    const maxAllowed = exam?.total_marks || 100;
    let val = parseInt(value) || 0;
    if (val > maxAllowed) val = maxAllowed;
    if (val < 0) val = 0;

    setStudentViewMarks(prev => ({
      ...prev,
      [subjectId]: { ...(prev[subjectId] || {}), [examId]: val }
    }));

    // Persist into the SHARED per-subject draft key (identical shape to Class
    // View: { studentId: { examId: score } }), merging this student's entry so
    // other students' drafts in the same subject are preserved.
    if (schoolConfig?.id && selectedStudent) {
      const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subjectId}`;
      let existing = {};
      try { existing = JSON.parse(localStorage.getItem(cacheKey) || '{}'); } catch { existing = {}; }
      existing[selectedStudent.id] = { ...(existing[selectedStudent.id] || {}), [examId]: val };
      localStorage.setItem(cacheKey, JSON.stringify(existing));
    }
    setHasUnsavedChanges(true);
  };

  const navigateGrid = (e, studentIdx, examIdx, totalStudents, totalExams) => {
    let nextRow = studentIdx;
    let nextCol = examIdx;

    if (e.key === "ArrowUp") nextRow--;
    else if (e.key === "ArrowDown" || e.key === "Enter") nextRow++;
    else if (e.key === "ArrowLeft") nextCol--;
    else if (e.key === "ArrowRight") nextCol++;
    else return;

    if (nextRow >= 0 && nextRow < totalStudents && nextCol >= 0 && nextCol < totalExams) {
      e.preventDefault();
      const nextInput = document.getElementById(`cell-${nextRow}-${nextCol}`);
      if (nextInput) nextInput.focus();
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {totalDrafts > 0 && (
          <div
            onClick={() => syncAllDrafts(false)}
            role="button"
            title="Click to sync all drafted classes to the cloud now"
            style={{
              background: "#FFF4E5",
              border: "1px solid #FFB020",
              padding: "10px 16px",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              boxShadow: "0 2px 4px rgba(255,176,32,0.1)",
              cursor: isSyncingAll ? "wait" : "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{isSyncingAll ? "⌛" : "⚠️"}</span>
              <span style={{ fontSize: 13, color: "#BF6A02", fontWeight: 700 }}>
                {isSyncingAll
                  ? "Syncing your classes to the cloud..."
                  : <>You have {totalDrafts} unsaved {totalDrafts === 1 ? 'class' : 'classes'} waiting to be synced to the cloud.
                      <span style={{ fontWeight: 400, marginLeft: 4 }}>Click here to sync {totalDrafts === 1 ? 'it' : 'them'} now.</span></>}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); syncAllDrafts(false); }}
              disabled={isSyncingAll}
              style={{
                padding: "7px 16px", borderRadius: 6, border: "none",
                background: "#D35400", color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: isSyncingAll ? "wait" : "pointer", whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(211,84,0,0.3)"
              }}
            >
              {isSyncingAll ? "⌛ Syncing..." : "🔄 Sync Now"}
            </button>
          </div>
        )}

        {/* View Mode Toggle (admin only — by-student view aggregates across all subjects) */}
        {!isTeacher && (
          <div className="ee-toggle" style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e6dfd8", alignSelf: "flex-start" }}>
            <button onClick={() => setViewMode("class")} style={{
              padding: "8px 20px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              background: viewMode === "class" ? activeColor : "#fff", color: viewMode === "class" ? "#fff" : "#2a2421",
              transition: "all 0.2s ease"
            }}>📋 Class View</button>
            <button onClick={() => setViewMode("student")} style={{
              padding: "8px 20px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", borderLeft: "1px solid #e6dfd8",
              background: viewMode === "student" ? activeColor : "#fff", color: viewMode === "student" ? "#fff" : "#2a2421",
              transition: "all 0.2s ease"
            }}>👤 Student View</button>
          </div>
        )}

        {viewMode === "class" && (<>
        {/* Focus + filter-bar toggles */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: filterBarHidden ? 8 : 8 }}>
          {filterBarHidden && (
            <button
              onClick={handleSaveMarks}
              disabled={isLoading || !hasUnsavedChanges}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: hasUnsavedChanges ? "#D35400" : "#2a2421", color: "#fff",
                fontSize: 11, fontWeight: 700,
                cursor: (isLoading || !hasUnsavedChanges) ? "not-allowed" : "pointer",
                opacity: (isLoading || !hasUnsavedChanges) ? 0.7 : 1,
                boxShadow: hasUnsavedChanges ? "0 2px 8px rgba(211,84,0,0.3)" : "none",
              }}
            >
              {isLoading ? "⌛ Saving..." : (hasUnsavedChanges ? "⚠️ Sync to Cloud" : "✓ All Synced")}
            </button>
          )}
          {focusMode && (
            <button
              onClick={() => setFilterBarHidden(v => !v)}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "1px solid #e6dfd8",
                background: "#fff", color: "#2a2421", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
              title={filterBarHidden ? "Show filters" : "Hide filters for more screen space"}
            >
              {filterBarHidden ? "▼ Show Filters" : "▲ Hide Filters"}
            </button>
          )}
          {!focusMode ? (
            <button
              onClick={() => setFocusMode?.(true)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid #1B6B3A",
                background: "#fff", color: "#1B6B3A", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
              title="Hide the sidebar and header for a full-screen marks view"
            >
              🪟 Focus Mode
            </button>
          ) : (
            <button
              onClick={() => { setFocusMode?.(false); setFilterBarHidden(false); }}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid #C0392B",
                background: "#fff", color: "#C0392B", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}
            >
              ✕ Exit Focus
            </button>
          )}
        </div>

        {/* Filters Bar */}
        {!filterBarHidden && (
        <div className="ee-filters-class" style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr) auto", gap: 10, padding: "16px 20px",
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", alignItems: "flex-end",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Level</label>
            <select value={entryLevel} onChange={(e) => {
              setEntryLevel(e.target.value);
              const grades = isTeacher && teacherAllowed
                ? [...(teacherAllowed.gradesByLevel[e.target.value] || [])]
                : (GRADES_BY_LEVEL[e.target.value] || []);
              setEntryGrade(grades[0]);
            }} style={inputStyle}>
              {(isTeacher && teacherAllowed
                ? [...teacherAllowed.levels]
                : Object.keys(GRADES_BY_LEVEL)
              ).map(lvl => <option key={lvl}>{lvl}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Grade</label>
            <select value={entryGrade} onChange={(e) => setEntryGrade(e.target.value)} style={inputStyle}>
              {(isTeacher && teacherAllowed
                ? [...(teacherAllowed.gradesByLevel[entryLevel] || [])]
                : (GRADES_BY_LEVEL[entryLevel] || [])
              ).map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Stream</label>
            <select value={entryStream} onChange={(e) => setEntryStream(e.target.value)} style={inputStyle}>
              {(() => {
                if (!isTeacher) {
                  return (
                    <>
                      <option value="All">All Streams</option>
                      {dbStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </>
                  );
                }
                const allowedStreamIds = teacherAllowed?.streamsByGrade[entryGrade] || new Set();
                const hasWildcard = allowedStreamIds.has(null);
                // A wildcard ("all streams") assignment allows every stream, so
                // list them individually too — the teacher can still drill down.
                const allowedSpecific = hasWildcard
                  ? dbStreams
                  : dbStreams.filter(s => allowedStreamIds.has(s.id));
                return (
                  <>
                    {(hasWildcard || allowedSpecific.length > 1) && <option value="All">All Streams</option>}
                    {allowedSpecific.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </>
                );
              })()}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Term</label>
            <select value={entryTerm} onChange={(e) => setEntryTerm(e.target.value)} style={inputStyle}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Subject</label>
            <select value={entrySubject} onChange={(e) => setEntrySubject(e.target.value)} style={inputStyle}>
              {entryAvailableSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <button 
            onClick={handleSaveMarks}
            disabled={isLoading || !hasUnsavedChanges}
            style={{ 
              height: 36, 
              padding: "0 24px", 
              background: hasUnsavedChanges ? "#D35400" : "#2a2421", 
              color: "#fff", 
              border: "none", 
              borderRadius: 8, 
              fontSize: 12, 
              fontWeight: 700, 
              cursor: (isLoading || !hasUnsavedChanges) ? "not-allowed" : "pointer", 
              opacity: (isLoading || !hasUnsavedChanges) ? 0.7 : 1, 
              transition: "all 0.2s ease",
              boxShadow: hasUnsavedChanges ? "0 4px 12px rgba(211,84,0,0.3)" : "none"
            }}
          >
            {isLoading ? "⌛ Saving..." : (hasUnsavedChanges ? "⚠️ Sync to Cloud" : "✓ All Synced")}
          </button>
        </div>
        )}

        {/* Toolbar */}
        <div className="ee-toolbar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, padding: "0 4px", marginTop: -4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Row Spacing</label>
          <input 
            type="range" 
            min="24" 
            max="56" 
            value={rowHeight} 
            onChange={(e) => setRowHeight(parseInt(e.target.value))}
            style={{ width: 120, height: 4, cursor: "pointer", accentColor: activeColor, padding: 0 }}
          />
        </div>

        {/* Marks Entry Spreadsheet */}
        <div className="table-container" style={{
          background: "#fff",
          border: "1px solid #e6dfd8",
          borderRadius: 12,
          overflowX: "auto",
          overflowY: "hidden",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#fafafa", borderBottom: "1px solid #e6dfd8" }}>
              <tr>
                <th className="sticky-col sticky-left-0" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", width: 80, color: "#2a2421", fontWeight: 700 }}>ADM NO</th>
                <th className="sticky-col sticky-left-1" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", minWidth: 150, color: "#2a2421", fontWeight: 700 }}>STUDENT NAME</th>
                {entryExams.map(exam => (
                  <th key={exam.id} style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", width: 120 }}>
                    <div style={{ fontSize: 10, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{exam.name}</div>
                    <div style={{ fontWeight: 700, color: "#2a2421" }}>Out of {exam.total_marks || 100}</div>
                    <div style={{ fontSize: 10, color: "#8a8fa8", fontWeight: 600 }}>· weight {exam.weight || 0}%</div>
                  </th>
                ))}
                <th style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>AVG %</th>
                <th style={{ padding: "8px 12px", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>GRADE</th>
              </tr>
            </thead>
            <tbody>
              {entryStudents.map((s, sIdx) => {
                const studentMarks = marksData[s.id] || {};
                const hasAnyMark = entryExams.some(exam => {
                  const v = studentMarks[exam.id];
                  return v !== undefined && v !== null && v !== "";
                });
                const total = entryExams.reduce((sum, exam) => {
                  const raw = parseInt(studentMarks[exam.id]) || 0;
                  const outOf = exam.total_marks || 100;
                  const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
                  return sum + pct * ((exam.weight || 0) / 100);
                }, 0);
                const grade = getGrade(total);

                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #e6dfd8", background: sIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td className="sticky-col sticky-left-0" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 700, color: activeColor }}>{s.adm_no}</td>
                    <td className="sticky-col sticky-left-1" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 600, color: "#2a2421" }}>{s.first_name} {s.last_name}</td>
                    {entryExams.map((exam, eIdx) => (
                      <td key={exam.id} style={{ padding: "0", borderRight: "1px solid #e6dfd8" }}>
                        <input
                          id={`cell-${sIdx}-${eIdx}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="marks-input"
                          value={studentMarks[exam.id] ?? ""}
                          onChange={(e) => handleScoreChange(s.id, exam.id, e.target.value)}
                          onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, entryStudents.length, entryExams.length)}
                          style={{ 
                            width: "100%", 
                            height: `${rowHeight}px`, 
                            border: "none", 
                            padding: "0 8px",
                            margin: 0,
                            boxSizing: "border-box",
                            textAlign: "center", 
                            fontSize: 13, 
                            fontWeight: 700, 
                            outline: "none",
                            background: "transparent",
                            color: activeColor
                          }}
                          autoComplete="off"
                        />
                      </td>
                    ))}
                    <td style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", fontWeight: 700, color: "#2a2421" }}>{hasAnyMark ? `${Math.round(total)}%` : ""}</td>
                    <td style={{ padding: "4px 12px", textAlign: "center", background: hasAnyMark ? grade.bg : "transparent", color: grade.color, fontWeight: 700 }}>{hasAnyMark ? grade.code : ""}</td>
                  </tr>
                );
              })}
              {entryStudents.length === 0 && (
                <tr>
                  <td colSpan={entryExams.length + 4} style={{ padding: "40px", textAlign: "center", color: "#8a8fa8" }}>
                    No students found for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>)}

        {/* === STUDENT VIEW === */}
        {viewMode === "student" && (<>
        {/* Student View Filters */}
        <div className="ee-filters-student" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, padding: "16px 20px",
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", alignItems: "flex-end",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Level</label>
            <select value={entryLevel} onChange={(e) => { setEntryLevel(e.target.value); setEntryGrade((GRADES_BY_LEVEL[e.target.value] || [])[0]); setSelectedStudent(null); }} style={inputStyle}>
              {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Grade</label>
            <select value={entryGrade} onChange={(e) => { setEntryGrade(e.target.value); setSelectedStudent(null); }} style={inputStyle}>
              {(GRADES_BY_LEVEL[entryLevel] || []).map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Term</label>
            <select value={entryTerm} onChange={(e) => { setEntryTerm(e.target.value); setSelectedStudent(null); }} style={inputStyle}>
              <option>Term 1</option><option>Term 2</option><option>Term 3</option>
            </select>
          </div>
          <button onClick={() => syncAllDrafts(false)} disabled={isSyncingAll || !hasUnsavedChanges}
            style={{
              height: 36, padding: "0 24px", background: hasUnsavedChanges ? "#D35400" : "#2a2421",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: (isSyncingAll || !hasUnsavedChanges) ? "not-allowed" : "pointer",
              opacity: (isSyncingAll || !hasUnsavedChanges) ? 0.7 : 1, transition: "all 0.2s ease",
              boxShadow: hasUnsavedChanges ? "0 4px 12px rgba(211,84,0,0.3)" : "none"
            }}
          >
            {isSyncingAll ? "⌛ Saving..." : (hasUnsavedChanges ? "⚠️ Sync to Cloud" : "✓ All Synced")}
          </button>
        </div>

        {/* Student Selector */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", padding: "16px 20px",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <label style={labelStyle}>Search Student (ADM No or Name)</label>
            <div className="ee-student-search" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="text" placeholder="Type ADM number or student name..."
              value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={selectedStudent?.id || ""}
              onChange={(e) => {
                const s = students.find(st => st.id === e.target.value);
                setSelectedStudent(s || null);
              }}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">— Select Student —</option>
              {svFilteredStudents.map(s => (
                <option key={s.id} value={s.id}>{s.adm_no} — {s.first_name} {s.last_name}</option>
              ))}
            </select>
          </div>
          {selectedStudent && (
            <div className="ee-student-info" style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 13, color: "#2a2421" }}>
              <span><strong>ADM:</strong> {selectedStudent.adm_no}</span>
              <span><strong>Name:</strong> {selectedStudent.first_name} {selectedStudent.last_name}</span>
              <span><strong>Grade:</strong> {entryGrade}</span>
            </div>
          )}
        </div>

        {/* Student Marks Grid (rows=subjects, cols=exams) */}
        {selectedStudent && (
        <div className="table-container" style={{
          background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12,
          overflowX: "auto", overflowY: "hidden",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#fafafa", borderBottom: "1px solid #e6dfd8" }}>
              <tr>
                <th className="sticky-col sticky-left-0" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", minWidth: 150, color: "#2a2421", fontWeight: 700 }}>SUBJECT</th>
                {entryExams.map(exam => (
                  <th key={exam.id} style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", width: 120 }}>
                    <div style={{ fontSize: 10, color: "#8a8fa8", textTransform: "uppercase" }}>{exam.name}</div>
                    <div style={{ fontWeight: 700, color: "#2a2421" }}>Out of {exam.total_marks || 100}</div>
                    <div style={{ fontSize: 10, color: "#8a8fa8", fontWeight: 600 }}>· weight {exam.weight || 0}%</div>
                  </th>
                ))}
                <th style={{ padding: "8px 12px", textAlign: "center", background: "#f5f2eb", width: 100, fontWeight: 700 }}>AVG %</th>
                <th style={{ padding: "8px 12px", textAlign: "center", width: 90, fontWeight: 700 }}>GRADE</th>
              </tr>
            </thead>
            <tbody>
              {svSubjects.map((sub, sIdx) => {
                const subMarks = studentViewMarks[sub.id] || {};
                const hasAnyMark = entryExams.some(ex => {
                  const v = subMarks[ex.id];
                  return v !== undefined && v !== null && v !== "";
                });
                // Normalize each raw mark by the exam's "out of" before
                // weighting — same math as Class View.
                const total = entryExams.reduce((sum, ex) => {
                  const raw = parseInt(subMarks[ex.id]) || 0;
                  const outOf = ex.total_marks || 100;
                  const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
                  return sum + pct * ((ex.weight || 0) / 100);
                }, 0);
                const grade = getGrade(total);
                return (
                  <tr key={sub.id} style={{ borderBottom: "1px solid #e6dfd8", background: sIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td className="sticky-col sticky-left-0" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 600, color: "#2a2421" }}>{sub.name}</td>
                    {entryExams.map((exam, eIdx) => (
                      <td key={exam.id} style={{ padding: "0", borderRight: "1px solid #e6dfd8" }}>
                        <input
                          id={`sv-${sIdx}-${eIdx}`}
                          type="text" inputMode="numeric" pattern="[0-9]*" className="marks-input"
                          value={subMarks[exam.id] ?? ""}
                          onChange={(e) => handleSvScoreChange(sub.id, exam.id, e.target.value)}
                          onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, svSubjects.length, entryExams.length)}
                          style={{
                            width: "100%", height: `${rowHeight}px`, border: "none", padding: "0 8px",
                            margin: 0, boxSizing: "border-box", textAlign: "center", fontSize: 13,
                            fontWeight: 700, outline: "none", background: "transparent", color: activeColor
                          }}
                          autoComplete="off"
                        />
                      </td>
                    ))}
                    <td style={{ padding: "4px 12px", textAlign: "center", background: "#f5f2eb", fontWeight: 700 }}>{hasAnyMark ? `${Math.round(total)}%` : ""}</td>
                    <td style={{ padding: "4px 12px", textAlign: "center", background: hasAnyMark ? grade.bg : "transparent", color: grade.color, fontWeight: 700 }}>{hasAnyMark ? grade.code : ""}</td>
                  </tr>
                );
              })}
              {svSubjects.length === 0 && (
                <tr><td colSpan={entryExams.length + 3} style={{ padding: "40px", textAlign: "center", color: "#8a8fa8" }}>No subjects found for this grade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        </>)}

      </div>
    </div>
  );
};

export default ExamEntries;
