# LogiQ Duka — Product Requirements Document (PRD)

**The All-in-One Kenyan Shop, Butchery, Agrovet & Supermarket Management System**

| Field | Detail |
|---|---|
| Document | Product Requirements Document v1.0 (Final) |
| Product | LogiQ Duka |
| Company | Total Man Technologies, Eldoret City, Kenya |
| Author | Shadrack ("Shady"), Founder & Lead Developer |
| Date | July 2026 |
| Status | Approved for Development |
| Classification | Internal — Confidential |

---

## Table of Contents

1. Executive Summary
2. Market Research — Kenya
3. Market Research — Global Benchmarks
4. Competitive Landscape & Gap Analysis
5. Product Vision, Positioning & Strategy
6. Target Market & User Personas
7. Product Scope — Core Modules
8. Vertical Packs (Duka, Butchery, Agrovet, Supermarket, Wines & Spirits, Hardware)
9. Regulatory & Compliance Requirements (eTIMS, VAT, DPA 2019)
10. Payments Architecture (M-Pesa, Cash, Bank, Credit)
11. Offline-First Architecture & Technical Design
12. Data Model Overview
13. Pricing & Packaging (KES 250 / 500 / 1,000)
14. Unit Economics & Business Model Realism
15. Non-Functional Requirements
16. Onboarding, Support & Customer Success
17. Go-To-Market Plan (90 Days)
18. Roadmap & Release Phases
19. Success Metrics & KPIs
20. Risks & Mitigations
21. Out of Scope (v1)
22. Appendices

---

# 1. Executive Summary

Kenya's retail backbone is not Carrefour or Naivas. It is the estimated **2+ million dukas, kiosks, butcheries, agrovets, chemists, hardware shops, and mini-marts** that serve every estate, market centre, and rural town. Almost all of them still run on exercise books, memory, and trust — losing money daily to stock shrinkage, unrecorded credit ("mali ya deni"), staff pilferage, and expired goods.

Two forces have made this the right moment to build:

1. **Regulation:** KRA's eTIMS regime has made electronic tax invoicing effectively mandatory. Under the "No eTIMS, No Expense" enforcement, a business that cannot issue eTIMS receipts becomes a supplier nobody wants to buy from, because their invoices are not tax-deductible for the buyer. Compliance has moved from optional to existential.
2. **Pricing failure of incumbents:** The existing Kenyan POS market prices at **KES 2,000–25,000 per month** plus KES 25,000–250,000 in hardware. This serves supermarkets and restaurants — and completely abandons the duka owner making KES 3,000–10,000 profit per day, who cannot justify a KES 3,000/month software bill.

**LogiQ Duka** is a mobile-first, offline-first, Swahili/English shop management system priced at **KES 250, 500, and 1,000 per month** — a price point 8–10x below the market's entry tier, designed to run on the Android phone the shop owner already has, taking payment via the M-Pesa line the shop already uses, and issuing the eTIMS receipts KRA now demands.

The system covers the full operational loop: **sell → receive payment (M-Pesa/cash/credit) → issue eTIMS receipt → deduct stock → alert on reorder → reconcile at close of day → report profit** — with vertical add-ons for butcheries (weight-based selling), agrovets (batch/expiry tracking, regulated products), and mini-supermarkets (multi-till, barcode lanes).

**Why Total Man Technologies wins:** deep, proven M-Pesa Daraja and multi-tenant Supabase expertise, an existing LogiQ product family and brand, distribution networks through cooperative societies, church leadership structures, and education contacts across the Rift Valley, and a cost structure (solo/small team, Kenyan cost base) that makes KES 250/month economics viable where a VC-funded Nairobi startup would starve.

---

# 2. Market Research — Kenya

## 2.1 Market context

- **eTIMS is the forcing function.** KRA now requires electronic tax invoices, and system-to-system integration happens through two certified pathways: the **Online Sales Control Unit (OSCU)** for always-online invoicing systems, and the **Virtual Sales Control Unit (VSCU)** for bulk invoicing and systems that are not always online. Taxpayers may self-integrate or use KRA-verified third-party integrators, and KRA runs a sandbox → testing → vetting → certification process for integrators.
- **Mobile money is the rail.** M-Pesa is the default payment method in Kenyan retail; any POS without native M-Pesa (STK Push, Till/Paybill confirmation, statement reconciliation) is dead on arrival. Industry commentary consistently treats M-Pesa integration as a non-negotiable feature, with mobile money volumes in the trillions of shillings annually.
- **Connectivity is unreliable outside CBDs.** Reviewers of eTIMS-compliant systems explicitly call out that a production-grade integration must queue invoices offline and sync automatically when connection is restored — "especially for businesses outside Nairobi's CBD." This validates offline-first as a core architectural requirement, not a nice-to-have.

## 2.2 Kenyan competitors — findings

| System | Positioning | Pricing signal | Strengths | Weaknesses (our opportunity) |
|---|---|---|---|---|
| **SimbaPOS** | Retail, restaurant, hotel POS; markets itself as leading Kenyan POS | Mid-market, quote-based | Supermarket/minimart module; multiple payment methods incl. M-Pesa & credit; multi-store stock control, stock valuation & reconciliation; expenses, customer & supplier accounts | Windows/desktop-heavy heritage; priced and sold for formal businesses; sales-team-led onboarding, not self-serve |
| **Uzapoint** | "All-in-one mobile business management" for SMEs; ERP ambitions | Subscription, varies by features | Strong traction (claims 2M+ POS transactions/month, 10,000+ merchants); eTIMS integrated for 300+ merchants; ecosystem plays — merchant loans, insurance, supplier community, SMS/USSD | Internet-dependent per reviews; breadth over depth; ecosystem complexity can overwhelm a simple duka |
| **Pesapal Sabi** | POS tied to Pesapal payment gateway/terminals | From ~KES 2,500/month + transaction fees | Payments-first; hardware terminals; brand trust | Basic inventory only — reviewers note no supplier management or purchase orders; pricing tied to transaction volume |
| **Duka POS** | Retail-focused Kenyan POS | Basic package ~KES 3,000/month | Inventory, loyalty, accounting integration | Price excludes micro-retail entirely |
| **EliteTeQ POS** | Feature-rich Kenyan POS, content-marketing led | Tiered SaaS | Advanced inventory: low-stock SMS/email alerts, supplier mgmt, purchase orders, batch tracking, expiry monitoring, reorder suggestions by sales velocity | Priced above micro-segment; their own market guide puts Kenyan SaaS POS at KES 2,000–5,000 (starter) to 10,000–25,000 (professional) |
| **Tiwi POS** | Cloud POS marketing hard on eTIMS compliance | Subscription | eTIMS/OSCU-VSCU messaging; "absentee owner" multi-branch monitoring pitch | Newer brand; compliance-led rather than operations-led |
| **ModernPOS / Nextgen / IntelliSoft / Hasibu / RobiPOS / SaifyPOS** | Implementation-and-support-led local vendors | Quote-based; full setups | Local support, industry configuration (hardware stores, wines & spirits) | Services businesses, not products; can't scale to 10,000 tenants; onboarding requires site visits |

## 2.3 Kenyan hardware cost reality

Published 2026 estimates for full hardware setups: **KES 25,000–45,000** for a small duka (tablet + scanner + printer), **KES 50,000–90,000** for a boutique, and **KES 120,000–250,000** for a 1–2 counter mini-supermarket. Software subscriptions cluster at **KES 2,000–5,000/month entry**, rising to KES 10,000–25,000 for professional tiers.

**Implication:** the incumbent model demands KES 50,000+ upfront and KES 30,000+/year before a duka sees value. LogiQ Duka enforces a **zero-hardware policy**: the system runs entirely on devices the shop already owns (Android phone, tablet, or desktop browser), the phone camera is the barcode scanner, and receipts are digital by default (WhatsApp/SMS/on-screen QR). The **only two peripherals ever supported — both strictly optional — are a wirelessly connected thermal printer and a wirelessly connected barcode reader** (~KES 6,500–9,000 and ~KES 2,500–4,000 respectively, if a shop chooses them). Total mandatory hardware cost: **KES 0**. This is a different market category, not a cheaper version of the same one.

## 2.4 The unserved segments

1. **Dukas & kiosks** — exercise-book records, M-Pesa till, heavy customer credit. Nothing on the market is priced or designed for them.
2. **Butcheries** — sell by weight (KES/kg), price fluctuates with market, carcass-to-cuts yield tracking absent from every mainstream Kenyan POS.
3. **Agrovets** — batch numbers, expiry dates, PCPB-regulated products, seasonal demand spikes (planting/top-dressing), heavy farmer credit cycles tied to harvest.
4. **Mini-supermarkets (1–3 tills)** — caught between duka tools (too small) and SimbaPOS-class systems (too expensive); need barcode lanes, shift management, supplier GRNs.
5. **Wines & spirits, hardware, cereals stores, mama mboga aggregators, chemists (non-pharmacy-regulated OTC)** — variants of the same core loop.

---

# 3. Market Research — Global Benchmarks

We studied the global leaders to steal proven patterns, not to copy their market fit.

| System | What it proves | What we adopt |
|---|---|---|
| **Square POS** | Free-to-start software + pay-per-transaction removed the adoption barrier for micro-businesses; consistently rated best overall for small business, praised for compliance, loyalty, item management, and near-zero ramp-up time | Zero-friction self-serve onboarding; sell-in-90-seconds UX; free trial tier mechanics; simple flat pricing |
| **Lightspeed Retail** | The gold standard for advanced retail inventory: SKU/variants, vendor catalogs, purchase ordering, multi-location, automation (bulk price updates, pricing-at-receiving); starts ~$69/month | Purchase order → GRN → stock ledger discipline; reorder automation by sales velocity; multi-branch views (our Tier 3) |
| **Loyverse** | A genuinely capable POS can be free/cheap: free core apps (POS, dashboard, KDS, customer display), $29/month paid add-ons; beloved by market vendors and micro-businesses globally — including significant organic adoption in Kenya | Feature-gated add-on model; phone-first Android UX; proof that our price point is technically achievable |
| **Shopify POS** | Unified online + offline commerce wins multichannel retail | Phase 2: WhatsApp storefront + POS unified inventory (our "multichannel" is WhatsApp, not web) |
| **Toast** | Deep verticalization (restaurants) beats horizontal breadth | Our vertical packs strategy: butchery/agrovet depth as moat |
| **KORONA POS / Clover** | App marketplaces and processor flexibility matter at scale | Phase 3 consideration only |

