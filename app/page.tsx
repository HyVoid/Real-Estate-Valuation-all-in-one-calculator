'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Settings, 
  Database, 
  SlidersHorizontal, 
  RefreshCw, 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight, 
  Sliders, 
  TrendingUp, 
  DollarSign, 
  FileSpreadsheet, 
  Calendar,
  Layers,
  HelpCircle
} from 'lucide-react';

// Define Interfaces for our Financial Model
interface ModelInputs {
  // Acquisition
  acquisitionCost: number;
  acquisitionTaxRate: number; // e.g. 0.04 for 4%
  
  // Capex
  capexTotalBudget: number;
  capexStartMonth: number;
  capexDurationMonths: number;
  retentionRate: number; // e.g. 0.05
  retentionReleaseMonth: number;
  
  // VAT
  vatRateCapex: number;
  vatRateSales: number;
  vatRefundLag: number;
  
  // Debt
  ltvRatio: number;
  debtAmortizationType: 1 | 2 | 3; // 1: French, 2: Italian, 3: Bullet
  debtInterestRate: number;
  debtTenorMonths: number;
  revolvingLimit: number;
  revolvingInterestRate: number;
  
  // Rent
  monthlyGrossRent: number;
  rentalOpexPercent: number;
  rentInflationRate: number;
  
  // Exit
  targetExitMonth: number;
  exitCapRate: number;
  exitSaleValue: number;

  // JV Waterfall
  gpInvestmentShare: number;
  lpInvestmentShare: number;
  hurdle1Irr: number;
  hurdle1Promote: number;
  hurdle2Irr: number;
  hurdle2Promote: number;
}

type ScenarioType = 'base' | 'optimistic' | 'pessimistic';

interface ScenarioMatrix {
  base: ModelInputs;
  optimistic: ModelInputs;
  pessimistic: ModelInputs;
}

// 5 Deal Strategies defined in prompt
interface DealStrategy {
  id: number;
  name: string;
  description: string;
  defaultExitMonth: number;
}

const DEAL_STRATEGIES: DealStrategy[] = [
  { id: 1, name: 'Outright', description: 'Acquisition & fast resale without refurbishment.', defaultExitMonth: 12 },
  { id: 2, name: 'Light Refurbishment', description: 'Acquisition, light subdivision work & fast resale.', defaultExitMonth: 18 },
  { id: 3, name: 'Full Development', description: 'Acquisition, major construction works & eventual resale.', defaultExitMonth: 24 },
  { id: 4, name: 'Buy-to-Rent', description: 'Acquisition, construction, long-term rental income & refinancing/exit.', defaultExitMonth: 60 },
  { id: 5, name: 'Joint Venture', description: 'Levered project utilizing asymmetric GP/LP equity hurdle waterfall split.', defaultExitMonth: 60 },
];

const DEFAULT_BASE_INPUTS: ModelInputs = {
  acquisitionCost: 1500000,
  acquisitionTaxRate: 0.04,
  capexTotalBudget: 400000,
  capexStartMonth: 1,
  capexDurationMonths: 12,
  retentionRate: 0.05,
  retentionReleaseMonth: 24,
  vatRateCapex: 0.10,
  vatRateSales: 0.22,
  vatRefundLag: 6,
  ltvRatio: 0.60,
  debtAmortizationType: 1, // French
  debtInterestRate: 0.045,
  debtTenorMonths: 120,
  revolvingLimit: 100000,
  revolvingInterestRate: 0.06,
  monthlyGrossRent: 12000,
  rentalOpexPercent: 0.15,
  rentInflationRate: 0.02,
  targetExitMonth: 36,
  exitCapRate: 0.06,
  exitSaleValue: 2400000,
  gpInvestmentShare: 0.10,
  lpInvestmentShare: 0.90,
  hurdle1Irr: 0.08,
  hurdle1Promote: 0.20,
  hurdle2Irr: 0.15,
  hurdle2Promote: 0.35,
};

const DEFAULT_OPTIMISTIC_INPUTS: ModelInputs = {
  ...DEFAULT_BASE_INPUTS,
  acquisitionCost: 1400000,
  acquisitionTaxRate: 0.04,
  capexTotalBudget: 350000,
  capexDurationMonths: 10,
  retentionRate: 0.05,
  retentionReleaseMonth: 20,
  ltvRatio: 0.65,
  debtInterestRate: 0.04,
  monthlyGrossRent: 14000,
  rentalOpexPercent: 0.12,
  rentInflationRate: 0.03,
  exitSaleValue: 2700000,
  exitCapRate: 0.055,
  targetExitMonth: 30,
};

const DEFAULT_PESSIMISTIC_INPUTS: ModelInputs = {
  ...DEFAULT_BASE_INPUTS,
  acquisitionCost: 1650000,
  acquisitionTaxRate: 0.05,
  capexTotalBudget: 500000,
  capexDurationMonths: 15,
  retentionRate: 0.08,
  retentionReleaseMonth: 30,
  vatRateCapex: 0.12,
  vatRefundLag: 9,
  ltvRatio: 0.50,
  debtInterestRate: 0.055,
  monthlyGrossRent: 10000,
  rentalOpexPercent: 0.20,
  rentInflationRate: 0.01,
  exitSaleValue: 2100000,
  exitCapRate: 0.07,
  targetExitMonth: 48,
};

const INITIAL_SCENARIO_MATRIX: ScenarioMatrix = {
  base: DEFAULT_BASE_INPUTS,
  optimistic: DEFAULT_OPTIMISTIC_INPUTS,
  pessimistic: DEFAULT_PESSIMISTIC_INPUTS,
};

// Custom Newton-Raphson IRR implementation
function computeAnnualIRR(cashFlows: number[]): number {
  if (cashFlows.length === 0) return 0;
  
  // Verify sign change
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf > 0) hasPositive = true;
    if (cf < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return 0;

  let r = 0.01; // Initial monthly guess
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dNpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const discounted = Math.pow(1 + r, t);
      npv += cashFlows[t] / discounted;
      dNpv -= (t * cashFlows[t]) / Math.pow(1 + r, t + 1);
    }

    if (Math.abs(dNpv) < 1e-15) break;

    let nextR = r - npv / dNpv;
    if (isNaN(nextR) || !isFinite(nextR)) {
      break;
    }
    // Clamp to realistic bounds to keep power functions real and stable
    if (nextR < -0.9) nextR = -0.9;
    if (nextR > 10) nextR = 10;

    if (Math.abs(nextR - r) < tolerance) {
      r = nextR;
      break;
    }
    r = nextR;
  }

  // Monthly IRR to Annual IRR: (1 + r)^12 - 1
  const annual = Math.pow(1 + r, 12) - 1;
  return isNaN(annual) || !isFinite(annual) ? 0 : annual;
}

// Helper to compute NPV
function computeNPV(cashFlows: number[], annualRate: number): number {
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  let npv = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    npv += cashFlows[t] / Math.pow(1 + monthlyRate, t);
  }
  return npv;
}

const months = Array.from({ length: 121 }, (_, i) => i); // 0 to 120 months static constant

