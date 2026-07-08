import React, { useState, useMemo, useEffect } from 'react';
import { getClassesByType } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { getPlanLimits } from '../lib/planConfig';
import BulkImportWizard from '../components/students/BulkImportWizard';
import PhotoUpload, { StudentAvatar } from '../components/students/PhotoUpload';
import { uploadStudentPhoto, deleteStudentPhoto, getStudentPhotoUrl } from '../lib/imageProcessing';
import { GRADE_NAME_TO_CODE, GRADE_CODE_TO_NAME, gradesByLevelForSchool } from '../lib/schoolLevels';

const Students = ({ schoolConfig, currentPlan, role, teacherInfo }) => {
  const isTeacher = role === 'teacher';
  // Levels/grades scoped to what this school actually teaches.
  const GRADES_BY_LEVEL = useMemo(
    () => gradesByLevelForSchool(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );
  const [studentsList, setStudentsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [boardingFilter, setBoardingFilter] = useState("all"); // all | day | boarder
  const [selectedStream, setSelectedStream] = useState("all"); // "all" or a stream id
  const [selectedLevel, setSelectedLevel] = useState(() => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0]);
  const [selectedGrade, setSelectedGrade] = useState(() => Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0][0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [streams, setStreams] = useState([]);
  const [dorms, setDorms] = useState([]);
  const itemsPerPage = 15;

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchStreams();
      fetchDorms();
    }
  }, [schoolConfig?.id]);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          streams (name)
        `)
        .eq('school_id', schoolConfig.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudentsList(data || []);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStreams = async () => {
    try {
      const { data, error } = await supabase
        .from('streams')
        .select('*')
        .eq('school_id', schoolConfig.id);
      if (error) throw error;
      setStreams(data || []);
    } catch (err) {
      console.error('Error fetching streams:', err);
    }
  };

  // Dorms drive boarding status: a student with a dorm is a boarder and gets
  // billed boarder voteheads by the fees module. No dorm = day scholar.
  const fetchDorms = async () => {
    try {
      const { data, error } = await supabase
        .from('dorms')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('name');
      if (error) throw error;
      setDorms(data || []);
    } catch (err) {
      console.error('Error fetching dorms:', err);
    }
  };

  const currentTypeClasses = useMemo(() => {
    return getClassesByType(schoolConfig?.schoolType || "Primary");
  }, [schoolConfig]);

  const filteredStudents = useMemo(() => {
    const targetGradeId = selectedGrade === "all" ? null : GRADE_NAME_TO_CODE[selectedGrade];
    const levelGrades = (GRADES_BY_LEVEL[selectedLevel] || []).map(name => GRADE_NAME_TO_CODE[name]);

    return studentsList.filter(s => {
      const nameMatch = s.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const admMatch = s.adm_no?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = nameMatch || admMatch;

      const matchesLevel = levelGrades.includes(s.level_id);
      const matchesGrade = selectedGrade === "all" ? true : s.level_id === targetGradeId;
      const matchesBoarding = boardingFilter === "all" ? true : (s.boarding_status || 'day') === boardingFilter;
      const matchesStream = selectedStream === "all" ? true : s.stream_id === selectedStream;

      return matchesSearch && matchesLevel && matchesGrade && matchesBoarding && matchesStream;
    });
  }, [searchTerm, selectedLevel, selectedGrade, boardingFilter, selectedStream, studentsList]);

  // Sync selectedGrade when selectedLevel changes
  useEffect(() => {
    setSelectedGrade((GRADES_BY_LEVEL[selectedLevel] || [])[0]);
    setCurrentPage(1);
  }, [selectedLevel]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const currentStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Admission Modal State
  const [showModal, setShowModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [newStudent, setNewStudent] = useState({
    first_name: "",
    last_name: "",
    adm_no: "",
    gender: "M",
    level_id: currentTypeClasses[0]?.id || "",
    stream_id: "",
    boarding_status: "day",
    dorm_id: "",
    parent_phone: "",
    photo_path: ""
  });

  // Parents / guardians for the student being added or edited. Two blank rows
  // (father, mother) by default; either parent's phone works at the parent
  // portal. The primary (first) phone is mirrored to students.parent_phone.
  const emptyGuardians = () => ([
    { relationship: "father", full_name: "", phone: "", email: "", id_number: "" },
    { relationship: "mother", full_name: "", phone: "", email: "", id_number: "" },
  ]);
  const [guardians, setGuardians] = useState(emptyGuardians());
  const updateGuardian = (i, field, val) => setGuardians(gs => gs.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  const addGuardian = () => setGuardians(gs => [...gs, { relationship: "guardian", full_name: "", phone: "", email: "", id_number: "" }]);
  const removeGuardian = (i) => setGuardians(gs => gs.filter((_, idx) => idx !== i));

  const resetForm = () => {
    setNewStudent({
      first_name: "",
      last_name: "",
      adm_no: "",
      gender: "M",
      level_id: currentTypeClasses[0]?.id || "",
      stream_id: "",
      dorm_id: "",
      parent_phone: "",
      photo_path: ""
    });
    setGuardians(emptyGuardians());
    setEditingStudentId(null);
    setPendingPhotoBlob(null);
    setRemoveExistingPhoto(false);
  };

  const handleEditClick = async (student) => {
    setNewStudent({
      // Full name lives in first_name (single-field convention). Merge any
      // legacy last_name so older records show their whole name in the field.
      first_name: `${student.first_name || ""} ${student.last_name || ""}`.trim(),
      last_name: "",
      adm_no: student.adm_no || "",
      gender: student.gender || "M",
      level_id: student.level_id,
      stream_id: student.stream_id || "",
      boarding_status: student.boarding_status || (student.dorm_id ? "boarder" : "day"),
      dorm_id: student.dorm_id || "",
      parent_phone: student.parent_phone || "",
      photo_path: student.photo_path || ""
    });
    setEditingStudentId(student.id);
    setPendingPhotoBlob(null);
    setRemoveExistingPhoto(false);
    setShowModal(true);

    // Load this student's guardians. Falls back to a single row seeded from the
    // legacy parent_phone if none exist yet (or the table isn't installed).
    try {
      const { data, error } = await supabase
        .from('student_guardians')
        .select('*')
        .eq('student_id', student.id)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      if (data && data.length) {
        setGuardians(data.map(g => ({
          relationship: g.relationship || 'guardian',
          full_name: g.full_name || '',
          phone: g.phone || '',
          email: g.email || '',
          id_number: g.id_number || '',
        })));
      } else if (student.parent_phone) {
        setGuardians([{ relationship: 'guardian', full_name: '', phone: student.parent_phone, email: '', id_number: '' }]);
      } else {
        setGuardians(emptyGuardians());
      }
    } catch {
      // Table not installed yet — keep the legacy single-phone view.
      setGuardians(student.parent_phone
        ? [{ relationship: 'guardian', full_name: '', phone: student.parent_phone, email: '', id_number: '' }]
        : emptyGuardians());
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm("Are you sure you want to delete this student? This action cannot be undone.")) return;

    try {
      const target = studentsList.find(s => s.id === id);
      const { data, error } = await supabase
        .from('students')
        .delete()
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("No rows were deleted. This usually means you don't have permission (RLS policy) or the student no longer exists.");
      }

      if (target?.photo_path) {
        try { await deleteStudentPhoto(target.photo_path); } catch (e) { console.error('Photo cleanup failed:', e); }
      }

      await fetchStudents();
    } catch (err) {
      alert('Failed to delete student: ' + err.message);
    }
  };

  const handleSaveStudent = async () => {
    if (!newStudent.adm_no || !newStudent.first_name.trim()) {
      alert("Please enter the admission number and the student's full name.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = { ...newStudent };
      // The whole name is captured in first_name; last_name stays blank.
      payload.first_name = payload.first_name.trim();
      payload.last_name = "";
      // Empty selects come through as "" — store NULL, not an invalid UUID.
      payload.stream_id = payload.stream_id || null;
      // Guardians drive the phone: mirror the first guardian's phone to the
      // legacy students.parent_phone so fees/reports keep working.
      const cleanGuardians = guardians
        .map(g => ({
          relationship: g.relationship || 'guardian',
          full_name: (g.full_name || '').trim(),
          phone: (g.phone || '').trim(),
          email: (g.email || '').trim(),
          id_number: (g.id_number || '').trim(),
        }))
        .filter(g => g.phone || g.full_name || g.email || g.id_number);
      payload.parent_phone = cleanGuardians.find(g => g.phone)?.phone || null;
      // Boarding status is authoritative; a dorm bed is optional detail and
      // only kept for boarders.
      payload.boarding_status = payload.boarding_status === 'boarder' ? 'boarder' : 'day';
      payload.dorm_id = payload.boarding_status === 'boarder' ? (payload.dorm_id || null) : null;

      let studentId = editingStudentId;

      if (editingStudentId) {
        const { data, error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editingStudentId)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("No rows were updated. Check your database permissions (RLS policies).");
        }
      } else {
        const finalPayload = {
          school_id: schoolConfig.id,
          ...payload
        };
        const { data, error } = await supabase
          .from('students')
          .insert([finalPayload])
          .select();

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Student was not added. Check your database permissions (RLS policies).");
        }
        studentId = data[0].id;
      }

      // Guardians — replace-all: clear existing rows, insert the filled ones.
      // Wrapped so a missing table (migration not yet applied) never blocks the
      // student save; the mirrored parent_phone still keeps parent login working.
      if (studentId) {
        try {
          await supabase.from('student_guardians').delete().eq('student_id', studentId);
          if (cleanGuardians.length) {
            const rows = cleanGuardians.map((g, i) => ({
              school_id: schoolConfig.id,
              student_id: studentId,
              relationship: g.relationship,
              full_name: g.full_name || null,
              phone: g.phone || null,
              email: g.email || null,
              id_number: g.id_number || null,
              is_primary: i === 0,
            }));
            const { error: gErr } = await supabase.from('student_guardians').insert(rows);
            if (gErr) throw gErr;
          }
        } catch (e) {
          console.error('Guardian save skipped:', e);
        }
      }

      // Photo handling — happens after the row exists so we have a stable ID
      if (pendingPhotoBlob && studentId) {
        try {
          const path = await uploadStudentPhoto({
            schoolId: schoolConfig.id,
            studentId,
            blob: pendingPhotoBlob,
          });
          await supabase.from('students').update({ photo_path: path }).eq('id', studentId);
        } catch (e) {
          alert('Student saved, but photo upload failed: ' + e.message);
        }
      } else if (removeExistingPhoto && newStudent.photo_path) {
        try {
          await deleteStudentPhoto(newStudent.photo_path);
          await supabase.from('students').update({ photo_path: null }).eq('id', studentId);
        } catch (e) {
          console.error('Photo removal failed:', e);
        }
      }

      await fetchStudents();
      setShowModal(false);
      resetForm();
    } catch (err) {
      alert('Failed to save student: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const gradeName = selectedGrade === 'all' ? 'All Grades' : currentTypeClasses.find(c => c.id === selectedGrade)?.name;
    
    const html = `
      <html>
        <head>
          <title>Student List - ${schoolConfig?.schoolName}</title>
          <style>
            body { font-family: 'Inter', sans-serif; color: #2a2421; padding: 40px; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #D4AF37; padding-bottom: 20px; margin-bottom: 30px; }
            .school-info { display: flex; align-items: center; gap: 15px; }
            .school-logo { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
            .school-name { font-size: 24px; font-weight: 800; margin: 0; font-family: 'EB Garamond', serif; }
            .report-title { text-align: right; }
            .report-title h2 { margin: 0; color: #D4AF37; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; }
            .report-title p { margin: 5px 0 0; color: #8a8fa8; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f9f7f2; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #8a8fa8; border-bottom: 1px solid #e6dfd8; }
            td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f0ece6; }
            .footer { margin-top: 50px; border-top: 1px solid #e6dfd8; padding-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #a0a5b8; }
            @media print {
              @page { margin: 20mm; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="school-info">
              ${schoolConfig?.logo_url ? `<img src="${schoolConfig.logo_url}" class="school-logo" />` : ''}
              <div>
                <h1 class="school-name">${schoolConfig?.schoolName || 'Institution'}</h1>
                <p style="margin:0; font-size:12px; color:#8a8fa8;">${schoolConfig?.county || ''} County · ${schoolConfig?.subCounty || ''}</p>
              </div>
            </div>
            <div class="report-title">
              <h2>Student Enrollment List</h2>
              <p>${gradeName}</p>
              <p>Generated on: ${new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>ADM No.</th>
                <th>Full Name</th>
                <th>Grade</th>
                <th>Stream</th>
                <th>Gender</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents.map(s => `
                <tr>
                  <td><strong>${s.adm_no}</strong></td>
                  <td>${s.full_name}</td>
                  <td>${currentTypeClasses.find(c => c.id === s.level_id)?.name || '-'}</td>
                  <td>${s.streams?.name || '-'}</td>
                  <td>${s.gender === 'M' ? 'Male' : 'Female'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <span>LOGIQ Educational Management System</span>
            <span>Total Students: ${filteredStudents.length}</span>
            <span>Page 1 of 1</span>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const planLimits = getPlanLimits(currentPlan || 'starter');
  const isAtLimit = studentsList.length >= planLimits.maxStudents;

  return (
    <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden" }}>
      {/* Plan Limit Banner */}
      {isAtLimit && (
        <div style={{
          padding: '12px 18px', background: '#FDF0ED', borderBottom: '1px solid #FADBD8',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#C0392B', fontWeight: 600,
        }}>
          <span>⚠️</span> Student limit reached ({planLimits.maxStudents} students on your plan). Upgrade to add more.
        </div>
      )}
      <div style={{ padding: "18px", borderBottom: "1px solid #E8EAF0" }}>
        {/* Filters and Search */}
        <div 
          className="grid-1"
          style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12 }}
        >
          <div style={{ position: "relative", minWidth: 0 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder="Search by name or admission number..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%",
                padding: "10px 12px 10px 32px",
                borderRadius: 8,
                border: "1px solid #E8EAF0",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, width: "100%", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>LEVEL:</span>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "140px" }}
              >
                {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>GRADE:</span>
              <select
                value={selectedGrade}
                onChange={(e) => { setSelectedGrade(e.target.value); setCurrentPage(1); }}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "120px" }}
              >
                <option value="all">All {selectedLevel}</option>
                {(GRADES_BY_LEVEL[selectedLevel] || []).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {streams.length > 0 && (
              // Streams are school-wide, so the same list applies across grades;
              // hidden for schools that have no streams configured.
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>STREAM:</span>
                <select
                  value={selectedStream}
                  onChange={(e) => { setSelectedStream(e.target.value); setCurrentPage(1); }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "120px" }}
                >
                  <option value="all">All streams</option>
                  {streams.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>BOARDING:</span>
              <select
                value={boardingFilter}
                onChange={(e) => { setBoardingFilter(e.target.value); setCurrentPage(1); }}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
              >
                <option value="all">All</option>
                <option value="boarder">Boarders</option>
                <option value="day">Day scholars</option>
              </select>
            </div>
            <button 
              onClick={handlePrint}
              style={{
                padding: "8px 16px",
                background: "#fff",
                color: "#1B6B3A", border: "1px solid #1B6B3A", borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <span>🖨️</span> Print
            </button>
            {!isTeacher && (
              <>
                <button
                  onClick={() => {
                    if (isAtLimit) {
                      alert(`Student limit reached (${planLimits.maxStudents}). Please upgrade your plan to add more students.`);
                      return;
                    }
                    setShowBulkImport(true);
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "#fff",
                    color: "#1B6B3A", border: "1px solid #1B6B3A", borderRadius: 8,
                    fontSize: 13, fontWeight: 600,
                    cursor: isAtLimit ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap"
                  }}
                  title="Import a list of students from an Excel file"
                >
                  <span>📊</span> Bulk Import
                </button>
                <button
                  onClick={() => {
                    if (isAtLimit) {
                      alert(`Student limit reached (${planLimits.maxStudents}). Please upgrade your plan to add more students.`);
                      return;
                    }
                    resetForm();
                    setShowModal(true);
                  }}
                  style={{
                    padding: "8px 16px",
                    background: isAtLimit ? "#8a8fa8" : "#1B6B3A",
                    color: "#fff", border: "none", borderRadius: 8,
                    fontSize: 13, fontWeight: 600,
                    cursor: isAtLimit ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  + New
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto", width: 30, height: 30, border: "3px solid #e6dfd8", borderTop: "3px solid #1B6B3A", borderRadius: "50%" }}></div>
          <p style={{ marginTop: 12, color: "#8a8fa8", fontSize: 13 }}>Loading students...</p>
        </div>
      ) : (
        <>
          {/* Student List Table */}
          <div className="table-container">
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
                <tr>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ADM No.</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Student Name</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Grade</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Stream</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentStudents.map((s, idx) => {
                  const grade = currentTypeClasses.find(c => c.id === s.level_id);
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A5F9C" }}>{s.adm_no}</td>
                      <td style={{ padding: "12px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StudentAvatar
                            photoUrl={getStudentPhotoUrl(s.photo_path, s.id)}
                            name={s.full_name || `${s.first_name} ${s.last_name}`.trim()}
                            size={32}
                          />
                          <div>
                            <div style={{ fontWeight: 700, color: "#1A1A2E", display: "flex", alignItems: "center", gap: 8 }}>
                              {s.full_name}
                              {s.boarding_status === 'boarder' && (
                                <span style={{ padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, background: "#EAF2FA", color: "#1A5F9C" }}>🛏 Boarder</span>
                              )}
                            </div>
                            <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                              {grade?.name} · {s.streams?.name || "No Stream"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                        <span style={{ 
                          padding: "3px 8px", 
                          borderRadius: 12, 
                          fontSize: 11, 
                          fontWeight: 700, 
                          background: grade?.bg || "#eee", 
                          color: grade?.color || "#333" 
                        }}>
                          {grade?.name}
                        </span>
                      </td>
                      <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.streams?.name || "No Stream"}</td>
                      <td style={{ padding: "12px 18px" }}>
                        <span style={{ 
                          padding: "2px 8px", 
                          borderRadius: 10, 
                          fontSize: 10, 
                          fontWeight: 700, 
                          background: s.status === "Active" ? "#E8F5EE" : "#F5F6F8", 
                          color: s.status === "Active" ? "#1B6B3A" : "#8A8FA8",
                          textTransform: "uppercase"
                        }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {isTeacher ? (
                            <span style={{ fontSize: 11, color: "#8A8FA8" }}>read-only</span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEditClick(s)}
                                style={{ background: "none", border: "none", color: "#1A5F9C", cursor: "pointer", fontSize: 16, padding: 4 }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(s.id)}
                                style={{ background: "none", border: "none", color: "#C0392B", cursor: "pointer", fontSize: 16, padding: 4 }}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: "18px", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#8A8FA8" }}>
              Showing {currentStudents.length} of {filteredStudents.length} students
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 12 }}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 12 }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bulk Import Wizard */}
      {showBulkImport && (
        <BulkImportWizard
          schoolConfig={schoolConfig}
          streams={streams}
          dorms={dorms}
          existingStudents={studentsList}
          planRemaining={Math.max(0, planLimits.maxStudents - studentsList.length)}
          onClose={() => setShowBulkImport(false)}
          onImported={fetchStudents}
        />
      )}

      {/* Admission Modal */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(42, 36, 33, 0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)", overflow: "hidden",
            display: "flex", flexDirection: "column", maxHeight: "90vh"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f2eb", flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2a2421" }}>
                {editingStudentId ? "📝 Edit Student Details" : "🎓 New Student Admission"}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8a8fa8" }}>&times;</button>
            </div>
            
            <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              {/* Photo */}
              <div style={{ gridColumn: "span 2", padding: "10px 0", borderBottom: "1px dashed #e6dfd8" }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Student Photo</label>
                <PhotoUpload
                  currentUrl={newStudent.photo_path && !removeExistingPhoto ? getStudentPhotoUrl(newStudent.photo_path, editingStudentId) : null}
                  studentName={`${newStudent.first_name} ${newStudent.last_name}`.trim()}
                  size={80}
                  onChange={(blob, meta) => {
                    setPendingPhotoBlob(blob);
                    setRemoveExistingPhoto(!!meta?.removed);
                  }}
                />
              </div>

              {/* Admission Number */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Admission Number</label>
                <input 
                  type="text" 
                  value={newStudent.adm_no}
                  onChange={(e) => setNewStudent({...newStudent, adm_no: e.target.value})}
                  placeholder="e.g. 2024/001"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", transition: "border-color 0.2s" }} 
                />
              </div>

              {/* Gender */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gender</label>
                <select 
                  value={newStudent.gender}
                  onChange={(e) => setNewStudent({...newStudent, gender: e.target.value})}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              {/* Full Name — one field, spans both columns */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</label>
                <input
                  type="text"
                  value={newStudent.first_name}
                  onChange={(e) => setNewStudent({...newStudent, first_name: e.target.value})}
                  placeholder="e.g. David Mario Kiplagat"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", transition: "border-color 0.2s" }}
                />
              </div>

              {/* Level */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Academic Level</label>
                <select
                  value={(() => {
                    const gradeName = GRADE_CODE_TO_NAME[newStudent.level_id];
                    for (const [lvl, grades] of Object.entries(GRADES_BY_LEVEL)) {
                      if (grades.includes(gradeName)) return lvl;
                    }
                    return Object.keys(GRADES_BY_LEVEL)[0];
                  })()}
                  onChange={(e) => {
                    const firstGrade = (GRADES_BY_LEVEL[e.target.value] || [])[0];
                    setNewStudent({...newStudent, level_id: GRADE_NAME_TO_CODE[firstGrade]});
                  }}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                >
                  {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>

              {/* Class / Grade */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Class / Grade</label>
                <select 
                  value={newStudent.level_id}
                  onChange={(e) => setNewStudent({...newStudent, level_id: e.target.value})}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                >
                  {(() => {
                    const gradeName = GRADE_CODE_TO_NAME[newStudent.level_id];
                    let currentLvl = Object.keys(GRADES_BY_LEVEL)[0];
                    for (const [lvl, grades] of Object.entries(GRADES_BY_LEVEL)) {
                      if (grades.includes(gradeName)) currentLvl = lvl;
                    }

                    return (GRADES_BY_LEVEL[currentLvl] || []).map(name => (
                      <option key={name} value={GRADE_NAME_TO_CODE[name]}>{name}</option>
                    ));
                  })()}
                </select>
              </div>

              {/* Stream */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stream (Optional)</label>
                <select 
                  value={newStudent.stream_id}
                  onChange={(e) => setNewStudent({...newStudent, stream_id: e.target.value})}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                >
                  <option value="">No Stream</option>
                  {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Boarding status — authoritative billing signal */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Boarding Status</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["day", "☀ Day Scholar"], ["boarder", "🛏 Boarder"]].map(([val, lbl]) => {
                    const active = newStudent.boarding_status === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setNewStudent({ ...newStudent, boarding_status: val, dorm_id: val === 'day' ? '' : newStudent.dorm_id })}
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                          border: active ? "1.5px solid #1A5F9C" : "1.5px solid #e6dfd8",
                          background: active ? "#EAF2FA" : "#fff", color: active ? "#1A5F9C" : "#8a8fa8",
                        }}
                      >{lbl}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: "#8a8fa8", marginTop: 4 }}>
                  Boarders are billed boarder-scoped voteheads; day scholars are not.
                </div>
              </div>

              {/* Dormitory — optional detail, only for boarders */}
              {newStudent.boarding_status === 'boarder' && (
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dormitory (Optional)</label>
                  <select
                    value={newStudent.dorm_id}
                    onChange={(e) => setNewStudent({...newStudent, dorm_id: e.target.value})}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer", transition: "border-color 0.2s" }}
                  >
                    <option value="">Not assigned to a dorm yet</option>
                    {dorms.map(d => <option key={d.id} value={d.id}>{d.name}{d.gender && d.gender !== 'Mixed' ? ` (${d.gender})` : ''}</option>)}
                  </select>
                </div>
              )}

              {/* Parents / Guardians */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Parents / Guardians</label>
                <div style={{ fontSize: 11.5, color: "#8a8fa8", marginBottom: 10, lineHeight: 1.5 }}>
                  Either parent can sign in to the parent portal with their own phone number and the student's admission number.
                </div>
                {guardians.map((g, i) => {
                  const fieldStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none" };
                  return (
                    <div key={i} style={{ border: "1px solid #e6dfd8", borderRadius: 10, padding: 12, marginBottom: 10, background: "#faf8f3" }}>
                      <div style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
                        <select
                          value={g.relationship}
                          onChange={(e) => updateGuardian(i, "relationship", e.target.value)}
                          style={{ ...fieldStyle, width: "auto", fontWeight: 700, cursor: "pointer" }}
                        >
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="guardian">Guardian</option>
                          <option value="other">Other</option>
                        </select>
                        <div style={{ flex: 1 }} />
                        {guardians.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGuardian(i)}
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#C0392B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >Remove</button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input type="text" value={g.full_name} onChange={(e) => updateGuardian(i, "full_name", e.target.value)} placeholder="Full name" style={fieldStyle} />
                        <input type="text" value={g.phone} onChange={(e) => updateGuardian(i, "phone", e.target.value)} placeholder="Phone e.g. 0712345678" style={fieldStyle} />
                        <input type="email" value={g.email} onChange={(e) => updateGuardian(i, "email", e.target.value)} placeholder="Email (optional)" style={fieldStyle} />
                        <input type="text" value={g.id_number} onChange={(e) => updateGuardian(i, "id_number", e.target.value)} placeholder="National ID (optional)" style={fieldStyle} />
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addGuardian}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px dashed #1B6B3A", background: "#fff", color: "#1B6B3A", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >+ Add another guardian</button>
              </div>
            </div>

            <div style={{ padding: "20px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#2a2421", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveStudent}
                disabled={isSaving}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: isSaving ? "#8a8fa8" : "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                {isSaving ? "Saving..." : editingStudentId ? "Update Student" : "Admit Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
