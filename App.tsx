
import React, { useState, useCallback, useRef } from 'react';
import { Chart } from './components/Chart';
import { MiniGauge } from './components/MiniGauge';
import { useEasixCalculation } from './hooks/useEasixCalculation';
import type { LabRow, CalculationResult } from './types';
import { DRI } from './types';

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
);
const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
);
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
);
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
)

const EXAMPLE_DATA: LabRow[] = [
    { id: '1', day: '30', ldh: '250', creatinine: '0.9', platelets: '150' },
    { id: '2', day: '60', ldh: '350', creatinine: '1.1', platelets: '100' },
    { id: '3', day: '85', ldh: '450', creatinine: '1.2', platelets: '80' },
];

// CSV utility functions
const downloadSampleCSV = () => {
    const csv = `Day,LDH,Creatinine,Platelets
30,250,0.9,150
60,350,1.1,100
85,450,1.2,80`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'easix_sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Fuzzy column matching
const matchColumn = (headers: string[], possibleNames: string[]): number => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    const normalizedPossible = possibleNames.map(n => n.toLowerCase().trim());

    for (const possible of normalizedPossible) {
        const index = normalizedHeaders.findIndex(h => h.includes(possible) || possible.includes(h));
        if (index !== -1) return index;
    }
    return -1;
};

interface CSVParseResult {
    imported: LabRow[];
    missingValues: number;
    outOfRange: number;
    complete: number;
    error?: string;
}

const parseCSV = (csvText: string): CSVParseResult => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
        return { imported: [], missingValues: 0, outOfRange: 0, complete: 0, error: 'CSV file is empty or has no data rows' };
    }

    const headers = lines[0].split(',').map(h => h.trim());

    // Try to match columns with fuzzy matching
    const dayIdx = matchColumn(headers, ['day', 'days', 'day post-transplant', 'd+', 'post-transplant day']);
    const ldhIdx = matchColumn(headers, ['ldh', 'lactate dehydrogenase', 'lactate']);
    const creatinineIdx = matchColumn(headers, ['creatinine', 'cr', 'creat']);
    const plateletsIdx = matchColumn(headers, ['platelet', 'platelets', 'plt', 'platelet count']);

    if (dayIdx === -1 || ldhIdx === -1 || creatinineIdx === -1 || plateletsIdx === -1) {
        return {
            imported: [],
            missingValues: 0,
            outOfRange: 0,
            complete: 0,
            error: `Could not find required columns. Found: ${headers.join(', ')}. Please use Day, LDH, Creatinine, Platelets`
        };
    }

    const imported: LabRow[] = [];
    let missingValues = 0;
    let outOfRange = 0;
    let complete = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        const day = values[dayIdx];
        const ldh = values[ldhIdx];
        const creatinine = values[creatinineIdx];
        const platelets = values[plateletsIdx];

        // Check if day is in range (20-120)
        const dayNum = parseFloat(day);
        if (!isNaN(dayNum) && (dayNum < 20 || dayNum > 120)) {
            outOfRange++;
            continue; // Skip this row
        }

        // Check for missing values (import anyway, but count them)
        const hasMissing = !day || !ldh || !creatinine || !platelets;
        if (hasMissing) {
            missingValues++;
        } else {
            complete++;
        }

        imported.push({
            id: crypto.randomUUID(),
            day: day || '',
            ldh: ldh || '',
            creatinine: creatinine || '',
            platelets: platelets || ''
        });
    }

    return { imported, missingValues, outOfRange, complete };
};

