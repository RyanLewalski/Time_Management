import { useEffect, useState, useRef } from 'react';
import api from '../api';
import './TimeEntryList.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


function getWeekStart(date) {
  // Returns the Sunday of the week containing 'date'
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day); // Sunday is 0
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function parseTime(str) {
  // str: 'HH:MM' => minutes
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins) {
  const sign = mins < 0 ? '-' : '';
  mins = Math.abs(mins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${sign}${h}:${m.toString().padStart(2, '0')}`;
}

function to24Hour(time, ampm) {
  if (!time) return '';
  let [hours, minutes] = time.split(':').map(Number);
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function pad(num) {
  return num.toString().padStart(2, '0');
}
const HOURS = Array.from({ length: 12 }, (_, i) => pad(i + 1));
const MINUTES = ['00', '15', '30', '45'];


export default function TimeEntryList() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null); // {date: string}
  const [weekStart, setWeekStart] = useState(() => {
    // Get current date in California timezone (America/Los_Angeles)
    const now = new Date();
    const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const localDate = new Date(la.getFullYear(), la.getMonth(), la.getDate());
    return getWeekStart(localDate);
  });
  const [weekCount, setWeekCount] = useState(2); // 1 or 2, could change in the future
  const [standardWeekHours, setStandardWeekHours] = useState(40);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [use24HourFormat, setUse24HourFormat] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const settingsRef = useRef(null);
  const calendarRef = useRef(null);
  const dateInputRef = useRef(null);

  // Form state
  const [startTime, setStartTime] = useState('08:00');
  const [startAMPM, setStartAMPM] = useState('AM');
  const [endTime, setEndTime] = useState('05:00');
  const [endAMPM, setEndAMPM] = useState('PM');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchEntries();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Handle settings dropdown
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
      
      // Handle calendar date input
      if (calendarRef.current && !calendarRef.current.contains(event.target) && 
          dateInputRef.current && !dateInputRef.current.contains(event.target)) {
        setCalendarPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchEntries = () => {
    api.get('timeentries/')
      .then(res => {
        setEntries(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Error fetching time entries');
        setLoading(false);
      });
  };

  // Navigation
  const handlePrev = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7 * weekCount);
    setWeekStart(prev);
    setSelectedCell(null);
  };
  const handleNext = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7 * weekCount);
    setWeekStart(next);
    setSelectedCell(null);
  };

  // Reset logic
  const handleReset = async () => {
    setResetConfirmOpen(true);
  };

  const confirmReset = async () => {
    // Get all dates in the current view
    const daysInView = days.map(d => formatDate(d));
    // Find entries to delete (only those in the current view)
    const toDelete = entries.filter(e => daysInView.includes(e.date));
    // Delete each entry (assuming DELETE /timeentries/:id/)
    await Promise.all(toDelete.map(e => api.delete(`timeentries/${e.id}/`)));
    fetchEntries();
    setSelectedCell(null);
    setResetConfirmOpen(false);
  };

  // Build N weeks of days
  const days = [];
  for (let week = 0; week < weekCount; week++) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + week * 7 + i);
      days.push(new Date(d));
    }
  }

  // Group entries by date
  const entryMap = {};
  entries.forEach(entry => {
    entryMap[entry.date] = entry;
  });

  // Calculate summary rows
  function getWeekSummary(startIdx) {
    let totalMins = 0;
    for (let i = 0; i < 7; i++) {
      const d = days[startIdx + i];
      const entry = entryMap[formatDate(d)];
      if (entry && entry.start_time && entry.end_time) {
        const start = parseTime(entry.start_time);
        const end = parseTime(entry.end_time);
        if (start !== null && end !== null && end > start) {
          totalMins += end - start;
        }
      }
    }
    const hoursWorked = minutesToHHMM(totalMins);
    const hoursRemaining = minutesToHHMM(standardWeekHours * 60 - totalMins);
    const differential = minutesToHHMM(totalMins - standardWeekHours * 60);
    return { hoursWorked, hoursRemaining, differential, rawHoursWorked: hoursWorked, rawDifferential: differential };
  }

  let summaryRows = [];
  if (days.length >= 7) {
    const week1 = getWeekSummary(0);
    summaryRows.push({
      label: `Week of ${formatDate(days[0])} - ${formatDate(days[6])}`,
      ...week1
    });
  }
  if (weekCount === 2 && days.length >= 14) {
    const week2 = getWeekSummary(7);
    summaryRows.push({
      label: `Week of ${formatDate(days[7])} - ${formatDate(days[13])}`,
      ...week2
    });
  }

  // Always calculate pay period total
  const payPeriodMins = (() => {
    let mins = 0;
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const entry = entryMap[formatDate(d)];
      if (entry && entry.start_time && entry.end_time) {
        const start = parseTime(entry.start_time);
        const end = parseTime(entry.end_time);
        if (start !== null && end !== null && end > start) {
          mins += end - start;
        }
      }
    }
    return mins;
  })();
  const payPeriodHours = minutesToHHMM(payPeriodMins);
  const payPeriodRemaining = minutesToHHMM(standardWeekHours * weekCount * 60 - payPeriodMins);
  const payPeriodDiff = minutesToHHMM(payPeriodMins - standardWeekHours * weekCount * 60);
  summaryRows.push({
    label: `Pay Period of ${formatDate(days[0])} - ${formatDate(days[days.length - 1])}`,
    hoursWorked: payPeriodHours,
    hoursRemaining: payPeriodRemaining,
    differential: payPeriodDiff,
    rawHoursWorked: payPeriodHours,
    rawDifferential: payPeriodDiff,
  });

  const formatTimeInput = (value) => {
    // Used for formatting on blur only. Allows free editing during typing.
    value = value.trim();
    if (!value) return '';

    if (value.includes(':')) {
      // Respect user input with colon, pad both sides
      let [h, m] = value.split(':');
      h = (h || '').padStart(2, '0').slice(-2);
      m = (m || '').padEnd(2, '0').slice(0, 2);
      return `${h}:${m}`;
    }

    // Fallback: remove non-digits and format as HH:MM
    let digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 4) {
      const hours = digits.slice(0, 2);
      const minutes = digits.slice(2).padEnd(2, '0');
      return `${hours}:${minutes}`;
    } else {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }
  };

  const formatDisplayTime = (time) => {
    if (!time) return '';
    if (use24HourFormat) {
      // Remove seconds from 24-hour format
      return time.split(':').slice(0, 2).join(':');
    }
    
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Get current date in California timezone for 'today' highlighting
  const getCaliforniaToday = () => {
    const now = new Date();
    const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    return new Date(la.getFullYear(), la.getMonth(), la.getDate());
  };
  const californiaTodayStr = formatDate(getCaliforniaToday());

  return (
    <div className="time-entry-container">
      <div className="settings-button-container" ref={settingsRef}>
        <button
          className="settings-button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings"
        >
          ⚙️
        </button>
        {settingsOpen && (
          <div className="settings-dropdown">
            <div className="settings-section">
              <h4>View Settings</h4>
              <div className="settings-option">
                <label>Period Length:</label>
                <select 
                  value={weekCount} 
                  onChange={(e) => setWeekCount(Number(e.target.value))}
                >
                  <option value={1}>1 Week</option>
                  <option value={2}>2 Weeks</option>
                </select>
              </div>
              <div className="settings-option">
                <label>Standard Hours per Week:</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={standardWeekHours}
                  onChange={(e) => setStandardWeekHours(Number(e.target.value))}
                />
              </div>
              <div className="settings-option">
                <label>Time Format:</label>
                <select 
                  value={use24HourFormat ? '24' : '12'} 
                  onChange={(e) => setUse24HourFormat(e.target.value === '24')}
                >
                  <option value="12">12-Hour</option>
                  <option value="24">24-Hour</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="calendar-nav-row">
        <button className="calendar-nav" onClick={handlePrev}>Prev</button>
        <div className="calendar-title">
          {weekStart.toLocaleString('default', { month: 'long', year: 'numeric' })}
          <div ref={calendarRef}>
            <button
              className="calendar-date-btn"
              title="Jump to date"
              onClick={() => {
                setCalendarPickerOpen(!calendarPickerOpen);
                if (!calendarPickerOpen) {
                  setTimeout(() => dateInputRef.current && dateInputRef.current.showPicker && dateInputRef.current.showPicker(), 0);
                }
              }}
            >
              📅
            </button>
            <input
              type="date"
              ref={dateInputRef}
              className="calendar-date-input"
              style={{ display: calendarPickerOpen ? 'inline-block' : 'none' }}
              onChange={e => {
                setCalendarPickerOpen(false);
                if (e.target.value) {
                  setWeekStart(getWeekStart(new Date(e.target.value)));
                  setSelectedCell(null);
                }
              }}
            />
          </div>
        </div>
        <button className="calendar-nav" onClick={handleNext}>Next</button>
      </div>
      <div className="calendar-toggle-row">
        <button
          className="calendar-reset"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
      {resetConfirmOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirm Reset</h3>
            <p>Are you sure you want to reset all time entries for the current period?</p>
            <p>This action cannot be undone.</p>
            <div className="modal-buttons">
              <button 
                className="modal-button cancel"
                onClick={() => setResetConfirmOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="modal-button confirm"
                onClick={confirmReset}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="calendar-grid-2w">
        {days.map((date, idx) => {
          const entry = entryMap[formatDate(date)];
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const isToday = formatDate(date) === californiaTodayStr;
          return (
            <div
              key={idx}
              className={`calendar-cell${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}${selectedCell && selectedCell.date === formatDate(date) ? ' selected' : ''}`}
              onClick={() => setSelectedCell({ date: formatDate(date) })}
            >
              <div className="cell-date" style={{ color: isToday ? '#d32f2f' : isWeekend ? '#888' : '#1976d2', fontWeight: isToday ? 'bold' : 'normal' }}>
                {DAYS[date.getDay()]} {date.toLocaleDateString()}
              </div>
              <div className="cell-row"><span>Clock In:</span> <span>{formatDisplayTime(entry?.start_time) || ''}</span></div>
              <div className="cell-row"><span>Clock Out:</span> <span>{formatDisplayTime(entry?.end_time) || ''}</span></div>
              <div className="cell-row"><span>Raw:</span> <span>{entry && entry.start_time && entry.end_time ? minutesToHHMM(parseTime(entry.end_time) - parseTime(entry.start_time)) : '0:00'}</span></div>
              {entry?.notes && <div className="cell-row"><span>Notes:</span> <span>{entry.notes}</span></div>}
            </div>
          );
        })}
      </div>
      {selectedCell && (
        <form onSubmit={e => {
          e.preventDefault();
          if (!selectedCell) return;
          
          // Convert times to 24-hour format
          const start24 = to24Hour(startTime, startAMPM);
          const end24 = to24Hour(endTime, endAMPM);
          
          console.log('Submitting times:', {
            date: selectedCell.date,
            start_time: start24,
            end_time: end24,
            notes
          });

          // Format the request data
          const requestData = {
            date: selectedCell.date,
            start_time: start24,
            end_time: end24,
            notes: notes || ''  // Ensure notes is never null
          };

          api.post('timeentries/', requestData)
            .then(response => {
              console.log('Success:', response);
              setStartTime('08:00');
              setStartAMPM('AM');
              setEndTime('05:00');
              setEndAMPM('PM');
              setNotes('');
              setSelectedCell(null);
              fetchEntries();
            })
            .catch(err => {
              console.error('Error:', err.response?.data || err.message);
              setError(err.response?.data?.message || err.message || 'Error submitting time entry');
            });
        }} className="time-entry-form">
          <button
            type="button"
            className="form-close-btn"
            aria-label="Close"
            onClick={() => setSelectedCell(null)}
          >
            ×
          </button>
          <h3>Enter time for {selectedCell.date}</h3>
          <div className="form-fields-row">
            <div className="form-group">
              <label>Clock In</label>
              <div className="form-time-row">
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  onBlur={(e) => {
                    const formatted = formatTimeInput(e.target.value);
                    setStartTime(formatted);
                  }}
                  placeholder="HH:MM"
                  className="time-input"
                />
                <select 
                  value={startAMPM} 
                  onChange={e => setStartAMPM(e.target.value)} 
                  className="ampm-select"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Clock Out</label>
              <div className="form-time-row">
                <input
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  onBlur={(e) => {
                    const formatted = formatTimeInput(e.target.value);
                    setEndTime(formatted);
                  }}
                  placeholder="HH:MM"
                  className="time-input"
                />
                <select 
                  value={endAMPM} 
                  onChange={e => setEndAMPM(e.target.value)} 
                  className="ampm-select"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <button 
            type="submit" 
            className="form-submit-btn"
            onClick={(e) => {
              console.log('Submit button clicked');
              console.log('Current state:', {
                startTime,
                startAMPM,
                endTime,
                endAMPM,
                notes
              });
            }}
          >
            Submit
          </button>
        </form>
      )}
      <div className="remaining-time-message">
        Hours still needed to be worked this pay period: {payPeriodRemaining}
      </div>
      <div className="summary-table-section">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Week/Period</th>
              <th>Hours Worked</th>
              <th>Hours Remaining</th>
              <th>Differential</th>
              <th>Raw Hours Worked</th>
              <th>Raw Differential</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row, i) => (
              <tr key={i}>
                <td>{row.label}</td>
                <td>{row.hoursWorked}</td>
                <td>{row.hoursRemaining}</td>
                <td>{row.differential}</td>
                <td>{row.rawHoursWorked}</td>
                <td>{row.rawDifferential}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
