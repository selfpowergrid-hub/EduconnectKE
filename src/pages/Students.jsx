import React, { useState, useMemo, useEffect } from 'react';
import { getClassesByType } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { getPlanLimits } from '../lib/planConfig';

const Students = ({ schoolConfig, currentPlan }) => {
  const [studentsList, setStudentsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [streams, setStreams] = useState([]);
  const itemsPerPage = 15;

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchStreams();
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

  const currentTypeClasses = useMemo(() => {
    return getClassesByType(schoolConfig?.schoolType || "Primary");
  }, [schoolConfig]);

  const filteredStudents = useMemo(() => {
    const classIds = currentTypeClasses.map(c => c.id);
    return studentsList.filter(s => {
      const nameMatch = s.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const admMatch = s.adm_no?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = nameMatch || admMatch;
      const matchesGrade = selectedGrade === "all" ? classIds.includes(s.level_id) : s.level_id === selectedGrade;
      return matchesSearch && matchesGrade;
    });
  }, [searchTerm, selectedGrade, currentTypeClasses, studentsList]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const currentStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Admission Modal State
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newStudent, setNewStudent] = useState({
    adm_no: "",
    first_name: "",
    last_name: "",
    gender: "M",
    level_id: currentTypeClasses[0]?.id || "",
    stream_id: "",
    parent_phone: ""
  });

  const handleAddStudent = async () => {
    if (!newStudent.adm_no || !newStudent.first_name || !newStudent.last_name) {
      alert("Please fill in all required fields.");
      return;
    }
    
    setIsSaving(true);
    try {
      const payload = {
        school_id: schoolConfig.id,
        ...newStudent
      };

      const { error } = await supabase
        .from('students')
        .insert([payload]);

      if (error) throw error;
      
      await fetchStudents();
      setShowModal(false);
      setNewStudent({
        adm_no: "",
        first_name: "",
        last_name: "",
        gender: "M",
        level_id: currentTypeClasses[0]?.id || "",
        stream_id: "",
        parent_phone: ""
      });
    } catch (err) {
      alert('Failed to admit student: ' + err.message);
    } finally {
      setIsSaving(false);
    }
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
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <select
              value={selectedGrade}
              onChange={(e) => { setSelectedGrade(e.target.value); setCurrentPage(1); }}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
            >
              <option value="all">All Grades</option>
              {currentTypeClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button 
              onClick={() => {
                if (isAtLimit) {
                  alert(`Student limit reached (${planLimits.maxStudents}). Please upgrade your plan to add more students.`);
                  return;
                }
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
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Fee Bal.</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentStudents.map((s, idx) => {
                  const grade = currentTypeClasses.find(c => c.id === s.level_id);
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A5F9C" }}>{s.adm_no}</td>
                      <td style={{ padding: "12px 18px" }}>
                        <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s.full_name}</div>
                        <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                          {grade?.name} · {s.streams?.name || "No Stream"}
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
                        <span style={{ fontWeight: 700, color: (s.fee_balance || 0) > 0 ? "#C0392B" : "#1B6B3A" }}>
                          {(s.fee_balance || 0).toLocaleString()}
                        </span>
                      </td>
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

      {/* Admission Modal */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(42, 36, 33, 0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 550,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)", overflow: "hidden"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f2eb" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2a2421" }}>🎓 New Student Admission</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8a8fa8" }}>&times;</button>
            </div>
            
            <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px 32px" }}>
              {/* Admission Number */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Admission Number</label>
                <input 
                  type="text" 
                  value={newStudent.adm_no}
                  onChange={(e) => setNewStudent({...newStudent, adm_no: e.target.value})}
                  placeholder="e.g. 2024/001"
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none" }} 
                />
              </div>

              {/* Gender */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gender</label>
                <select 
                  value={newStudent.gender}
                  onChange={(e) => setNewStudent({...newStudent, gender: e.target.value})}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer" }}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              {/* First Name */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>First Name</label>
                <input 
                  type="text" 
                  value={newStudent.first_name}
                  onChange={(e) => setNewStudent({...newStudent, first_name: e.target.value})}
                  placeholder="e.g. David"
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none" }} 
                />
              </div>

              {/* Last Name */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Name</label>
                <input 
                  type="text" 
                  value={newStudent.last_name}
                  onChange={(e) => setNewStudent({...newStudent, last_name: e.target.value})}
                  placeholder="e.g. Otieno"
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none" }} 
                />
              </div>

              {/* Class / Grade */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Class / Grade</label>
                <select 
                  value={newStudent.level_id}
                  onChange={(e) => setNewStudent({...newStudent, level_id: e.target.value})}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer" }}
                >
                  {currentTypeClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Stream */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stream (Optional)</label>
                <select 
                  value={newStudent.stream_id}
                  onChange={(e) => setNewStudent({...newStudent, stream_id: e.target.value})}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none", cursor: "pointer" }}
                >
                  <option value="">No Stream</option>
                  {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Phone */}
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#4A4A6A", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Parent/Guardian Phone Number</label>
                <input 
                  type="text" 
                  value={newStudent.parent_phone}
                  onChange={(e) => setNewStudent({...newStudent, parent_phone: e.target.value})}
                  placeholder="e.g. 0712345678"
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #e6dfd8", fontSize: 14, boxSizing: "border-box", background: "#ffffff", outline: "none" }} 
                />
              </div>
            </div>

            <div style={{ padding: "20px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#2a2421", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={handleAddStudent}
                disabled={isSaving}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: isSaving ? "#8a8fa8" : "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                {isSaving ? "Admitting..." : "Admit Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
