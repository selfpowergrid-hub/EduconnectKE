const TIERS = [
  { name: "Msingi", price: "KSh 250", tagline: "Anza vizuri — the duka essential" },
  { name: "Biashara", price: "KSh 500", tagline: "Kua kibiashara — the growing shop" },
  { name: "Kampuni", price: "KSh 1,000", tagline: "Endesha kama kampuni — the mini-supermarket" },
];

export default function Landing() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "2.5rem", lineHeight: 1.15, color: "#166534" }}>
        Duka lako kwenye simu.
      </h1>
      <p style={{ fontSize: "1.25rem", color: "#374151", maxWidth: 640 }}>
        Sell, track stock, manage deni, take M-Pesa, stay KRA-compliant — from{" "}
        <strong>KSh 250 a month</strong>, even without internet. KSh 8 kwa siku. Faida yako wazi
        kila jioni.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "3rem" }}>
        {TIERS.map((t) => (
          <div
            key={t.name}
            style={{
              flex: "1 1 240px", border: "1px solid #D1D5DB", borderRadius: 12, padding: "1.5rem",
            }}
          >
            <h2 style={{ margin: 0, color: "#166534" }}>{t.name}</h2>
            <p style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0" }}>
              {t.price}
              <span style={{ fontSize: "1rem", fontWeight: 400, color: "#6B7280" }}>/mwezi</span>
            </p>
            <p style={{ color: "#6B7280", margin: 0 }}>{t.tagline}</p>
          </div>
        ))}
      </div>
      <p style={{ marginTop: "3rem", color: "#6B7280" }}>
        Owner dashboard, bulk product editing, reports and fiscal health arrive with milestone M4
        (PRD §30). This page is a placeholder for the marketing site.
      </p>
    </main>
  );
}