const App: React.FC = () => {
    const [labRows, setLabRows] = useState<LabRow[]>([]);
    const [dri, setDri] = useState<DRI | ''>('');
    const [results, setResults] = useState<CalculationResult | null>(null);
    const [showPointsTable, setShowPointsTable] = useState(false);
    const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const calculation = useEasixCalculation(labRows, dri);

    const addRow = () => {
        setLabRows(prev => [...prev, { id: crypto.randomUUID(), day: '', ldh: '', creatinine: '', platelets: '' }]);
    };
    const removeRow = (id: string) => {
        setLabRows(prev => prev.filter(row => row.id !== id));
    };
    const updateRow = (id: string, field: keyof Omit<LabRow, 'id'>, value: string) => {
        setLabRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const handleCompute = () => {
        setResults(calculation);
    };

    const handleClear = () => {
        setLabRows([]);
        setResults(null);
        setUploadMessage(null);
    };

    const loadExample = () => {
        setLabRows(EXAMPLE_DATA.map(r => ({...r, id: crypto.randomUUID()})));
        setResults(null);
        setUploadMessage(null);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const result = parseCSV(text);

            if (result.error) {
                setUploadMessage({ type: 'error', text: result.error });
                return;
            }

            setLabRows(result.imported);
            setResults(null);

            // Build success message
            const messages: string[] = [];
            messages.push(`✓ Successfully imported ${result.imported.length} lab ${result.imported.length === 1 ? 'entry' : 'entries'} (${result.complete} ${result.complete === 1 ? 'contributes' : 'contribute'} to computation)`);

            if (result.missingValues > 0) {
                messages.push(`⚠ ${result.missingValues} ${result.missingValues === 1 ? 'entry has' : 'entries have'} missing values (can be filled manually)`);
            }

            if (result.outOfRange > 0) {
                messages.push(`ℹ ${result.outOfRange} ${result.outOfRange === 1 ? 'entry' : 'entries'} outside day 20-120 ${result.outOfRange === 1 ? 'was' : 'were'} excluded`);
            }

            setUploadMessage({
                type: result.missingValues > 0 ? 'warning' : 'success',
                text: messages.join('. ')
            });
        };

        reader.readAsText(file);

        // Reset file input so same file can be uploaded again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };
    
    const getEventRateTone = (rate: number) => {
        if (rate >= 40) return 'border-red-400 bg-red-500/10 text-red-100';
        if (rate >= 20) return 'border-amber-400 bg-amber-500/10 text-amber-100';
        return 'border-green-400 bg-green-500/10 text-green-100';
    };

    const EventRateBadge: React.FC<{ eventRate: number | null }> = ({ eventRate }) => {
        if (eventRate === null) {
            return (
                <div className="px-4 py-2 rounded-lg border border-amber-400 bg-amber-500/10 text-amber-200 text-sm font-semibold text-center">
                    Awaiting ≥2 labs + DRI
                </div>
            );
        }

        return (
            <div className={`px-4 py-3 rounded-lg border text-center shadow-inner ${getEventRateTone(eventRate)}`}>
                <p className="text-xs uppercase tracking-wide opacity-80">2-year event rate</p>
                <p className="text-3xl font-bold font-mono">{eventRate.toFixed(1)}%</p>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-2 sm:p-3 lg:p-4">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400">Dynamic EASIX DRI: Rule-Based Stratifier</h1>
                    <p className="mt-1 text-sm text-gray-400">A research tool for time-dependent EASIX risk stratification.</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    {/* Left Column: Inputs */}
                    <div className="lg:col-span-2 space-y-3">
                        {/* Lab Inputs */}
                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                            <h2 className="text-lg font-semibold mb-2 text-white">1. Transplant Labs (Day +20 to +120)</h2>
                            <div className="space-y-2">
                                {labRows.map((row) => (
                                    <div key={row.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-gray-900/50 p-2 rounded-md">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Day</label>
                                            <div className="flex gap-1 items-center">
                                                <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
                                                    <TrashIcon />
                                                </button>
                                                <input type="number" value={row.day} onChange={e => updateRow(row.id, 'day', e.target.value)} placeholder="e.g. 30" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">LDH (IU/L)</label>
                                            <input type="number" value={row.ldh} onChange={e => updateRow(row.id, 'ldh', e.target.value)} placeholder="e.g. 250" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.ldh) || null} range={[140, 280]} label="Normal" labType="ldh" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Creatinine</label>
                                            <input type="number" step="0.1" value={row.creatinine} onChange={e => updateRow(row.id, 'creatinine', e.target.value)} placeholder="e.g. 0.9" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.creatinine) || null} range={[0.6, 1.3]} label="Normal" labType="creatinine" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Platelets</label>
                                            <input type="number" value={row.platelets} onChange={e => updateRow(row.id, 'platelets', e.target.value)} placeholder="e.g. 150" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.platelets) || null} range={[150, 400]} label="Normal" labType="platelets" />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Upload message */}
                            {uploadMessage && (
                                <div className={`mt-2 p-2 rounded-md text-sm ${
                                    uploadMessage.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                                    uploadMessage.type === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' :
                                    'bg-red-500/20 text-red-400 border border-red-500/50'
                                }`}>
                                    {uploadMessage.text}
                                </div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-2">
                                <button onClick={addRow} className="flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                                    <PlusIcon /> Add Lab Row
                                </button>
                                <button onClick={downloadSampleCSV} className="flex items-center gap-1 text-sm font-medium text-green-400 hover:text-green-300 transition-colors">
                                    <DownloadIcon /> Download Sample CSV
                                </button>
                                <button onClick={triggerFileUpload} className="flex items-center gap-1 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors">
                                    <UploadIcon /> Upload CSV
                                </button>
                            </div>

                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".csv"
                                className="hidden"
                            />
                        </div>

                        {/* Clinical Factors */}
                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                            <h2 className="text-lg font-semibold mb-2 text-white">2. Disease Risk Index</h2>
                            <label htmlFor="dri" className="block text-xs font-medium text-gray-300 mb-0.5">High/Very High vs. Low/Intermediate (required for event-rate prediction)</label>
                            <select id="dri" value={dri} onChange={e => setDri(e.target.value as DRI)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                                <option value="">Select...</option>
                                {Object.values(DRI).map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>

                         <div className="flex items-center gap-2">
                            <button onClick={handleCompute} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-3 rounded-lg transition-colors text-base shadow-md">
                                Compute
                            </button>
                            <button onClick={loadExample} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-3 rounded-lg transition-colors shadow-md text-sm">
                                Load Example
                            </button>
                            <button onClick={handleClear} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors shadow-md text-sm">
                                Clear
                            </button>
                        </div>

                    </div>
                    
                    {/* Right Column: Outputs */}
                    <div className="lg:col-span-3 space-y-3">
                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                            <h2 className="text-lg font-semibold mb-2 text-white">Dynamic Prediction</h2>
                             {results ? (
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-gray-900/50 p-2 rounded-lg">
                                        <div>
                                            <h3 className="text-base font-bold">Landmark Model Output</h3>
                                            {results.classificationNote && results.eventRate2yr === null && (
                                                <p className="text-xs text-gray-300 max-w-md">{results.classificationNote}</p>
                                            )}
                                        </div>
                                        <EventRateBadge eventRate={results.eventRate2yr ?? null} />
                                    </div>
                                    <div className="bg-gray-900/40 p-2 rounded-md text-sm text-gray-300">
                                        The event rate is computed with the dynamic landmark LME + Cox model once ≥2 labs within +20 to +120 days and a DRI selection are provided.
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-sm text-gray-400">Enter lab data, select DRI, and click "Compute" to see the 2-year event rate.</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                            <h2 className="text-lg font-semibold mb-2 text-white">Visualization</h2>
                            <div className="h-64 w-full">
                                <Chart points={results?.points || []} slope={results?.slope || null} intercept={results?.intercept || null} width={600} height={256} />
                            </div>
                        </div>

                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                            <button onClick={() => setShowPointsTable(!showPointsTable)} className="w-full flex justify-between items-center text-left text-base font-semibold text-white">
                                <span>Show Computed Points</span>
                                <ChevronDownIcon />
                            </button>
                            {showPointsTable && results && (
                                <div className="mt-2 overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-700 text-xs text-gray-300 uppercase">
                                            <tr>
                                                <th className="px-2 py-1">Day</th>
                                                <th className="px-2 py-1">EASIX</th>
                                                <th className="px-2 py-1">log₂(EASIX)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-gray-900/50">
                                            {results.points.map((p, i) => (
                                                <tr key={i} className="border-b border-gray-700">
                                                    <td className="px-2 py-1">{p.day.toFixed(0)}</td>
                                                    <td className="px-2 py-1 font-mono">{p.easix.toFixed(2)}</td>
                                                    <td className="px-2 py-1 font-mono">{p.log2Easix.toFixed(3)}</td>
                                                </tr>
                                            ))}
                                            {results.points.length === 0 && (
                                                <tr><td colSpan={3} className="text-center py-2 text-gray-400">No valid points to display.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                         <div className="bg-gray-800 p-3 rounded-lg shadow-lg text-gray-400 text-xs space-y-2">
                            <h2 className="text-base font-semibold text-white">Disclaimers & Limitations</h2>
                            <ul className="list-disc list-inside space-y-1">
                                <li>The model outputs a <strong>predicted 2-year mortality rate</strong> (event rate) derived from the dynamic landmark LME + Cox model documented in the manuscript.</li>
                                <li>EASIX calculations can be confounded by platelet transfusions, acute kidney injury, or sparse sampling—more time points yield more stable predictions.</li>
                                <li>This tool is for <strong>research and educational purposes only</strong> and should not be the sole basis for clinical decisions.</li>
                            </ul>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;
