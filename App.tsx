
import React, { useState, useCallback } from 'react';
import { Chart } from './components/Chart';
import { MiniGauge } from './components/MiniGauge';
import { useEasixCalculation } from './hooks/useEasixCalculation';
import type { LabRow, DirectEntry, CalculationResult, Classification } from './types';
import { DRI, Prophylaxis, Conditioning } from './types';

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
);
const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
)

const EXAMPLE_DATA: LabRow[] = [
    { id: '1', day: '30', ldh: '250', creatinine: '0.9', platelets: '150' },
    { id: '2', day: '60', ldh: '350', creatinine: '1.1', platelets: '100' },
    { id: '3', day: '85', ldh: '450', creatinine: '1.2', platelets: '80' },
];

const App: React.FC = () => {
    const [labRows, setLabRows] = useState<LabRow[]>([]);
    const [directEntries, setDirectEntries] = useState<DirectEntry[]>([]);
    const [manualSlope, setManualSlope] = useState('');
    const [dri, setDri] = useState<DRI | ''>('');
    const [prophylaxis, setProphylaxis] = useState<Prophylaxis | ''>('');
    const [conditioning, setConditioning] = useState<Conditioning | ''>('');
    const [results, setResults] = useState<CalculationResult | null>(null);
    const [showPointsTable, setShowPointsTable] = useState(false);

    const calculation = useEasixCalculation(labRows, directEntries, manualSlope);

    // Calculate normal ranges for EASIX and LOG2EASIX
    // Based on lab normal ranges: LDH (140-280), Creatinine (0.6-1.3), Platelets (150-400)
    const NORMAL_EASIX_MIN = (140 * 0.6) / 400; // ~0.21
    const NORMAL_EASIX_MAX = (280 * 1.3) / 150; // ~2.427
    const NORMAL_LOG2EASIX_MIN = Math.log(NORMAL_EASIX_MIN) / Math.log(2); // ~-2.252
    const NORMAL_LOG2EASIX_MAX = Math.log(NORMAL_EASIX_MAX) / Math.log(2); // ~1.279

    const addRow = () => {
        setLabRows(prev => [...prev, { id: crypto.randomUUID(), day: '', ldh: '', creatinine: '', platelets: '' }]);
    };
    const removeRow = (id: string) => {
        setLabRows(prev => prev.filter(row => row.id !== id));
    };
    const updateRow = (id: string, field: keyof Omit<LabRow, 'id'>, value: string) => {
        setLabRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const addDirectEntry = () => {
        setDirectEntries(prev => [...prev, { id: crypto.randomUUID(), day: '', value: '', type: 'log2' }]);
    };
    const removeDirectEntry = (id: string) => {
        setDirectEntries(prev => prev.filter(entry => entry.id !== id));
    };
    const updateDirectEntry = (id: string, field: keyof Omit<DirectEntry, 'id'>, value: string) => {
        setDirectEntries(prev => prev.map(entry => entry.id === id ? { ...entry, [field]: value } : entry));
    };

    const handleCompute = () => {
        setResults(calculation);
    };

    const handleClear = () => {
        setLabRows([]);
        setDirectEntries([]);
        setResults(null);
    };

    const loadExample = () => {
        setLabRows(EXAMPLE_DATA.map(r => ({...r, id: crypto.randomUUID()})));
        setDirectEntries([]);
        setManualSlope('');
        setResults(null);
    }
    
    const NRM_DATA = {
        [Prophylaxis.PTCy]: { High: '21.7%', Low: '2.2%' },
        [Prophylaxis.MTX]: { High: '23.5%', Low: '9.1%' },
        [Conditioning.MAC]: { High: '17.4%', Low: '3.9%' },
        [Conditioning.RIC_NMA]: { High: '25.3%', Low: '9.2%' },
    };

    const renderNrmResult = () => {
        if (!results || results.classification === 'Insufficient Data') return <p className="text-sm text-gray-400">Select clinical factors to see group-level outcomes once risk is classified.</p>;
        
        const riskLevel = results.classification;
        const selectedFactors = [prophylaxis, conditioning].filter(Boolean);

        if (selectedFactors.length === 0) {
            return <p className="text-sm text-amber-400">Tip: Select GVHD Prophylaxis and/or Conditioning to see relevant group-level 1-year NRM.</p>;
        }

        return (
            <ul className="space-y-2">
                {prophylaxis && (
                    <li><span className="font-semibold">{prophylaxis}:</span> {NRM_DATA[prophylaxis][riskLevel]}</li>
                )}
                {conditioning && (
                    <li><span className="font-semibold">{conditioning}:</span> {NRM_DATA[conditioning][riskLevel]}</li>
                )}
            </ul>
        );
    };

    const ClassificationBadge: React.FC<{ classification: Classification }> = ({ classification }) => {
        const styles = {
            High: 'bg-red-500/20 text-red-400 border-red-500',
            Low: 'bg-green-500/20 text-green-400 border-green-500',
            'Insufficient Data': 'bg-amber-500/20 text-amber-400 border-amber-500',
        };
        return <span className={`px-3 py-1 text-sm font-bold rounded-full border ${styles[classification]}`}>{classification} Risk</span>;
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
                                        <div className="sm:col-span-4 flex justify-between items-center mb-1">
                                            <label className="text-xs font-medium text-gray-300">Lab entry</label>
                                            <button onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-300 transition-colors"><TrashIcon /></button>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Day</label>
                                            <input type="number" value={row.day} onChange={e => updateRow(row.id, 'day', e.target.value)} placeholder="e.g. 30" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">LDH (IU/L)</label>
                                            <input type="number" value={row.ldh} onChange={e => updateRow(row.id, 'ldh', e.target.value)} placeholder="e.g. 250" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.ldh) || null} range={[140, 280]} label="Normal" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Creatinine</label>
                                            <input type="number" step="0.1" value={row.creatinine} onChange={e => updateRow(row.id, 'creatinine', e.target.value)} placeholder="e.g. 0.9" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.creatinine) || null} range={[0.6, 1.3]} label="Normal" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-0.5">Platelets</label>
                                            <input type="number" value={row.platelets} onChange={e => updateRow(row.id, 'platelets', e.target.value)} placeholder="e.g. 150" className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-sm p-1.5"/>
                                            <MiniGauge value={parseFloat(row.platelets) || null} range={[150, 400]} label="Normal" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addRow} className="mt-2 flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                                <PlusIcon /> Add Lab Row
                            </button>
                        </div>

                        {/* Optional Inputs */}
                        <div className="bg-gray-800 p-3 rounded-lg shadow-lg">
                             <h2 className="text-lg font-semibold mb-2 text-white">2. Optional Overrides & Factors</h2>
                             <div className="space-y-2">
                                 <div>
                                     <label className="block text-xs font-medium text-gray-300 mb-1">Direct Entry</label>
                                     <div className="space-y-2">
                                         {directEntries.map((entry) => (
                                             <div key={entry.id} className="bg-gray-900/50 p-2 rounded-md">
                                                 <div className="flex justify-between items-center mb-1">
                                                     <label className="text-xs font-medium text-gray-300">Direct entry</label>
                                                     <button onClick={() => removeDirectEntry(entry.id)} className="text-red-400 hover:text-red-300 transition-colors"><TrashIcon /></button>
                                                 </div>
                                                 <div className="grid grid-cols-3 gap-1">
                                                     <div>
                                                         <input type="number" placeholder="Day" value={entry.day} onChange={e => updateDirectEntry(entry.id, 'day', e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500"/>
                                                     </div>
                                                     <div>
                                                         <input type="number" step="0.01" placeholder="Value" value={entry.value} onChange={e => updateDirectEntry(entry.id, 'value', e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500"/>
                                                         <MiniGauge
                                                             value={parseFloat(entry.value) || null}
                                                             range={entry.type === 'easix' ? [NORMAL_EASIX_MIN, NORMAL_EASIX_MAX] : [NORMAL_LOG2EASIX_MIN, NORMAL_LOG2EASIX_MAX]}
                                                             label="Normal"
                                                         />
                                                     </div>
                                                     <div>
                                                         <select value={entry.type} onChange={e => updateDirectEntry(entry.id, 'type', e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                                                            <option value="log2">log₂(EASIX)</option>
                                                            <option value="easix">EASIX</option>
                                                         </select>
                                                     </div>
                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                     <button onClick={addDirectEntry} className="mt-2 flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                                         <PlusIcon /> Add Direct Entry
                                     </button>
                                 </div>
                                 <div>
                                     <label htmlFor="manualSlope" className="block text-xs font-medium text-gray-300 mb-0.5">Manual Slope Override (per day)</label>
                                     <input type="number" step="0.0001" id="manualSlope" value={manualSlope} onChange={e => setManualSlope(e.target.value)} placeholder="e.g. 0.0150" className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500"/>
                                 </div>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                     <div>
                                         <label htmlFor="dri" className="block text-xs font-medium text-gray-300 mb-0.5">Disease Risk Index (DRI)</label>
                                         <select id="dri" value={dri} onChange={e => setDri(e.target.value as DRI)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                                            <option value="">Select...</option>
                                            {Object.values(DRI).map(d => <option key={d} value={d}>{d}</option>)}
                                         </select>
                                     </div>
                                     <div>
                                         <label htmlFor="prophylaxis" className="block text-xs font-medium text-gray-300 mb-0.5">GVHD Prophylaxis</label>
                                         <select id="prophylaxis" value={prophylaxis} onChange={e => setProphylaxis(e.target.value as Prophylaxis)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                                            <option value="">Select...</option>
                                            <option value={Prophylaxis.PTCy}>PTCy-based</option>
                                            <option value={Prophylaxis.MTX}>CNI/MTX-based</option>
                                         </select>
                                     </div>
                                     <div>
                                         <label htmlFor="conditioning" className="block text-xs font-medium text-gray-300 mb-0.5">Conditioning</label>
                                         <select id="conditioning" value={conditioning} onChange={e => setConditioning(e.target.value as Conditioning)} className="w-full bg-gray-700 border-gray-600 rounded-md p-1.5 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                                            <option value="">Select...</option>
                                            <option value={Conditioning.MAC}>MAC</option>
                                            <option value={Conditioning.RIC_NMA}>RIC/NMA</option>
                                         </select>
                                     </div>
                                 </div>
                             </div>
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
                            <h2 className="text-lg font-semibold mb-2 text-white">Results & Classification</h2>
                             {results ? (
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-gray-900/50 p-2 rounded-lg">
                                        <div>
                                            <h3 className="text-base font-bold">Day +90 Risk Status</h3>
                                            <p className="text-xs text-gray-400 max-w-md">{results.classificationNote}</p>
                                        </div>
                                        <ClassificationBadge classification={results.classification} />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                                        <div className="bg-gray-700 p-2 rounded-md">
                                            <p className="text-xs text-gray-400">Slope (per day)</p>
                                            <p className="text-xl font-mono font-bold text-cyan-400">{results.slope?.toFixed(4) ?? 'N/A'}</p>
                                        </div>
                                        <div className="bg-gray-700 p-2 rounded-md">
                                            <p className="text-xs text-gray-400">Predicted log₂(EASIX) at D+90</p>
                                            <p className="text-xl font-mono font-bold">{results.predictedDay90?.toFixed(3) ?? 'N/A'}</p>
                                        </div>
                                        <div className="bg-gray-700 p-2 rounded-md">
                                            <p className="text-xs text-gray-400">Predicted log₂(EASIX) at D+120</p>
                                            <p className="text-xl font-mono font-bold">{results.predictedDay120?.toFixed(3) ?? 'N/A'}</p>
                                        </div>
                                    </div>
                                     <div className="bg-gray-900/50 p-2 rounded-lg">
                                        <h3 className="text-base font-bold">Group-level 1-Year NRM</h3>
                                        <div className="mt-1 text-sm text-gray-300">{renderNrmResult()}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-sm text-gray-400">Enter lab data and click "Compute & Classify" to see results.</p>
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
                                                <th className="px-2 py-1">Source</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-gray-900/50">
                                            {results.points.map((p, i) => (
                                                <tr key={i} className="border-b border-gray-700">
                                                    <td className="px-2 py-1">{p.day.toFixed(0)}</td>
                                                    <td className="px-2 py-1 font-mono">{p.easix.toFixed(2)}</td>
                                                    <td className="px-2 py-1 font-mono">{p.log2Easix.toFixed(3)}</td>
                                                    <td className="px-2 py-1 capitalize">{p.source}</td>
                                                </tr>
                                            ))}
                                            {results.points.length === 0 && (
                                                <tr><td colSpan={4} className="text-center py-2 text-gray-400">No valid points to display.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                         <div className="bg-gray-800 p-3 rounded-lg shadow-lg text-gray-400 text-xs space-y-2">
                            <h2 className="text-base font-semibold text-white">Disclaimers & Limitations</h2>
                            <ul className="list-disc list-inside space-y-1">
                                <li>This is a <strong>rule-based stratifier</strong> based on the manuscript, not an individualized probability calculator.</li>
                                <li>High EASIX is defined as <strong>log₂(EASIX) ≥ 2.32</strong> at approximately day +90.</li>
                                <li>EASIX calculations can be confounded by factors like platelet transfusions and acute kidney injury. More timepoints yield a more reliable slope.</li>
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