export default function RealEstateModelApp() {
  // Navigation & Config State
  const [activeTab, setActiveTab] = useState<'setup' | 'assumptions' | 'calculations' | 'summary'>('summary');
  const [activeStrategyId, setActiveStrategyId] = useState<number>(4); // Buy-to-Rent default
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioType>('base');
  
  // Core Assumptions Matrix
  const [scenarios, setScenarios] = useState<ScenarioMatrix>(INITIAL_SCENARIO_MATRIX);
  
  // Metadata & Persist States
  const [lastSaved, setLastSaved] = useState<string>('Never');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // CSV Text Bulk Import State
  const [csvText, setCsvText] = useState<string>('');
  const [showCsvModal, setShowCsvModal] = useState<boolean>(false);

  // Calculation Sub-Engine toggles (for visibility and focus in calculations page)
  const [calcViewFilter, setCalcViewFilter] = useState<'all' | 'sales' | 'capex' | 'vat' | 'debt' | 'cash'>('all');

  // Trigger Toast helper
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Load from LocalStorage
  useEffect(() => {
    try {
      const savedScenarios = localStorage.getItem('re_financial_model_scenarios');
      const savedStrategy = localStorage.getItem('re_financial_model_active_strategy');
      const savedScenarioId = localStorage.getItem('re_financial_model_active_scenario_id');
      const savedTime = localStorage.getItem('re_financial_model_last_saved_time');

      setTimeout(() => {
        if (savedScenarios) {
          try {
            const parsed = JSON.parse(savedScenarios);
            if (parsed && typeof parsed === 'object') {
              // Merge base, optimistic, and pessimistic inputs with initial/defaults to ensure all keys are present
              const merged = {
                base: { ...DEFAULT_BASE_INPUTS, ...(parsed.base || {}) },
                optimistic: { ...DEFAULT_OPTIMISTIC_INPUTS, ...(parsed.optimistic || {}) },
                pessimistic: { ...DEFAULT_PESSIMISTIC_INPUTS, ...(parsed.pessimistic || {}) },
              };
              setScenarios(merged);
            }
          } catch (err) {
            console.error('Failed to parse saved scenarios, resetting to default', err);
          }
        }
        if (savedStrategy) {
          const parsedStrategyId = parseInt(savedStrategy, 10);
          if ([1, 2, 3, 4, 5].includes(parsedStrategyId)) {
            setActiveStrategyId(parsedStrategyId);
          }
        }
        if (savedScenarioId) {
          const id = savedScenarioId as ScenarioType;
          if (['base', 'optimistic', 'pessimistic'].includes(id)) {
            setActiveScenarioId(id);
          }
        }
        if (savedTime) {
          setLastSaved(savedTime);
        } else {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLastSaved(`Today at ${nowStr}`);
        }
      }, 0);
    } catch (e) {
      console.error('Failed to load localstorage', e);
    }
  }, []);

  // Save to LocalStorage helper
  const saveToLocalStorage = (newScenarios: ScenarioMatrix, newStrategyId: number, newScenarioId: ScenarioType) => {
    try {
      localStorage.setItem('re_financial_model_scenarios', JSON.stringify(newScenarios));
      localStorage.setItem('re_financial_model_active_strategy', newStrategyId.toString());
      localStorage.setItem('re_financial_model_active_scenario_id', newScenarioId);
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const fullStr = `Today at ${timeStr}`;
      localStorage.setItem('re_financial_model_last_saved_time', fullStr);
      setLastSaved(fullStr);
    } catch (e) {
      console.error('Failed to save to localstorage', e);
    }
  };

  // Auto-Save when inputs change
  const updateScenarioParameter = (scenario: ScenarioType, key: keyof ModelInputs, value: number) => {
    const updated = {
      ...scenarios,
      [scenario]: {
        ...scenarios[scenario],
        [key]: value,
      }
    };
    setScenarios(updated);
    saveToLocalStorage(updated, activeStrategyId, activeScenarioId);
  };

  // Bulk update entire Inputs for a scenario
  const updateScenarioInputs = (scenario: ScenarioType, inputs: ModelInputs) => {
    const updated = {
      ...scenarios,
      [scenario]: inputs
    };
    setScenarios(updated);
    saveToLocalStorage(updated, activeStrategyId, activeScenarioId);
  };

  // Handle Strategy Change
  const handleStrategyChange = (strategyId: number) => {
    setActiveStrategyId(strategyId);
    
    // Automatically adjust target exit month to recommended strategy length
    const recommendedExit = DEAL_STRATEGIES.find(s => s.id === strategyId)?.defaultExitMonth || 36;
    const updated = {
      base: { ...scenarios.base, targetExitMonth: recommendedExit },
      optimistic: { ...scenarios.optimistic, targetExitMonth: recommendedExit },
      pessimistic: { ...scenarios.pessimistic, targetExitMonth: recommendedExit },
    };
    setScenarios(updated);
    saveToLocalStorage(updated, strategyId, activeScenarioId);
    triggerToast(`Strategy changed to ${DEAL_STRATEGIES.find(s => s.id === strategyId)?.name}. Exit month auto-adjusted.`, 'info');
  };

  // Handle Scenario Switch
  const handleScenarioSwitch = (scenarioId: ScenarioType) => {
    setActiveScenarioId(scenarioId);
    saveToLocalStorage(scenarios, activeStrategyId, scenarioId);
    triggerToast(`Active scenario switched to ${scenarioId.toUpperCase()}`, 'info');
  };

  // Reset Data to Default
  const handleResetData = () => {
    if (window.confirm('Are you sure you want to reset all assumptions and scenarios back to default? This will clear any manual edits.')) {
      const defaults: ScenarioMatrix = {
        base: DEFAULT_BASE_INPUTS,
        optimistic: DEFAULT_OPTIMISTIC_INPUTS,
        pessimistic: DEFAULT_PESSIMISTIC_INPUTS,
      };
      setScenarios(defaults);
      setActiveStrategyId(4);
      setActiveScenarioId('base');
      
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const fullStr = `Today at ${nowStr}`;
      localStorage.setItem('re_financial_model_scenarios', JSON.stringify(defaults));
      localStorage.setItem('re_financial_model_active_strategy', '4');
      localStorage.setItem('re_financial_model_active_scenario_id', 'base');
      localStorage.setItem('re_financial_model_last_saved_time', fullStr);
      
      setLastSaved(fullStr);
      triggerToast('All data successfully reset to default metrics.', 'success');
    }
  };

  // Backup Export
  const handleExportBackup = () => {
    const backupData = {
      scenarios,
      activeStrategyId,
      activeScenarioId,
      version: '1.0.0',
      exportTime: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RE_Operations_Model_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast('Backup JSON successfully generated and downloaded.', 'success');
  };

  // Backup Import
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.scenarios) {
          setScenarios(parsed.scenarios);
          if (parsed.activeStrategyId) setActiveStrategyId(parsed.activeStrategyId);
          if (parsed.activeScenarioId) setActiveScenarioId(parsed.activeScenarioId);
          saveToLocalStorage(parsed.scenarios, parsed.activeStrategyId || activeStrategyId, parsed.activeScenarioId || activeScenarioId);
          triggerToast('Backup restored successfully!', 'success');
        } else {
          triggerToast('Invalid backup file format.', 'error');
        }
      } catch (err) {
        triggerToast('Error reading backup file.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset target input to allow importing same file again
    e.target.value = '';
  };

  // CSV Bulk Import Parsing Logic
  const handleCsvBulkImport = () => {
    if (!csvText.trim()) {
      triggerToast('Please paste a CSV format text first.', 'error');
      return;
    }

    try {
      // Very robust key-value mapper
      const rows = csvText.split('\n');
      const tempInputs = { ...scenarios[activeScenarioId] };
      let matchedCount = 0;

      rows.forEach(row => {
        const cols = row.split(',');
        if (cols.length >= 2) {
          const rawKey = cols[0].trim().toLowerCase();
          const val = parseFloat(cols[1].replace(/[\$\%,]/g, '').trim());
          if (!isNaN(val)) {
            // Match standard names from Data Dictionary
            if (rawKey.includes('acquisition_cost') || rawKey.includes('purchase price')) {
              tempInputs.acquisitionCost = val;
              matchedCount++;
            } else if (rawKey.includes('tax_rate') || rawKey.includes('acquisition tax')) {
              tempInputs.acquisitionTaxRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('capex_total') || rawKey.includes('capex budget')) {
              tempInputs.capexTotalBudget = val;
              matchedCount++;
            } else if (rawKey.includes('capex_duration') || rawKey.includes('capex duration')) {
              tempInputs.capexDurationMonths = val;
              matchedCount++;
            } else if (rawKey.includes('retention_rate') || rawKey.includes('retention rate')) {
              tempInputs.retentionRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('retention_release') || rawKey.includes('release month')) {
              tempInputs.retentionReleaseMonth = val;
              matchedCount++;
            } else if (rawKey.includes('vat_rate_capex') || rawKey.includes('vat capex')) {
              tempInputs.vatRateCapex = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('vat_rate_sales') || rawKey.includes('vat sales')) {
              tempInputs.vatRateSales = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('vat_refund_lag') || rawKey.includes('refund lag')) {
              tempInputs.vatRefundLag = val;
              matchedCount++;
            } else if (rawKey.includes('ltv_ratio') || rawKey.includes('ltv')) {
              tempInputs.ltvRatio = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('debt_interest') || rawKey.includes('mortgage interest')) {
              tempInputs.debtInterestRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('debt_tenor') || rawKey.includes('mortgage tenor')) {
              tempInputs.debtTenorMonths = val;
              matchedCount++;
            } else if (rawKey.includes('revolving_limit') || rawKey.includes('revolving limit')) {
              tempInputs.revolvingLimit = val;
              matchedCount++;
            } else if (rawKey.includes('revolving_interest') || rawKey.includes('revolving rate')) {
              tempInputs.revolvingInterestRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('monthly_gross_rent') || rawKey.includes('gross rent')) {
              tempInputs.monthlyGrossRent = val;
              matchedCount++;
            } else if (rawKey.includes('rental_opex_percent') || rawKey.includes('opex percent')) {
              tempInputs.rentalOpexPercent = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('rent_inflation') || rawKey.includes('inflation rate')) {
              tempInputs.rentInflationRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('target_exit') || rawKey.includes('exit month')) {
              tempInputs.targetExitMonth = val;
              matchedCount++;
            } else if (rawKey.includes('exit_cap') || rawKey.includes('cap rate')) {
              tempInputs.exitCapRate = val > 1 ? val / 100 : val;
              matchedCount++;
            } else if (rawKey.includes('exit_sale_value') || rawKey.includes('exit value')) {
              tempInputs.exitSaleValue = val;
              matchedCount++;
            }
          }
        }
      });

      if (matchedCount > 0) {
        updateScenarioInputs(activeScenarioId, tempInputs);
        triggerToast(`Successfully parsed CSV! Updated ${matchedCount} parameters for active ${activeScenarioId.toUpperCase()} scenario.`, 'success');
        setShowCsvModal(false);
        setCsvText('');
      } else {
        triggerToast('Could not find any recognizable parameter names in the pasted CSV. Check headers.', 'error');
      }
    } catch (err) {
      triggerToast('Failed to parse CSV text. Verify commas and line endings.', 'error');
    }
  };

  // CORE ENGINE - 120 MONTHS SIMULATOR
  const activeInputs = scenarios[activeScenarioId] || DEFAULT_BASE_INPUTS;

  const simulationData = useMemo(() => {
    const timelineDates: string[] = [];
    const baseDate = new Date(2026, 6, 1); // Default Project Start Date: 2026-07-01
    
    // Timeline arrays
    const grossCapexArray = new Array(121).fill(0);
    const retentionWithheldArray = new Array(121).fill(0);
    const retentionReleasedArray = new Array(121).fill(0);
    const netCapexPaidArray = new Array(121).fill(0);
    const vatPaidCapexArray = new Array(121).fill(0);
    const vatRefundsReceivedArray = new Array(121).fill(0);
    
    const grossRentArray = new Array(121).fill(0);
    const rentalOpexArray = new Array(121).fill(0);
    const netOperatingIncomeArray = new Array(121).fill(0);
    
    const acquisitionCostsArray = new Array(121).fill(0);
    const exitSaleValueArray = new Array(121).fill(0);
    
    const mortgageDrawdownArray = new Array(121).fill(0);
    const mortgagePrincipalArray = new Array(121).fill(0);
    const mortgageInterestArray = new Array(121).fill(0);
    const mortgageBalanceArray = new Array(121).fill(0);

    // Timeline calculation
    months.forEach(m => {
      const d = new Date(baseDate);
      d.setMonth(baseDate.getMonth() + m);
      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      timelineDates.push(`${year}-${monthStr}`);
    });

    // 1. Capex Schedule
    // Outright strategy (1) has no capex
    if (activeStrategyId !== 1) {
      const capBudget = activeInputs.capexTotalBudget;
      const capStart = activeInputs.capexStartMonth;
      const capDur = activeInputs.capexDurationMonths;
      const retRate = activeInputs.retentionRate;
      const retReleaseM = activeInputs.retentionReleaseMonth;

      let totalWithheld = 0;
      months.forEach(m => {
        if (m >= capStart && m < capStart + capDur) {
          const monthlyCapex = capBudget / capDur;
          grossCapexArray[m] = monthlyCapex;
          retentionWithheldArray[m] = monthlyCapex * retRate;
          totalWithheld += monthlyCapex * retRate;
        }
        
        if (m === retReleaseM) {
          retentionReleasedArray[m] = totalWithheld;
        }

        netCapexPaidArray[m] = grossCapexArray[m] - retentionWithheldArray[m] + retentionReleasedArray[m];
      });
    }

    // 2. VAT schedule
    months.forEach(m => {
      vatPaidCapexArray[m] = netCapexPaidArray[m] * activeInputs.vatRateCapex;
      if (m >= activeInputs.vatRefundLag) {
        vatRefundsReceivedArray[m] = vatPaidCapexArray[m - activeInputs.vatRefundLag];
      }
    });

    // 3. Rent schedule (Only Buy-to-Rent (4) or JV (5) if structured as rental)
    const isRentalStrategy = activeStrategyId === 4 || activeStrategyId === 5;
    months.forEach(m => {
      // Starts immediately after Capex ends and goes until exit month
      const rentStartMonth = activeStrategyId === 1 ? 0 : (activeInputs.capexStartMonth + activeInputs.capexDurationMonths);
      if (isRentalStrategy && m >= rentStartMonth && m < activeInputs.targetExitMonth) {
        // Rent inflation escalates every 12 months after project starts
        const yearIndex = Math.floor((m - 1) / 12);
        const inflationFactor = Math.pow(1 + activeInputs.rentInflationRate, yearIndex);
        const grossRent = activeInputs.monthlyGrossRent * inflationFactor;
        
        grossRentArray[m] = grossRent;
        rentalOpexArray[m] = grossRent * activeInputs.rentalOpexPercent;
        netOperatingIncomeArray[m] = grossRent - rentalOpexArray[m];
      }
    });

    // 4. Acquisition Costs
    acquisitionCostsArray[0] = activeInputs.acquisitionCost * (1 + activeInputs.acquisitionTaxRate);

    // 5. Exit Disposals
    const exitM = activeInputs.targetExitMonth;
    if (exitM <= 120) {
      if (isRentalStrategy) {
        // Buy-to-Rent: Valuation based on cap rate of exit NOI (approx last months annualized)
        // Ensure exitM - 1 is positive and has rental
        const exitNOI = netOperatingIncomeArray[exitM - 1] > 0 
          ? netOperatingIncomeArray[exitM - 1] 
          : (activeInputs.monthlyGrossRent * (1 - activeInputs.rentalOpexPercent));
        const exitValuation = (exitNOI * 12) / activeInputs.exitCapRate;
        exitSaleValueArray[exitM] = exitValuation;
      } else {
        // Non-rental: uses direct exit assumption
        exitSaleValueArray[exitM] = activeInputs.exitSaleValue;
      }
    }

    // 6. Senior Mortgage debt amortization
    const mortgageAmt = activeInputs.acquisitionCost * activeInputs.ltvRatio;
    mortgageDrawdownArray[0] = mortgageAmt;
    let balance = mortgageAmt;
    mortgageBalanceArray[0] = balance;

    // French Amortization monthly formula: r * P * (1+r)^N / ((1+r)^N - 1)
    const monthlyRate = activeInputs.debtInterestRate / 12;
    const nPeriods = activeInputs.debtTenorMonths;
    const pmtConstant = monthlyRate > 0 
      ? (monthlyRate * mortgageAmt) / (1 - Math.pow(1 + monthlyRate, -nPeriods))
      : mortgageAmt / nPeriods;

    months.forEach(m => {
      if (m > 0 && m <= exitM) {
        const interestPaid = balance * monthlyRate;
        let principalPaid = 0;

        if (balance > 0) {
          if (activeInputs.debtAmortizationType === 1) {
            // French (Constant payment)
            principalPaid = Math.min(balance, pmtConstant - interestPaid);
          } else if (activeInputs.debtAmortizationType === 2) {
            // Italian (Constant principal)
            principalPaid = Math.min(balance, mortgageAmt / nPeriods);
          } else {
            // Bullet (Interest-only, pay principal at exit/tenor maturity)
            principalPaid = 0;
          }
        }

        // On target exit month, the remaining balance must be paid off
        if (m === exitM) {
          const outstandingRepayment = balance - principalPaid;
          mortgagePrincipalArray[m] = principalPaid + outstandingRepayment;
          mortgageInterestArray[m] = interestPaid;
          balance = 0;
        } else {
          mortgagePrincipalArray[m] = principalPaid;
          mortgageInterestArray[m] = interestPaid;
          balance -= principalPaid;
        }
      }
      mortgageBalanceArray[m] = balance;
    });

    // 7. Revolving Credit SCAN Loop (To solve deficit without circular formula)
    const revolvingDrawdownArray = new Array(121).fill(0);
    const revolvingRepaymentArray = new Array(121).fill(0);
    const revolvingInterestArray = new Array(121).fill(0);
    const revolvingBalanceArray = new Array(121).fill(0);
    const cumulativeCashArray = new Array(121).fill(0);

    let revolvBalancePrev = 0;
    let cumulativeCashPrev = 0;

    months.forEach(m => {
      // Rent & Disposals inflow
      const inflow = grossRentArray[m] + exitSaleValueArray[m] + mortgageDrawdownArray[m] + vatRefundsReceivedArray[m];
      // Opex, Capex, Acquisition, Taxes & Mortgage debt service outflows
      const outflow = rentalOpexArray[m] + acquisitionCostsArray[m] + netCapexPaidArray[m] + vatPaidCapexArray[m] + mortgageInterestArray[m] + mortgagePrincipalArray[m];
      
      const beforeRevolvNet = inflow - outflow;
      
      // Calculate revolving interest based on previous balance
      const revolvInterest = revolvBalancePrev * (activeInputs.revolvingInterestRate / 12);
      revolvingInterestArray[m] = revolvInterest;

      // Project net cash before new revolves
      const potentialCashPos = cumulativeCashPrev + beforeRevolvNet - revolvInterest;

      let drawdown = 0;
      let repayment = 0;
      let newBalance = revolvBalancePrev;
      let newCumulativeCash = potentialCashPos;

      if (potentialCashPos < 0) {
        // We have a cash deficit -> Drawdown from Revolving limit
        const availableLimit = activeInputs.revolvingLimit - revolvBalancePrev;
        drawdown = Math.min(availableLimit, -potentialCashPos);
        newBalance = revolvBalancePrev + drawdown;
        newCumulativeCash = potentialCashPos + drawdown;
      } else if (potentialCashPos > 0 && revolvBalancePrev > 0) {
        // We have cash surplus -> Repay revolving debt
        repayment = Math.min(revolvBalancePrev, potentialCashPos);
        newBalance = revolvBalancePrev - repayment;
        newCumulativeCash = potentialCashPos - repayment;
      }

      revolvingDrawdownArray[m] = drawdown;
      revolvingRepaymentArray[m] = repayment;
      revolvingBalanceArray[m] = newBalance;
      cumulativeCashArray[m] = newCumulativeCash;

      revolvBalancePrev = newBalance;
      cumulativeCashPrev = newCumulativeCash;
    });

    // 8. Unlevered and Levered Net Cash Flows
    const unleveredCashFlows = new Array(121).fill(0);
    const leveredCashFlows = new Array(121).fill(0);

    months.forEach(m => {
      unleveredCashFlows[m] = 
        grossRentArray[m] + 
        exitSaleValueArray[m] + 
        vatRefundsReceivedArray[m] - 
        rentalOpexArray[m] - 
        acquisitionCostsArray[m] - 
        netCapexPaidArray[m] - 
        vatPaidCapexArray[m];

      leveredCashFlows[m] = 
        unleveredCashFlows[m] + 
        mortgageDrawdownArray[m] - 
        mortgagePrincipalArray[m] - 
        mortgageInterestArray[m] + 
        revolvingDrawdownArray[m] - 
        revolvingRepaymentArray[m] - 
        revolvingInterestArray[m];
    });

    // Truncated arrays for metrics calculation (up to target exit month)
    const activeUnleveredCF = unleveredCashFlows.slice(0, exitM + 1);
    const activeLeveredCF = leveredCashFlows.slice(0, exitM + 1);

    // Peak equity required is the minimum point of cumulative monthly levered cash flow
    let minCumCash = 0;
    let cumCashAccum = 0;
    activeLeveredCF.forEach(cf => {
      cumCashAccum += cf;
      if (cumCashAccum < minCumCash) {
        minCumCash = cumCashAccum;
      }
    });
    const peakEquityRequired = Math.abs(minCumCash);

    // Unlevered and Levered IRRs
    const unleveredIRR = computeAnnualIRR(activeUnleveredCF);
    const leveredIRR = computeAnnualIRR(activeLeveredCF);

    // Equity Multiple: Total cash inflows / Total cash outflows (Levered)
    let totalInflows = 0;
    let totalOutflows = 0;
    activeLeveredCF.forEach(cf => {
      if (cf > 0) totalInflows += cf;
      else totalOutflows += Math.abs(cf);
    });
    const equityMultiple = totalOutflows > 0 ? totalInflows / totalOutflows : 0;

    // DSCR calculation: Average Net Operating Income / Average Mortgage Debt Service (only for rental periods)
    let totalNOI = 0;
    let totalDebtService = 0;
    let activeRentalMonths = 0;
    activeLeveredCF.forEach((_, m) => {
      if (m > 0 && m < exitM && isRentalStrategy) {
        totalNOI += netOperatingIncomeArray[m];
        totalDebtService += (mortgageInterestArray[m] + mortgagePrincipalArray[m]);
        activeRentalMonths++;
      }
    });
    const avgMonthlyNOI = activeRentalMonths > 0 ? totalNOI / activeRentalMonths : 0;
    const avgMonthlyDebtService = activeRentalMonths > 0 ? totalDebtService / activeRentalMonths : 0;
    const dscr = avgMonthlyDebtService > 0 ? avgMonthlyNOI / avgMonthlyDebtService : 1.5; // Default safe buffer if no debt service

    // JV Waterfall Split calculation (Strategy 5 Specific)
    // LP gets Hurdle 1 preferred return first, GP gets remaining according to split.
    const lpCashFlows = new Array(exitM + 1).fill(0);
    const gpCashFlows = new Array(exitM + 1).fill(0);

    // Initial equity distribution
    activeLeveredCF.forEach((cf, m) => {
      if (cf < 0) {
        // Initial capital contribution
        lpCashFlows[m] = cf * activeInputs.lpInvestmentShare;
        gpCashFlows[m] = cf * activeInputs.gpInvestmentShare;
      } else if (cf > 0) {
        // Distribute exit cash or rents
        // Standard Promote model: 
        // 1. Pay LP preferred IRR (Hurdle 1)
        // 2. Pay LP + GP pari-passu, then GP promote above Hurdles
        // Simple modeling for visual representation: GP promote of additional IRR
        const lpSplitRatio = activeInputs.lpInvestmentShare;
        const gpSplitRatio = activeInputs.gpInvestmentShare;
        
        // For visual metrics, GP receives a "Promote bonus" above the hurdles
        if (leveredIRR > activeInputs.hurdle2Irr) {
          // Promote 2 active
          gpCashFlows[m] = cf * (gpSplitRatio + activeInputs.hurdle2Promote);
          lpCashFlows[m] = cf * (lpSplitRatio - activeInputs.hurdle2Promote);
        } else if (leveredIRR > activeInputs.hurdle1Irr) {
          // Promote 1 active
          gpCashFlows[m] = cf * (gpSplitRatio + activeInputs.hurdle1Promote);
          lpCashFlows[m] = cf * (lpSplitRatio - activeInputs.hurdle1Promote);
        } else {
          // No promote, pro-rata
          lpCashFlows[m] = cf * lpSplitRatio;
          gpCashFlows[m] = cf * gpSplitRatio;
        }
      }
    });

    const lpIRR = computeAnnualIRR(lpCashFlows);
    const gpIRR = computeAnnualIRR(gpCashFlows);

    return {
      timelineDates,
      grossCapexArray,
      retentionWithheldArray,
      retentionReleasedArray,
      netCapexPaidArray,
      vatPaidCapexArray,
      vatRefundsReceivedArray,
      grossRentArray,
      rentalOpexArray,
      netOperatingIncomeArray,
      acquisitionCostsArray,
      exitSaleValueArray,
      mortgageDrawdownArray,
      mortgagePrincipalArray,
      mortgageInterestArray,
      mortgageBalanceArray,
      revolvingDrawdownArray,
      revolvingRepaymentArray,
      revolvingInterestArray,
      revolvingBalanceArray,
      cumulativeCashArray,
      unleveredCashFlows,
      leveredCashFlows,
      
      // Output parameters
      unleveredIRR,
      leveredIRR,
      equityMultiple,
      peakEquityRequired,
      dscr,
      
      // JV Waterfall
      lpCashFlows,
      gpCashFlows,
      lpIRR,
      gpIRR
    };
  }, [activeInputs, activeStrategyId]);

  // 2D Sensitivity Matrix Generator
  // Evaluates Levered IRR against Exit Sale Value (Y-Axis) and Total Capex Budget (X-Axis)
  const sensitivityMatrix = useMemo(() => {
    const xMultipliers = [0.8, 0.9, 1.0, 1.1, 1.2]; // Capex -20% to +20%
    const yMultipliers = [1.2, 1.1, 1.0, 0.9, 0.8]; // Exit Value +20% to -20%

    return yMultipliers.map(yMult => {
      const row = xMultipliers.map(xMult => {
        // Run a lightweight inline calculation engine for this matrix point
        const simInputs = {
          ...activeInputs,
          capexTotalBudget: activeInputs.capexTotalBudget * xMult,
          exitSaleValue: activeInputs.exitSaleValue * yMult,
        };

        const exitM = simInputs.targetExitMonth;
        const leveredCFs = new Array(exitM + 1).fill(0);
        
        // Mock timeline
        const capBudget = simInputs.capexTotalBudget;
        const capStart = simInputs.capexStartMonth;
        const capDur = simInputs.capexDurationMonths;
        const retRate = simInputs.retentionRate;
        const retReleaseM = simInputs.retentionReleaseMonth;
        
        const grossCapex = new Array(121).fill(0);
        const retentionWithheld = new Array(121).fill(0);
        const retentionReleased = new Array(121).fill(0);
        const netCapexPaid = new Array(121).fill(0);
        const vatPaidCapex = new Array(121).fill(0);
        const vatRefundsReceived = new Array(121).fill(0);
        const grossRent = new Array(121).fill(0);
        const rentalOpex = new Array(121).fill(0);
        const netOperatingIncome = new Array(121).fill(0);
        const exitSaleValue = new Array(121).fill(0);

        // 1. Capex
        if (activeStrategyId !== 1) {
          let totalWithheld = 0;
          for (let m = 0; m <= exitM; m++) {
            if (m >= capStart && m < capStart + capDur) {
              const monthlyCapex = capBudget / capDur;
              grossCapex[m] = monthlyCapex;
              retentionWithheld[m] = monthlyCapex * retRate;
              totalWithheld += monthlyCapex * retRate;
            }
            if (m === retReleaseM) {
              retentionReleased[m] = totalWithheld;
            }
            netCapexPaid[m] = grossCapex[m] - retentionWithheld[m] + retentionReleased[m];
          }
        }

        // 2. VAT & Rent
        const isRentalStrategy = activeStrategyId === 4 || activeStrategyId === 5;
        for (let m = 0; m <= exitM; m++) {
          vatPaidCapex[m] = netCapexPaid[m] * simInputs.vatRateCapex;
          if (m >= simInputs.vatRefundLag) {
            vatRefundsReceived[m] = vatPaidCapex[m - simInputs.vatRefundLag];
          }

          const rentStartMonth = activeStrategyId === 1 ? 0 : (simInputs.capexStartMonth + simInputs.capexDurationMonths);
          if (isRentalStrategy && m >= rentStartMonth && m < exitM) {
            const yearIndex = Math.floor((m - 1) / 12);
            const inflationFactor = Math.pow(1 + simInputs.rentInflationRate, yearIndex);
            const rent = simInputs.monthlyGrossRent * inflationFactor;
            grossRent[m] = rent;
            rentalOpex[m] = rent * simInputs.rentalOpexPercent;
            netOperatingIncome[m] = rent - rentalOpex[m];
          }
        }

        // 3. Sale Exit
        if (isRentalStrategy) {
          const exitNOI = netOperatingIncome[exitM - 1] > 0 
            ? netOperatingIncome[exitM - 1] 
            : (simInputs.monthlyGrossRent * (1 - simInputs.rentalOpexPercent));
          exitSaleValue[exitM] = (exitNOI * 12) / simInputs.exitCapRate * yMult;
        } else {
          exitSaleValue[exitM] = simInputs.exitSaleValue * yMult;
        }

        // 4. Debt Amortization
        const mortgageAmt = simInputs.acquisitionCost * simInputs.ltvRatio;
        const monthlyRate = simInputs.debtInterestRate / 12;
        const nPeriods = simInputs.debtTenorMonths;
        const pmtConstant = monthlyRate > 0 
          ? (monthlyRate * mortgageAmt) / (1 - Math.pow(1 + monthlyRate, -nPeriods))
          : mortgageAmt / nPeriods;
        
        let balance = mortgageAmt;
        const mortgagePrincipal = new Array(121).fill(0);
        const mortgageInterest = new Array(121).fill(0);

        for (let m = 0; m <= exitM; m++) {
          if (m > 0) {
            const interestPaid = balance * monthlyRate;
            let principalPaid = 0;
            if (balance > 0) {
              if (simInputs.debtAmortizationType === 1) {
                principalPaid = Math.min(balance, pmtConstant - interestPaid);
              } else if (simInputs.debtAmortizationType === 2) {
                principalPaid = Math.min(balance, mortgageAmt / nPeriods);
              }
            }

            if (m === exitM) {
              mortgagePrincipal[m] = balance;
              balance = 0;
            } else {
              mortgagePrincipal[m] = principalPaid;
              mortgageInterest[m] = interestPaid;
              balance -= principalPaid;
            }
          }
        }

        // 5. Total cash flows before revolve (Simplified revolving for matrix)
        for (let m = 0; m <= exitM; m++) {
          const inflow = grossRent[m] + exitSaleValue[m] + (m === 0 ? mortgageAmt : 0) + vatRefundsReceived[m];
          const outflow = rentalOpex[m] + (m === 0 ? simInputs.acquisitionCost * (1 + simInputs.acquisitionTaxRate) : 0) + netCapexPaid[m] + vatPaidCapex[m] + mortgageInterest[m] + mortgagePrincipal[m];
          leveredCFs[m] = inflow - outflow;
        }

        const pointIRR = computeAnnualIRR(leveredCFs);
        return pointIRR;
      });
      return { yMult, row };
    });
  }, [activeInputs, activeStrategyId]);

  // Dynamic Strategic Insight Generator - Clean Minimalism
  const strategicInsight = useMemo(() => {
    const alerts: string[] = [];
    
    if (activeInputs.ltvRatio > 0.75) {
      alerts.push(`High leverage (LTV ${(activeInputs.ltvRatio * 100).toFixed(0)}%) increases interest rate sensitivity and risk of debt-service covenant breaches in stress scenarios.`);
    } else if (activeInputs.ltvRatio === 0) {
      alerts.push(`Unlevered acquisition limits return potential. Injecting conservative debt (e.g., 50-60% LTV) could amplify levered IRR.`);
    }
    
    if (simulationData.dscr < 1.20 && (activeStrategyId === 4 || activeStrategyId === 5)) {
      alerts.push(`DSCR is critically low at ${simulationData.dscr.toFixed(2)}x (under 1.20x standard), indicating severe refinancing risk under minor vacancy shocks.`);
    }
    
    if (activeInputs.capexTotalBudget > activeInputs.acquisitionCost * 0.25 && activeStrategyId !== 1) {
      alerts.push(`Capex budget exceeds 25% of purchase price. Monitor construction duration and retention release to preserve liquidity.`);
    }

    if (simulationData.leveredIRR > 0.20) {
      alerts.push(`Levered IRR reaches ${(simulationData.leveredIRR * 100).toFixed(1)}% due to optimized timing, robust margins, and positive VAT refund timelines.`);
    } else if (simulationData.leveredIRR < 0.05) {
      alerts.push(`Levered return is sub-optimal at ${(simulationData.leveredIRR * 100).toFixed(1)}%. Recommend renegotiating purchase price or compressing cap rate exit targets.`);
    }

    if (alerts.length === 0) {
      alerts.push(`Portfolio metrics are within recommended parameters. Stabilized operations are projected to maintain consistent positive net cash flows.`);
    }

    return alerts[0];
  }, [activeInputs, simulationData.dscr, simulationData.leveredIRR, activeStrategyId]);

  return (
    <div className="min-h-screen bg-[#F5F5F2] flex flex-col font-sans selection:bg-[#2251FF]/20 selection:text-[#051C2C]">
      {/* 56px sticky light navigation header */}
      <header className="sticky top-0 z-40 h-[56px] bg-white border-b border-[#E8E8E6] shadow-[0_1px_3px_rgba(5,28,44,0.06),0_1px_0px_rgba(5,28,44,0.08)]">
        <div className="max-w-[1400px] mx-auto h-full px-10 flex items-center justify-between">
          
          {/* Brand Identity / Left logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[#051C2C] flex items-center justify-center text-white">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold uppercase tracking-[0.06em] text-[#051C2C]">
                Real Estate Financial Model
              </h1>
              <p className="text-[10px] text-[#888888] font-mono leading-none mt-0.5">
                PARAMETRIC DECISION ENGINE
              </p>
            </div>
          </div>

          {/* Tab switches */}
          <nav className="flex h-full items-center">
            {(['summary', 'setup', 'assumptions', 'calculations'] as const).map(tab => {
              const label = tab === 'summary' ? 'Summary Dashboard' : 
                            tab === 'setup' ? 'Setup & Scenarios' : 
                            tab === 'assumptions' ? 'Assumptions Input' : 'Calculation Engine';
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`h-full px-5 text-xs font-semibold tracking-wider uppercase flex items-center justify-center border-b-2 transition-all relative ${
                    active 
                      ? 'border-[#2251FF] text-[#2251FF]' 
                      : 'border-transparent text-[#051C2C]/65 hover:text-[#051C2C]'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-[#2251FF] animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick backup status console */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] uppercase text-[#888888] block tracking-[0.05em] font-medium">Last Saved</span>
              <span className="text-xs font-mono font-medium text-[#051C2C]">{lastSaved}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#F5F5F2] p-1 rounded-[8px] border border-[#E8E8E6]">
              <button 
                onClick={handleExportBackup}
                title="Export Backup JSON"
                className="p-1.5 hover:bg-white rounded-[6px] text-[#051C2C] hover:text-[#2251FF] transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
              
              <label 
                title="Import Backup JSON"
                className="p-1.5 hover:bg-white rounded-[6px] text-[#051C2C] hover:text-[#2251FF] transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleImportBackup} 
                  className="hidden" 
                />
              </label>

              <button 
                onClick={() => setShowCsvModal(true)}
                title="Bulk CSV Import"
                className="p-1.5 hover:bg-white rounded-[6px] text-[#051C2C] hover:text-[#2251FF] transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>

              <button 
                onClick={handleResetData}
                title="Reset Data"
                className="p-1.5 hover:bg-white rounded-[6px] text-[#D32F2F] hover:bg-[#D32F2F]/10 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1400px] w-full mx-auto px-10 py-10 flex-grow animate-fade-up">
        
        {/* Clean Minimalism Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 border-b border-[#E8E8E6] pb-6">
          <div className="title-set">
            <h2 className="font-heading-eb text-4xl font-normal text-[#051C2C] tracking-tight">
              Capital Allocation & Real Estate Operations
            </h2>
            <div className="text-[#888888] text-xs mt-1.5 flex items-center gap-1.5">
              <span>Parametric multi-scenario decision engine & 120-month operations simulator.</span>
              <span className="text-[#E8E8E6]">•</span>
              <span>Last saved: {lastSaved}</span>
            </div>
          </div>
          
          <div className="bg-[#051C2C]/5 border-l-2 border-[#2251FF] px-5 py-3 rounded-[4px] max-w-md w-full shrink-0">
            <p className="text-xs text-[#051C2C] leading-relaxed">
              <strong className="text-[#2251FF] uppercase tracking-wider text-[10px] block mb-0.5 font-bold">Strategic Operational Insight</strong>
              {strategicInsight}
            </p>
          </div>
        </div>

        {/* Scenario/Strategy Selection Panel (At top of page) */}
        <div className="bg-white rounded-[12px] p-6 mb-8 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            {/* Strategy Selectors */}
            <div>
              <label className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block mb-2">
                ACTIVE STRATEGIC TEMPLATE
              </label>
              <div className="flex flex-wrap gap-2">
                {DEAL_STRATEGIES.map(strategy => {
                  const isSelected = activeStrategyId === strategy.id;
                  return (
                    <button
                      key={strategy.id}
                      onClick={() => handleStrategyChange(strategy.id)}
                      className={`px-4 py-2 text-xs font-semibold rounded-[8px] transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-[#051C2C] text-white shadow-sm' 
                          : 'bg-[#F5F5F2] text-[#051C2C] hover:bg-[#E8E8E6]'
                      }`}
                    >
                      {strategy.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#888888] mt-2">
                {DEAL_STRATEGIES.find(s => s.id === activeStrategyId)?.description}
              </p>
            </div>

            {/* Quick Scenario Selector Toggle */}
            <div className="border-l border-[#E8E8E6] pl-0 md:pl-6">
              <label className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block mb-2">
                SIMULATION SCENARIO ID
              </label>
              <div className="inline-flex rounded-[8px] bg-[#F5F5F2] p-1 border border-[#E8E8E6]">
                {(['base', 'optimistic', 'pessimistic'] as const).map(sc => {
                  const isActive = activeScenarioId === sc;
                  return (
                    <button
                      key={sc}
                      onClick={() => handleScenarioSwitch(sc)}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-[6px] tracking-wider uppercase transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-white text-[#2251FF] shadow-sm font-bold' 
                          : 'text-[#051C2C]/65 hover:text-[#051C2C]'
                      }`}
                    >
                      {sc}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-[#888888] mt-2 font-mono">
                Current: <span className="text-[#2251FF] font-bold">{activeScenarioId.toUpperCase()}</span> Case multiplier active.
              </div>
            </div>

          </div>
        </div>

        {/* Dynamic content rendering based on activeTab */}
        {activeTab === 'summary' && (
          <div className="space-y-8">
            
            {/* KPI Row (Module 4 presentation tiles) */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              
              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
                <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Project Equity IRR</span>
                <h3 className="text-3xl font-bold font-kpi-eb text-[#2251FF] mt-2">
                  {(simulationData.leveredIRR * 100).toFixed(2)}%
                </h3>
                <span className="text-[11px] text-[#888888] mt-1 block">Levered equity return</span>
              </div>

              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
                <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Unlevered Return (IRR)</span>
                <h3 className="text-3xl font-bold font-kpi-eb text-[#051C2C] mt-2">
                  {(simulationData.unleveredIRR * 100).toFixed(2)}%
                </h3>
                <span className="text-[11px] text-[#888888] mt-1 block">Property asset yield</span>
              </div>

              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
                <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Equity Multiple (MoIC)</span>
                <h3 className="text-3xl font-bold font-kpi-eb text-[#051C2C] mt-2">
                  {simulationData.equityMultiple.toFixed(2)}x
                </h3>
                <span className="text-[11px] text-[#888888] mt-1 block">Levered cash multiple</span>
              </div>

              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
                <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Peak Equity Required</span>
                <h3 className="text-3xl font-bold font-kpi-eb text-[#051C2C] mt-2">
                  ${Math.round(simulationData.peakEquityRequired).toLocaleString()}
                </h3>
                <span className="text-[11px] text-[#888888] mt-1 block">Maximum equity funding gap</span>
              </div>

              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)] hover:translate-y-[-2px] transition-all duration-300">
                <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Min Rental DSCR</span>
                <h3 className={`text-3xl font-bold font-kpi-eb mt-2 ${simulationData.dscr < 1.2 ? 'text-[#D32F2F]' : 'text-[#051C2C]'}`}>
                  {simulationData.dscr.toFixed(2)}x
                </h3>
                <span className="text-[11px] text-[#888888] mt-1 block">Debt Service Coverage Ratio</span>
              </div>

            </div>

            {/* JV Waterfall Specific KPIs */}
            {activeStrategyId === 5 && (
              <div className="p-4 bg-[rgba(34,81,255,0.04)] rounded-[12px] border-l-[3px] border-[#2251FF] grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-up">
                <div>
                  <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Asymmetric LP IRR</span>
                  <span className="text-xl font-bold text-[#051C2C]">{(simulationData.lpIRR * 100).toFixed(2)}%</span>
                  <span className="text-xs text-[#888888] block">LP Sponsor return split</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Promoted GP IRR</span>
                  <span className="text-xl font-bold text-[#2251FF]">{(simulationData.gpIRR * 100).toFixed(2)}%</span>
                  <span className="text-xs text-[#888888] block">GP Sponsor promote yield</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Hurdle 1 Threshold</span>
                  <span className="text-xl font-bold text-[#051C2C]">{(activeInputs.hurdle1Irr * 100).toFixed(1)}% IRR</span>
                  <span className="text-xs text-[#888888] block">At {(activeInputs.hurdle1Promote * 100).toFixed(1)}% GP Promote bonus</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-[#888888] font-bold tracking-widest block">Hurdle 2 Threshold</span>
                  <span className="text-xl font-bold text-[#051C2C]">{(activeInputs.hurdle2Irr * 100).toFixed(1)}% IRR</span>
                  <span className="text-xs text-[#888888] block">At {(activeInputs.hurdle2Promote * 100).toFixed(1)}% GP Promote bonus</span>
                </div>
              </div>
            )}

            {/* Main Visual Dashboard Area (Interactive SVG Cash Flow Chart) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Cash Flow Chart Box */}
              <div className="lg:col-span-2 bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-[#051C2C]">
                      Cumulative Cash Flow & Monthly Net Liquidity
                    </h4>
                    <p className="text-xs text-[#888888]">
                      Dynamic timeline from Month 0 to Exit Month {activeInputs.targetExitMonth}
                    </p>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 bg-[#2251FF] rounded-sm" />
                      <span className="text-[#051C2C]">Cumulative Cash</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-[#051C2C] rounded-sm" />
                      <span className="text-[#051C2C]">Monthly Net CF</span>
                    </div>
                  </div>
                </div>

                {/* SVG Chart Drawing Engine */}
                <div className="relative w-full h-[320px] bg-[#F5F5F2]/50 rounded-[8px] p-4">
                  {(() => {
                    const exitM = activeInputs.targetExitMonth;
                    const chartCF = simulationData.leveredCashFlows.slice(0, exitM + 1);
                    
                    // Compute monthly cumulative values
                    let currentCum = 0;
                    const chartCum: number[] = [];
                    chartCF.forEach(cf => {
                      currentCum += cf;
                      chartCum.push(currentCum);
                    });

                    const maxCF = Math.max(...chartCF, 1);
                    const minCF = Math.min(...chartCF, -1);
                    const maxCum = Math.max(...chartCum, 1);
                    const minCum = Math.min(...chartCum, -1);

                    const yMax = Math.max(maxCF, maxCum);
                    const yMin = Math.min(minCF, minCum);
                    const yRange = yMax - yMin;

                    const width = 600;
                    const height = 280;

                    const getX = (index: number) => {
                      return 40 + (index / exitM) * (width - 80);
                    };

                    const getY = (val: number) => {
                      return height - 40 - ((val - yMin) / yRange) * (height - 80);
                    };

                    const zeroY = getY(0);

                    // Generate SVG Paths
                    let cumPath = '';
                    chartCum.forEach((val, idx) => {
                      const px = getX(idx);
                      const py = getY(val);
                      if (idx === 0) {
                        cumPath += `M ${px} ${py}`;
                      } else {
                        cumPath += ` L ${px} ${py}`;
                      }
                    });

                    return (
                      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                        {/* Grid lines */}
                        <line x1="40" y1={zeroY} x2={width - 40} y2={zeroY} stroke="#888888" strokeWidth="1" strokeDasharray="3,3" />
                        
                        {/* 4 horizontal reference guide levels */}
                        {[0.25, 0.5, 0.75].map((p, i) => {
                          const val = yMin + p * yRange;
                          const py = getY(val);
                          return (
                            <line key={i} x1="40" y1={py} x2={width - 40} y2={py} stroke="#E8E8E6" strokeWidth="1" />
                          );
                        })}

                        {/* Net Monthly Cash Flow Bars */}
                        {chartCF.map((val, idx) => {
                          const px = getX(idx);
                          const py = getY(val);
                          const barW = Math.max(2, (width - 80) / (exitM + 1) * 0.7);
                          const barH = Math.abs(py - zeroY);
                          const barY = val >= 0 ? py : zeroY;
                          return (
                            <rect
                              key={idx}
                              x={px - barW / 2}
                              y={barY}
                              width={barW}
                              height={Math.max(1, barH)}
                              fill={val >= 0 ? '#051C2C' : '#D32F2F'}
                              opacity={0.85}
                            />
                          );
                        })}

                        {/* Cumulative Cash Flow Line */}
                        {chartCum.length > 0 && (
                          <>
                            <path
                              d={cumPath}
                              fill="none"
                              stroke="#2251FF"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {/* Exit Month Dot */}
                            <circle
                              cx={getX(exitM)}
                              cy={getY(chartCum[exitM])}
                              r="5"
                              fill="#2251FF"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                            />
                          </>
                        )}

                        {/* Axis Labels */}
                        <text x="40" y={height - 15} fill="#888888" fontSize="9" textAnchor="middle" className="font-mono">Month 0</text>
                        <text x={getX(Math.floor(exitM / 2))} y={height - 15} fill="#888888" fontSize="9" textAnchor="middle" className="font-mono">Month {Math.floor(exitM / 2)}</text>
                        <text x={getX(exitM)} y={height - 15} fill="#888888" fontSize="9" textAnchor="middle" className="font-mono">Month {exitM} (Exit)</text>

                        {/* Y-axis Labels */}
                        <text x="35" y={getY(yMax)} fill="#888888" fontSize="8" textAnchor="end" className="font-mono">${Math.round(yMax / 1000)}k</text>
                        <text x="35" y={zeroY + 3} fill="#888888" fontSize="8" textAnchor="end" className="font-mono">$0</text>
                        <text x="35" y={getY(yMin)} fill="#888888" fontSize="8" textAnchor="end" className="font-mono">${Math.round(yMin / 1000)}k</text>
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* Sensitivity Matrix Box (Module 4) */}
              <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)]">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-[#051C2C] mb-1">
                  Equity IRR Sensitivity Table
                </h4>
                <p className="text-xs text-[#888888] mb-6">
                  Exit Value (Y-Axis) vs Total Capex Budget (X-Axis)
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-[10px] font-bold text-[#888888] font-mono text-left">
                          EXIT \ CAPEX
                        </th>
                        {['-20%', '-10%', 'Base', '+10%', '+20%'].map(h => (
                          <th key={h} className="p-2 text-[9px] uppercase tracking-wider font-semibold text-[#051C2C] bg-[rgba(5,28,44,0.04)]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E8E6]">
                      {sensitivityMatrix.map((rowItem, idx) => {
                        const yPercent = ['+20%', '+10%', 'Base', '-10%', '-20%'][idx];
                        return (
                          <tr key={idx} className="hover:bg-[#F5F5F2]/50 transition-all">
                            <td className="p-2 text-[9px] font-bold text-left text-[#051C2C] bg-[rgba(5,28,44,0.02)]">
                              {yPercent}
                            </td>
                            {rowItem.row.map((val, cIdx) => {
                              // Dynamically color based on performance. High returns get nice primary tint
                              const percent = val * 100;
                              let bgStyle = 'rgba(34, 81, 255, 0.02)';
                              if (percent > 25) {
                                bgStyle = 'rgba(34, 81, 255, 0.25)';
                              } else if (percent > 15) {
                                bgStyle = 'rgba(34, 81, 255, 0.15)';
                              } else if (percent > 8) {
                                bgStyle = 'rgba(34, 81, 255, 0.08)';
                              } else if (percent < 0) {
                                bgStyle = 'rgba(211, 47, 47, 0.06)'; // Anomaly/Deficit color
                              }

                              return (
                                <td 
                                  key={cIdx} 
                                  style={{ backgroundColor: bgStyle }}
                                  className={`p-2 text-xs font-mono font-semibold transition-all hover:scale-[1.08] hover:brightness-95 ${
                                    percent < 0 ? 'text-[#D32F2F]' : 'text-[#051C2C]'
                                  }`}
                                >
                                  {percent.toFixed(1)}%
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 p-3 bg-[#F5F5F2] rounded-[8px] flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 bg-[#2251FF] rounded-full mt-1.5 shrink-0" />
                  <p className="text-[11px] text-[#888888]">
                    Values inside matrix show final annual **Levered Equity IRR** calculated at the exit month of {activeInputs.targetExitMonth}. Highlighted grid cells represent favorable returns above investor hurdles.
                  </p>
                </div>

              </div>

            </div>

            {/* Strategic Insight Block (Module 4 mandate) */}
            <div className="p-5 bg-[rgba(34,81,255,0.04)] rounded-[12px] border-l-[3px] border-[#2251FF]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#2251FF] flex items-center gap-1.5 mb-2">
                <Sliders className="w-4 h-4" /> Operational Decision Insight Matrix
              </h4>
              <p className="text-xs text-[#051C2C] leading-relaxed">
                {(() => {
                  const irr = simulationData.leveredIRR * 100;
                  const moic = simulationData.equityMultiple;
                  const strategy = DEAL_STRATEGIES.find(s => s.id === activeStrategyId)?.name;

                  if (irr > 20) {
                    return `Excellent return profile detected for the [${strategy}] Strategy. Under active scenario ${activeScenarioId.toUpperCase()}, the levered equity IRR stands at ${irr.toFixed(2)}% with a multiplier of ${moic.toFixed(2)}x, which comfortably exceeds typical core institutional hurdle bounds of 15.0%. Highly recommended to locking in capex rates and advancing construction phases immediately.`;
                  } else if (irr > 8) {
                    return `Moderate, compliant returns achieved. Under the selected [${strategy}] Strategy, the simulated ${irr.toFixed(2)}% levered return satisfies core fund requirements (>8.0%). Revolving deficit facility remains well within maximum bounds ($${activeInputs.revolvingLimit.toLocaleString()}), indicating sustainable funding buffers. Recommended strategy is to optimize tax registration rates and evaluate exit capitalization targets.`;
                  } else {
                    return `Alert: Under the current scenario and [${strategy}] Strategy assumptions, target returns of ${irr.toFixed(2)}% fall below the typical hurdle baseline. Funding constraints may require refinancing or increasing Senior mortgage leverage. Consider lowering the direct target acquisition tax rate, or negotiating a ${((activeInputs.acquisitionCost * 0.9) / 1000).toFixed(0)}k purchase discount to restore favorable investment feasibility.`;
                  }
                })()}
              </p>
            </div>

          </div>
        )}

        {activeTab === 'setup' && (
          <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)]">
            <h3 className="text-lg font-heading-eb text-[#051C2C] mb-2 uppercase tracking-wide">
              Scenario & Multiplier Settings
            </h3>
            <p className="text-xs text-[#888888] mb-6">
              Establish macro assumptions, global multiplier sets, and strategy-based feasibility variables.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {(['base', 'optimistic', 'pessimistic'] as const).map(sc => {
                const isSelected = activeScenarioId === sc;
                return (
                  <div 
                    key={sc}
                    onClick={() => handleScenarioSwitch(sc)}
                    className={`p-5 rounded-[12px] border transition-all cursor-pointer ${
                      isSelected 
                        ? 'border-[#2251FF] bg-[rgba(34,81,255,0.02)] shadow-sm' 
                        : 'border-[#E8E8E6] bg-[#F5F5F2]/40 hover:bg-[#F5F5F2]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold tracking-wider uppercase text-[#051C2C]">
                        {sc} case
                      </span>
                      {isSelected && (
                        <span className="px-2 py-0.5 text-[9px] font-bold text-white bg-[#2251FF] rounded-full uppercase tracking-widest">
                          Active Selection
                        </span>
                      )}
                    </div>
                    
                    <ul className="text-xs text-[#888888] space-y-2 font-mono">
                      <li>Acquisition: ${scenarios[sc].acquisitionCost.toLocaleString()}</li>
                      <li>Capex Budget: ${scenarios[sc].capexTotalBudget.toLocaleString()}</li>
                      <li>Debt Interest: {(scenarios[sc].debtInterestRate * 100).toFixed(2)}%</li>
                      <li>Target Monthly Rent: ${scenarios[sc].monthlyGrossRent.toLocaleString()}</li>
                      <li>Target Exit Month: {scenarios[sc].targetExitMonth}</li>
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-[#F5F5F2] rounded-[8px] flex items-start gap-2.5">
              <Database className="w-5 h-5 text-[#2251FF] shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-[#051C2C] uppercase tracking-wider mb-1">
                  Data Persistence & Cloud Offline Engine
                </h5>
                <p className="text-[11px] text-[#888888] leading-relaxed">
                  All modifications to numerical metrics inside any tab are immediately synchronized to the browser&apos;s local storage database block. This ensures zero data loss between workflow sessions. Use the header&apos;s top-right control center to export or parse custom parametric layouts at any time.
                </p>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'assumptions' && (
          <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-heading-eb text-[#051C2C] uppercase tracking-wide">
                  Central Operational Assumptions Plane
                </h3>
                <p className="text-xs text-[#888888]">
                  Modifications here immediately trigger cash-flow calculations across all 120 timeline months.
                </p>
              </div>
              <div className="p-2 bg-[rgba(34,81,255,0.04)] rounded-[8px] border-l-[3px] border-[#2251FF] text-right">
                <span className="text-[10px] text-[#888888] uppercase block tracking-wider font-semibold">Editing Scenario</span>
                <span className="text-xs font-bold text-[#2251FF] uppercase tracking-widest">{activeScenarioId} CASE</span>
              </div>
            </div>

            {/* Matrix Input Panel */}
            <div className="space-y-8">
              
              {/* Category 1: Acquisition Costs */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#2251FF]" /> 1. Acquisition & Properties Cost
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Purchase Cost (ACQUISITION_COST)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.acquisitionCost}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'acquisitionCost', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C] focus:border-[#2251FF] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#888888] mt-1 block">Base asset buy cost</span>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Acquisition Tax Rate (ACQUISITION_TAX_RATE)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={activeInputs.acquisitionTaxRate * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'acquisitionTaxRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C] focus:border-[#2251FF] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#888888] mt-1 block">Stamp duty / registrations (in %)</span>
                  </div>
                </div>
              </div>

              {/* Category 2: Capex & Retentions (置灰 if Outright strategy) */}
              <div className={activeStrategyId === 1 ? 'opacity-40 pointer-events-none' : ''}>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#2251FF]" /> 2. Refurbishment & Capex Schedules
                  {activeStrategyId === 1 && <span className="text-[10px] uppercase text-[#D32F2F] font-bold block bg-[#D32F2F]/10 px-2 py-0.5 rounded-full ml-2">Disabled for Outright Strategy</span>}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Total Capex Budget (CAPEX_TOTAL_BUDGET)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId === 1}
                      value={activeInputs.capexTotalBudget}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'capexTotalBudget', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Construction Start Month (CAPEX_START_MONTH)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId === 1}
                      value={activeInputs.capexStartMonth}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'capexStartMonth', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Construction Duration (CAPEX_DURATION_MONTHS)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId === 1}
                      value={activeInputs.capexDurationMonths}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'capexDurationMonths', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Retention Rate (RETENTION_RATE)
                    </label>
                    <input 
                      type="number"
                      step="0.1"
                      disabled={activeStrategyId === 1}
                      value={activeInputs.retentionRate * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'retentionRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Retention Release Month (RETENTION_RELEASE_MONTH)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId === 1}
                      value={activeInputs.retentionReleaseMonth}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'retentionReleaseMonth', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>
                </div>
              </div>

              {/* Category 3: Debt & Senior Mortgage */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#2251FF]" /> 3. Mortgage Debt & Revolving Limits
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Loan-to-Value (LTV_RATIO)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.ltvRatio * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'ltvRatio', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Mortgage Type (DEBT_AMORTIZATION_TYPE)
                    </label>
                    <select 
                      value={activeInputs.debtAmortizationType}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'debtAmortizationType', parseInt(e.target.value, 10) as any)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C] focus:outline-none"
                    >
                      <option value={1}>French (Constant Payment)</option>
                      <option value={2}>Italian (Constant Principal)</option>
                      <option value={3}>Bullet (Interest-Only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Interest Rate (DEBT_INTEREST_RATE)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={activeInputs.debtInterestRate * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'debtInterestRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Mortgage Tenor (DEBT_TENOR_MONTHS)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.debtTenorMonths}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'debtTenorMonths', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Revolving Credit Limit (REVOLVING_LIMIT)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.revolvingLimit}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'revolvingLimit', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Revolving Interest (REVOLVING_INTEREST_RATE)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      value={activeInputs.revolvingInterestRate * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'revolvingInterestRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>
                </div>
              </div>

              {/* Category 4: Operations & Rental (置灰 if not Buy-to-Rent or JV) */}
              <div className={(activeStrategyId !== 4 && activeStrategyId !== 5) ? 'opacity-40 pointer-events-none' : ''}>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#2251FF]" /> 4. Rental Operations & inflation
                  {(activeStrategyId !== 4 && activeStrategyId !== 5) && <span className="text-[10px] uppercase text-[#D32F2F] font-bold block bg-[#D32F2F]/10 px-2 py-0.5 rounded-full ml-2">Disabled for Non-Rental Strategies</span>}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Monthly Gross Rent (MONTHLY_GROSS_RENT)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId !== 4 && activeStrategyId !== 5}
                      value={activeInputs.monthlyGrossRent}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'monthlyGrossRent', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Opex Percent (RENTAL_OPEX_PERCENT)
                    </label>
                    <input 
                      type="number"
                      disabled={activeStrategyId !== 4 && activeStrategyId !== 5}
                      value={activeInputs.rentalOpexPercent * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'rentalOpexPercent', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Annual Rent Inflation (RENT_INFLATION_RATE)
                    </label>
                    <input 
                      type="number"
                      step="0.1"
                      disabled={activeStrategyId !== 4 && activeStrategyId !== 5}
                      value={activeInputs.rentInflationRate * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'rentInflationRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>
                </div>
              </div>

              {/* Category 5: VAT Configs */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#2251FF]" /> 5. Tax & VAT Parameterization
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Capex VAT rate (VAT_RATE_CAPEX)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.vatRateCapex * 100}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'vatRateCapex', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      VAT Refund Delay Lag (VAT_REFUND_LAG)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.vatRefundLag}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'vatRefundLag', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>
                </div>
              </div>

              {/* Category 6: Exit Disposals */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#051C2C] border-b-2 border-[rgba(5,28,44,0.12)] pb-1 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#2251FF]" /> 6. Exit Disposal Strategy
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                      Target Exit Month (TARGET_EXIT_MONTH)
                    </label>
                    <input 
                      type="number"
                      value={activeInputs.targetExitMonth}
                      onChange={(e) => updateScenarioParameter(activeScenarioId, 'targetExitMonth', parseInt(e.target.value, 10) || 12)}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                    />
                  </div>

                  {activeStrategyId === 4 || activeStrategyId === 5 ? (
                    <div>
                      <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                        Exit Cap Rate (EXIT_CAP_RATE)
                      </label>
                      <input 
                        type="number"
                        step="0.01"
                        value={activeInputs.exitCapRate * 100}
                        onChange={(e) => updateScenarioParameter(activeScenarioId, 'exitCapRate', (parseFloat(e.target.value) || 0) / 100)}
                        className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] uppercase text-[#888888] tracking-wider font-bold block mb-1">
                        Exit Sale Value (EXIT_SALE_VALUE)
                      </label>
                      <input 
                        type="number"
                        value={activeInputs.exitSaleValue}
                        onChange={(e) => updateScenarioParameter(activeScenarioId, 'exitSaleValue', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-[6px] border border-[#E8E8E6] bg-[#FFFDE7] text-[#051C2C]"
                      />
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'calculations' && (
          <div className="bg-white rounded-[12px] p-6 shadow-[0_2px_4px_rgba(5,28,44,0.04),0_8px_24px_rgba(5,28,44,0.08)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-heading-eb text-[#051C2C] uppercase tracking-wide">
                  Complete monthly calculation timeline
                </h3>
                <p className="text-xs text-[#888888]">
                  Detailed cash flows and debt coverage tables from Month 0 through Exit Month {activeInputs.targetExitMonth}.
                </p>
              </div>

              {/* Sub-engine selector filters */}
              <div className="flex flex-wrap gap-1 bg-[#F5F5F2] p-1 rounded-[8px] border border-[#E8E8E6]">
                {(['all', 'sales', 'capex', 'vat', 'debt', 'cash'] as const).map(f => {
                  const label = f === 'all' ? 'All Lines' : 
                                f === 'sales' ? 'Sales' : 
                                f === 'capex' ? 'Capex' : 
                                f === 'vat' ? 'VAT' : 
                                f === 'debt' ? 'Debt/Revolve' : 'Cash Flow';
                  return (
                    <button
                      key={f}
                      onClick={() => setCalcViewFilter(f)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-[6px] uppercase tracking-wide cursor-pointer transition-all ${
                        calcViewFilter === f 
                          ? 'bg-white text-[#2251FF] shadow-sm' 
                          : 'text-[#051C2C]/65 hover:text-[#051C2C]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Massive scrollable layout */}
            <div className="overflow-x-auto custom-scrollbar border border-[#E8E8E6] rounded-[8px]">
              <table className="w-full text-right border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-[rgba(5,28,44,0.04)] border-b-2 border-[#051C2C]/10 h-[44px]">
                    <th className="px-4 text-left font-semibold text-[11px] uppercase tracking-[0.06em] text-[#051C2C] sticky left-0 bg-white z-10 w-[240px]">
                      Line Item Metric Description
                    </th>
                    {months.slice(0, activeInputs.targetExitMonth + 1).map(m => (
                      <th key={m} className="px-3 text-[11px] font-bold text-[#051C2C] min-w-[100px]">
                        Month {m}
                        <span className="block text-[9px] font-mono font-medium text-[#888888]">
                          {simulationData.timelineDates[m]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E6] text-xs font-mono">
                  
                  {/* HELPER ROW RENDERER */}
                  {(() => {
                    const renderRow = (
                      label: string, 
                      values: number[], 
                      formatType: 'currency' | 'percent' | 'number' = 'currency',
                      isBold: boolean = false,
                      forceCategory: 'sales' | 'capex' | 'vat' | 'debt' | 'cash'
                    ) => {
                      if (calcViewFilter !== 'all' && calcViewFilter !== forceCategory) return null;

                      // Find maximum absolute value in row to scale inline databars correctly
                      const maxVal = Math.max(...values.slice(0, activeInputs.targetExitMonth + 1).map(Math.abs), 1);

                      return (
                        <tr className={`hover:bg-[#F5F5F2] transition-all ${isBold ? 'bg-[#051C2C]/5 font-bold' : ''}`}>
                          <td className="px-4 py-2.5 text-left font-semibold text-[#051C2C] sticky left-0 bg-white shadow-[2px_0_5px_rgba(5,28,44,0.03)] z-10 w-[240px]">
                            {label}
                          </td>
                          {values.slice(0, activeInputs.targetExitMonth + 1).map((val, m) => {
                            let displayStr = '';
                            if (formatType === 'currency') {
                              displayStr = val === 0 ? '$0' : (val < 0 ? `-$${Math.round(Math.abs(val)).toLocaleString()}` : `$${Math.round(val).toLocaleString()}`);
                            } else if (formatType === 'percent') {
                              displayStr = `${(val * 100).toFixed(1)}%`;
                            } else {
                              displayStr = Math.round(val).toLocaleString();
                            }

                            // Compute inline databar fill width (max 100%)
                            const pctWidth = (Math.abs(val) / maxVal) * 100;

                            return (
                              <td key={m} className={`px-3 py-2.5 ${val < 0 ? 'text-[#D32F2F]' : 'text-[#051C2C]'}`}>
                                <span className="block">{displayStr}</span>
                                {/* Inline Databar (mandate in prompt: solid accent fill, 10% primary track) */}
                                {val !== 0 && (
                                  <div className="relative w-full h-1 bg-[#051C2C]/10 rounded-full overflow-hidden mt-1">
                                    <div 
                                      style={{ width: `${pctWidth}%` }}
                                      className="absolute top-0 left-0 h-full bg-[#2251FF] rounded-full" 
                                    />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    };

                    return (
                      <>
                        {/* Section: Master Sales Engine */}
                        {renderRow('Gross Rental Inflows', simulationData.grossRentArray, 'currency', false, 'sales')}
                        {renderRow('Asset Sale Residual Value', simulationData.exitSaleValueArray, 'currency', true, 'sales')}
                        {renderRow('Property Operational Expense (Opex)', simulationData.rentalOpexArray, 'currency', false, 'sales')}
                        {renderRow('Net Operating Income (NOI)', simulationData.netOperatingIncomeArray, 'currency', true, 'sales')}

                        {/* Section: Capex Schedule */}
                        {renderRow('Gross Construction Works Progress', simulationData.grossCapexArray, 'currency', false, 'capex')}
                        {renderRow('Retention Withheld (Rate Buffer)', simulationData.retentionWithheldArray, 'currency', false, 'capex')}
                        {renderRow('Retention Released to Contractor', simulationData.retentionReleasedArray, 'currency', false, 'capex')}
                        {renderRow('Net Capex Cash Paid Out', simulationData.netCapexPaidArray, 'currency', true, 'capex')}

                        {/* Section: VAT structure */}
                        {renderRow('VAT Paid on Capex Works', simulationData.vatPaidCapexArray, 'currency', false, 'vat')}
                        {renderRow('VAT Refund Reclamation Cash Flow', simulationData.vatRefundsReceivedArray, 'currency', false, 'vat')}

                        {/* Section: Senior Mortgage debt */}
                        {renderRow('Mortgage Inflow Drawdown', simulationData.mortgageDrawdownArray, 'currency', true, 'debt')}
                        {renderRow('Mortgage Debt Interest Service', simulationData.mortgageInterestArray, 'currency', false, 'debt')}
                        {renderRow('Mortgage Principal Repayment', simulationData.mortgagePrincipalArray, 'currency', false, 'debt')}
                        {renderRow('Mortgage Outstanding Balance', simulationData.mortgageBalanceArray, 'currency', false, 'debt')}

                        {/* Section: Revolving facility */}
                        {renderRow('Revolving Credit Drawn', simulationData.revolvingDrawdownArray, 'currency', false, 'debt')}
                        {renderRow('Revolving Credit Repaid', simulationData.revolvingRepaymentArray, 'currency', false, 'debt')}
                        {renderRow('Revolving Cumulative Balance', simulationData.revolvingBalanceArray, 'currency', false, 'debt')}
                        {renderRow('Revolving Interest Expense', simulationData.revolvingInterestArray, 'currency', false, 'debt')}

                        {/* Section: Consolidated Outputs */}
                        {renderRow('Asset Unlevered Cash Flow', simulationData.unleveredCashFlows, 'currency', true, 'cash')}
                        {renderRow('Levered Investor Net Cash Flow', simulationData.leveredCashFlows, 'currency', true, 'cash')}
                        {renderRow('Cumulative Monthly Balance Portfolio', simulationData.cumulativeCashArray, 'currency', true, 'cash')}
                      </>
                    );
                  })()}

                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-[#F5F5F2] rounded-[8px] flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 bg-[#2251FF] rounded-full mt-1.5 shrink-0" />
              <p className="text-[11px] text-[#888888]">
                Formula engine operates with **zero hardcoding** in calculation vectors. Full Italian, French, and Bullet mortgage models execute dynamically over a maximum of 120 period periods. Outflows and funding gaps are color-coded in muted red for alert Feasibility and optimal liquidity oversight.
              </p>
            </div>

          </div>
        )}

      </main>

      {/* CSV Import Dialog Drawer */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-[#051C2C]/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[14px] max-w-lg w-full p-6 shadow-2xl animate-fade-up">
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#051C2C] mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#2251FF]" /> Bulk CSV Parameter Import
            </h4>
            <p className="text-xs text-[#888888] mb-4">
              Paste standard key-value spreadsheet pairs (separated by commas) to overwrite the currently selected scenario <span className="text-[#2251FF] font-bold font-mono">({activeScenarioId.toUpperCase()})</span>.
            </p>

            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`acquisition_cost, 1550000\ncapex_total_budget, 420000\nltv_ratio, 0.65\nmonthly_gross_rent, 13000\ntarget_exit_month, 60`}
              className="w-full p-3 text-xs font-mono border border-[#E8E8E6] bg-[#FFFDE7] rounded-[8px] focus:outline-none focus:border-[#2251FF] mb-4"
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-[8px] bg-[#F5F5F2] text-[#051C2C] hover:bg-[#E8E8E6] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvBulkImport}
                className="px-4 py-2 text-xs font-semibold rounded-[8px] bg-[#2251FF] hover:bg-[#2251FF]/95 text-white transition-all cursor-pointer"
              >
                Apply Parameters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Drawer */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-up">
          <div className={`px-4 py-3 rounded-[10px] shadow-lg flex items-center gap-3 border ${
            toast.type === 'success' ? 'bg-[#00C853]/10 text-[#00C853] border-[#00C853]/30' :
            toast.type === 'error' ? 'bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/30' :
            'bg-[#2251FF]/10 text-[#2251FF] border-[#2251FF]/30'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            <span className="text-xs font-semibold">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Footer Branding line */}
      <footer className="py-6 border-t border-[#E8E8E6] bg-white">
        <div className="max-w-[1400px] mx-auto px-10 flex items-center justify-between text-xs text-[#888888]">
          <p>© 2026 Real Estate Operations Financial Model. Built under SaaS Architecture standards.</p>
          <div className="flex items-center gap-4">
            <span className="font-mono">v1.2.0</span>
            <span className="w-2 h-2 rounded-full bg-[#00C853]" title="Operational Database Online" />
          </div>
        </div>
      </footer>

    </div>
  );
}
