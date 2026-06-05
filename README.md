<!-- Language Navigation -->
<div align="center">

[English](#english)

</div>

---

<a name="english"></a>

# Run Real Estate Deal Economics Before the Spreadsheet Opens

<div align="center">

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Platform](https://img.shields.io/badge/platform-Browser%20HTML-orange)
![Type](https://img.shields.io/badge/type-Real%20Estate%20Financial%20Model-004B87)

**Built for acquisition analysts and investment teams who need to pressure-test parametric deal logic — IRR, peak equity, VAT timing, amortization profiles, scenario sensitivity — without opening or distributing a locked Excel file.**

[Live Demo](https://your-demo-link-here) | [Full Excel Model](https://your-purchase-link-here)

</div>

A self-contained browser application that replicates the full 121-month calculation engine of a parametric real estate financial model — including three amortization types, VAT offset logic, S-curve capex distribution, and live XIRR — with no backend, no installation, and no file upload.

---

## Quick Preview

> 🌐 **Interactive Demo:** [RE Financial Model Live](https://your-demo-link-here)

## Why This Exists

Most real estate deal analysis errors are not caused by bad financial judgment.

They happen because amortization chains, VAT offset timing, scenario multiplier dependencies, and exit cash flow construction are difficult to isolate and verify inside a large Excel file.

### 🔴 The Traditional Error-Prone Workflow

```
Model opened in Excel
 └── ➡️ Input changed
      └── ➡️ Dependent formula chain not visible
           └── ➡️ Assumption tested without knowing what broke upstream
                └── ❌ Error discovered after commitment
```

### 🟢 The Verification Workflow with This Tool

```
Deal parameters entered in browser
 └── ➡️ 121-month calculation runs in real-time
      └── ➡️ All engines visible simultaneously: Capex, VAT, Revenue, Debt, NCF
           └── 🔍 Scenario, sensitivity, and exit logic tested before Excel opens
```

The commercial problem is not only computational. It is review speed and stakeholder legibility.

* **The Bottleneck:** A model that can only be interrogated by its original builder.

* **The Solution:** A demo that runs in a browser converts that bottleneck into a shareable, auditable artifact.

## Three Calculation Errors That Catch Real Estate Analysts

> [!WARNING]
>
> ### Trap 1 — Exit proceeds modeled without the simultaneous loan payoff
>
> A deal showing an $\$8\text{M}$ sale at month $36$ looks entirely different when the outstanding mortgage balance is subtracted in the same cash flow period.
>
> On a $\$5\text{M}$ acquisition at $65\%\text{ LTV}$ with $60\text{-month}$ French amortization at $4.5\%$, the outstanding balance at month $36$ is approximately $\$2.3\text{M}$. The net cash flow to equity at exit is not $\$8\text{M}$. It is $\$8\text{M}$ minus $\$2.3\text{M}$ minus that month's scheduled interest and principal payment.
>
> Analysts who enter exit proceeds as a standalone revenue line — without modeling the simultaneous payoff as an outflow in the same `NET_CASH_FLOW_LEVERED` period — overstate equity IRR and understate peak equity requirement.
>
> **The Correct Mathematical Construction:**
> 
> $$
> \text{NCF}_{\text{exit}} = \text{SALE\_PROCEEDS} - \text{MORTGAGE\_INTEREST\_PMT}_{\text{exit}} - \text{MORTGAGE\_PRINCIPAL\_PMT}_{\text{exit}} - \text{LOAN\_BALANCE}_{\text{exit}} \quad \leftarrow \text{This line is the trap!}
> $$

> [!WARNING]
>
> ### Trap 2 — VAT cash flows netted at the wrong period
>
> Construction VAT is paid monthly on invoiced works. The refund arrives from the tax authority after a configurable lag — commonly $6\text{ months}$. Analysts who net VAT in the period it is paid, or who omit the lag entirely, misstate peak equity requirement by the full VAT balance outstanding during the lag window.
>
> On a $\$2\text{M}$ capex budget at $20\%\text{ VAT}$ with a $6\text{-month}$ refund lag:
>
> | Period | VAT Paid | VAT Refund Received | Net Cash Position Error (If Netted Instantly) | 
>  | ----- | ----- | ----- | ----- | 
> | **Month 1** | $\approx \$13\text{K}$ | $\$0$ | $(\$13\text{K})$ understated outflow | 
> | **Month 6** | $\approx \$35\text{K}$ | $\$0$ | $(\$35\text{K})$ understated outflow | 
> | **Month 7** | $\approx \$40\text{K}$ | $\$13\text{K}$ | Refund arrives; float starts unwinding | 
> | **Peak Float** | — | — | $\approx \$350\text{K} - \$400\text{K}$ outstanding | 
>
> Extra outstanding capital of $\$400,000$ is the difference between a deal that fits within an equity budget and one that requires an emergency revolving draw.

> [!WARNING]
>
> ### Trap 3 — Scenario analysis performed as IRR arithmetic instead of cash flow recalculation
>
> Scenario analysis is not a post-model adjustment applied to a base IRR.
>
> When a downside capex multiplier of $1.20\times$ is active, the correct method runs the full $121\text{-period}$ cash flow with the adjusted input and derives IRR from that new series.
>
> Analysts who instead apply a percentage haircut to the base IRR — *"20% cost overrun means roughly 20% lower IRR"* — are compressing a nonlinear cash flow problem into a linear rate adjustment. **The relationship is not proportional.**
>
> * Higher capex increases equity invested.
>
> * Lengthens the construction drawdown period.
>
> * Increases VAT float.
>
> * Reduces the exit equity multiple simultaneously.
>
> The IRR impact is always larger than a proportional adjustment implies. The correct method requires full recalculation. This demo runs it in under $50\text{ms}$.

## Who This Tool Is For

| User Profile | Practical Use Case | 
 | ----- | ----- | 
| **Acquisition Analysts** | Pressure-test deal assumptions before submitting an offer | 
| **Investment Committee** | Demonstrate calculation logic live in a browser without distributing the Excel file | 
| **Portfolio Managers** | Compare scenario outcomes across deal strategies without rebuilding models | 
| **Junior Modelers** | Learn how French, Italian, and Bullet amortization produce different cash flow profiles under identical LTV and tenor inputs | 
| **Technical Reviewers** | Audit formula logic and named range architecture before relying on the Excel version | 
| **Deal Sponsors** | Show LP co-investors how exit IRR changes under capex and revenue stress — in a meeting, in real time | 

> *Best suited for teams running single-asset analysis where model logic needs to be communicated, reviewed, or stress-tested outside the Excel environment.*

## What The Model Calculates

### 📐 Capex Engine

* Monthly capex distributed across a configurable construction window via **S-curve weighting**.

* Retention withheld at a user-defined rate per period, released in full at a single designated month (`RETENTION_RELEASE_MONTH`).

* Net capex paid per period accounts for both the withholding and the release event.

### 💸 VAT Engine

* Monthly VAT paid on net capex:
  
  $$
  \text{VAT}_{\text{paid}} = \text{NET\_CAPEX\_PAID} \times \text{VAT\_RATE\_CAPEX}
  $$

* Refund received after configurable lag ($0 - 12\text{ months}$), implemented via `INDEX` offset into the historical VAT paid array.

* Cash flow impact is period-accurate, not period-netted.

### 🏢 Sales and Revenue Engine

* **Five deal strategies:** Outright, Light Refurb, Full Development, Buy-to-Rent, Joint Venture (hook only).

* Buy-to-Rent rental revenue scales by occupancy, annual rent inflation compounded by year, and an active scenario multiplier.

* Exit proceeds fire at `TARGET_EXIT_MONTH`, calculated as direct sale price or:
  
  $$
  \text{Exit Proceeds} = \frac{\text{NOI}}{\text{EXIT\_CAP\_RATE}} \quad \text{(for Buy-to-Rent)}
  $$

### 📊 Debt Engine

Three amortization types implemented via `IFS` switch logic — no separate formula branches:

* **French:** Constant total payment; interest front-loaded; principal component increases each period.

* **Italian:** Constant principal payment; interest declines on outstanding balance; total payment declines.

* **Bullet:** Interest-only throughout; full principal repayment at maturity in a single period.

*All three types produce the same loan balance dependency chain. Exit month includes remaining outstanding balance in the net cash flow calculation.*

### 📈 Net Cash Flow (Levered)

* Single $121\text{-period}$ series.

* **Period 0:** Mortgage drawdown minus acquisition cost and transfer tax.

* **Periods 1–120:** Net revenue plus VAT refund, minus net capex, VAT paid, interest, principal, and exit payoff at `TARGET_EXIT_MONTH`.

### 🧮 XIRR

* Newton-Raphson, $300\text{ iterations}$, tolerance $1 \times 10^{-9}$.

* Monthly time fractions ($i/12$).

* Returns "—" gracefully when no convergent root exists in the valid range.

### 🔲 Sensitivity Matrix

* $5 \times 5$ live recalculation.

* Exit value and capex budget each varied across five multipliers ($-30\%$ to $+30\%$).

* $25$ full model passes per render.

* **IRR threshold coloring:** Green above $15\%$, red below $8\%$, base case cell outlined.

## Example Scenario

### 📋 Deal Profile

* **Strategy:** Full Development

* **Acquisition:** $\$5\text{M}$ at $4\%$ transfer tax

* **Capex:** $\$2\text{M}$ construction over $24\text{ months}$ (S-curve)

* **Debt:** $65\%\text{ LTV}$, French amortization, $4.5\%$ annual interest, $60\text{-month}$ tenor

* **Exit:** Sale at month $36$ for $\$8\text{M}$

* **VAT:** $20\%$ on capex, $6\text{-month}$ refund lag

| Metrics Comparison | Base Case | Downside ($1.20\times$ Capex, $0.85\times$ Exit Value) | 
 | ----- | ----- | ----- | 
| **Effective Capex** | $\$2.0\text{M}$ | $\$2.4\text{M}$ | 
| **Exit Proceeds** | $\$8.0\text{M}$ | $\$6.8\text{M}$ | 
| **VAT Float at Peak** | $\approx \$370\text{K}$ | $\approx \$444\text{K}$ | 
| **Loan Balance at Exit** | $\approx \$2.3\text{M}$ | $\approx \$2.3\text{M}$ | 
| **Net Exit NCF to Equity** | $\approx \$5.5\text{M}$ | $\approx \$4.3\text{M}$ | 
| **Equity IRR Direction** | — | **Materially lower**; not proportional to capex change | 

> [!NOTE]
> The downside is not $20\%$ worse because capex increased $20\%$. It is worse by a larger margin because equity invested increases, VAT float increases, and exit proceeds decrease simultaneously. The compounding effect is only visible through full cash flow recalculation — not through rate arithmetic.

## Why Parametric Models Work This Way

A financial model that requires manual cell edits for every scenario test is a calculator with extra steps. Parametric design separates three concerns:

```
 ├── ⚙️ Structure  --> The fixed formula chain converting inputs into outputs.
 │                     (Modifying CAPEX_TOTAL_BUDGET changes the input, never the formula)
 │
 ├── 📊 Parameters --> Named, discrete inputs linked to the calculation chain.
 │                     (e.g., ACQUISITION_COST, RETENTION_RATE, VAT_REFUND_LAG, DEBT_AMORTIZATION_TYPE)
 │
 └── 📑 Scenarios  --> Multiplier overlays applied to base parameters through a lookup matrix.
                       (Changing ACTIVE_SCENARIO updates multiple parameters instantly via INDEX)
```

**The Practical Consequence:** Any analyst can stress-test the model without understanding its internal structure. Any reviewer can audit the structure without running scenarios. The two concerns are independent by design.

## How The Calculation Chain Works

The model runs a single forward pass through $121\text{ monthly}$ periods. Each period depends only on the period immediately preceding it. **There are no circular references.**

| Period Timeframe | Dependencies | Calculation Event | 
 | ----- | ----- | ----- | 
| $t = 0$ | Named input ranges only | Acquisition outflow; mortgage drawdown | 
| $t = 1$ | $t = 0$ loan balance | First interest; first principal; first capex tranche; VAT paid | 
| $t = \text{VAT\_REFUND\_LAG}$ | $t = 0$ VAT paid | First VAT refund received | 
| $t = \text{RETENTION\_RELEASE\_MONTH}$ | All prior capex rows | Full accrued retention released in single event | 
| $t = \text{TARGET\_EXIT\_MONTH}$ | $t - 1$ loan balance | Sale proceeds; loan payoff; single NCF period | 
| $t = \text{DEBT\_TENOR\_MONTHS}$ | Prior balance | Final scheduled principal (or bullet repayment) | 

*The chain resolves without iteration because each row references only prior rows — never forward or lateral dependencies.*

### Amortization Profile Comparison

| Type | Principal per Period | Interest per Period | Balance Trajectory | 
 | ----- | ----- | ----- | ----- | 
| **French** | Increasing | Decreasing | Smooth convex decline to zero | 
| **Italian** | Constant | Decreasing | Linear decline to zero | 
| **Bullet** | Zero until maturity | Constant on initial balance | Flat until single terminal drop | 

*All three types produce a loan balance that reaches zero at `DEBT_TENOR_MONTHS` under scheduled amortization, or at `TARGET_EXIT_MONTH` under early exit payoff — whichever comes first.*

## Model Logic

The four-tab architecture mirrors the Excel workbook directly:

* **📂 01 Setup:** Select deal strategy (five types) and active scenario ($1 - 3$). Live multipliers update from the scenario matrix via `INDEX` lookup. Changing active scenario recalculates the entire model instantly.

* **📂 02 Assumptions:** Enter all named parameters. Input fields highlighted in yellow. Named range annotations display the corresponding Excel defined name for each field.

* **📂 03 Calc Engine:** Review $48\text{-month}$ calculation table. All engines displayed simultaneously: Capex, VAT, Revenue, Debt, Net Cash Flow. Revolving Credit rows are marked as placeholders — that engine requires Excel 365 `SCAN`/`REDUCE` and is not implemented in this demo.

* **📂 04 Dashboard:** Five KPI tiles (Equity IRR, Project IRR, Equity Multiple, Peak Equity, Deal Strategy). $121\text{-month}$ SVG cash flow chart with monthly bar series and cumulative line. Live $5 \times 5$ sensitivity matrix.

> *No file upload. No account required. No backend. Runs entirely in the browser from a single HTML file.*

## Get The Excel File

The complete Excel workbook contains all $32\text{ named ranges}$, full formula architecture across $4\text{ sheets}$, and $121\text{-month}$ per-column formula chains for every calculation row.

👉 [Download the complete Excel model →](https://your-purchase-link-here)

## Limitations

* **Revolving credit not implemented:** The `SCAN`/`REDUCE` revolving credit engine is a placeholder; NCF reflects pre-revolving cash flows only; peak equity and IRR will differ from the Excel version once that engine is built.

* **Project IRR is approximate:** Unlevered IRR is estimated by adding back interest, principal, and exit payoff to levered NCF; a precise unlevered calculation requires a separate `UNLEVERED_NCF` row not present in this demo.

* **XIRR convergence:** Newton-Raphson initializes at $15\%$; cash flow patterns with IRR outside approximately $0 - 100\%$ may return "—" without a second attempt from an alternative starting point.

* **Capex distribution is automatic:** The demo generates an S-curve between configurable start and end months; the Excel workbook accepts a full $120\text{-cell}$ manual distribution; edge-weighted curves will produce different results.

* **JV waterfall not encoded:** Phase 2 Joint Venture logic (LP/GP splits, preferred return hurdles, promote tiers) is present as input placeholders but produces no calculation output.

* **Single asset only:** Portfolio aggregation, multi-tranche debt structures, and cross-asset waterfall calculations are not supported.

* **Tax treatment is generic:** No jurisdiction-specific capital gains, depreciation recapture, or transfer tax schedules beyond the single flat acquisition tax rate input.

* **Excel formula parity:** This demo replicates calculation logic, not Excel formula syntax; minor floating-point differences from the Excel workbook are expected on edge inputs.

## About This Project

This demo is part of a broader effort to make financial model architecture visible, auditable, and independent of the original builder's environment.

Most parametric real estate models live in a single analyst's Excel file. The logic is correct. The formulas work. But the model cannot be reviewed without the file, cannot be demonstrated without screen-sharing, and cannot be stress-tested by anyone who did not build it.

**The goal here is different:** take the same calculation logic — XIRR, amortization chains, VAT engines, scenario matrices, sensitivity tables — and run it in a browser with no dependencies.

*Not as a replacement for Excel. As a layer that makes the Excel model reviewable, presentable, and interrogable before anyone opens the workbook.*

If your work involves financial models, compliance calculations, or scheduling logic that currently live in someone's head or a disconnected spreadsheet:

👉 [See what else is available →](https://your-portfolio-link-here)

## License

Distributed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
