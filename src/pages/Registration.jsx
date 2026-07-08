import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.jpg';
import SchoolCodeCard from '../components/school/SchoolCodeCard';

const Registration = ({ onComplete, schoolConfig, userEmail }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(schoolConfig || {
    schoolName: "",
    regNumber: "",
    county: "",
    subCounty: "",
    email: userEmail || "",
    phone: "",
    address: "",
    schoolType: "", // Primary, JSS, SS
    modules: [], // Examinations, Accounts, Library
    totalStudents: ""
  });

  const [errors, setErrors] = useState({});

  const schoolTypes = [
    { id: "Primary & JSS", label: "Primary & JSS", description: "PP1 to Grade 9", icon: "🏫" },
    { id: "Secondary", label: "Senior Secondary", description: "Grade 10 to 12", icon: "🏛️" }
  ];

  const availableModules = [
    { id: "Examinations", label: "Examinations", icon: "📝" },
    { id: "Accounts", label: "Accounts", icon: "💳" },
    { id: "Library", label: "Library", icon: "📚" }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const toggleModule = (id) => {
    setFormData(prev => {
      const modules = prev.modules.includes(id)
        ? prev.modules.filter(m => m !== id)
        : [...prev.modules, id];
      return { ...prev, modules };
    });
    if (errors.modules) {
      setErrors(prev => ({ ...prev, modules: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.schoolName) newErrors.schoolName = "Required";
    if (!formData.regNumber) newErrors.regNumber = "Required";
    if (!formData.county) newErrors.county = "Required";
    if (!formData.email && !userEmail) newErrors.email = "Required";
    if (!formData.phone) newErrors.phone = "Required";
    if (!formData.schoolType) newErrors.schoolType = "Select school type";
    if (formData.modules.length === 0) newErrors.modules = "Select at least one module";
    if (!formData.totalStudents || formData.totalStudents <= 0) newErrors.totalStudents = "Required, must be greater than 0";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Use auth email if available
      const submitData = { ...formData, email: userEmail || formData.email };
      await onComplete(submitData);
    } catch (err) {
      console.error('Error during registration:', err);
      alert('Registration failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: "#4A4A6A", marginBottom: 8 };
  const inputStyle = { width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #E8EAF0", fontSize: 14, background: "#fff", outline: "none", boxSizing: "border-box" };

  return (
    <div className="main-scroll" style={{ height: "auto", minHeight: "100%", overflowY: "visible", padding: "20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src={logo} alt="LOGIQ Logo" style={{ width: 80, height: 'auto', borderRadius: 12, marginBottom: 16, boxShadow: '0 6px 20px rgba(212,175,55,0.2)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#1A1A2E", margin: 0 }}>School Registration</h1>
          <p style={{ color: "#8A8FA8", marginTop: 8, fontSize: 15 }}>Welcome to LOGIQ. Please set up your institution.</p>
          <div style={{ marginTop: 12, fontSize: 12, color: "#1B6B3A", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>↓</span> Scroll down to complete all sections <span>↓</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {schoolConfig?.id && schoolConfig?.schoolCode && (
            <SchoolCodeCard
              code={schoolConfig.schoolCode}
            />
          )}

          {/* School Info Section */}
          <section style={{ background: "#fff", padding: 28, borderRadius: 16, border: "1px solid #E8EAF0" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#1B6B3A", margin: "0 0 20px" }}>School Information</h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>School Name</label>
                <input name="schoolName" placeholder="e.g. Mwanga Academy" value={formData.schoolName} onChange={handleInputChange} style={{...inputStyle, borderColor: errors.schoolName ? "#C0392B" : "#E8EAF0"}} />
              </div>

              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Registration No.</label>
                  <input name="regNumber" placeholder="e.g. MOE/PRI/123" value={formData.regNumber} onChange={handleInputChange} style={{...inputStyle, borderColor: errors.regNumber ? "#C0392B" : "#E8EAF0"}} />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input name="phone" placeholder="0712..." value={formData.phone} onChange={handleInputChange} style={{...inputStyle, borderColor: errors.phone ? "#C0392B" : "#E8EAF0"}} />
                </div>
              </div>

              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>County</label>
                  <input name="county" placeholder="Nairobi" value={formData.county} onChange={handleInputChange} style={{...inputStyle, borderColor: errors.county ? "#C0392B" : "#E8EAF0"}} />
                </div>
                <div>
                  <label style={labelStyle}>Sub-County</label>
                  <input name="subCounty" placeholder="Westlands" value={formData.subCounty} onChange={handleInputChange} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>School Email</label>
                {userEmail ? (
                  <div style={{...inputStyle, background: '#f5f2eb', color: '#8a8fa8', cursor: 'not-allowed'}}>{userEmail}</div>
                ) : (
                  <input name="email" type="email" placeholder="info@school.ac.ke" value={formData.email} onChange={handleInputChange} style={{...inputStyle, borderColor: errors.email ? "#C0392B" : "#E8EAF0"}} />
                )}
              </div>

              <div>
                <label style={labelStyle}>Postal Address</label>
                <input name="address" placeholder="P.O. Box 123-00100" value={formData.address} onChange={handleInputChange} style={inputStyle} />
              </div>
            </div>
          </section>

          {/* School Type Section */}
          <section style={{ background: "#fff", padding: 28, borderRadius: 16, border: "1px solid #E8EAF0" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#1B6B3A", margin: "0 0 4px" }}>School Level</h2>
            <p style={{ fontSize: 13, color: "#8A8FA8", marginBottom: 20 }}>Select the primary level of your institution.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {schoolTypes.map(type => (
                <div 
                  key={type.id}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, schoolType: type.id }));
                    setErrors(prev => ({ ...prev, schoolType: null }));
                  }}
                  style={{
                    padding: "16px",
                    borderRadius: 12,
                    border: "2px solid",
                    borderColor: formData.schoolType === type.id ? "#1B6B3A" : "#F0F2F5",
                    background: formData.schoolType === type.id ? "#E8F5EE" : "#FAFBFC",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ fontSize: 24 }}>{type.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 14 }}>{type.label}</div>
                    <div style={{ fontSize: 12, color: "#8A8FA8" }}>{type.description}</div>
                  </div>
                  <div style={{ 
                    width: 20, height: 20, borderRadius: "50%", border: "2px solid",
                    borderColor: formData.schoolType === type.id ? "#1B6B3A" : "#D1D5DB",
                    background: formData.schoolType === type.id ? "#1B6B3A" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {formData.schoolType === type.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                </div>
              ))}
              {errors.schoolType && <p style={{ color: "#C0392B", fontSize: 12, fontWeight: 600, margin: "4px 0 0" }}>{errors.schoolType}</p>}
            </div>
          </section>

          {/* Enrollment Section */}
          <section style={{ background: "#fff", padding: 28, borderRadius: 16, border: "1px solid #E8EAF0" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#1B6B3A", margin: "0 0 4px" }}>Enrollment & Subscription</h2>
            <p style={{ fontSize: 13, color: "#8A8FA8", marginBottom: 20 }}>Indicate the total number of students in your school to calculate your subscription cost.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Total Number of Students</label>
                <input 
                  type="number" 
                  name="totalStudents" 
                  placeholder="e.g. 500" 
                  value={formData.totalStudents} 
                  onChange={handleInputChange} 
                  style={{...inputStyle, borderColor: errors.totalStudents ? "#C0392B" : "#E8EAF0"}} 
                  min="1"
                />
                {errors.totalStudents && <p style={{ color: "#C0392B", fontSize: 12, fontWeight: 600, margin: "4px 0 0" }}>{errors.totalStudents}</p>}
              </div>

              {formData.totalStudents > 0 && (
                <div style={{ background: "#E8F5EE", padding: 16, borderRadius: 12, border: "1px solid #1B6B3A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#1B6B3A", fontWeight: 700 }}>Subscription Cost</div>
                    <div style={{ fontSize: 11, color: "#8A8FA8", maxWidth: 300 }}>
                      KES 35/student (first 300), then KES 20/student thereafter.
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E", textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, textTransform: "uppercase" }}>Annual Total</div>
                    KES {((parseInt(formData.totalStudents) || 0) <= 300 
                      ? (parseInt(formData.totalStudents) || 0) * 35 
                      : (300 * 35) + ((parseInt(formData.totalStudents) || 0) - 300) * 20).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Module Selection Section */}
          <section style={{ background: "#fff", padding: 28, borderRadius: 16, border: "1px solid #E8EAF0" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#1B6B3A", margin: "0 0 4px" }}>Feature Modules</h2>
            <p style={{ fontSize: 13, color: "#8A8FA8", marginBottom: 20 }}>Select the modules you wish to activate for your school.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="grid-1">
              {availableModules.map(module => (
                <div 
                  key={module.id}
                  onClick={() => toggleModule(module.id)}
                  style={{
                    padding: "16px",
                    borderRadius: 12,
                    border: "2px solid",
                    borderColor: formData.modules.includes(module.id) ? "#1B6B3A" : "#F0F2F5",
                    background: formData.modules.includes(module.id) ? "#E8F5EE" : "#FAFBFC",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ fontSize: 20 }}>{module.icon}</div>
                  <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 13, flex: 1 }}>{module.label}</div>
                  <div style={{ 
                    width: 18, height: 18, borderRadius: 4, border: "2px solid",
                    borderColor: formData.modules.includes(module.id) ? "#1B6B3A" : "#D1D5DB",
                    background: formData.modules.includes(module.id) ? "#1B6B3A" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {formData.modules.includes(module.id) && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>
            {errors.modules && <p style={{ color: "#C0392B", fontSize: 12, fontWeight: 600, margin: "12px 0 0" }}>{errors.modules}</p>}
          </section>

          <button 
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "16px",
              background: isSubmitting ? "#8A8FA8" : "#1B6B3A",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 800,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(27,107,58,0.2)",
              transition: "all 0.2s",
              marginBottom: 40,
              width: "100%",
              opacity: isSubmitting ? 0.8 : 1
            }}
            onMouseEnter={(e) => !isSubmitting && (e.target.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => !isSubmitting && (e.target.style.transform = "translateY(0)")}
          >
            {isSubmitting ? "Processing..." : (schoolConfig ? "Update Institution Settings" : "Complete Registration")}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Registration;
