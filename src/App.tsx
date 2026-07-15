/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, Delete, Equal, Minus, Plus, X, Divide, ArrowLeftRight, ChevronRight, X as CloseIcon } from 'lucide-react';

// -- Audio Utilities --
let audioCtx: AudioContext | null = null;
const initAudio = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playClickSound = () => {
  try {
    const ctx = initAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  } catch (e) {
    console.error(e);
  }
};

const playPrintSound = () => {
  try {
    const ctx = initAudio();
    if (!ctx) return;
    // Mechanical rolling "brrrrrt"
    for (let i = 0; i < 5; i++) {
      const t = ctx.currentTime + i * 0.03;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.02);
      gain.gain.setValueAtTime(0.03, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
    }
    // Paper sliding noise
    const noiseSize = ctx.sampleRate * 0.15;
    const noiseBuffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800; // Muted paper sound
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  } catch(e) {
    console.error(e);
  }
};

interface TapeEntry {
  id: string;
  type: 'number' | 'operator' | 'result' | 'header';
  value: string;
  label?: string;
  title?: string;
}

type ConversionCategory = 'Area' | 'Longitud' | 'Temperatura' | 'Volumen' | 'Peso';
const CONVERSION_UNITS: Record<ConversionCategory, string[]> = {
  Area: ['Metros²', 'Pies²', 'Tarea²'],
  Longitud: ['Metros', 'Pies', 'cm', 'Pulgadas'],
  Temperatura: ['Fahrenheit', 'Celsius'],
  Volumen: ['Galones', 'Litros', 'Mililitros', 'Fl Oz'],
  Peso: ['Libra', 'Kilo', 'Tonelada', 'Onza', 'Gramos']
};

const UNIT_SYMBOLS: Record<string, string> = {
  'Metros²': 'm²',
  'Pies²': 'ft²',
  'Tarea²': 'tar²',
  'Metros': 'm',
  'Pies': 'ft',
  'cm': 'cm',
  'Pulgadas': 'in',
  'Fahrenheit': '°F',
  'Celsius': '°C',
  'Galones': 'gal',
  'Litros': 'L',
  'Mililitros': 'ml',
  'Fl Oz': 'fl oz',
  'Libra': 'lb',
  'Kilo': 'kg',
  'Tonelada': 'ton',
  'Onza': 'oz',
  'Gramos': 'g'
};