**Key global insight:** buyers are advised to compute *total cost* (subscription + transaction fees), because processing costs usually dwarf software fees. In Kenya the equivalent is M-Pesa till charges — which the merchant already pays regardless of POS. Therefore LogiQ Duka charges **no transaction fees**, making our KES 250–1,000 the *entire* incremental software cost. This is a decisive marketing weapon against Pesapal-style transaction-fee models.

---

# 4. Competitive Landscape & Gap Analysis

## 4.1 Positioning map

```
                 High price (KES 5,000+/mo)
                          │
        SimbaPOS ●        │        ● Lightspeed/Vend
     IntelliSoft ●        │        ● Dynamics BC + eTIMS addons
                          │
 Desktop/ ─────────────────────────────── Mobile/
 Site-visit setup         │               Self-serve
                          │
       Pesapal Sabi ●     │     ● Uzapoint
                          │     ● Loyverse (no eTIMS, no M-Pesa native)
                          │
                          │   ★ LogiQ Duka (target position)
                 Low price (KES 250–1,000/mo)
```

## 4.2 The gap we occupy

**No product in the Kenyan market today combines all seven of:**

1. KES sub-1,000 monthly pricing with no transaction fees
2. True offline-first (sell all day with zero internet; sync later)
3. Native M-Pesa STK Push + till confirmation + auto-reconciliation
4. eTIMS receipts via certified OSCU/VSCU pathway with offline queuing
5. Customer credit ("deni") book as a first-class feature, with WhatsApp/SMS reminders
6. Vertical depth for butcheries (weight/yield) and agrovets (batch/expiry/regulated)
7. Swahili-first UX designed for a shopkeeper with a KES 12,000 Android phone

Loyverse gets closest on price/UX but has no eTIMS, no native M-Pesa, no deni book. Uzapoint gets closest on breadth but not on price, offline resilience, or vertical depth. That is the wedge.

---

# 5. Product Vision, Positioning & Strategy

## 5.1 Vision statement

> **"Kila duka Kenya lina akili ya biashara mfukoni."**
> Every Kenyan shop runs with business intelligence in its pocket.

## 5.2 One-line positioning

**LogiQ Duka is the shop manager in your phone: sell, track stock, manage deni, take M-Pesa, stay KRA-compliant — from KES 250 a month, even without internet.**

## 5.3 Product principles

1. **Phone kwanza (phone first).** Every core flow must work perfectly on a 5.5", 2GB RAM Android phone, one-handed, in sunlight, by a shop attendant with basic digital literacy. Web dashboard is for owners and back-office, not the till.
2. **Offline ni kawaida (offline is normal).** The app assumes no internet and treats connectivity as a bonus. Selling, stock deduction, receipts (provisional), and deni recording never require network. Sync is background, automatic, conflict-safe.
3. **Dakika tatu (three minutes).** A new shop must complete signup → add 10 products → make first sale in under 3 minutes, unassisted. Product catalog templates per business type (duka, butchery, agrovet…) pre-load common Kenyan items.
4. **Deni ni biashara (credit is business).** Customer credit is not an edge case in Kenya; it is 20–40% of duka revenue. The deni book is a headline feature, not a buried ledger.
5. **Bei ya wazi (transparent price).** Flat monthly price. No transaction fees, no per-user surprise charges within tier limits, no forced hardware. Pay via M-Pesa STK, cancel anytime.
6. **Hakuna vifaa (zero hardware).** Everything runs on the mobile phone, tablet, or desktop the shop already owns. The camera is the scanner; WhatsApp is the receipt printer; the app is the cash drawer record. Only two optional peripherals exist in the entire product universe — a wireless thermal printer and a wireless barcode reader — and both connect remotely (Bluetooth/Wi-Fi/cloud print relay), never by cable, and are never required for any feature to work.
6. **Lugha yako (your language).** Full Swahili and English UI, switchable per user. Receipt language configurable. Voice-note help in Swahili.

## 5.4 Strategic sequencing

- **v1 (Months 0–4):** Core POS + inventory + deni + M-Pesa + eTIMS for dukas and general retail. Butchery weight-mode included (differentiator at launch).
- **v1.5 (Months 5–7):** Agrovet pack (batch/expiry/regulated register), supplier POs/GRNs, WhatsApp receipts & reminders, multi-user tills.
- **v2 (Months 8–12):** Mini-supermarket mode (multi-till, shifts, barcode label printing, desktop web POS), multi-branch, accountant exports, WhatsApp storefront.

---

# 6. Target Market & User Personas

## 6.1 Segment sizing (serviceable focus)

| Segment | Est. count (Kenya) | Beachhead geography | Tier fit |
|---|---|---|---|
| Dukas / kiosks / general shops | 1.5M+ | Eldoret, Uasin Gishu, Rift Valley towns | Msingi (250) |
| Butcheries | 60,000+ | Same | Msingi/Biashara |
| Agrovets | 12,000+ | Rift Valley grain belt — natural fit with Chepkatet cooperative networks | Biashara (500) |
| Mini-marts / self-service shops (1–3 tills) | 30,000+ | County towns | Biashara/Kampuni |
| Wines & spirits, hardware, cereals, boutiques | 200,000+ | National | Msingi/Biashara |

Realistic 24-month target: **5,000 paying shops** (≈0.25% of addressable), weighted 60/30/10 across tiers → ≈ KES 2.1M MRR. Conservative, achievable with Rift Valley density-first strategy.

## 6.2 Personas

**Persona 1 — Mama Chebet, duka owner (Msingi tier)**
Runs a duka in Langas, Eldoret. Stock worth KES 150,000. M-Pesa till, exercise book for deni (30+ customers owe her). Smartphone: Tecno Spark. Pain: doesn't know her real profit; deni defaults; sugar and unga stockouts on weekends; KRA letters about eTIMS scare her.
Needs: sell fast, record deni with reminders, know low stock, simple end-of-day "leo umepata..." summary, eTIMS receipts without understanding eTIMS.

**Persona 2 — Kipchoge, butchery owner (Msingi/Biashara)**
Buys a carcass at KES 380/kg hanging weight, sells beef at KES 550–650/kg, mutury/offal separately. Uses a manual scale, calculator, memory. Pain: no idea of yield per carcass, attendant "kudanganya na mizani", price changes weekly.
Needs: weight-based selling (enter kg → price auto), per-kg price board he can change instantly, daily kg-in vs kg-sold + cash reconciliation, attendant PIN accounts.

**Persona 3 — Sarah, agrovet manager (Biashara tier)**
Manages an agrovet in Mosoriot. 800+ SKUs: seeds, fertilizer, acaricides, vet drugs, animal feed. Pain: expired chemicals = pure loss + PCPB risk; planting-season stockouts; farmers buy on credit until harvest; some products legally require recorded sale.
Needs: batch + expiry tracking with 90/30-day alerts, seasonal reorder suggestions, farmer credit accounts with harvest-date due dates, regulated-product sales register, supplier POs.

**Persona 4 — Mr. Korir, mini-supermarket owner (Kampuni tier)**
Two-till self-service shop in a county town, 3,000 SKUs, 6 staff. Pain: shrinkage he can't locate, no shift accountability, supplier invoices unreconciled, wants to open branch #2.
Needs: barcode scanning lanes, shift open/close with cash-drop variance, GRN vs PO vs supplier invoice matching, branch dashboard on his phone, accountant-ready exports.

**Persona 5 — Achieng', shop attendant (all tiers)**
Uses whatever the owner installs. Needs: 3-tap selling, mistake-proof (voids need owner PIN), Swahili UI, no blame for system problems.

---

# 7. Product Scope — Core Modules

## 7.1 Module 1: Sell (POS)

- **Quick-sale grid:** top 20 items by frequency auto-pinned; big touch targets; works one-handed.
- **Search-as-you-type** (name, Swahili alias — "unga", "sukari"), plus **camera barcode scanning as the default scanner** (ML Kit, fast even on low-end phones, works offline).
- **Companion Scanner Mode:** any spare smartphone becomes a dedicated remote barcode reader — pair it to a till session via QR code, and every scan streams into the active cart over local Wi-Fi (or cloud relay when tills are separated). This turns a KES 0 old phone into supermarket-lane scanning hardware.
- **Optional wireless barcode reader:** Bluetooth HID barcode readers supported for shops that want one; connects remotely to any phone, tablet, or desktop till — no cables, no drivers.
- **Sale lines:** quantity, unit (pc, kg, g, L, mL, bale, packet, sack, tray, crate, bunch), per-unit price override with owner-set floor (min price) to stop attendant under-selling.
- **Weight mode:** attendant reads the shop's existing scale and enters weight → price auto-computed from KES/kg; supports tare; plausibility checks guard against entry errors. No scale hardware integration — the scale the butchery already owns stays as-is, keeping the zero-hardware promise.
- **Cart operations:** hold/park sale (customer stepped out), multiple parked carts, discounts (amount/%) gated by role, line void with PIN.
- **Tender types:** Cash (with change calculator), M-Pesa STK Push, M-Pesa manual-confirm (customer pays till, system matches C2B callback), Card (via aggregator, Tier 3), Split tender, **Deni (credit)** — requires named customer.
- **Receipts — digital by default:** WhatsApp receipt, SMS receipt, or **on-screen QR receipt** (customer scans the till screen with their phone and gets the receipt instantly as a web page — zero hardware, zero message cost); or no receipt. eTIMS-fiscalised receipt with KRA QR where applicable (see §9).
- **Optional remote printing:** one wireless thermal printer (Bluetooth or Wi-Fi ESC/POS, 58/80mm) can serve the whole shop via the **print relay** — any till (phone, tablet, or desktop) sends the job to a shared print queue, and the device paired to the printer (or the network printer itself) prints it. One printer, many tills, no cables (see §11.4).
- **Returns/refunds:** against original receipt; eTIMS credit note issued from same solution (KRA requires corrections from originating system); stock restored; owner-PIN gated.
- **Speed target:** ≤ 8 seconds from app-open to completed cash sale for a pinned item.

