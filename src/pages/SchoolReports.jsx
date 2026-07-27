import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { GRADE_CODE_TO_NAME, GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import Letterhead from '../components/Letterhead';
import PrintSizer, { printCellFont, usePageEstimate, BW_FILTER } from '../components/PrintSizer';

// General & statutory school reports: student lists, guardians, emergency
// contacts, KEMIS learner register, termly enrolment returns.

const REPORTS = [
  { id: 'students', label: '📋 Student List' },
  { id: 'guardians', label: '👪 Parents / Guardians Directory' },
  { id: 'emergency', label: '🚨 Emergency Contact Sheet' },
  { id: 'kemis', label: '🏛️ KEMIS Learner Register' },
  { id: 'enrolment', label: '📊 Termly Enrolment Returns' },
];

const th = { border: '1px solid #e6dfd8', padding: '8px 10px', textAlign: 'left', fontWeight: 700, background: '#faf8f5', fontSize: 11.5, textTransform: 'uppercase' };
const td = { border: '1px solid #e6dfd8', padding: '7px 10px', fontSize: 12.5 };
const tdC = { ...td, textAlign: 'center' };
const card = { background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 18, marginBottom: 16 };
const sectionTitle = { fontSize: 15, fontWeight: 800, color: '#2a2421', marginBottom: 12 };

const SchoolReports = ({ schoolConfig }) => {
  const gradesByLevel = useMemo(() => gradesByLevelForSchool(schoolConfig?.schoolType), [schoolConfig?.schoolType]);
  const allClassCodes = useMemo(
    () => Object.values(gradesByLevel).flat().map(n => GRADE_NAME_TO_CODE[n]),
    [gradesByLevel]
  );
  const [selectedLevel, setSelectedLevel] = useState('all');   // 'all' | level name
  const [selectedClass, setSelectedClass] = useState('all');   // 'all' | grade code
  const [selectedStream, setSelectedStream] = useState('all'); // 'all' | stream id
  const [reportType, setReportType] = useState('students');
  const [customTitle, setCustomTitle] = useState('');          // '' = use the default report title
  const [students, setStudents] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printScale, setPrintScale] = useState(100);
  const [printFont, setPrintFont] = useState('auto');
  const [printBW, setPrintBW] = useState(false); // black & white output

  useEffect(() => {
    if (!schoolConfig?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const id = schoolConfig.id;
      const [st, gu, str, si] = await Promise.all([
        supabase.from('students').select('*').eq('school_id', id),
        supabase.from('student_guardians').select('*').eq('school_id', id),
        supabase.from('streams').select('*').eq('school_id', id),
        supabase.from('school_information').select('*').eq('school_id', id).maybeSingle(),
      ]);
      if (cancelled) return;
      setStudents(st.data || []);
      setGuardians(gu.data || []);
      setDbStreams(str.data || []);
      setSchoolInfo(si.data || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolConfig?.id]);

  const streamById = useMemo(() => Object.fromEntries(dbStreams.map(s => [s.id, s.name])), [dbStreams]);
  const guardiansByStudent = useMemo(() => {
    const map = {};
    guardians.forEach(g => { (map[g.student_id] = map[g.student_id] || []).push(g); });
    // primary guardian first
    Object.values(map).forEach(list => list.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)));
    return map;
  }, [guardians]);

  // Codes in scope: specific class > whole level > whole school.
  const scopeCodes = useMemo(() => {
    if (selectedClass !== 'all') return [selectedClass];
    if (selectedLevel !== 'all') return (gradesByLevel[selectedLevel] || []).map(n => GRADE_NAME_TO_CODE[n]);
    return allClassCodes;
  }, [selectedClass, selectedLevel, gradesByLevel, allClassCodes]);

  // Sorting for the student-based reports: class order first, then the chosen
  // column. ADM sorts numerically where possible.
  const [sortKey, setSortKey] = useState('name'); // 'name' | 'adm'
  const [sortDir, setSortDir] = useState('asc');
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortArrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  // Students in scope, sorted by class then the chosen column.
  const scoped = useMemo(() => {
    let pool = students.filter(s => scopeCodes.includes(s.level_id));
    if (selectedStream !== 'all') pool = pool.filter(s => s.stream_id === selectedStream);
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmpAdm = (a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
    };
    return [...pool].sort((a, b) =>
      allClassCodes.indexOf(a.level_id) - allClassCodes.indexOf(b.level_id) ||
      (sortKey === 'adm'
        ? dir * cmpAdm(a.adm_no, b.adm_no)
        : dir * (a.first_name || '').localeCompare(b.first_name || '')));
  }, [students, scopeCodes, selectedStream, allClassCodes, sortKey, sortDir]);

  // Streams offered for the current class scope. Streams are school-wide (no
  // grade column); a stream belongs to this class only if one of its students
  // is actually assigned to it.
  const streamsForScope = useMemo(() => {
    if (selectedClass === 'all') return [];
    const ids = new Set(students.filter(s => s.level_id === selectedClass).map(s => s.stream_id).filter(Boolean));
    return dbStreams.filter(s => ids.has(s.id));
  }, [dbStreams, students, selectedClass]);

  // Effective title: the user's custom text, else the report's default name.
  const defaultTitle = REPORTS.find(r => r.id === reportType)?.label.replace(/^[^ ]+ /, '') || 'Report';
  const effectiveTitle = customTitle.trim() || defaultTitle;
  const scopeLabel = [
    selectedClass !== 'all' ? GRADE_CODE_TO_NAME[selectedClass] : selectedLevel !== 'all' ? selectedLevel : 'All Classes',
    selectedStream !== 'all' ? (dbStreams.find(s => s.id === selectedStream)?.name || '') : null,
  ].filter(Boolean).join(' · ');

  const estPages = usePageEstimate({
    containerId: 'school-report-print',
    scale: printScale, font: printFont, autoPx: 11,
    screenZoom: printScale / 100,
    deps: [reportType, scoped, loading],
  });

  const className = (code) => GRADE_CODE_TO_NAME[code] || code;
  const primaryGuardian = (s) => (guardiansByStudent[s.id] || [])[0] ||
    (s.parent_phone ? { full_name: '', phone: s.parent_phone, relationship: 'guardian' } : null);

  // ------------------------------------------------------------- Excel export
  const exportExcel = () => {
    let rows = [];
    let sheet = 'Report';
    if (reportType === 'students') {
      sheet = 'Student List';
      rows = scoped.map((s, i) => ({
        '#': i + 1, 'ADM NO': s.adm_no,
        'STUDENT NAME': `${s.first_name || ''} ${s.last_name || ''}`.trim(),
        'GENDER': s.gender || '', 'CLASS': className(s.level_id),
        'STREAM': streamById[s.stream_id] || '', 'BOARDING': s.boarding_status || '',
      }));
    } else if (reportType === 'guardians') {
      sheet = 'Guardians';
      scoped.forEach(s => {
        const list = guardiansByStudent[s.id] || [];
        if (!list.length) {
          rows.push({ 'ADM NO': s.adm_no, 'STUDENT': `${s.first_name || ''} ${s.last_name || ''}`.trim(), 'CLASS': className(s.level_id), 'STREAM': streamById[s.stream_id] || '', 'GUARDIAN': s.parent_phone ? '(legacy phone)' : '', 'RELATIONSHIP': '', 'PHONE': s.parent_phone || '', 'EMAIL': '', 'ID NO': '' });
        } else {
          list.forEach(g => rows.push({ 'ADM NO': s.adm_no, 'STUDENT': `${s.first_name || ''} ${s.last_name || ''}`.trim(), 'CLASS': className(s.level_id), 'STREAM': streamById[s.stream_id] || '', 'GUARDIAN': g.full_name || '', 'RELATIONSHIP': g.relationship || '', 'PHONE': g.phone || '', 'EMAIL': g.email || '', 'ID NO': g.id_number || '' }));
        }
      });
    } else if (reportType === 'emergency') {
      sheet = 'Emergency Contacts';
      rows = scoped.map(s => { const g = primaryGuardian(s); return { 'ADM NO': s.adm_no, 'STUDENT': `${s.first_name || ''} ${s.last_name || ''}`.trim(), 'CLASS': className(s.level_id), 'STREAM': streamById[s.stream_id] || '', 'CONTACT PERSON': g?.full_name || '', 'RELATIONSHIP': g?.relationship || '', 'PHONE': g?.phone || '' }; });
    } else if (reportType === 'kemis') {
      sheet = 'KEMIS Register';
      rows = scoped.map(s => ({
        'UPI / MAISHA NAMBA': s.upi_number || '', 'ADM NO': s.adm_no,
        'FIRST NAME': s.first_name || '', 'LAST NAME': s.last_name || '',
        'GENDER': s.gender || '', 'DATE OF BIRTH': s.date_of_birth || '',
        'BIRTH CERT NO': s.birth_cert_no || '', 'NATIONALITY': s.nationality || 'Kenyan',
        'GRADE': className(s.level_id), 'STREAM': streamById[s.stream_id] || '',
        'BOARDING/DAY': s.boarding_status || '', 'SPECIAL NEEDS': s.special_needs || 'None',
      }));
    } else if (reportType === 'enrolment') {
      sheet = 'Enrolment';
      rows = enrolmentRows().map(r => ({ 'GRADE': r.grade, 'BOYS': r.boys, 'GIRLS': r.girls, 'TOTAL': r.total, 'BOARDERS': r.boarders, 'DAY': r.day }));
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    const fileBase = effectiveTitle.replace(/[^\w ]/g, '').trim().replace(/ +/g, '-') || sheet.replace(/ /g, '-');
    XLSX.writeFile(wb, `${fileBase}-${scopeLabel.replace(/ /g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handlePrint = () => {
    const el = document.getElementById('school-report-print');
    if (!el) return;
    const win = window.open('', '_blank');
    // The letterhead lives inside the printable container, so the export
    // carries it (with logo) without a separate header here.
    const cellFont = printCellFont(printFont, 11);
    win.document.write(`<html><head><title>${effectiveTitle}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:16px;color:#111;zoom:${printScale / 100}${printBW ? `;filter:${BW_FILTER}` : ''}}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th,td{border:1px solid #333;padding:${cellFont <= 8 ? '2px 4px' : '5px 8px'};font-size:${cellFont}px}th{background:#eee;text-align:left}
      img{max-width:80px;max-height:80px}
      @media print{@page{margin:12mm}}
    </style></head><body>
      ${el.innerHTML}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  // ------------------------------------------------------------- Renderers
  const renderStudents = () => (
    <div style={card}>
      <div style={sectionTitle}>{effectiveTitle} ({scoped.length} students)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, width: 40 }}>#</th><th onClick={() => toggleSort('adm')} title="Sort by admission number" style={{ ...th, cursor: 'pointer', userSelect: 'none' }}>ADM No{sortArrow('adm')}</th><th onClick={() => toggleSort('name')} title="Sort by name" style={{ ...th, cursor: 'pointer', userSelect: 'none' }}>Student Name{sortArrow('name')}</th><th style={{ ...th, textAlign: 'center' }}>Gender</th><th style={th}>Class</th><th style={th}>Stream</th><th style={th}>Boarding</th></tr></thead>
          <tbody>
            {scoped.map((s, i) => (
              <tr key={s.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ ...td, color: '#8a8fa8' }}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 700 }}>{s.adm_no}</td>
                <td style={{ ...td, fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                <td style={tdC}>{s.gender || '—'}</td>
                <td style={td}>{className(s.level_id)}</td>
                <td style={td}>{streamById[s.stream_id] || '—'}</td>
                <td style={{ ...td, textTransform: 'capitalize' }}>{s.boarding_status || '—'}</td>
              </tr>
            ))}
            {scoped.length === 0 && <tr><td colSpan={7} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderGuardians = () => (
    <div style={card}>
      <div style={sectionTitle}>{effectiveTitle} ({scoped.length} students)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>ADM</th><th style={th}>Student</th><th style={th}>Class</th><th style={th}>Stream</th><th style={th}>Guardian</th><th style={th}>Relationship</th><th style={th}>Phone</th><th style={th}>Email</th></tr></thead>
          <tbody>
            {scoped.map(s => {
              const list = guardiansByStudent[s.id] || [];
              if (!list.length) return (
                <tr key={s.id}>
                  <td style={td}>{s.adm_no}</td><td style={{ ...td, fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                  <td style={td}>{className(s.level_id)}</td><td style={td}>{streamById[s.stream_id] || '—'}</td>
                  <td style={{ ...td, color: '#C0392B' }} colSpan={2}>No guardian on record</td>
                  <td style={td}>{s.parent_phone || '—'}</td><td style={td}>—</td>
                </tr>
              );
              return list.map((g, i) => (
                <tr key={g.id} style={{ background: i > 0 ? '#faf8f5' : undefined }}>
                  <td style={td}>{i === 0 ? s.adm_no : ''}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{i === 0 ? `${s.first_name} ${s.last_name}` : ''}</td>
                  <td style={td}>{i === 0 ? className(s.level_id) : ''}</td>
                  <td style={td}>{i === 0 ? (streamById[s.stream_id] || '—') : ''}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{g.full_name || '—'}{g.is_primary ? ' ⭐' : ''}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{g.relationship}</td>
                  <td style={td}>{g.phone || '—'}</td>
                  <td style={td}>{g.email || '—'}</td>
                </tr>
              ));
            })}
            {scoped.length === 0 && <tr><td colSpan={8} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderEmergency = () => (
    <div style={card}>
      <div style={sectionTitle}>{effectiveTitle} ({scoped.length} students)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>ADM</th><th style={th}>Student</th><th style={th}>Class</th><th style={th}>Stream</th><th style={th}>Contact Person</th><th style={th}>Relationship</th><th style={th}>Phone</th></tr></thead>
          <tbody>
            {scoped.map(s => {
              const g = primaryGuardian(s);
              return (
                <tr key={s.id}>
                  <td style={td}>{s.adm_no}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                  <td style={td}>{className(s.level_id)}</td>
                  <td style={td}>{streamById[s.stream_id] || '—'}</td>
                  <td style={{ ...td, fontWeight: 600, color: g ? undefined : '#C0392B' }}>{g?.full_name || (g ? '(phone only)' : 'MISSING')}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{g?.relationship || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{g?.phone || '—'}</td>
                </tr>
              );
            })}
            {scoped.length === 0 && <tr><td colSpan={7} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const kemisCoverage = useMemo(() => {
    if (!scoped.length) return null;
    const pct = (fn) => Math.round(scoped.filter(fn).length / scoped.length * 100);
    return {
      upi: pct(s => s.upi_number), birth: pct(s => s.birth_cert_no),
      dob: pct(s => s.date_of_birth), gender: pct(s => s.gender),
    };
  }, [scoped]);

  const renderKemis = () => (
    <div>
      {kemisCoverage && (
        <div style={{ ...card, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[['UPI / Maisha Namba', kemisCoverage.upi], ['Birth Cert No', kemisCoverage.birth], ['Date of Birth', kemisCoverage.dob], ['Gender', kemisCoverage.gender]].map(([label, pct]) => (
            <div key={label} style={{ flex: 1, minWidth: 150, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: pct === 100 ? '#1B6B3A' : pct >= 50 ? '#D97706' : '#C0392B' }}>{pct}%</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8fa8', textTransform: 'uppercase' }}>{label} captured</div>
            </div>
          ))}
        </div>
      )}
      <div style={card}>
        <div style={sectionTitle}>{effectiveTitle} ({scoped.length} learners)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>UPI / Maisha</th><th style={th}>ADM</th><th style={th}>Name</th><th style={th}>Gender</th>
              <th style={th}>DOB</th><th style={th}>Birth Cert</th><th style={th}>Nationality</th><th style={th}>Grade</th><th style={th}>Boarding</th><th style={th}>SNE</th>
            </tr></thead>
            <tbody>
              {scoped.map(s => (
                <tr key={s.id}>
                  <td style={{ ...td, fontWeight: 700, color: s.upi_number ? '#1B6B3A' : '#C0392B' }}>{s.upi_number || 'MISSING'}</td>
                  <td style={td}>{s.adm_no}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                  <td style={tdC}>{s.gender || '—'}</td>
                  <td style={td}>{s.date_of_birth || '—'}</td>
                  <td style={td}>{s.birth_cert_no || '—'}</td>
                  <td style={td}>{s.nationality || 'Kenyan'}</td>
                  <td style={td}>{className(s.level_id)}</td>
                  <td style={td}>{s.boarding_status || '—'}</td>
                  <td style={td}>{s.special_needs || 'None'}</td>
                </tr>
              ))}
              {scoped.length === 0 && <tr><td colSpan={10} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#8a8fa8' }}>
          💡 Capture UPI, birth certificate, DOB and special-needs details on each student's profile (Students &amp; Admission), then export to Excel for the KEMIS portal upload.
        </div>
      </div>
    </div>
  );

  const enrolmentRows = () => {
    return scopeCodes.map(code => {
      const pool = students.filter(s => s.level_id === code);
      if (!pool.length) return null;
      const boys = pool.filter(s => (s.gender || '').toUpperCase().startsWith('M')).length;
      const girls = pool.filter(s => (s.gender || '').toUpperCase().startsWith('F')).length;
      const boarders = pool.filter(s => (s.boarding_status || '').toLowerCase() === 'boarding').length;
      return { grade: className(code), boys, girls, total: pool.length, boarders, day: pool.length - boarders };
    }).filter(Boolean);
  };

  const renderEnrolment = () => {
    const rows = enrolmentRows();
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    return (
      <div style={card}>
        <div style={sectionTitle}>{effectiveTitle} — {new Date().toLocaleDateString()}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Grade</th><th style={{ ...th, textAlign: 'center' }}>Boys</th><th style={{ ...th, textAlign: 'center' }}>Girls</th><th style={{ ...th, textAlign: 'center' }}>Total</th><th style={{ ...th, textAlign: 'center' }}>Boarders</th><th style={{ ...th, textAlign: 'center' }}>Day</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.grade}>
                <td style={{ ...td, fontWeight: 600 }}>{r.grade}</td>
                <td style={tdC}>{r.boys}</td><td style={tdC}>{r.girls}</td>
                <td style={{ ...tdC, fontWeight: 800 }}>{r.total}</td>
                <td style={tdC}>{r.boarders}</td><td style={tdC}>{r.day}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No students enrolled.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ background: '#eef3ee', fontWeight: 800 }}>
              <td style={td}>TOTAL</td>
              <td style={tdC}>{sum('boys')}</td><td style={tdC}>{sum('girls')}</td>
              <td style={tdC}>{sum('total')}</td><td style={tdC}>{sum('boarders')}</td><td style={tdC}>{sum('day')}</td>
            </tr></tfoot>
          )}
        </table>
      </div>
    );
  };

  const renderReport = () => {
    switch (reportType) {
      case 'students': return renderStudents();
      case 'guardians': return renderGuardians();
      case 'emergency': return renderEmergency();
      case 'kemis': return renderKemis();
      case 'enrolment': return renderEnrolment();
      default: return null;
    }
  };

  const filterLabel = { display: 'block', fontSize: 11, fontWeight: 800, color: '#2a2421', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const filterSelect = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, background: '#fff', fontWeight: 600, outline: 'none', cursor: 'pointer' };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={filterLabel}>Report</label>
          <select
            value={reportType}
            onChange={e => { setReportType(e.target.value); setCustomTitle(''); }}
            style={{ ...filterSelect, background: '#faf8f5' }}
          >
            {REPORTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Level</label>
          <select
            value={selectedLevel}
            onChange={e => { setSelectedLevel(e.target.value); setSelectedClass('all'); }}
            style={filterSelect}
          >
            <option value="all">All Levels</option>
            {Object.keys(gradesByLevel).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Grade / Form</label>
          <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStream('all'); }} style={filterSelect}>
            <option value="all">{selectedLevel === 'all' ? 'All Grades' : `All ${selectedLevel}`}</option>
            {(selectedLevel === 'all' ? Object.values(gradesByLevel).flat() : gradesByLevel[selectedLevel] || []).map(g => (
              <option key={g} value={GRADE_NAME_TO_CODE[g]}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Stream</label>
          <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)} disabled={streamsForScope.length === 0} style={{ ...filterSelect, opacity: streamsForScope.length ? 1 : 0.55, cursor: streamsForScope.length ? 'pointer' : 'not-allowed' }}>
            <option value="all">All Streams</option>
            {streamsForScope.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <PrintSizer scale={printScale} setScale={setPrintScale} font={printFont} setFont={setPrintFont} pages={estPages} bw={printBW} setBw={setPrintBW} />
        <button onClick={exportExcel} style={{ padding: '10px 18px', background: '#1A5F9C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', height: 40, whiteSpace: 'nowrap' }}>📥 Excel</button>
        <button onClick={handlePrint} style={{ padding: '10px 18px', background: '#1B6B3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', height: 40, whiteSpace: 'nowrap' }}>🖨️ Print</button>
      </div>

      {/* Custom report title — appears on screen, in print and in the Excel file name */}
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#2a2421', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>✏️ Report Title</span>
        <input
          type="text"
          value={customTitle}
          onChange={e => setCustomTitle(e.target.value)}
          placeholder={defaultTitle}
          maxLength={90}
          style={{ flex: 1, minWidth: 260, padding: '9px 12px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, fontWeight: 600, outline: 'none', background: '#faf8f5' }}
        />
        {customTitle && (
          <button onClick={() => setCustomTitle('')} style={{ padding: '8px 14px', background: '#fff', color: '#4A4A6A', border: '1px solid #e6dfd8', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
        )}
      </div>

      <div style={{ overflowX: 'auto', background: '#f5f4f1', padding: 20, borderRadius: 12, border: '1px solid #e6dfd8', display: 'flex', justifyContent: 'center' }}>
        <div id="school-report-print" style={{ zoom: printScale / 100, filter: printBW ? BW_FILTER : 'none', width: '100%', maxWidth: 1000, background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <Letterhead
          schoolConfig={schoolConfig}
          schoolInfo={schoolInfo}
          title={effectiveTitle}
          subtitle={`${scopeLabel} · ${new Date().toLocaleDateString()}`}
        />
        {loading ? <div style={{ ...card, textAlign: 'center', color: '#8a8fa8', padding: 40 }}>Loading…</div> : renderReport()}
        </div>
      </div>
    </div>
  );
};

export default SchoolReports;
