import React from 'react';

// Shared report letterhead: logo · school identity · contact line, closed by a
// classic double rule, then the report title + scope. Lives INSIDE the
// printable container so window.print() exports carry it automatically.
const Letterhead = ({ schoolConfig, schoolInfo, title, subtitle }) => (
  <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: '18px 22px 14px', marginBottom: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', gap: 14, alignItems: 'center' }}>
      <div>
        {schoolInfo?.logo_url ? (
          <img src={schoolInfo.logo_url} alt="School logo" style={{ width: 80, height: 80, objectFit: 'contain' }} />
        ) : (
          <div style={{ width: 80, height: 80 }} />
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, color: '#1A1A2E', fontFamily: 'Georgia, serif' }}>
          {(schoolConfig?.schoolName || 'INSTITUTION NAME').toUpperCase()}
        </div>
        {(schoolConfig?.address || schoolConfig?.county) && (
          <div style={{ fontSize: 11.5, marginTop: 3, color: '#2a2421' }}>
            {schoolConfig?.address}{schoolConfig?.address && schoolConfig?.county ? ' · ' : ''}{schoolConfig?.county}
          </div>
        )}
        {(schoolConfig?.email || schoolConfig?.phone) && (
          <div style={{ fontSize: 11, marginTop: 2, color: '#2a2421' }}>
            {schoolConfig?.email ? `Email: ${schoolConfig.email}` : ''}{schoolConfig?.email && schoolConfig?.phone ? ' · ' : ''}{schoolConfig?.phone ? `Tel: ${schoolConfig.phone}` : ''}
          </div>
        )}
        {schoolInfo?.motto && (
          <div style={{ fontSize: 11, marginTop: 3, fontStyle: 'italic', color: '#555' }}>
            “{schoolInfo.motto}”
          </div>
        )}
      </div>
      <div style={{ width: 80, height: 80 }} />
    </div>

    {/* Classic double rule */}
    <div style={{ borderTop: '2.5px solid #1A1A2E', marginTop: 12 }} />
    <div style={{ borderTop: '1px solid #1A1A2E', marginTop: 2 }} />

    {title && (
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <div style={{ display: 'inline-block', padding: '4px 22px', border: '1.5px solid #1A1A2E', fontSize: 13.5, fontWeight: 900, letterSpacing: 0.5, color: '#1A1A2E' }}>
          {String(title).toUpperCase()}
        </div>
        {subtitle && <div style={{ fontSize: 11.5, marginTop: 5, color: '#555', fontWeight: 600 }}>{subtitle}</div>}
      </div>
    )}
  </div>
);

export default Letterhead;
