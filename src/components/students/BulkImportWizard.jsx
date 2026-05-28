import React, { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  GRADES_BY_LEVEL,
  downloadTemplate,
  parseExcelFile,
  validateRows,
  toInsertPayload,
} from '../../lib/studentImport';

const STEPS = ['Configure', 'Upload & Preview', 'Import'];

const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 800, color: '#4A4A6A',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em'
};
const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  border: '1.5px solid #e6dfd8', fontSize: 13, boxSizing: 'border-box',
  background: '#ffffff', outline: 'none'
};

const BulkImportWizard = ({ schoolConfig, streams, existingStudents, planRemaining, onClose, onImported }) => {
  const [step, setStep] = useState(0);
  const [defaults, setDefaults] = useState({
    level: 'Junior Secondary',
    grade: 'Grade 7',
    stream: '',
    gender: 'per_row',
  });
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResult, setImportResult] = useState(null);

  const validGrades = GRADES_BY_LEVEL[defaults.level] || [];
  const validStreamNames = streams.map(s => s.name);
  const streamNameToId = useMemo(
    () => Object.fromEntries(streams.map(s => [s.name, s.id])),
    [streams]
  );
  const existingAdmNos = useMemo(
    () => new Set(existingStudents.map(s => s.adm_no).filter(Boolean)),
    [existingStudents]
  );

  const handleDownload = () => {
    downloadTemplate({
      schoolName: schoolConfig?.schoolName,
      defaultGrade: defaults.grade,
      defaultStream: defaults.stream,
      defaultGender: defaults.gender,
      validGrades,
      validStreams: validStreamNames,
    });
  };

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParseError('');
    setParsedRows([]);
    try {
      const { rows } = await parseExcelFile(f);
      const validated = validateRows(rows, {
        validGrades,
        validStreams: validStreamNames,
        existingAdmNos,
      });
      setParsedRows(validated);
    } catch (err) {
      setParseError('Failed to read file: ' + err.message);
    }
  };

  const validRows = parsedRows.filter(r => r.isValid);
  const errorRows = parsedRows.filter(r => !r.isValid);
  const wouldExceedLimit = validRows.length > planRemaining;

  const handleImport = async () => {
    if (validRows.length === 0 || wouldExceedLimit) return;
    setIsImporting(true);
    setImportProgress({ done: 0, total: validRows.length });

    const payload = validRows.map(r =>
      toInsertPayload(r, { schoolId: schoolConfig.id, streamNameToId })
    );

    const CHUNK = 100;
    let inserted = 0;
    const errors = [];
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('students')
          .insert(slice)
          .select('id');
        if (error) {
          errors.push(error.message);
          break;
        }
        inserted += data?.length || 0;
        setImportProgress({ done: inserted, total: validRows.length });
      }
    } catch (err) {
      errors.push(err.message);
    }

    setIsImporting(false);
    setImportResult({ inserted, skipped: errorRows.length, errors });
    if (inserted > 0) onImported?.();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(42, 36, 33, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 820,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #E8EAF0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f5f2eb',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2a2421' }}>
            📊 Bulk Import Students
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#8a8fa8' }}>&times;</button>
        </div>

        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 8 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: i <= step ? '#1B6B3A' : '#E8EAF0',
                color: i <= step ? '#fff' : '#8A8FA8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: i <= step ? '#2a2421' : '#8A8FA8' }}>{label}</span>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < step ? '#1B6B3A' : '#E8EAF0' }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {step === 0 && (
            <>
              <p style={{ marginTop: 0, fontSize: 13, color: '#4A4A6A', lineHeight: 1.5 }}>
                Set the defaults for the students you're importing. These will be pre-filled in the template
                so for a whole-class upload you only need to type the Admission Number and Full Name.
                You can still change Grade or Stream per row.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                <div>
                  <label style={labelStyle}>Academic Level</label>
                  <select
                    value={defaults.level}
                    onChange={(e) => setDefaults({
                      ...defaults,
                      level: e.target.value,
                      grade: GRADES_BY_LEVEL[e.target.value][0],
                    })}
                    style={inputStyle}
                  >
                    {Object.keys(GRADES_BY_LEVEL).map(lvl => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Default Grade</label>
                  <select
                    value={defaults.grade}
                    onChange={(e) => setDefaults({ ...defaults, grade: e.target.value })}
                    style={inputStyle}
                  >
                    {validGrades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Default Stream (Optional)</label>
                  <select
                    value={defaults.stream}
                    onChange={(e) => setDefaults({ ...defaults, stream: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">No Stream</option>
                    {streams.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Default Gender</label>
                  <select
                    value={defaults.gender}
                    onChange={(e) => setDefaults({ ...defaults, gender: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="per_row">Specify per row</option>
                    <option value="M">Male (all)</option>
                    <option value="F">Female (all)</option>
                  </select>
                </div>
              </div>

              <div style={{
                marginTop: 20, padding: 16, background: '#FEF9E7',
                border: '1px solid #FAD7A0', borderRadius: 8, fontSize: 12,
                color: '#7D6608', lineHeight: 1.5,
              }}>
                <strong>💡 Tip:</strong> The downloaded file has Grade and Stream dropdowns
                inside Excel itself, so typos are prevented at the source.
              </div>

              <button
                onClick={handleDownload}
                style={{
                  marginTop: 20, padding: '12px 20px',
                  background: '#1B6B3A', color: '#fff', border: 'none',
                  borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                ⬇ Download Template (.xlsx)
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <p style={{ marginTop: 0, fontSize: 13, color: '#4A4A6A' }}>
                Upload the filled template. Each row is checked before anything is saved.
              </p>

              <label style={{
                display: 'block', padding: 30, border: '2px dashed #c8d0e0',
                borderRadius: 12, background: '#FAFBFC', textAlign: 'center',
                cursor: 'pointer', marginBottom: 16,
              }}>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: 30, marginBottom: 6 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2a2421' }}>
                  {file ? file.name : 'Click to choose an Excel file'}
                </div>
                <div style={{ fontSize: 11, color: '#8A8FA8', marginTop: 4 }}>.xlsx, .xls or .csv</div>
              </label>

              {parseError && (
                <div style={{
                  padding: 12, background: '#FDEDEC', color: '#C0392B',
                  borderRadius: 8, fontSize: 13, marginBottom: 12,
                }}>
                  {parseError}
                </div>
              )}

              {parsedRows.length > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '6px 12px', background: '#E8F5EE', color: '#1B6B3A',
                      borderRadius: 6, fontSize: 12, fontWeight: 700,
                    }}>
                      ✓ {validRows.length} valid
                    </span>
                    {errorRows.length > 0 && (
                      <span style={{
                        padding: '6px 12px', background: '#FDEDEC', color: '#C0392B',
                        borderRadius: 6, fontSize: 12, fontWeight: 700,
                      }}>
                        ✗ {errorRows.length} with errors
                      </span>
                    )}
                    <span style={{
                      padding: '6px 12px', background: '#F5F6F8', color: '#4A4A6A',
                      borderRadius: 6, fontSize: 12, fontWeight: 700,
                    }}>
                      {parsedRows.length} total
                    </span>
                  </div>

                  {wouldExceedLimit && (
                    <div style={{
                      padding: 12, background: '#FDEDEC', color: '#C0392B',
                      borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600,
                    }}>
                      ⚠️ Importing {validRows.length} students would exceed your plan limit.
                      Only {planRemaining} slot{planRemaining === 1 ? '' : 's'} remaining.
                    </div>
                  )}

                  <div style={{
                    maxHeight: 320, overflowY: 'auto',
                    border: '1px solid #E8EAF0', borderRadius: 8,
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#FAFBFC' }}>
                        <tr>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Row</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Status</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Adm No</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Name</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Grade</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Stream</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8EAF0', fontWeight: 700, color: '#8A8FA8', fontSize: 10, textTransform: 'uppercase' }}>Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((r) => (
                          <tr key={r.rowIndex} style={{
                            background: r.isValid ? (r.warnings.length ? '#FFFBF0' : '#fff') : '#FDF6F5',
                            borderBottom: '1px solid #F0ECE6',
                          }}>
                            <td style={{ padding: '8px 10px', color: '#8A8FA8' }}>{r.rowIndex}</td>
                            <td style={{ padding: '8px 10px' }}>
                              {r.isValid
                                ? (r.warnings.length
                                  ? <span style={{ color: '#B7791F' }}>⚠</span>
                                  : <span style={{ color: '#1B6B3A' }}>✓</span>)
                                : <span style={{ color: '#C0392B' }}>✗</span>}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1A5F9C' }}>{r.admNo || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{r.fullName || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{r.grade || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{r.stream || '—'}</td>
                            <td style={{ padding: '8px 10px', color: r.errors.length ? '#C0392B' : '#B7791F', fontSize: 11 }}>
                              {[...r.errors, ...r.warnings].join('; ') || ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {!importResult && !isImporting && (
                <div>
                  <p style={{ fontSize: 14, color: '#2a2421' }}>
                    Ready to import <strong>{validRows.length}</strong> student{validRows.length === 1 ? '' : 's'}.
                  </p>
                  {errorRows.length > 0 && (
                    <p style={{ fontSize: 13, color: '#8A8FA8' }}>
                      {errorRows.length} row{errorRows.length === 1 ? '' : 's'} with errors will be skipped.
                    </p>
                  )}
                </div>
              )}

              {isImporting && (
                <div>
                  <p style={{ fontSize: 14, color: '#2a2421' }}>
                    Importing… {importProgress.done} / {importProgress.total}
                  </p>
                  <div style={{ height: 8, background: '#E8EAF0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%`,
                      background: '#1B6B3A', transition: 'width 0.2s',
                    }} />
                  </div>
                </div>
              )}

              {importResult && (
                <div>
                  <div style={{
                    padding: 16, background: importResult.errors.length ? '#FEF9E7' : '#E8F5EE',
                    borderRadius: 8, marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#2a2421', marginBottom: 4 }}>
                      {importResult.errors.length ? '⚠️ Import finished with issues' : '✅ Import complete'}
                    </div>
                    <div style={{ fontSize: 13, color: '#4A4A6A' }}>
                      {importResult.inserted} student{importResult.inserted === 1 ? '' : 's'} imported.
                      {importResult.skipped > 0 && ` ${importResult.skipped} skipped due to errors.`}
                    </div>
                  </div>
                  {importResult.errors.map((e, i) => (
                    <div key={i} style={{
                      padding: 10, background: '#FDEDEC', color: '#C0392B',
                      borderRadius: 6, fontSize: 12, marginBottom: 6,
                    }}>{e}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '16px 24px', background: '#f5f2eb',
          borderTop: '1px solid #E8EAF0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            disabled={isImporting}
            style={{
              padding: '10px 18px', borderRadius: 8, border: '1px solid #e6dfd8',
              background: '#fff', color: '#2a2421', fontSize: 13, fontWeight: 600,
              cursor: isImporting ? 'not-allowed' : 'pointer',
            }}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step === 0 && (
            <button
              onClick={() => setStep(1)}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#1B6B3A', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Next: Upload File →
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={validRows.length === 0 || wouldExceedLimit}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: (validRows.length === 0 || wouldExceedLimit) ? '#8a8fa8' : '#1B6B3A',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: (validRows.length === 0 || wouldExceedLimit) ? 'not-allowed' : 'pointer',
              }}
            >
              Next: Review & Import →
            </button>
          )}

          {step === 2 && !importResult && (
            <button
              onClick={handleImport}
              disabled={isImporting || validRows.length === 0}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: (isImporting || validRows.length === 0) ? '#8a8fa8' : '#1B6B3A',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: (isImporting || validRows.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {isImporting ? 'Importing…' : `Import ${validRows.length} Student${validRows.length === 1 ? '' : 's'}`}
            </button>
          )}

          {step === 2 && importResult && (
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#1B6B3A', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkImportWizard;
