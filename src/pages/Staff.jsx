import React, { useState, useEffect, useRef } from 'react';
import { STAFF_ROLES } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { getPlanLimits } from '../lib/planConfig';

const Staff = ({ schoolConfig, currentPlan }) => {
  const [staffList, setStaffList] = useState([]);
  const [filter, setFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showReportDropdown, setShowReportDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStaff();
    }
  }, [schoolConfig?.id]);

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .order('full_name', { ascending: true });

      if (error) throw error;
      
      // Map DB names to frontend names if necessary
      const mappedData = (data || []).map(s => ({
        id: s.id,
        name: s.full_name,
        type: s.type,
        role: s.role,
        tsc: s.tsc_no,
        subject: s.subjects?.[0] || "", // Assuming single subject for now
        phone: s.phone,
        email: s.email
      }));
      
      setStaffList(mappedData);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowReportDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [newStaff, setNewStaff] = useState({
    name: "",
    type: "Teaching",
    role: "Subject Teacher",
    tsc: "",
    subject: "",
    phone: "",
    email: ""
  });

  const handleSaveStaff = async () => {
    if (!newStaff.name.trim()) return;
    
    setIsSaving(true);
    try {
      const payload = {
        school_id: schoolConfig.id,
        full_name: newStaff.name,
        type: newStaff.type,
        role: newStaff.role,
        tsc_no: newStaff.tsc,
        subjects: newStaff.subject ? [newStaff.subject] : [],
        phone: newStaff.phone,
        email: newStaff.email,
        status: 'Active'
      };

      if (editingId) {
        const { error } = await supabase
          .from('staff')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('staff')
          .insert([payload]);
        if (error) throw error;
      }

      await fetchStaff();
      setShowModal(false);
    } catch (err) {
      alert('Failed to save staff: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePDF = (scope) => {
    setShowReportDropdown(false);
    
    // Filter data based on current view
    const reportData = sortedStaff;
    const title = scope === 'all' ? `${filter} Staff Report` : "Staff Report (By Department)";
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1A1A2E; }
            h1 { color: #1B6B3A; border-bottom: 2px solid #1B6B3A; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #E8EAF0; padding: 12px; text-align: left; font-size: 12px; }
            th { background: #F8FAFC; color: #8A8FA8; text-transform: uppercase; }
            .header-info { margin-bottom: 30px; display: flex; justify-content: space-between; }
            .badge { padding: 2px 8px; borderRadius: 10px; fontSize: 10px; fontWeight: 700; background: #EBF3FB; color: #1A5F9C; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div>
              <h1>${schoolConfig?.schoolName || "EduConnect School"}</h1>
              <p>Staff Management Report</p>
            </div>
            <div style="text-align: right;">
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Report Type:</strong> ${title}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Staff Name</th>
                <th>Role</th>
                <th>Type</th>
                <th>TSC No.</th>
                <th>Subject/Dept</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.map(s => `
                <tr>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.role || (s.type === 'Teaching' ? 'Teacher' : 'Staff')}</td>
                  <td>${s.type}</td>
                  <td>${s.tsc || 'N/A'}</td>
                  <td>${s.subject || 'General'}</td>
                  <td>${s.phone}<br/><small>${s.email}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 10px; color: #888; text-align: center;">
            This report was automatically generated by EduConnect Management System.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleEdit = (s) => {
    setNewStaff(s);
    setEditingId(s.id);
    setShowModal(true);
  };

  const handleAdd = () => {
    setNewStaff({
      name: "",
      type: "Teaching",
      role: "Subject Teacher",
      tsc: "",
      subject: "",
      phone: "",
      email: ""
    });
    setEditingId(null);
    setShowModal(true);
  };

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedStaff = React.useMemo(() => {
    let items = staffList.filter(s => {
      if (filter === "All") return true;
      return s.type === filter;
    });

    if (sortConfig.key !== null) {
      items.sort((a, b) => {
        const aValue = a[sortConfig.key]?.toString().toLowerCase() || "";
        const bValue = b[sortConfig.key]?.toString().toLowerCase() || "";
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return items;
  }, [staffList, filter, sortConfig]);

  const planLimits = getPlanLimits(currentPlan || 'starter');
  const isAtStaffLimit = staffList.length >= planLimits.maxStaff;

  return (
    <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12 }}>
      {isAtStaffLimit && (
        <div style={{
          padding: '12px 18px', background: '#FDF0ED', borderBottom: '1px solid #FADBD8',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#C0392B', fontWeight: 600,
        }}>
          <span>⚠️</span> Staff limit reached ({planLimits.maxStaff} on your plan). Upgrade to add more.
        </div>
      )}
      <div style={{ padding: "18px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div 
            style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, flexWrap: "nowrap" }}
            className="sidebar-scroll"
          >
            {["All", "Teaching", "Non-Teaching"].map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: filter === type ? "#1B6B3A" : "#E8EAF0",
                  background: filter === type ? "#1B6B3A" : "#fff",
                  color: filter === type ? "#fff" : "#4A4A6A",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              onClick={() => setShowReportDropdown(!showReportDropdown)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #E8EAF0",
                background: "#F8FAFC",
                color: "#1B6B3A",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              📊 View Report <span style={{ fontSize: 10 }}>▼</span>
            </button>
            
            {showReportDropdown && (
              <div style={{
                position: "absolute",
                top: "110%",
                right: 0,
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                border: "1px solid #E8EAF0",
                width: 200,
                zIndex: 1000,
                padding: "6px 0"
              }}>
                <button 
                  onClick={() => handleGeneratePDF('all')}
                  style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontSize: 12, color: "#1A1A2E", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => e.target.style.background = "#F8FAFC"}
                  onMouseLeave={(e) => e.target.style.background = "none"}
                >
                  📄 {filter} Staff Report (PDF)
                </button>
                <button 
                  onClick={() => handleGeneratePDF('dept')}
                  style={{ width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontSize: 12, color: "#1A1A2E", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={(e) => e.target.style.background = "#F8FAFC"}
                  onMouseLeave={(e) => e.target.style.background = "none"}
                >
                  📂 Per Department Report (PDF)
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (isAtStaffLimit) {
              alert(`Staff limit reached (${planLimits.maxStaff}). Please upgrade your plan.`);
              return;
            }
            handleAdd();
          }}
          style={{
            padding: "10px 16px",
            background: isAtStaffLimit ? "#8a8fa8" : "#1B6B3A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: isAtStaffLimit ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          + Add Staff
        </button>
      </div>

      {/* Add Staff Modal */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(26, 26, 46, 0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 600,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)", overflow: "hidden"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFC" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1A1A2E", letterSpacing: "-0.01em" }}>
                {editingId ? "✏️ Edit Staff Member" : "👤 Add New Staff Member"}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8A8FA8", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
            </div>
            
            <div style={{ padding: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 20px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Full Name</label>
                <input 
                  type="text" 
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({...newStaff, name: e.target.value})}
                  placeholder="e.g. Mr. John Doe"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", boxSizing: "border-box", transition: "border-color 0.2s" }} 
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Staff Type</label>
                <select 
                  value={newStaff.type}
                  onChange={(e) => setNewStaff({...newStaff, type: e.target.value})}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", background: "#fff", boxSizing: "border-box", cursor: "pointer" }}
                >
                  <option value="Teaching">Teaching</option>
                  <option value="Non-Teaching">Non-Teaching</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Specific Role</label>
                <select 
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({...newStaff, role: e.target.value})}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", background: "#fff", boxSizing: "border-box", cursor: "pointer" }}
                >
                  {STAFF_ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>ID / TSC Number</label>
                <input 
                  type="text" 
                  value={newStaff.tsc}
                  onChange={(e) => setNewStaff({...newStaff, tsc: e.target.value})}
                  placeholder="e.g. TSC/12345"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", boxSizing: "border-box" }} 
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Subject / Dept</label>
                <input 
                  type="text" 
                  value={newStaff.subject}
                  onChange={(e) => setNewStaff({...newStaff, subject: e.target.value})}
                  placeholder="e.g. Mathematics"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", boxSizing: "border-box" }} 
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Phone Number</label>
                <input 
                  type="text" 
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff({...newStaff, phone: e.target.value})}
                  placeholder="07..."
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", boxSizing: "border-box" }} 
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Email Address</label>
                <input 
                  type="email" 
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({...newStaff, email: e.target.value})}
                  placeholder="staff@mwanga.ac.ke"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, color: "#1A1A2E", boxSizing: "border-box" }} 
                />
              </div>
            </div>

            <div style={{ padding: "20px 24px", background: "#F8FAFC", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #D0D5DD", background: "#fff", color: "#344054", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveStaff}
                disabled={isSaving}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: isSaving ? "#8A8FA8" : "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}
              >
                {isSaving ? "Saving..." : "Save Staff"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-container" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <tr>
              <th 
                onClick={() => requestSort('name')} 
                style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}
              >
                Staff Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th 
                onClick={() => requestSort('role')} 
                style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}
              >
                Role/Type {sortConfig.key === 'role' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th 
                className="hide-mobile" 
                onClick={() => requestSort('tsc')} 
                style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}
              >
                ID / TSC No. {sortConfig.key === 'tsc' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th 
                className="hide-mobile" 
                onClick={() => requestSort('subject')} 
                style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}
              >
                Subjects / Dept {sortConfig.key === 'subject' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th 
                onClick={() => requestSort('phone')} 
                style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}
              >
                Contact {sortConfig.key === 'phone' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedStaff.map((s, idx) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="hide-mobile" style={{ width: 32, height: 32, borderRadius: "50%", background: "#1B6B3A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                      {s.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s.name}</div>
                      <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>{s.subject || "General"}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 12 }}>{s.role || (s.type === "Teaching" ? "Teacher" : "Staff")}</div>
                  <span style={{ 
                    padding: "2px 8px", 
                    borderRadius: 10, 
                    fontSize: 9, 
                    fontWeight: 700, 
                    background: s.type === "Teaching" ? "#EBF3FB" : "#F5EEF8", 
                    color: s.type === "Teaching" ? "#1A5F9C" : "#6C3483",
                    textTransform: "uppercase",
                    marginTop: 4,
                    display: "inline-block"
                  }}>
                    {s.type}
                  </span>
                </td>
                <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A", fontWeight: 500 }}>{s.tsc || "N/A"}</td>
                <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.subject || "General"}</td>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ fontSize: 12, color: "#1A1A2E" }}>{s.phone}</div>
                  <div className="hide-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>{s.email}</div>
                </td>
                <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                  <button 
                    onClick={() => handleEdit(s)}
                    style={{ padding: "4px 8px", background: "none", border: "1px solid #E8EAF0", borderRadius: 4, fontSize: 11, color: "#4A4A6A", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Staff;