## 7.2 Module 2: Stock (Inventory)

- Product catalog: name, Swahili alias, category, barcode(s), buy price, sell price, wholesale price, unit, VAT class (16% / zero-rated / exempt), reorder level, reorder quantity, photo (optional), active/inactive.
- **Composite/repack items:** buy a 90kg sack of maize, sell in 1kg/2kg "gorogoro" units — parent-child stock conversion with automatic deduction and repack wastage capture.
- Stock movements ledger (immutable): sale, purchase/GRN, return, adjustment (with reason codes: breakage, expiry, theft, gift, correction), repack, transfer (multi-branch, Tier 3).
- **Stock take:** guided count by category/shelf; blind count option (system hides expected qty); variance report with value; partial counts allowed.
- Low-stock alerts: in-app + push + optional SMS/WhatsApp digest at owner-set time ("kila siku saa mbili usiku").
- **Reorder intelligence:** suggested order = sales velocity (last 14/30 days) × lead time + safety stock; seasonal weighting for agrovet mode.
- Buy-price averaging (weighted average cost) for margin truth; FIFO batch costing where batches enabled.
- Expiry & batch tracking (Biashara+): batch no., expiry date, FEFO pick suggestion, expiring-soon reports (90/60/30/7 days), expired quarantine state.

## 7.3 Module 3: Deni (Customer Credit) — headline feature

- Customer registry: name, phone, photo (optional), ID no. (optional), credit limit, notes.
- Sell-on-deni flow: 2 extra taps; running balance shown before confirming; limit warnings.
- Payments against deni: cash or M-Pesa; partial payments; allocation oldest-first; statement per customer.
- **Automated reminders:** WhatsApp/SMS templates in Swahili/English ("Habari Mama Akinyi, salio lako duka la Chebet ni KSh 850. Karibu."), scheduled (e.g., every Friday), owner-approved before send (Msingi) or auto (Biashara+).
- Deni dashboard: total outstanding, aging buckets (0–7, 8–30, 31–60, 60+ days), top debtors, collection rate.
- Agrovet extension: due date = expected harvest month; crop-season tagging.

## 7.4 Module 4: Money (Payments & Reconciliation)

- **Cash management:** opening float, cash-in/out with reasons (mchango, transport, supplier cash payment), expected-vs-actual drawer count at close, variance flagging.
- **M-Pesa (see §10):** STK push from cart; C2B confirmation auto-match to open sale by amount+time+phone; unmatched-payments inbox; till statement reconciliation report (system sales vs M-Pesa received vs cash counted).
- **Close-of-day ("Funga Siku"):** one screen — gross sales, by tender, deni issued, deni collected, expenses, expected cash, counted cash, variance, gross profit estimate. Sent to owner via WhatsApp automatically.
- Expenses module: quick expense entry with categories (stock purchase, rent, transport, wages, airtime, misc), photo of receipt, monthly expense report.

## 7.5 Module 5: Watu (Staff & Roles)

- Roles: **Owner** (everything), **Manager** (no financial settings, can adjust stock), **Attendant** (sell, record deni payments; no voids/discounts beyond floor; no reports), **Accountant** (read-only reports + exports, Tier 3).
- Per-user PIN login on shared device; per-sale attendant attribution; per-attendant sales & variance reports.
- Shift management (Tier 2+): open/close shift, cash accountability per shift, shift handover report.

## 7.6 Module 6: Ripoti (Reports & Intelligence)

- Daily/weekly/monthly: sales, gross profit (real margin from buy prices), by category/product/attendant/tender/hour-of-day.
- Dead stock report (no sales in X days, capital tied up), fast-movers, margin leaders vs volume leaders.
- Deni aging, expense summary, stock valuation (at cost and at retail), shrinkage/adjustment report.
- **"Wiki Yako" WhatsApp digest:** every Sunday evening, a plain-language Swahili/English summary: "Wiki hii: Mauzo KSh 84,300 (▲12%). Faida ~KSh 13,900. Bidhaa inayokwisha: Sukari 2kg. Deni jipya: KSh 4,200."
- Exports: PDF, Excel/CSV; accountant pack (sales register, VAT summary, expense register) — Tier 3.

## 7.7 Module 7: Settings & Business Profile

- Business profile: name, KRA PIN, VAT status, till/paybill number, logo for receipts, location.
- Receipt customization: header/footer ("Asante, karibu tena!"), language, paper size.
- Tax settings: VAT-registered toggle drives eTIMS behaviour and receipt format.
- Data controls: export all my data; delete account (DPA 2019 compliance, §9.4).

---

# 8. Vertical Packs

Vertical packs are configuration + feature bundles activated at signup by business type. Same core engine, different defaults, catalog templates, and unlocked features.

## 8.1 Duka Pack (default)

- Pre-loaded catalog template: ~150 common Kenyan FMCG items (unga brands, sukari, mafuta, sabuni, sodas, airtime denominations, bread, milk, matchboxes…), with typical units and VAT classes; owner edits prices.
- Repack/gorogoro selling enabled by default (rice, sugar, maize, beans, cooking oil dispensed).
- Airtime & mobile-money commission tracking as non-stock income lines.

## 8.2 Butchery Pack ("Nyama")

- **Weight-based selling as default sale mode:** attendant enters kg (or grams), price computed from live KES/kg board.
- **Price board:** beef, goat, mutton, offal, bones, mince — each with today's KES/kg; owner changes in 5 seconds; history kept.
- **Carcass intake & yield:** record carcass purchase (supplier, hanging weight, cost/kg) → system tracks kg sold vs kg received → daily yield % and shrinkage; profit per carcass.
- Cut hierarchy (optional, Biashara+): carcass → cuts with target yield %, variance alerts ("leo yield 87%, kawaida 92% — angalia").
- By-products (skin, hooves) as income lines.
- Manual weight entry (butchery keeps its existing certified scale) with plausibility checks: single line > 25kg prompts confirm; per-attendant weight-entry patterns flagged in reports to expose "mizani games." Scale hardware integration is permanently out of scope by policy (§11.4).
- Hygiene/licence reminder dates (county public-health licence, medical certs).

## 8.3 Agrovet Pack ("Shamba Supplies")

- Batch + expiry mandatory on flagged categories (agrochemicals, vet drugs, vaccines); FEFO enforced at sale.
- **Regulated products register:** for products flagged as PCPB/VMD-restricted, sale captures buyer name + phone (+ optional ID); exportable register for inspection.
- Seasonal intelligence: planting/top-dressing/harvest calendar per region; reorder suggestions weighted by season ("Machi inakaribia: ongeza DAP, mbegu za mahindi").
- Farmer credit: due dates tied to harvest; group/cooperative-linked accounts (natural bridge to Chepkatet-style cooperative partnerships — cooperative pays member deni via checkoff, v2 partnership feature).
- Cold-chain flag for vaccines (storage location note, expiry priority).
- Unit conversions: 50kg/25kg/10kg fertilizer bags; mL/L chemicals; kg/g seed.

## 8.4 Mini-Supermarket Pack ("Supa") — Kampuni tier

