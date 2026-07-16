import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { defaultGradesFor } from '../data/mockData';
import { LEVELS, GRADE_CODE_TO_NAME, GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import { COMMENT_TOKENS, defaultCommentsForBands } from '../lib/reportComments';

// Dedicated form for the general comments that appear on report cards —
// one set per overall grade band, per role (class teacher / principal), with
// multiple wording variations. 'All' scope is the school-wide set; a specific
// class scope overrides it for that class only.

const ROLES = [
  { key: 'class_teacher', label: "Class Teacher's Comment", color: '#1B6B3A' },
  { key: 'principal', label: "Principal's Comment", color: '#1A5F9C' },
];

const levelNameForClass = (classId) => {
  const name = GRADE_CODE_TO_NAME[classId];
  for (const [lvl, grades] of Object.entries(LEVELS)) if (grades.includes(name)) return lvl;
  return null;
};

const emptyState = () => ({ class_teacher: {}, principal: {} });

const ReportComments = ({ schoolConfig }) => {
  const gradesByLevel = useMemo(() => gradesByLevelForSchool(schoolConfig?.schoolType), [schoolConfig?.schoolType]);
  const [scope, setScope] = useState('All');          // 'All' | grade code
  const [dbGrades, setDbGrades] = useState([]);
  const [comments, setComments] = useState(emptyState()); // role -> band -> [variants]
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Grading rows for the school (bands are derived from these).
  useEffect(() => {
    if (!schoolConfig?.id) return;
    (async () => {
      const { data } = await supabase.from('grading_systems').select('*').eq('school_id', schoolConfig.id);
      setDbGrades(data || []);
    })();
  }, [schoolConfig?.id]);

  // Ordered band list (best → worst) for the current scope.
  const bands = useMemo(() => {
    let scale = [];
    if (scope === 'All') {
      // Union of every scale the school uses, deduped by band name.
      const seen = new Set();
      scale = [...dbGrades]
        .sort((a, b) => (b.min_score || 0) - (a.min_score || 0))
        .filter(g => { const k = g.grade; if (seen.has(k)) return false; seen.add(k); return true; });
      if (!scale.length) {
        const merged = [...defaultGradesFor('f3'), ...defaultGradesFor('g10')];
        scale = merged.filter(g => { const k = g.grade; if (seen.has(k)) return false; seen.add(k); return true; });
      }
    } else {
      const gradeName = GRADE_CODE_TO_NAME[scope];
      const levelName = levelNameForClass(scope);
      scale = dbGrades.filter(g => g.school_grade === gradeName);
      if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
      if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
      if (!scale.length) scale = defaultGradesFor(scope);
      scale = [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
    }
    return scale.map(g => g.grade || g.code);
  }, [dbGrades, scope]);

  // Load saved comments for the scope.
  useEffect(() => {
    if (!schoolConfig?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('report_comments')
        .select('*')
        .eq('school_id', schoolConfig.id)
        .eq('level_category', scope);
      if (cancelled) return;
      const next = emptyState();
      (data || [])
        .sort((a, b) => (a.variant || 1) - (b.variant || 1))
        .forEach(r => { (next[r.role] = next[r.role] || {})[r.grade_band] = [...(next[r.role][r.grade_band] || []), r.comment]; });
      setComments(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolConfig?.id, scope]);

  const variantsFor = (role, band) => comments[role]?.[band]?.length ? comments[role][band] : [''];
  const setVariant = (role, band, idx, val) => setComments(prev => {
    const list = [...(prev[role]?.[band]?.length ? prev[role][band] : [''])];
    list[idx] = val;
    return { ...prev, [role]: { ...prev[role], [band]: list } };
  });
  const addVariant = (role, band) => setComments(prev => ({
    ...prev, [role]: { ...prev[role], [band]: [...(prev[role]?.[band]?.length ? prev[role][band] : ['']), ''] }
  }));
  const removeVariant = (role, band, idx) => setComments(prev => {
    const list = (prev[role]?.[band] || ['']).filter((_, i) => i !== idx);
    return { ...prev, [role]: { ...prev[role], [band]: list.length ? list : [''] } };
  });

  const loadDefaults = () => {
    const ok = window.confirm(
      `Fill every grade band with the built-in default comments (2 variations per role)?\n\n` +
      `⚠️ This replaces what is currently typed on this screen for the ${scope === 'All' ? 'General' : GRADE_CODE_TO_NAME[scope]} scope. Nothing is saved until you click Save.`
    );
    if (!ok) return;
    setComments(defaultCommentsForBands(bands));
  };

  const handleSave = async () => {
    if (!schoolConfig?.id) return;
    setIsSaving(true);
    try {
      // Clean replace for this scope.
      const { error: delErr } = await supabase
        .from('report_comments')
        .delete()
        .eq('school_id', schoolConfig.id)
        .eq('level_category', scope);
      if (delErr) throw delErr;

      const rows = [];
      ROLES.forEach(({ key: role }) => {
        bands.forEach(band => {
          (comments[role]?.[band] || [])
            .map(t => t.trim())
            .filter(Boolean)
            .forEach((comment, i) => rows.push({
              school_id: schoolConfig.id, role, grade_band: band,
              level_category: scope, variant: i + 1, comment,
            }));
        });
      });

      if (rows.length) {
        const { data, error } = await supabase.from('report_comments').insert(rows).select();
        if (error) throw error;
        if (!data || data.length !== rows.length) {
          throw new Error(`Save was not persisted (expected ${rows.length}, stored ${data?.length || 0}).`);
        }
      }
      alert(`${rows.length} comment${rows.length === 1 ? '' : 's'} saved for the ${scope === 'All' ? 'General (all classes)' : GRADE_CODE_TO_NAME[scope]} scope.`);
    } catch (err) {
      alert('Failed to save comments: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filterLabel = { display: 'block', fontSize: 11, fontWeight: 800, color: '#2a2421', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const areaStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 12.5, lineHeight: 1.45, outline: 'none', resize: 'vertical', minHeight: 54, boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: '1.4fr 2fr auto auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={filterLabel}>Applies To</label>
          <select value={scope} onChange={e => setScope(e.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, fontWeight: 600, background: '#faf8f5', outline: 'none', cursor: 'pointer' }}>
            <option value="All">🌍 General — All Classes</option>
            {Object.entries(gradesByLevel).map(([lvl, grades]) => (
              <optgroup key={lvl} label={lvl}>
                {grades.map(g => <option key={g} value={GRADE_NAME_TO_CODE[g]}>{g} (override)</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: '#8a8fa8', lineHeight: 1.5, alignSelf: 'center' }}>
          {scope === 'All'
            ? 'These comments apply to every class. Add several variations per band — each student is given one consistently.'
            : `Overrides the General set for ${GRADE_CODE_TO_NAME[scope]} only. Leave a band blank to keep using the General comments.`}
        </div>
        <button onClick={loadDefaults} style={{ padding: '10px 16px', background: '#fff', color: '#B45309', border: '1px solid #F0D9B5', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', height: 40, whiteSpace: 'nowrap' }}>↺ Load Defaults</button>
        <button onClick={handleSave} disabled={isSaving} style={{ padding: '10px 20px', background: isSaving ? '#8a8fa8' : '#1A5F9C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', height: 40, whiteSpace: 'nowrap' }}>{isSaving ? '⌛ Saving…' : '💾 Save Comments'}</button>
      </div>

      {/* Token legend — optional power feature, kept low-key */}
      <div style={{ background: '#faf8f5', border: '1px solid #e6dfd8', borderRadius: 12, padding: '9px 16px', marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8a8fa8' }}>Optional: type any of these into a comment and each student's report card fills it in automatically —</span>
        {COMMENT_TOKENS.map(([tok, desc]) => (
          <span key={tok} style={{ fontSize: 11, color: '#8a8fa8' }} title={desc}>
            <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 5, fontWeight: 700, border: '1px solid #e6dfd8', color: '#4A4A6A' }}>{tok}</code>
          </span>
        ))}
      </div>

      {/* Bands */}
      {loading ? (
        <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 40, textAlign: 'center', color: '#8a8fa8' }}>Loading…</div>
      ) : bands.map(band => (
        <div key={band} style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '9px 16px', background: '#f5f2eb', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '3px 12px', borderRadius: 6, fontWeight: 900, fontSize: 13, background: '#EBF3FB', color: '#1A5F9C' }}>{band}</span>
            <span style={{ fontSize: 11, color: '#8a8fa8', fontWeight: 600 }}>Overall grade {band} — the student's report card picks one variation of each comment.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {ROLES.map(({ key: role, label, color }, ri) => (
              <div key={role} style={{ padding: '12px 16px', borderLeft: ri ? '1px solid #f0ece5' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{label}</div>
                {variantsFor(role, band).map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                    <textarea
                      value={text}
                      onChange={e => setVariant(role, band, i, e.target.value)}
                      placeholder={scope === 'All' ? `Variation ${i + 1}…` : 'Blank = use the General comment'}
                      style={areaStyle}
                    />
                    {variantsFor(role, band).length > 1 && (
                      <button onClick={() => removeVariant(role, band, i)} title="Remove this variation" style={{ border: '1px solid #e6dfd8', background: '#fff', color: '#C0392B', borderRadius: 8, cursor: 'pointer', padding: '6px 9px', fontSize: 12 }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addVariant(role, band)} style={{ border: '1px dashed #cfc8be', background: 'transparent', color: '#8a8fa8', borderRadius: 8, cursor: 'pointer', padding: '5px 12px', fontSize: 11.5, fontWeight: 700 }}>+ Add variation</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ReportComments;