export default function App() {
  const [display, setDisplay] = useState('0');
  const [conversionState, setConversionState] = useState<{
    isOpen: boolean;
    category: ConversionCategory | null;
    fromUnit: string | null;
  }>({ isOpen: false, category: null, fromUnit: null });
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [isNewNumber, setIsNewNumber] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isKeypadVisible, setIsKeypadVisible] = useState(true);
  const [tape, setTape] = useState<TapeEntry[]>(() => {
    const saved = localStorage.getItem('calculator-tape');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse tape from localStorage', e);
      }
    }
    return [
      { 
        id: 'h1', 
        type: 'header', 
        value: new Date().toLocaleString('en-US', { 
          day: '2-digit', 
          month: 'short', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).toUpperCase() 
      }
    ];
  });
  
  const tapeEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    localStorage.setItem('calculator-tape', JSON.stringify(tape));
    tapeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    playPrintSound();
  }, [tape]);

  const startEditing = (id: string, currentTitle?: string) => {
    setEditingId(id);
    setEditingText(currentTitle || "");
  };

  const saveTitle = (id: string) => {
    setTape(prev => prev.map(entry => entry.id === id ? { ...entry, title: editingText } : entry));
    setEditingId(null);
  };

  const addToTape = (entry: Omit<TapeEntry, 'id'>) => {
    setTape(prev => [...prev, { ...entry, id: Math.random().toString(36).substr(2, 9) }]);
  };

  const clear = () => {
    const newEntries: TapeEntry[] = [];
    const makeId = () => Math.random().toString(36).substr(2, 9);
    
    if (previousValue !== null && operation) {
      const current = parseFloat(display);
      const result = calculate(previousValue, current, operation);
      const resultStr = result.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
      
      newEntries.push({ type: 'number', value: display, label: operation, id: makeId() });
      newEntries.push({ type: 'result', value: resultStr, label: '=', id: makeId() });
    }

    newEntries.push({ type: 'header', value: '*************************', id: makeId() });
    newEntries.push({ type: 'header', value: '\u00A0', id: makeId() });
    newEntries.push({ type: 'header', value: '\u00A0', id: makeId() });
    newEntries.push({ type: 'header', value: '\u00A0', id: makeId() });

    setTape(prev => [...prev, ...newEntries]);

    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setIsNewNumber(true);
  };

  const handleNumber = (num: string) => {
    if (isNewNumber) {
      setDisplay(num);
      setIsNewNumber(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleOperation = (op: string) => {
    // If the user just pressed an operator and presses it (or another one) again 
    // before typing a new number, just update the operation and do nothing else.
    if (isNewNumber && operation !== null) {
      setOperation(op);
      return;
    }

    const current = parseFloat(display);
    
    if (previousValue === null) {
      setPreviousValue(current);
      addToTape({ type: 'number', value: display });
    } else if (operation) {
      const result = calculate(previousValue, current, operation);
      setPreviousValue(result);
      addToTape({ type: 'number', value: display, label: operation });
    }
    
    setOperation(op);
    setIsNewNumber(true);
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      default: return b;
    }
  };

  const handleEqual = () => {
    if (previousValue === null || !operation) return;
    
    const current = parseFloat(display);
    const result = calculate(previousValue, current, operation);
    const resultStr = result.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
    
    addToTape({ type: 'number', value: display, label: operation });
    addToTape({ type: 'result', value: resultStr, label: '=' });
    addToTape({ type: 'header', value: '*************************' });
    
    // We format result for display as well
    setDisplay(resultStr);
    setPreviousValue(null);
    setOperation(null);
    setIsNewNumber(true);
  };

  const handlePercent = () => {
    const current = parseFloat(display);
    if (isNaN(current)) return;

    let result: number;
    if (previousValue !== null && (operation === '+' || operation === '-')) {
      // Calculamos el porcentaje relativo al valor previo (ej: 100 + 5% -> 5)
      result = previousValue * (current / 100);
    } else {
      // Valor absoluto del porcentaje (ej: 50 * 10% -> 0.1, luego resultaría en 5)
      result = current / 100;
    }
    
    const resultStr = result.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
    setDisplay(resultStr);
    addToTape({ type: 'number', value: resultStr, label: '%' });
    setIsNewNumber(true);
  };

  const handleConversion = (toUnit: string) => {
    const { category, fromUnit } = conversionState;
    if (!category || !fromUnit) return;

    const amount = parseFloat(display);
    if (isNaN(amount)) return;

    let result = amount;
    if (fromUnit !== toUnit) {
      if (category === 'Temperatura') {
        if (fromUnit === 'Celsius' && toUnit === 'Fahrenheit') result = (amount * 9/5) + 32;
        else if (fromUnit === 'Fahrenheit' && toUnit === 'Celsius') result = (amount - 32) * 5/9;
      } else {
        const rates: any = {
          Area: {
            'Metros²': 1,
            'Pies²': 10.7639104,
            'Tarea²': 1 / 628.86,
          },
          Longitud: {
            'Metros': 1,
            'Pies': 3.28084,
            'cm': 100,
            'Pulgadas': 39.3701
          },
          Volumen: {
            'Litros': 1,
            'Galones': 0.264172052,
            'Mililitros': 1000,
            'Fl Oz': 33.8140227
          },
          Peso: {
            'Kilo': 1,
            'Libra': 2.20462,
            'Tonelada': 0.001,
            'Onza': 35.274,
            'Gramos': 1000
          }
        };
        const baseAmount = amount / rates[category][fromUnit];
        result = baseAmount * rates[category][toUnit];
      }
    }

    const resultStr = result.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
    
    const fromSymbol = UNIT_SYMBOLS[fromUnit] || fromUnit;
    const toSymbol = UNIT_SYMBOLS[toUnit] || toUnit;
    
    addToTape({ 
      type: 'result', 
      value: resultStr, 
      label: '⇄', 
      title: `${amount.toLocaleString('en-US')} ${fromSymbol} → ${toSymbol}` 
    });
    
    setDisplay(resultStr);
    setIsNewNumber(true);
    setConversionState({ isOpen: false, category: null, fromUnit: null });
  };

  const handleDelete = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] sm:p-8 relative bg-black/90 sm:bg-transparent">
      {/* Background shadow around phone shape */}
      <div className="hidden sm:block absolute inset-0 bg-black/20 pointer-events-none" />

      {/* Main Calculator Body */}
      <div 
        className="relative w-full sm:max-w-[400px] h-[100dvh] sm:h-[850px] max-h-none sm:max-h-[90vh] calc-body sm:rounded-[48px] overflow-hidden flex flex-col z-10 mx-auto cursor-default"
        onClick={() => setIsKeypadVisible(v => !v)}
      >
        
        {/* Conversion Menu Overlay */}
        <AnimatePresence>
          {conversionState.isOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={(e) => { e.stopPropagation(); setConversionState({ isOpen: false, category: null, fromUnit: null }); }}
            >
              <div 
                className="w-full max-w-[360px] bg-[#252525] rounded-3xl p-5 shadow-2xl border border-white/10"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-5 text-white/90">
                  <h3 className="text-xl font-medium font-sans">
                    {conversionState.fromUnit ? 'Convertir a...' : conversionState.category ? 'Convertir de...' : 'Conversión'}
                  </h3>
                  <button onClick={() => setConversionState({ isOpen: false, category: null, fromUnit: null })} className="p-1 opacity-70 hover:opacity-100">
                    <CloseIcon size={24} />
                  </button>
                </div>

                {!conversionState.category ? (
                  <div className="space-y-3">
                    {(Object.keys(CONVERSION_UNITS) as ConversionCategory[]).map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setConversionState(prev => ({ ...prev, category: cat }))}
                        className="w-full flex items-center justify-between p-4 bg-[#353535] rounded-2xl text-white hover:bg-[#404040] active:scale-[0.98] transition-all"
                      >
                        <span className="text-lg">{cat}</span>
                        <ChevronRight size={20} className="opacity-50" />
                      </button>
                    ))}
                  </div>
                ) : !conversionState.fromUnit ? (
                  <div className="grid grid-cols-2 gap-3">
                    {CONVERSION_UNITS[conversionState.category].map(u => (
                      <button
                        key={u}
                        onClick={() => setConversionState(prev => ({ ...prev, fromUnit: u }))}
                        className="p-4 bg-[#353535] rounded-2xl flex items-center justify-center text-center text-white text-sm hover:bg-[#404040] active:scale-[0.98] transition-all"
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {CONVERSION_UNITS[conversionState.category].map(u => (
                      <button
                        key={u}
                        disabled={u === conversionState.fromUnit}
                        onClick={() => handleConversion(u)}
                        className={`p-4 rounded-2xl flex items-center justify-center text-center text-sm transition-all active:scale-[0.98] ${
                          u === conversionState.fromUnit 
                            ? 'bg-[#303030] text-gray-500 cursor-not-allowed' 
                            : 'bg-[#0a84ff] text-white hover:bg-[#0070e0]'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Paper Roll Mechanism */}
        <div className={`relative w-full flex justify-center perspective-1000 transition-all duration-300 flex-1 min-h-[220px] ${isKeypadVisible ? '' : 'mb-[5px]'}`}>
          {/* Wood side accents */}
          <div className="absolute top-[40px] bottom-0 w-[80%] flex justify-between z-20 px-1 pointer-events-none transition-all duration-300">
            <div className="w-5 h-full wood-panel shadow-[5px_0_10px_rgba(0,0,0,0.5)] rounded-t-xl rounded-b-sm border border-black/40" />
            <div className="w-5 h-full wood-panel shadow-[-5px_0_10px_rgba(0,0,0,0.5)] rounded-t-xl rounded-b-sm border border-black/40" />
          </div>

          {/* Paper roll */}
          <div className="absolute top-[20px] w-[68%] h-[50px] paper-roll rounded-[20px] z-10 flex justify-between items-center shadow-[0_15px_20px_rgba(0,0,0,0.4)]">
            <div className="w-2 h-[40px] paper-roll-side rounded-full -ml-[4px]" />
            <div className="w-2 h-[8px] bg-[#1a1a1a] rounded-full ml-[-2px] shadow-inner opacity-40" />
            <div className="w-2 h-[8px] bg-[#1a1a1a] rounded-full mr-[-2px] shadow-inner opacity-40" />
            <div className="w-2 h-[40px] paper-roll-side rounded-full -mr-[4px]" />
          </div>

          {/* Paper tape */}
          <div 
            className="absolute top-[45px] bottom-[20px] w-[64%] paper-texture z-10 flex flex-col justify-end p-4 font-mono text-[12px] text-[#222] shadow-[0_10px_15px_rgba(0,0,0,0.2)] transition-all duration-300 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto scrollbar-hide flex flex-col pt-10 h-full w-full">
              <AnimatePresence initial={false}>
                {tape.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`w-full ${
                      entry.type === 'result' ? 'mt-1 pt-1' : 
                      entry.type === 'header' ? 'mb-2' : ''
                    }`}
                  >
                    {entry.type === 'header' ? (
                      <span className="w-full text-center tracking-wide block text-[11px] opacity-70 italic">{entry.value}</span>
                    ) : entry.type === 'result' ? (
                        <div 
                          className="w-full flex justify-between items-end leading-[1.3] pt-1 border-t border-black/20 group cursor-pointer"
                          onClick={() => { if(editingId !== entry.id) startEditing(entry.id, entry.title); }}
                        >
                          <div className="text-left w-8 opacity-70 shrink-0">
                            {entry.label}
                          </div>
                          <div className="flex-1 flex justify-between items-end gap-2 overflow-hidden">
                            <div className="flex-1 text-[10px] text-gray-500 uppercase overflow-hidden text-left">
                              {editingId === entry.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onBlur={() => saveTitle(entry.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(entry.id); }}
                                  className="w-full bg-transparent border-b border-gray-400 outline-none text-gray-700 p-0 m-0 h-4"
                                  placeholder="TÍTULO..."
                                />
                              ) : (
                                <div className="truncate">{entry.title}</div>
                              )}
                            </div>
                            <div className="text-right font-bold shrink-0">
                              {parseFloat(entry.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                    ) : (
                      <div 
                        className="w-full flex justify-between items-end leading-[1.3] group cursor-pointer"
                        onClick={() => { if(editingId !== entry.id) startEditing(entry.id, entry.title); }}
                      >
                        <div className="text-left w-8 opacity-70 shrink-0">
                          {entry.label || <span className="opacity-0">.</span>}
                        </div>
                        <div className="flex-1 flex justify-between items-end gap-2 overflow-hidden">
                          <div className="flex-1 text-[10px] text-gray-500 uppercase overflow-hidden text-left">
                              {editingId === entry.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onBlur={() => saveTitle(entry.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(entry.id); }}
                                  className="w-full bg-transparent border-b border-gray-400 outline-none text-gray-700 p-0 m-0 h-4"
                                  placeholder="TÍTULO..."
                                />
                              ) : (
                                <div className="truncate">{entry.title}</div>
                              )}
                          </div>
                          <div className="text-right shrink-0">
                            {parseFloat(entry.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={tapeEndRef} />
            </div>
          </div>

          {/* Cutter / Slot */}
          <div className="absolute bottom-[20px] w-[72%] h-[12px] metal-slot z-30 rounded-[2px]" />
          
          {/* Base under cutter */}
          <div className="absolute bottom-0 w-[90%] h-[24px] bg-gradient-to-b from-[#4a4a4a] to-[#3a3a3a] border-t border-[#111] z-20 rounded-t-[12px] shadow-[0_-5px_10px_rgba(0,0,0,0.2)]" />
        </div>

        {/* LCD Display */}
        <div className="px-8 pb-1 shrink-0 relative flex flex-col justify-end items-end min-h-[60px]">
          <div className="h-[16px] w-full flex items-end justify-end mb-0.5">
            {(previousValue !== null && operation) && (
              <div className="text-right text-sm font-sans font-medium text-[#baa485] opacity-60 tracking-wide leading-none">
                 Subtotal: {(isNewNumber ? previousValue : calculate(previousValue, parseFloat(display), operation)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
          <div className="text-right text-5xl font-sans font-light tracking-tight text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] overflow-hidden whitespace-nowrap leading-none">
            {parseFloat(display).toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Keypad */}
        <div 
          className={`grid grid-cols-4 gap-2 sm:gap-3.5 bg-[#252525] sm:rounded-b-[48px] shadow-[inset_0_20px_20px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out origin-bottom ${isKeypadVisible ? 'shrink-0 p-4 pb-6 sm:p-7 opacity-100 scale-y-100' : 'h-0 p-0 opacity-0 scale-y-0 border-none'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <CalcButton onClick={clear} className="bg-[#ff8c00] text-black">AC</CalcButton>
          <CalcButton onClick={handleDelete} className="bg-[#ff8c00] text-black"><Delete size={22} className="stroke-[2.5]" /></CalcButton>
          <CalcButton onClick={handlePercent} className="bg-[#d4d4d2] text-black font-semibold text-2xl">%</CalcButton>
          <CalcButton onClick={() => handleOperation('/')} className="bg-[#d4d4d2] text-black font-semibold text-2xl">÷</CalcButton>

          <CalcButton onClick={() => handleNumber('7')} className="bg-[#505050] text-[#e0e0e0]">7</CalcButton>
          <CalcButton onClick={() => handleNumber('8')} className="bg-[#505050] text-[#e0e0e0]">8</CalcButton>
          <CalcButton onClick={() => handleNumber('9')} className="bg-[#505050] text-[#e0e0e0]">9</CalcButton>
          <CalcButton onClick={() => handleOperation('*')} className="bg-[#d4d4d2] text-black font-semibold text-2xl">×</CalcButton>

          <CalcButton onClick={() => handleNumber('4')} className="bg-[#505050] text-[#e0e0e0]">4</CalcButton>
          <CalcButton onClick={() => handleNumber('5')} className="bg-[#505050] text-[#e0e0e0]">5</CalcButton>
          <CalcButton onClick={() => handleNumber('6')} className="bg-[#505050] text-[#e0e0e0]">6</CalcButton>
          <CalcButton onClick={() => handleOperation('+')} className="bg-[#d4d4d2] text-black font-semibold text-2xl">+</CalcButton>

          <CalcButton onClick={() => handleNumber('1')} className="bg-[#505050] text-[#e0e0e0]">1</CalcButton>
          <CalcButton onClick={() => handleNumber('2')} className="bg-[#505050] text-[#e0e0e0]">2</CalcButton>
          <CalcButton onClick={() => handleNumber('3')} className="bg-[#505050] text-[#e0e0e0]">3</CalcButton>
          <CalcButton onClick={() => handleOperation('-')} className="bg-[#d4d4d2] text-black font-semibold text-2xl">−</CalcButton>

          <CalcButton onClick={() => setConversionState(prev => ({ ...prev, isOpen: true }))} className="bg-[#505050] text-[#e0e0e0] text-xl font-normal">
            <ArrowLeftRight size={22} className="opacity-80" />
          </CalcButton>
          <CalcButton onClick={() => handleNumber('0')} className="bg-[#505050] text-[#e0e0e0]">0</CalcButton>
          <CalcButton onClick={() => handleNumber('.')} className="bg-[#505050] text-[#e0e0e0]">.</CalcButton>
          <CalcButton onClick={handleEqual} className="bg-[#0a84ff] text-white text-3xl font-normal">=</CalcButton>
        </div>
      </div>
    </div>
  );
}

function CalcButton({ children, onClick, className = '', rowSpan = 1 }: { children: React.ReactNode, onClick: () => void, className?: string, rowSpan?: number }) {
  const isPointerDownTriggered = React.useRef(false);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isPointerDownTriggered.current = true;
    playClickSound();
    triggerHaptic();
    onClick();
    
    setTimeout(() => {
      isPointerDownTriggered.current = false;
    }, 100);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isPointerDownTriggered.current) return;
    playClickSound();
    triggerHaptic();
    onClick();
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`
        flex items-center justify-center
        h-[64px] sm:h-[70px]
        text-xl font-medium font-sans
        rounded-2xl
        calc-btn
        active:calc-btn-active
        ${className}
      `}
      style={{ gridRow: rowSpan > 1 ? `span ${rowSpan}` : 'auto' }}
    >
      {children}
    </motion.button>
  );
}