- Multi-till: up to 3 concurrent POS devices per branch on shared stock.
- Barcode-first lanes: camera scanning, Companion Scanner Mode (a spare phone per lane as the scanner), or optional wireless Bluetooth reader; unknown-barcode quick-add flow.
- Desktop till option: the web POS (PWA) runs full checkout on any existing desktop/laptop browser with offline caching — ideal for a fixed counter, still zero new hardware.
- Shift & cashier accountability: per-till floats, cash drops, X/Z-style reports.
- Shelf-label & barcode label printing: generated as A4 PDF sheets printed on any ordinary printer the shop can access (own, cyber café, or office) via the standard system print dialog — no label printer hardware.
- Supplier module full: PO → delivery → GRN (with partials) → supplier invoice matching → supplier balance & payment tracking.
- Multi-branch: branch stock views, inter-branch transfer with in-transit state, consolidated owner dashboard.
- Price-embedded barcode *reading* supported (if a shop's existing label scale prints them, our camera/reader parses them) — but no scale hardware is sold, integrated, or required.

## 8.5 Wines & Spirits / Hardware / Cereals (config presets)

- **W&S:** age-notice on receipt, county liquor licence renewal reminder, bottle/tot dual units, high-shrinkage alerting.
- **Hardware:** large catalog support, dimension-based units (m, ft, pieces cut from stock length), quotation → invoice flow, project/customer job tags.
- **Cereals:** weight mode + moisture/quality note, seasonal buy-price tracking, sack↔kg conversions, aggregation purchases from farmers (buy-side weighbridge entries, v2).

---

# 9. Regulatory & Compliance Requirements

## 9.1 eTIMS strategy (critical path)

**Facts established in research:**
- KRA offers system-to-system integration via **OSCU** (always-online invoicing) and **VSCU** (bulk invoicing / not-always-online) pathways; both require development and testing in the eTIMS sandbox, then vetting and certification.
- Third-party integrator certification requires, among other documents, business registration (Cert of Incorporation & CR12), proof of at least three qualified technical staff, a notarized solvency declaration, and technology architecture documentation; KRA issues an interim approval certificate after successful integration and certification.
- KRA permits taxpayers to run more than one eTIMS solution, but **credit notes must be created from the same solution** that issued the original invoice — our returns flow must respect this.
- The invoice flow: authenticate/session → submit invoice payload (sales details, tax breakdown, buyer info) → receive KRA validation & digital signature → store signed invoice metadata for printing/audit. Receipts must carry KRA fiscal fields including QR code.
- Community SDKs exist (Paybill Kenya's TypeScript/Python/PHP OSCU SDKs, MIT-licensed, aligned to KRA OSCU/VSCU v2.0 specs) — useful reference implementations for our TypeScript stack.

**Our decision: VSCU-primary architecture.** Because LogiQ Duka is offline-first with intermittent connectivity, VSCU (designed for not-always-online, bulk invoicing) matches our reality. Sales are fiscalised locally, queued, and synced. Where a tenant is always-online (supermarkets), OSCU real-time validation can be used. The sync engine treats KRA submission as a queue consumer identical in pattern to our general sync — one architecture, two endpoints.

**Compliance execution plan:**
1. Month 1: Register on eTIMS taxpayer sandbox; register VSCU + OSCU test devices; study OSCU/VSCU v2.0 specs.
2. Months 1–3: Build integration against sandbox (TypeScript service, informed by Paybill SDK patterns); implement invoice, credit note, item/branch registration, and stock-movement endpoints as required by spec.
3. Month 3: Submit certification pack — Total Man Technologies registration docs, CR12, technical staff evidence (Shady + Kim + contract engineer satisfies the three-staff requirement; confirm acceptability of contractors with KRA), notarized declaration, architecture document (reuse BARAZA-grade documentation standards).
4. Month 4: Interim approval → pilot tenants issue live fiscal receipts.
5. Contingency: if certification delays, launch with **eTIMS-ready mode** — non-VAT tenants (the majority of dukas are below VAT threshold) operate fully; VAT tenants bridged via KRA's own eTIMS clients with our export until our certification lands. *Do not block launch on certification; do not misrepresent certification status.*

**Product behaviour:**
- Non-VAT tenant: normal receipts, no fiscalisation, but sales register export always KRA-audit-ready.
- VAT tenant: every taxable sale queued for fiscalisation; receipt shows KRA QR + fiscal number once signed; offline sales print "provisional — fiscal copy to follow" per allowed practice, fiscalised on sync; dashboard shows fiscalisation backlog & failures loudly.
- Credit notes only against original fiscal invoice, from within LogiQ Duka.

## 9.2 VAT logic

- Item-level VAT class: 16%, zero-rated, exempt. Catalog templates ship with correct default classes for common goods (e.g., basic unprocessed foods vs processed).
- Prices entered VAT-inclusive (Kenyan retail norm); system back-computes tax for eTIMS payloads.
- Monthly VAT summary report aligned to KRA return lines (Tier 2+).

## 9.3 Sector licences (assistive, not enforcement)

Reminder engine for: county single business permit, public health licence (butcheries, food), liquor licence (W&S), PCPB premises registration (agrovets), fire certificate, NEMA where relevant. LogiQ Duka reminds; it does not verify.

## 9.4 Data Protection Act 2019

- Total Man Technologies to register with ODPC as data controller/processor.
- Customer (debtor) personal data: collected with purpose limitation (credit management), minimal fields, no sale of data, per-tenant isolation via RLS.
- Data subject rights: shop owners can export/delete customer records; tenants can export/delete their full dataset.
- Consent language embedded in deni-customer creation flow; SMS/WhatsApp reminders include opt-out honouring.
- Data residency note: Supabase region selection documented; encryption at rest and in transit; DPA-compliant privacy policy in Swahili and English.

---

# 10. Payments Architecture (M-Pesa First)

## 10.1 Flows

1. **STK Push (C2B via Daraja):** attendant confirms cart → enters/selects customer phone → STK prompt on customer phone → callback confirms → sale auto-completes with M-Pesa reference stored. Timeout handling (customer delay), retry, and fall-back to manual-confirm.
2. **Manual till payment matching:** customer pays shop till directly (habit dies hard). C2B confirmation webhook (register validation/confirmation URLs against tenant till/paybill where merchant onboards their own shortcode) or, for shops on personal tills we can't webhook, **quick-match inbox**: attendant taps "M-Pesa received," enters last 4 of transaction code + amount; end-of-day reconciliation against till statement.
3. **Deni repayments via M-Pesa:** reminder message carries amount; payment matched to customer account.
4. **Subscription billing (our revenue):** monthly STK push to owner; 5-day grace; downgrade-to-read-only (never data hostage) on lapse; annual prepay discount (pay 10 months, get 12).

## 10.2 Technical notes (Daraja — home turf)

- Per-tenant shortcode credentials stored encrypted (Supabase Vault); central Total Man aggregation shortcode for tenants without their own (Phase 2 decision — evaluate PSP licensing implications before aggregating funds; v1 = merchant's own till, we only *confirm*, never touch funds → no payment-licence exposure).
- Callback ingestion: idempotent, signed-URL validation, dead-letter queue, replay tooling.
- Reconciliation job: nightly compare of recorded M-Pesa sales vs confirmations; discrepancies surfaced in Funga Siku.

## 10.3 Other tenders

- Cash (change calculator, drawer accountability), bank transfer (reference capture), card via third-party PDQ (record-only in v1), Airtel Money (Phase 2), split tenders.

---

# 11. Offline-First Architecture & Technical Design

## 11.1 Stack (aligned to Total Man core competencies)

| Layer | Choice | Rationale |
|---|---|---|
| Mobile POS | **React Native / Expo** (Android-first; iOS later) | Existing expertise (KNC Trial Monitor, KENHA offline-first app); OTA updates via EAS |
| Local store | **SQLite (expo-sqlite) + WatermelonDB-style sync layer** | True offline query/write speed at 3,000+ SKUs |
| Backend | **Supabase (PostgreSQL, Auth, RLS, Edge Functions, Realtime, Storage, Vault)** | Proven multi-tenant RLS patterns from BARAZA/Nyumba360 |
| Web dashboard | **Next.js 14+ / TypeScript on Vercel** | Owner/back-office console, admin, marketing site |
| Desktop/tablet POS | **Next.js PWA POS mode** (installable, IndexedDB offline cache, service-worker sync) | Full checkout on any existing desktop, laptop, or tablet browser — same event pipeline as mobile; zero new hardware (v2) |
| Messaging | **WhatsApp Cloud API + Africa's Talking SMS** | Receipts, reminders, digests — existing integrations |
| eTIMS service | **Supabase Edge Functions / dedicated Node service** (TypeScript, informed by Paybill OSCU SDK patterns) | Queue-based fiscalisation worker |
| Payments | **M-Pesa Daraja** (STK, C2B) | Core moat |
| Observability | Sentry + structured logs + uptime monitoring | SLA credibility |

## 11.2 Sync engine (the hard part — design it once, properly)

- **Event-sourced writes:** every local mutation is an append-only event (sale_created, stock_adjusted, payment_recorded…) with client-generated UUIDv7, device ID, logical clock, and tenant ID.
- **Push:** background upload when connectivity returns; batched; idempotent server ingestion (event UUID dedupe).
- **Pull:** server changes (price updates from owner dashboard, catalog edits, other tills) streamed down; last-writer-wins on scalar fields with server timestamp authority, **except stock quantity, which is never set — only derived from movement events** (eliminates the classic stock-clobbering conflict).
- **Conflict policy:** money and stock are event-derived (no conflicts by construction); catalog edits LWW with edit-history; deletes are soft.
- **Fiscal & M-Pesa queues:** same event pipeline, separate consumers with retry/backoff and failure surfacing.
- **Device management:** owner approves each device; lost-phone remote revoke; local DB encrypted (SQLCipher) with PIN-derived key.
- **Sync health UI:** honest indicator ("Mauzo 14 yanasubiri mtandao") — never silent data risk.

## 11.3 Multi-tenancy & security

- Single Postgres, tenant_id on every row, **RLS on every table, no exceptions** (established Total Man security posture: RLS + env-var hygiene + credential protection for M-Pesa/WhatsApp secrets).
- Roles enforced in RLS policies + JWT claims (owner/manager/attendant/accountant scoped).
- Secrets: Supabase Vault + Vercel env separation per environment; no secrets in client bundles; per-tenant Daraja creds encrypted at rest.
- Audit log: immutable table of sensitive actions (price change, void, adjustment, user change, export).
- Backups: PITR on Postgres; tenant-level export; quarterly restore drills.
- Rate limiting & abuse controls on Edge Functions; OWASP MASVS checklist for the mobile app.

## 11.4 Zero-Hardware Peripheral Model (policy + design)

**Policy:** LogiQ Duka is a pure software product. It runs on the mobile phones, tablets, and desktops the shop already owns. Exactly **two optional peripherals** exist, both connected remotely (wireless), and **no feature ever depends on either**:

**A. Barcode input — three ways, hardware last:**
1. **Camera scanning (default, KES 0):** on-device ML barcode recognition on every phone/tablet; works fully offline; tuned for worn/curved labels common on Kenyan FMCG packaging.
2. **Companion Scanner Mode (KES 0):** any spare/old smartphone is paired to a till session by scanning a QR code and becomes a dedicated remote scanner. Scans stream to the cart over local Wi-Fi with automatic fallback to cloud relay (so a scanner phone and a desktop till don't even need to be on the same network). Latency target < 300ms on LAN.
3. **Wireless barcode reader (optional purchase):** standard Bluetooth HID readers pair directly to any till device — phone, tablet, or desktop browser (Web Bluetooth/HID keyboard-wedge). No cables, no drivers, hot-swappable between tills.

**B. Printing — digital first, one remote printer if wanted:**
1. **Digital receipts (default, KES 0):** WhatsApp, SMS, and on-screen QR receipt (customer scans till screen → receipt opens as a hosted page with eTIMS QR when fiscalised). Legally sufficient; costs nothing; most dukas will never print.
2. **Print Relay (optional printer):** a single wireless thermal printer (Bluetooth ESC/POS, or Wi-Fi/network ESC/POS) serves the entire shop. Every till — mobile, tablet, or desktop — submits print jobs to a tenant print queue (Supabase Realtime channel); the "print host" (whichever device is paired to a Bluetooth printer, or the network printer directly for Wi-Fi models) consumes and prints. Queue survives offline: jobs print when the host reconnects. One printer, unlimited tills, zero cabling.
3. Documents (labels, reports, statements) render as A4 PDFs and print through any ordinary printer via the OS/browser print dialog — nothing special to buy.

**C. Explicitly no:** cash drawers (cash is tracked in-app with Funga Siku accountability), customer-facing display poles (the customer sees the till screen or their own phone), integrated/connected weighing scales (existing certified scales stay; weights are keyed in with plausibility checks), label printers, USB peripherals of any kind, and vendor-locked terminals. This is both a cost promise to customers and an engineering discipline — every peripheral avoided is a support ticket category that never exists.

## 11.5 Performance targets

- Cold start ≤ 3s on 2GB RAM Android 10 device; sale completion ≤ 8s; search results < 150ms local; sync of 500 queued events < 60s on 3G; app size ≤ 40MB; graceful at 10,000 SKUs / 200,000 events per tenant/year.

---

# 12. Data Model Overview (core entities)

```
tenants ─┬─ branches ─┬─ devices
         │            └─ registers/tills
         ├─ users (role, pin_hash)
         ├─ products ─┬─ product_units (conversions)
         │            ├─ barcodes
         │            └─ batches (no, expiry, qty_in)
         ├─ price_board_entries (butchery KES/kg history)
         ├─ customers (deni) ── customer_transactions (charges/payments)
         ├─ suppliers ─┬─ purchase_orders ── po_lines
         │             └─ grns ── grn_lines
         ├─ sales ─┬─ sale_lines (qty, unit, weight, price, vat_class, batch_id)
         │         ├─ payments (tender, mpesa_ref, amount)
         │         └─ fiscal_documents (kra invoice no, qr, status, signed_payload)
         ├─ stock_movements (type, qty, reason, ref)  ← single source of truth
         ├─ carcass_intakes (butchery) ── yield snapshots
         ├─ regulated_sale_register (agrovet)
         ├─ expenses / cash_movements / shifts
         ├─ events (sync event log)
         └─ subscriptions (tier, status, mpesa billing refs)
```

Design rules: monetary values as integer cents (KES × 100); all quantities in base units with conversion factors; soft deletes; created_by/device_id on everything; movements-derived stock (`current_qty = Σ movements`), materialized for read speed.

---

# 13. Pricing & Packaging

**Currency: KES, VAT-inclusive, billed monthly via M-Pesa STK. Annual: pay 10 months, get 12. 14-day free trial, full Biashara features, no card/no commitment.**

## 13.1 Tiers

| | **MSINGI** — KES 250/mo | **BIASHARA** — KES 500/mo | **KAMPUNI** — KES 1,000/mo |
|---|---|---|---|
| Tagline | "Anza vizuri" — the duka essential | "Kua kibiashara" — the growing shop | "Endesha kama kampuni" — the mini-supermarket |
| Devices / branch | 1 phone | 2 devices | 3 tills + owner devices |
| Branches | 1 | 1 | Up to 3 (then +KES 300/branch) |
| Users | Owner + 1 attendant | Up to 4 | Up to 10 |
| Products | Up to 300 | Up to 2,000 | Unlimited |
| POS: cash, M-Pesa manual-match, deni | ✔ | ✔ | ✔ |
| M-Pesa STK Push | ✔ | ✔ | ✔ |
| eTIMS fiscal receipts | ✔ | ✔ | ✔ |
| Offline mode & sync | ✔ | ✔ | ✔ |
| Receipts: print/WhatsApp/SMS | ✔ (SMS at cost*) | ✔ | ✔ |
| Deni reminders | Manual send | Automated schedules | Automated + statements |
| Repack/gorogoro selling | ✔ | ✔ | ✔ |
| Butchery weight mode + price board | ✔ | ✔ | ✔ |
| Carcass yield tracking | — | ✔ | ✔ |
| Batch & expiry tracking | — | ✔ | ✔ |
| Agrovet regulated register + seasonal reorder | — | ✔ | ✔ |
| Suppliers, POs, GRNs | — | ✔ | ✔ + invoice matching |
| Shifts & cashier accountability | — | ✔ | ✔ |
| Reports | Daily + basic | Full + Wiki Yako digest | Full + accountant pack + custom ranges |
| Stock take | Full count | Full + blind | Full + blind + cycle counts |
| Barcode label printing | — | — | ✔ |
| Multi-branch dashboard & transfers | — | — | ✔ |
| Accountant read-only seat + exports | — | — | ✔ |
| Support | WhatsApp bot + community | WhatsApp human (business hrs) | Priority WhatsApp + onboarding call |

*SMS billed at pass-through Africa's Talking cost via prepaid SMS wallet; WhatsApp receipts free within fair use.

## 13.2 Pricing rationale

- **KES 250 ≈ 8 shillings/day** — less than one soda, one boda stage fee. The pitch writes itself: *"Lipa na soda moja kwa siku, ujue faida yako."* Against a market entry of KES 2,000–5,000/month, this is not a discount; it is a category change.
- Tier boundaries follow *business complexity*, not feature hostage-taking: everything a duka needs to be compliant and profitable lives in Msingi (including eTIMS and STK — compliance and payments must never be upsell bait, both ethically and because they drive word-of-mouth).
- Biashara's triggers are organic growth moments (second attendant, supplier POs, expiry tracking) — natural, non-resented upgrades.
- Kampuni at KES 1,000 still undercuts every "professional" Kenyan tier by 10–25x while serving the segment (mini-marts) with the highest willingness to pay and lowest churn.

## 13.3 Add-ons (all tiers)

- Extra branch (Kampuni): KES 300/mo. Extra device (Biashara): KES 100/mo. SMS wallet top-ups via M-Pesa. **Optional peripherals via partner referral only** (we never hold stock, never require them): wireless thermal printer ~KES 6,500–9,000; wireless Bluetooth barcode reader ~KES 2,500–4,000 — both one-off, both remote-connected, both replaceable by camera scanning and digital receipts at KES 0. Assisted onboarding visit (Eldoret/Rift Valley): KES 1,500 one-off.

---

# 14. Unit Economics & Business Model Realism

## 14.1 Honest cost view (per active tenant / month, at 1,000 tenants)

| Cost item | Estimate (KES) | Notes |
|---|---|---|
| Supabase/infra amortised | 15–35 | Event tables dominate; Postgres partitioning + archival keeps this flat |
| WhatsApp Cloud API | 10–40 | Utility templates; digests batched; receipts within free-form windows where possible |
| M-Pesa STK costs | ~0 direct | Merchant's own till; our billing STK negligible |
| Support (blended) | 40–80 | Bot-first deflection; Swahili macros; community group |
| Payment collection failures/dunning | 10 | Grace + retry automation |
| **Total** | **~75–165** | |

Gross margin: **~35–70% at Msingi, ~70–85% blended** — thin but workable at Msingi *only because* Total Man runs lean (no office overhead, founder-led support initially, no paid CAC dependence). This is exactly the moat: incumbents with Nairobi salaries cannot follow us to KES 250.

## 14.2 Revenue model (24-month, conservative)

| Milestone | Tenants (paying) | Mix M/B/K | MRR (KES) |
|---|---|---|---|
| Month 6 | 150 | 70/25/5 | ~53,000 |
| Month 12 | 800 | 65/28/7 | ~300,000 |
| Month 18 | 2,500 | 60/30/10 | ~1,000,000 |
| Month 24 | 5,000 | 60/30/10 | ~2,100,000 |

Secondary revenue: onboarding visits, printer margin, SMS wallet float, and (Phase 3, carefully) data-informed supplier partnerships — never selling tenant data, only opt-in aggregated demand programs.

## 14.3 Churn assumptions

Micro-SME SaaS churn is brutal (5–10%/mo typical). Mitigations: annual prepay push (2 free months), deni book as lock-in (their receivables live here), Wiki Yako habit loop, read-only-never-delete lapse policy (winback path), and cooperative/chama group billing (one payer, many shops — structurally lower churn). Plan assumes 6% monthly churn Msingi, 3% Biashara, 2% Kampuni.

---

# 15. Non-Functional Requirements

- **Availability:** 99.5% backend (POS unaffected by outages by design — offline-first is the real SLA).
- **Durability:** zero acknowledged-event loss; PITR backups; tenant export always available.
- **Security:** RLS everywhere, encrypted local DB, encrypted secrets, audit log, OWASP MASVS-L1, annual pen-test from Month 12.
- **Privacy:** DPA 2019 compliance, ODPC registration, bilingual privacy policy, data minimisation.
- **Accessibility & usability:** min 44dp touch targets, high-contrast sunlight mode, Swahili/English full parity, voice-note help.
- **Compatibility:** Android 8+, 2GB RAM, 40MB APK, works on 2G/3G/4G/none; desktop/tablet via PWA on Chrome/Edge/Safari with offline caching (v2); optional wireless peripherals only — 58/80mm Bluetooth or Wi-Fi ESC/POS printers via Print Relay, Bluetooth HID barcode readers; no USB/cabled peripheral support by policy.
- **Scalability:** 10,000 tenants on single Supabase project with partitioned event tables before re-architecture is needed.

---

# 16. Onboarding, Support & Customer Success

- **Self-serve onboarding:** phone number + M-Pesa OTP signup → pick business type → catalog template loads → guided first sale (confetti moment) → trial starts. Target: < 3 minutes.
- **Assisted onboarding:** KES 1,500 visit (Rift Valley initially) — setup, product load from photos of shelves (we type it), staff training, and pairing of optional wireless peripherals if the shop chose any. Also delivered by commissioned **field agents/resellers** (former shop attendants, cooperative field officers — 20% first-year commission).
- **Support stack:** WhatsApp bot (Swahili/English FAQ + account actions) → human WhatsApp escalation → screen-share for Kampuni. In-app help videos (30–60s, Swahili, vertical format).
- **Success rituals:** Day-3 check-in message, Day-10 "your first Wiki Yako," Day-13 trial-end offer with annual option, monthly feature broadcast via WhatsApp channel.
- **Community:** "Wamiliki wa Duka" WhatsApp community per county — support deflection + referral engine + feature feedback.

---

# 17. Go-To-Market Plan (90 Days) — Rift Valley Density First

**Weeks 1–4 (Pilot 20):** Hand-pick 20 shops in Eldoret (5 dukas Langas/Huruma, 3 butcheries West Market, 3 agrovets via Chepkatet/Mosoriot networks, 2 mini-marts, others mixed). Free for pilot + printer subsidy for 5. Daily feedback loop. Exit criteria: 15/20 active daily, sale-time ≤ 8s verified, zero data-loss incidents.

**Weeks 5–8 (Paid launch 100):** Public launch at KES 250/500/1,000. Channels: pilot referrals (1 month free per referral both sides), county-market activation days (agent at Eldoret main market with demo phone + printer), AIC and cooperative network introductions (trusted-institution distribution — the unfair advantage), Facebook/TikTok Swahili demo videos ("Duka lako kwenye simu"), boda-stage poster QR campaign.

**Weeks 9–13 (Systemise 300):** Recruit 5 commissioned field agents (Eldoret, Kapsabet, Iten, Kitale, Kericho). Cooperative partnership pilot: Chepkatet-model group onboarding of member agrovets/shops with checkoff billing. First "Funga Mwezi" owner meetup. Content engine: weekly Swahili YouTube/TikTok shorts (ties into existing faceless-channel strategy, M-Pesa/Daraja niche authority).

**Positioning messages:**
1. "KSh 8 kwa siku. Faida yako wazi kila jioni." (price + profit clarity)
2. "Inafanya kazi bila internet." (offline trust)
3. "Deni zote kwenye simu — na kumbusho za WhatsApp." (deni pain)
4. "Risiti za KRA eTIMS bila stress." (compliance fear → relief)

---

# 18. Roadmap & Release Phases

| Phase | Months | Scope |
|---|---|---|
| **0 — Foundation** | 0–1 | Sync engine spike + hardening; eTIMS sandbox registration; data model; design system (Swahili-first); catalog templates |
| **1 — MVP (Msingi)** | 1–4 | POS, inventory, deni, cash + M-Pesa (STK + manual match), receipts (print/WhatsApp), Funga Siku, offline sync, onboarding, subscription billing, butchery weight mode + price board; eTIMS integration in cert pipeline |
| **1.5 — Biashara** | 5–7 | Batch/expiry, agrovet pack, suppliers/PO/GRN, shifts, automated deni reminders, Wiki Yako, carcass yield, eTIMS live post-certification |
| **2 — Kampuni** | 8–12 | Multi-till, multi-branch, desktop web POS (PWA), Companion Scanner Mode, Print Relay multi-till mode, A4 barcode labels, invoice matching, accountant seat/exports, Airtel Money, iOS |
| **3 — Ecosystem** | 12+ | WhatsApp storefront (order-ahead), cooperative checkoff billing, supplier ordering marketplace (opt-in), lending-readiness reports (tenant-owned data → bank/SACCO loan applications), Kanisa/BARAZA cross-sell for church-owned enterprises |

---

# 19. Success Metrics & KPIs

**North star: number of shops that complete Funga Siku ≥ 5 days/week.** (Daily-close habit = retained, value-realising tenant.)

- Activation: signup → first sale < 24h ≥ 70%; trial → paid ≥ 35%.
- Engagement: DAU/MAU ≥ 60%; median sales logged/day/tenant ≥ 25; deni feature adoption ≥ 50% of dukas.
- Reliability: crash-free sessions ≥ 99.5%; sync success ≤ 24h ≥ 99.9%; fiscalisation backlog > 48h < 1% of fiscal tenants.
- Commercial: MRR per plan §14.2; monthly churn ≤ 6/3/2% by tier; NPS ≥ 50; referral share of signups ≥ 30% by Month 9.
- Support: first response < 15 min (business hrs); bot deflection ≥ 60%.

---

# 20. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| eTIMS certification delay | Medium | High | Start Month 1; VSCU-primary design; eTIMS-ready contingency mode; majority of Msingi tenants are non-VAT so launch value is intact |
| KRA spec changes / API instability | Medium | Medium | Queue-isolated fiscal service; version-pinned payload builders; monitor KRA integrator communications |
| Churn at micro-tier | High | High | Annual prepay, deni lock-in, habit loops, group billing, winback automation |
| Price war from incumbents | Low-Med | Medium | Their cost structures can't reach KES 250; our moat is unit economics + vertical depth + Swahili UX, not price alone |
| Sync/data-integrity bug destroys trust | Low | Critical | Event sourcing, movement-derived stock, property-based sync tests, staged rollouts, PITR, "never lose a sale" as engineering law |
| Founder bandwidth (Shady solo-core) | High | High | Ruthless scope control per phases; contract engineer for eTIMS + QA; field agents own onboarding; Kim on institutional/cooperative BD |
| M-Pesa Daraja policy shifts | Low | Medium | v1 confirm-only (no funds handling) avoids PSP licensing exposure; monitor Safaricom terms |
| Phone theft/loss at shops | High | Low | Cloud sync, device revoke, encrypted local DB, cheap re-login |
| Data protection breach | Low | High | RLS discipline, minimal PII, ODPC registration, incident response runbook |
| Feature-creep from big-tenant requests | High | Medium | Kampuni ceiling is 3 branches; enterprise requests routed to bespoke Total Man services, not into the product |

---

# 21. Out of Scope (v1)

Full accounting/general ledger (exports instead), payroll, pharmacy-regulated dispensing (PPB workflows), restaurant KDS/table service, e-commerce website builder, iOS at launch, card acquiring, holding client funds, hardware manufacturing/inventory/sales, **all peripherals except the two optional wireless ones (thermal printer, barcode reader): no cash drawers, customer displays, label printers, connected scales, USB/cabled devices, or proprietary terminals — ever**, ERP-grade manufacturing/BOM beyond repack, English-only markets (Australia arm continues under separate LogiQ products — this product is deliberately, proudly Kenyan).

---

# 22. Appendices

**A. Research sources (July 2026):** KRA eTIMS system-to-system integration pages & OSCU/VSCU v2.0 specifications and integrator certification requirements; eTIMS taxpayer sandbox sign-up guide; Paybill Kenya open-source OSCU SDKs (TS/Python/PHP); EliteTeQ Kenya POS comparison & 2026 pricing guides; SimbaPOS, Uzapoint, Pesapal Sabi, Tiwi POS, ModernPOS, Nextgen, KnowHow Kenya POS listings; TechnologyAdvice best POS inventory systems & Square alternatives 2026; SelectHub and Sonary Lightspeed vs Square analyses; Dupple 2026 POS field tests (Loyverse pricing model); ITKenya eTIMS-compliant ERP guide (offline queuing requirement).

**B. Glossary:** Duka (shop), Deni (credit/debt), Gorogoro (2kg tin measure), Funga Siku (close the day), GRN (goods received note), OSCU/VSCU (KRA online/virtual sales control units), FEFO (first-expired-first-out), STK Push (M-Pesa payment prompt), RLS (row level security).

**C. Open questions for v1.1:** KRA position on contractor staff for the 3-technical-staff certification requirement; Safaricom terms for third-party C2B URL registration on merchant tills at scale; WhatsApp template pricing changes; county-level butchery scale-verification (Weights & Measures) integration opportunity; Chepkatet checkoff-billing legal structure.

---

*Prepared by Total Man Technologies, Eldoret City. This PRD is the single source of truth for LogiQ Duka v1. Build boldly, ship weekly, keep it Kenyan.*

---
---

# PART B — BUILD SPECIFICATION (Code-Ready)

*Everything below exists so this single file can be dropped into a repo and handed to Claude Code as the master spec. Part A defines WHAT and WHY; Part B defines HOW, in what order, and what "done" means.*

---

# 23. Week 1 Setup Runbook (Founder Tasks — before/alongside coding)

| # | Task | Where | Output needed by code |
|---|---|---|---|
| 1 | Create GitHub repo `totalman/logiq-duka` (private, monorepo) | github.com | Repo URL |
| 2 | Create Supabase project `logiq-duka-dev` (region: closest available; document choice) + later `logiq-duka-prod` | supabase.com | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, DB password |
| 3 | Vercel project linked to repo (`apps/web`) | vercel.com | Deploy pipeline |
| 4 | Expo account + EAS project | expo.dev | `EAS_PROJECT_ID` |
| 5 | Google Play Console account ($25) + app listing draft | play.google.com/console | Package name `ke.totalman.logiqduka` |
| 6 | Safaricom Daraja account → create sandbox app | developer.safaricom.co.ke | `DARAJA_CONSUMER_KEY/SECRET` (sandbox), test shortcode + passkey |
| 7 | Meta Business verification → WhatsApp Cloud API app + test number (START EARLY — slowest item) | developers.facebook.com | `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, verified templates later |
| 8 | Africa's Talking account (sandbox) | africastalking.com | `AT_USERNAME`, `AT_API_KEY` |
| 9 | KRA eTIMS taxpayer sandbox signup under Total Man PIN; register 1 VSCU + 1 OSCU test device | etims sandbox portal | `ETIMS_TIN`, `ETIMS_BHF_ID`, `ETIMS_DEVICE_SERIAL`, `ETIMS_CMC_KEY` (per spec), sandbox base URL |
| 10 | Sentry org + 2 projects (mobile, web) | sentry.io | DSNs |
| 11 | Domain (e.g. `logiqduka.co.ke`) + DNS on Vercel | KeNIC registrar | Domain |
| 12 | Buy test kit: 2GB-RAM Android, BT thermal printer (58mm ESC/POS), BT HID scanner | local | Physical QA |
| 13 | ODPC data controller registration (parallel, non-blocking) | odpc.go.ke | Cert no. for privacy policy |

---

# 24. Repository Structure (Monorepo)

```
logiq-duka/
├── CLAUDE.md                  # Claude Code instructions (seed in §31)
├── PRD.md                     # THIS FILE — single source of truth
├── package.json               # pnpm workspaces + turborepo
├── turbo.json
├── apps/
│   ├── mobile/                # Expo React Native POS (Android-first)
│   │   ├── app/               # expo-router screens (inventory §27.1)
│   │   ├── src/
│   │   │   ├── db/            # SQLite schema, migrations, DAOs
│   │   │   ├── sync/          # event log, push/pull engine (§28)
│   │   │   ├── features/      # sell/, stock/, deni/, money/, reports/, settings/
│   │   │   ├── peripherals/   # camera-scan/, companion-scanner/, print-relay/, bt-printer/ (escpos)
│   │   │   ├── i18n/          # en.json, sw.json (full parity enforced by test)
│   │   │   └── ui/            # design system components
│   │   └── e2e/               # Maestro flows
│   └── web/                   # Next.js 14 App Router (dashboard now, PWA POS in Phase 2)
│       ├── app/(marketing)/   # landing, pricing (Swahili/English)
│       ├── app/(dashboard)/   # owner console (inventory §27.2)
│       └── app/(admin)/       # Total Man internal: tenants, subs, fiscal queue health
├── packages/
│   ├── shared/                # TS types, zod schemas, money/qty utils, event definitions
│   ├── catalog-templates/     # JSON seed catalogs: duka, butchery, agrovet, supa, wines, hardware, cereals
│   └── receipts/              # receipt render (ESC/POS bytes + HTML + WhatsApp text) — one source, three outputs
├── supabase/
│   ├── migrations/            # SQL migrations (schema §26)
│   ├── functions/             # Edge Functions (inventory §27.3)
│   ├── seed.sql
│   └── tests/                 # pgTAP RLS tests
└── services/
    └── etims/                 # Node/TS fiscalisation worker (deployable as Edge Fn or Fly/Railway if long-running needed)
```

**Stack pins:** pnpm, TypeScript strict, Expo SDK (latest stable), expo-sqlite, expo-router, expo-camera + ML Kit barcode, zustand (app state), react-hook-form + zod, Next.js 14+, Tailwind + shadcn/ui (web), Supabase JS v2, Vitest (unit), pgTAP (RLS), Maestro (mobile e2e), Playwright (web e2e).

---

# 25. Environment Variables (complete)

```
# apps/web (.env.local) + Vercel
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only
NEXT_PUBLIC_APP_URL=
SENTRY_DSN_WEB=

# apps/mobile (app.config.ts extra / EAS secrets)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_RECEIPT_BASE_URL=       # hosted receipt pages
SENTRY_DSN_MOBILE=

# supabase functions / services (Supabase Vault or fn secrets — NEVER in client)
DARAJA_ENV=sandbox|production
DARAJA_CONSUMER_KEY=  DARAJA_CONSUMER_SECRET=
DARAJA_BILLING_SHORTCODE=  DARAJA_BILLING_PASSKEY=   # our subscription till
DARAJA_CALLBACK_SECRET=             # HMAC on callback URLs
WA_ACCESS_TOKEN=  WA_PHONE_NUMBER_ID=  WA_VERIFY_TOKEN=
AT_USERNAME=  AT_API_KEY=
ETIMS_ENV=sandbox|production
ETIMS_BASE_URL=  ETIMS_TIN=  ETIMS_BHF_ID=  ETIMS_DEVICE_SERIAL=  ETIMS_CMC_KEY=
RECEIPT_SIGNING_SECRET=             # signed receipt-page URLs
```

Per-tenant Daraja credentials (their own till) live encrypted in `tenant_integrations`, not env.

---

# 26. Database Schema Specification (Supabase / Postgres)

Conventions: `uuid` PKs (UUIDv7 client-generatable); `tenant_id uuid not null` on every tenant table; `created_at/updated_at timestamptz`; `created_by uuid`, `device_id uuid`; soft delete via `deleted_at`; money as `bigint` cents; quantities `numeric(14,3)` in base units. **RLS enabled on every table; policies: tenant isolation via JWT `tenant_id` claim + role checks via `role` claim. Service-role bypass only in Edge Functions.**

Core tables (columns beyond conventions):

- `tenants` (name, business_type enum[duka|butchery|agrovet|supa|wines|hardware|cereals], kra_pin, vat_registered bool, till_number, paybill, phone, plan enum[msingi|biashara|kampuni], plan_status enum[trial|active|grace|lapsed], trial_ends_at, settings jsonb)
- `branches` (tenant_id, name, is_main, etims_bhf_id)
- `devices` (tenant_id, branch_id, name, platform, approved bool, revoked_at, last_sync_at, push_token)
- `users` (tenant_id, phone, full_name, role enum[owner|manager|attendant|accountant], pin_hash, active)
- `products` (tenant_id, name, name_sw, category_id, unit enum, base_unit, sell_price_cents, buy_price_cents_avg, wholesale_price_cents, min_price_cents, vat_class enum[vat16|zero|exempt], reorder_level, reorder_qty, track_batches bool, is_weight_item bool, kg_price_cents, parent_product_id (repack), conversion_factor, image_path, active)
- `barcodes` (product_id, code, unique(tenant_id, code))
- `batches` (product_id, batch_no, expiry_date, qty_in, supplier_id, grn_line_id)
- `price_board_entries` (tenant_id, product_id, kg_price_cents, effective_from, set_by)
- `customers` (tenant_id, name, phone, id_number, photo_path, credit_limit_cents, notes, opt_out_reminders bool)
- `customer_transactions` (customer_id, type enum[charge|payment|adjustment], amount_cents, sale_id, payment_method, mpesa_ref, balance_after_cents, due_date, note)
- `suppliers` (tenant_id, name, phone, kra_pin, balance_cents)
- `purchase_orders` (supplier_id, status enum[draft|sent|partial|received|closed], expected_date) / `po_lines` (product_id, qty, unit_cost_cents)
- `grns` (po_id nullable, supplier_id, ref, received_at) / `grn_lines` (product_id, qty, unit_cost_cents, batch_no, expiry_date)
- `sales` (tenant_id, branch_id, receipt_no bigint per-tenant sequence, status enum[completed|voided|refunded|parked], sold_by, customer_id nullable, subtotal_cents, discount_cents, vat_cents, total_cents, parked_label)
- `sale_lines` (sale_id, product_id, batch_id, qty, unit, weight_kg, unit_price_cents, line_total_cents, vat_class, vat_cents, is_deni_priced bool)
- `payments` (sale_id nullable, customer_id nullable, tender enum[cash|mpesa_stk|mpesa_manual|bank|card_ext|deni], amount_cents, mpesa_ref, mpesa_phone, matched bool, matched_by)
- `stock_movements` (tenant_id, branch_id, product_id, batch_id, type enum[sale|purchase|return|adjust|repack_in|repack_out|transfer_in|transfer_out|expiry|stock_take], qty_delta, unit_cost_cents, reason_code, ref_table, ref_id) — **single source of truth for stock**
- `stock_levels` (materialized per product/branch: qty, valuation_cents; refreshed by trigger on movements)
- `carcass_intakes` (tenant_id, supplier_id, animal enum, hanging_weight_kg, cost_per_kg_cents, date) + view `carcass_yield` (kg_sold vs intake)
- `regulated_sales` (sale_line_id, buyer_name, buyer_phone, buyer_id_no, product_id)
- `expenses` (tenant_id, category enum, amount_cents, note, photo_path, incurred_at)
- `cash_movements` (tenant_id, branch_id, shift_id, type enum[opening_float|cash_in|cash_out|drop|closing_count], amount_cents, reason)
- `shifts` (branch_id, opened_by, opened_at, closed_at, expected_cash_cents, counted_cash_cents, variance_cents)
- `day_closes` (tenant_id, branch_id, business_date, totals jsonb, variance_cents, closed_by, whatsapp_sent bool)
- `fiscal_documents` (sale_id, direction enum[invoice|credit_note], status enum[queued|submitted|signed|failed|not_required], kra_invoice_no, kra_qr_payload, signed_at, payload jsonb, error, attempts)
- `events` (tenant_id, device_id, event_id uuid unique, type text, aggregate text, aggregate_id uuid, payload jsonb, client_ts, server_ts, applied bool) — partitioned by month
- `subscriptions` (tenant_id, plan, period_start, period_end, amount_cents, status, mpesa_ref, stk_request_id)
- `tenant_integrations` (tenant_id, kind enum[daraja_c2b], shortcode, encrypted_credentials, status)
- `message_log` (tenant_id, channel enum[whatsapp|sms], template, to_phone, cost_cents, status, ref)
- `audit_log` (tenant_id, user_id, action, entity, entity_id, before jsonb, after jsonb)
- `sms_wallets` (tenant_id, balance_cents) + `sms_wallet_topups`

Plan-limit enforcement: `plan_limits` reference table (plan → max_devices, max_users, max_products, max_branches) checked in RLS-adjacent policies/functions and mirrored client-side.

Mobile SQLite mirrors the tenant's slice of: products, barcodes, batches, customers, customer_transactions, sales(+lines,payments), stock_movements, stock_levels, price_board, users(pins), settings, pending events.

---

# 27. Build Inventories

## 27.1 Mobile screens (expo-router)

Auth/Onboarding: `phone-entry → otp → business-setup (type, name, KRA PIN optional) → catalog-template-load → first-sale-tutorial`
Sell: `sell/index (grid+search+cart)`, `sell/scan`, `sell/weight-entry`, `sell/tender`, `sell/parked`, `sell/receipt-result`
Stock: `stock/index (levels+alerts)`, `stock/product-form`, `stock/adjust`, `stock/stock-take`, `stock/repack`, `stock/batches`, `stock/reorder-suggestions`
Deni: `deni/index (dashboard+aging)`, `deni/customer/[id] (statement+pay)`, `deni/customer-form`, `deni/reminders`
Money: `money/index`, `money/expenses`, `money/mpesa-inbox (unmatched)`, `money/funga-siku`
Butchery: `nyama/price-board`, `nyama/carcass-intake`, `nyama/yield`
Agrovet: `agro/expiring`, `agro/regulated-register`
Reports: `reports/index`, `reports/[report]` (sales, profit, dead-stock, attendant, shrinkage)
Suppliers (Biashara+): `suppliers/index`, `suppliers/po`, `suppliers/grn`
Settings: `settings/business`, `settings/receipt`, `settings/users`, `settings/devices`, `settings/peripherals (printer relay, companion scanner pair)`, `settings/subscription`, `settings/language`, `settings/sync-health`
Companion mode: `companion/pair (scan QR)`, `companion/scanner`

## 27.2 Web (dashboard) pages

Marketing: landing, pricing, help. Dashboard: overview (today/week KPIs), products (bulk edit, CSV import), deni, reports (+exports), suppliers, staff, branches (Kampuni), settings, subscription/billing, fiscal-health (eTIMS backlog). Admin (internal): tenant list, plan management, fiscal queue monitor, message costs, churn dashboard.

## 27.3 Supabase Edge Functions

`sync-push` (ingest event batch, idempotent, apply reducers) · `sync-pull` (changes since cursor) · `daraja-stk-initiate` · `daraja-stk-callback` · `daraja-c2b-validate` · `daraja-c2b-confirm` (match engine) · `billing-charge` (monthly STK + dunning cron) · `etims-enqueue` (trigger) · `etims-worker` (queue consumer → KRA submit → store signature; cron every 1min) · `wa-send` (template send + log + wallet debit) · `wa-webhook` (delivery status, opt-out) · `sms-send` · `receipt-page` (signed URL HTML receipt) · `digest-wiki-yako` (Sunday cron) · `digest-funga-siku` (on day_close) · `reorder-suggest` (nightly velocity calc) · `print-relay` (Realtime channel auth) · `export-accountant-pack` · `tenant-export` / `tenant-delete` (DPA)

---

# 28. Sync Engine — Implementation Spec (build this first, test hardest)

**Event types (v1):** `sale.completed`, `sale.voided`, `sale.parked`, `sale.unparked`, `payment.recorded`, `payment.matched`, `deni.charged`, `deni.paid`, `customer.upserted`, `product.upserted`, `price_board.set`, `stock.adjusted`, `stock.repacked`, `stock.take_line`, `grn.received`, `expense.recorded`, `cash.moved`, `shift.opened`, `shift.closed`, `day.closed`, `user.upserted`, `settings.changed`.

**Client algorithm:**
1. Every mutation = write domain rows locally in a SQLite transaction **and** append event row (UUIDv7 id, type, payload, client_ts, seq).
2. Background pusher: batch ≤200 events → `sync-push`; on 200 OK mark synced; on partial failure, server returns per-event status; retry with exponential backoff; events never deleted until acked.
3. Puller: `sync-pull?cursor=server_ts` → apply remote events through the same reducers used locally (one reducer codebase in `packages/shared`); update cursor.
4. Stock is NEVER stored-then-synced as a quantity; reducers fold movements → `stock_levels` deterministically on both sides.
5. Conflicts: scalar entity fields LWW by server_ts with audit trail; monetary/stock = append-only (no conflict class exists).
6. Receipt numbers: per-device prefix (`D3-000481`) offline; tenant-global `receipt_no` assigned server-side on ingest; both printed where relevant.

**Server ingest:** idempotency on `event_id`; per-tenant advisory lock per aggregate for ordered apply; reducer failures → event flagged `applied=false` + Sentry + admin fiscal-health style surface (never silently dropped).

**Definition of done:** property-based test suite (fast-check) proving: any interleaving of N devices' event streams converges to identical stock/balance state; kill-app-mid-sale loses nothing; 500 queued events sync <60s on throttled 3G profile; airplane-mode soak test 72h passes.

---

# 29. Integration Specs

## 29.1 Daraja
- STK: `POST /mpesa/stkpush/v1/processrequest` with tenant creds (or ours for billing); store `CheckoutRequestID` on payment row; callback validates HMAC path secret → mark paid; timeout job flips to `failed` after 90s → UI offers manual-match.
- C2B: register validate/confirm URLs per tenant shortcode on onboarding of their till; confirm handler match order: exact amount+phone within 10min → amount within 10min → inbox.
- Reconciliation cron: daily compare payments vs confirmations → discrepancies into Funga Siku payload.

## 29.2 eTIMS (VSCU-primary)
- Worker per queued `fiscal_documents`: build payload per VSCU v2.0 spec (items with itemCd/classification per KRA item registration, tax breakdown by class, buyer PIN optional), submit, persist KRA invoice no + signature + QR payload; retries: 5x backoff then `failed` + alert; credit notes reference original KRA invoice no; item & branch registration endpoints called on product/branch create for VAT tenants.
- Receipt renderer appends KRA QR + fiscal no when `signed`; prints "PROVISIONAL — fiscal copy to follow" when sale made offline and doc still queued; re-print available once signed.
- Sandbox conformance checklist mirrored from spec into `services/etims/CONFORMANCE.md`; certification pack docs generated from architecture section of this PRD.

## 29.3 WhatsApp/SMS
- Templates (submit for approval Week 2): `receipt`, `deni_reminder`, `funga_siku`, `wiki_yako`, `low_stock_digest`, `trial_ending`, `payment_received` — each in en + sw.
- Wallet debit per SMS at AT cost + 0 margin (v1); WhatsApp utility within fair-use counter per tenant.

---

# 30. Milestones, Order of Work & Acceptance Criteria

| M | Weeks | Deliverable | Acceptance ("done" =) |
|---|---|---|---|
| M0 | 1–2 | Monorepo scaffold, CI (typecheck/test/build), Supabase schema + RLS + pgTAP, shared types/reducers | All RLS tests pass incl. cross-tenant denial; CI green |
| M1 | 3–5 | **Sync engine** + local DB + auth (phone OTP, PIN users, device approval) | §28 definition-of-done suite passes on low-end device |
| M2 | 6–8 | Sell module complete (grid, search, camera scan, weight mode, tenders cash+deni, parked, receipts digital, returns) + Stock core (products, movements, adjust, low-stock) + catalog templates | 8s sale test on 2GB device; 20-shop catalog templates load <10s |
| M3 | 9–10 | Deni module full + Money (expenses, cash, Funga Siku) + Daraja STK + manual match + inbox | End-to-end sandbox STK sale; Funga Siku WhatsApp delivered |
| M4 | 11–12 | Subscription billing (trial→STK→grace→read-only), web dashboard v1 (overview, products, deni, reports), butchery pack (price board, intake, yield) | Full trial→paid lifecycle in sandbox; owner edits price on web, till updates via pull |
| M5 | 13–14 | eTIMS sandbox integration complete (invoice, CN, item/branch reg, offline queue) + fiscal-health surfaces | Sandbox conformance checklist 100%; provisional→fiscal receipt flow works offline→online |
| **MVP GATE** | 14 | Pilot build to 20 shops (Play internal track) | Exit criteria §17 pilot |
| M6 | 15–18 | Biashara: batches/expiry, agrovet pack, suppliers/PO/GRN, shifts, automated reminders, Wiki Yako | — |
| M7 | 19–24 | Kampuni: multi-till, Print Relay multi-till, Companion Scanner, desktop PWA POS, multi-branch, exports | — |

Order rule for Claude Code: **schema → reducers/shared → sync → sell → money → billing → eTIMS**. Nothing UI-polish before M1 passes.

---

# 31. CLAUDE.md Seed (place at repo root)

```md
# LogiQ Duka — Claude Code Instructions
- PRD.md is the single source of truth. When ambiguous, follow PRD §; if truly unspecified, choose the simplest option consistent with §5.3 product principles and note it in DECISIONS.md.
- NEVER: store stock as a settable quantity (movements only, §26); put secrets in client code; create a table without RLS + pgTAP test; add a peripheral beyond §11.4; add English strings without Swahili pair.
- ALWAYS: money in bigint cents; UUIDv7 ids; reducers live in packages/shared and run identically client/server; every event type has a property-based convergence test; every screen works offline.
- Testing gates: `pnpm test` + pgTAP + Maestro smoke must pass before any milestone is called done.
- Build order per PRD §30. Do not start a milestone early.
- Commit style: conventional commits; small PRs per feature folder.
```

---

# 32. Non-Code Checklist Before Pilot (founder)

WhatsApp templates approved · Daraja production app + our billing till live · Play internal track approved · Privacy policy (en/sw) published + ODPC ref · eTIMS certification pack submitted · 20 pilot shops signed with WhatsApp group created · Test kit devices verified against M2/M5 acceptance runs · Support macros (sw/en) drafted · Pricing page live.

*End of Part B. This document is now sufficient input for Claude Code: paste as PRD.md, create CLAUDE.md from §31, complete §23 runbook, and begin M0.*
