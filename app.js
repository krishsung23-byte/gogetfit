// --- Safe Initialization ---
function safeUpdateIcons() {
  try {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  } catch (e) {
    console.warn("Lucide icons could not be loaded.", e);
  }
}
safeUpdateIcons();

// --- Global App State ---
let activeProgressTab = 'weight'; // weight, strength, bodyfat
let activeTimeFilter = 'all'; // 7, 30, all
let activeStrengthToggle = 'topset'; // topset, 1rm

// Mock Data
const appData = {
  weight: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    data: [82.5, 81.2, 80.0, 79.8, 78.9, 78.5, 78.0, 77.2, 76.5, 75.8, 75.2, 74.9]
  },
  bodyfat: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    data: [25.0, 24.5, 23.8, 23.0, 22.8, 22.5, 21.8, 21.0, 20.5, 19.8, 19.2, 18.5]
  },
  strength: {
    labels: ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5', 'Wk6', 'Wk7', 'Wk8', 'Wk9', 'Wk10', 'Wk11', 'Wk12'],
    topset: [80, 80, 85, 85, 90, 92.5, 92.5, 95, 95, 100, 102.5, 105],
    est1rm: [85, 88, 92, 94, 98, 101, 103, 105, 108, 112, 115, 118]
  }
};

let userProfile = {
  name: '',
  height: 175,
  currentWeight: 78.5,
  goalWeight: 70.0
};
let historyStack = ['dashboard'];

function updateGreeting() {
  const hour = new Date().getHours();
  let timeGreeting = 'Good Evening';
  if(hour < 12) timeGreeting = 'Good Morning';
  else if(hour < 18) timeGreeting = 'Good Afternoon';
  
  const name = userProfile.name.trim() || 'Athlete';
  const greetingEl = document.getElementById('dash-greeting');
  if(greetingEl) greetingEl.innerText = `${timeGreeting}, ${name}`;
}

function updateProfile(key, val) {
  if (key === 'name') {
    userProfile.name = val;
    updateGreeting();
  } else {
    userProfile[key] = parseFloat(val) || 0;
    if(activeProgressTab === 'weight') calculateWeightMetrics();
  }
}

// --- Navigation & Tab Switching ---
function switchTab(tabId, isBackNavigation = false) {
  if (!isBackNavigation && historyStack[historyStack.length - 1] !== tabId) {
    historyStack.push(tabId);
  }

  // Update Bottom Nav UI
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if(activeBtn) activeBtn.classList.add('active');

  // Switch Screens
  const targetScreen = document.getElementById(`screen-${tabId}`);
  
  // SAFE FALLBACK: Prevent black screen if route is missing
  if(!targetScreen) {
    console.error(`Fallback triggered: Screen ${tabId} is missing.`);
    return; 
  }
  
  document.querySelectorAll('.screen:not(.detail-screen)').forEach(screen => {
    screen.classList.remove('active');
  });
  targetScreen.classList.add('active');
  
  if(tabId === 'progress') {
    renderChart();
  }
}

function startWorkoutFlow() {
  if (currentParsedPlan.length === 0 || activeDayExercises.length === 0) {
    // Missing inputs: intercept and force user to import/select
    switchTab('workout');
    const wrkContainer = document.getElementById('today-workout-container');
    if(wrkContainer) wrkContainer.style.display = 'none';
    const selContainer = document.getElementById('day-selection-container');
    
    if (currentParsedPlan.length === 0) {
      if(selContainer) selContainer.style.display = 'none';
      const pasteCardEl = document.querySelector('.paste-card');
      if(pasteCardEl) pasteCardEl.style.display = 'block';
    } else {
      if(selContainer) selContainer.style.display = 'block';
    }
  } else {
    // Inputs complete, proceed to active workout
    switchTab('workout');
    const selContainer = document.getElementById('day-selection-container');
    if(selContainer) selContainer.style.display = 'none';
    const wrkContainer = document.getElementById('today-workout-container');
    if(wrkContainer) wrkContainer.style.display = 'block';
  }
}

function navigateBack() {
  if (historyStack.length > 1) {
    historyStack.pop();
    const prevTab = historyStack[historyStack.length - 1];
    switchTab(prevTab, true);
  }
}

// --- Chart Filtering Methods ---
function setChartFilter(filter) {
  activeTimeFilter = filter;
  document.querySelectorAll('.time-filters .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.toLowerCase() === filter || (filter==='7' && btn.innerText==='7D') || (filter==='30' && btn.innerText==='30D'));
  });
  renderChart();
}

function setStrengthMetric(metric) {
  activeStrengthToggle = metric;
  document.querySelectorAll('#strength-toggles .toggle-pill').forEach(btn => {
    btn.classList.toggle('active', 
      (metric === 'topset' && btn.innerText.includes('Top Set')) || 
      (metric === '1rm' && btn.innerText.includes('1RM'))
    );
  });
  renderChart();
}

// --- Progress Chart (Chart.js) ---
let mainChartInstance = null;

function renderChart() {
  const ctx = document.getElementById('mainChart');
  if(!ctx || typeof Chart === 'undefined') return;
  
  if(mainChartInstance) {
    mainChartInstance.destroy();
  }

  let rawLabels = [];
  let rawData = [];
  let color = '#00FFA3';
  let bgColor = 'rgba(0, 255, 163, 0.1)';

  // Select dataset
  let unit = 'kg';
  if(activeProgressTab === 'weight') {
    rawLabels = appData.weight.labels;
    rawData = appData.weight.data;
  } else if(activeProgressTab === 'bodyfat') {
    rawLabels = appData.bodyfat.labels;
    rawData = appData.bodyfat.data;
    color = '#00B8FF'; // Neon blue for Body Fat
    bgColor = 'rgba(0, 184, 255, 0.1)';
    unit = '%';
  } else if(activeProgressTab === 'strength') {
    rawLabels = appData.strength.labels;
    rawData = activeStrengthToggle === 'topset' ? appData.strength.topset : appData.strength.est1rm;
    color = '#FF0055';
    bgColor = 'rgba(255, 0, 85, 0.1)';
  }

  // Apply time filter
  let labels = [...rawLabels];
  let dataPoints = [...rawData];
  
  if(activeTimeFilter === '7') {
    labels = labels.slice(-7);
    dataPoints = dataPoints.slice(-7);
    
    // Generate real calendar days for 7D chart
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const newLabels = [];
    for(let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      newLabels.push(weekDays[d.getDay()]);
    }
    labels = newLabels;
  } else if(activeTimeFilter === '30') {
    labels = labels.slice(-30);
    dataPoints = dataPoints.slice(-30);
  }

  // Adjust container width for horizontal scroll
  const containerInner = document.getElementById('chart-container-inner');
  if(containerInner) {
    if(activeTimeFilter === 'all' && labels.length > 8) {
      containerInner.style.minWidth = (labels.length * 40) + 'px'; 
    } else {
      containerInner.style.minWidth = '100%';
    }
  }

  const config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: activeProgressTab.toUpperCase(),
        data: dataPoints,
        borderColor: color,
        backgroundColor: bgColor,
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#0A0A0A',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1A1A',
          titleColor: '#A0A0A0',
          bodyColor: '#FFF',
          borderColor: '#2A2A2A',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return context.parsed.y + ' ' + unit;
            }
          }
        }
      },
      scales: {
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#A0A0A0' } },
        x: { grid: { display: false }, ticks: { color: '#A0A0A0' } }
      }
    }
  };

  mainChartInstance = new Chart(ctx, config);
}

// --- Smart Paste-to-Workout Parsing ---
let currentParsedPlan = [];

function formatReps(repStr) {
  if(!repStr) return null;
  let cleaned = repStr.replace(/\s*(?:-|to|~)\s*/i, '–').replace(/target|sets|set|reps|rep|x/gi, '').trim();
  cleaned = cleaned.replace(/[^\d–\-]/g, '').trim();
  return cleaned;
}

function cleanExerciseName(name) {
  if (!name) return "";
  return name
    .replace(/[-–—]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const parserPatterns = [
  {
    re: /(?:^|\s)(?:(\d+)\s*(?:x|times|sets|set))(?:\s*(?:x|of|for)?\s*(\d+(?:\s*(?:-|–|to|~)\s*\d+)?(?:(?:\s*reps|\s*rep)?)))?/i,
    parse: m => ({ sets: parseInt(m[1]), reps: formatReps(m[2]) })
  },
  {
    re: /target:\s*(\d+(?:\s*(?:-|–|to|~)\s*\d+)?)/i,
    parse: m => ({ sets: null, reps: formatReps(m[1]) })
  },
  {
    re: /(?:^|\s)(\d+(?:\s*(?:-|–|to|~)\s*\d+)?)\s*(?:reps|rep)/i,
    parse: m => ({ sets: null, reps: formatReps(m[1]) })
  },
  {
    re: /^(\d)(\d{1,2}(?:\s*(?:-|–|to|~)\s*\d+)?)$/,
    parse: m => ({ sets: parseInt(m[1]), reps: formatReps(m[2]) })
  },
  {
    re: /^(\d+)\s*(?:-|–|to|~)\s*(\d+(?:\s*(?:-|–|to|~)\s*\d+)?)$/,
    parse: m => ({ sets: parseInt(m[1]), reps: formatReps(m[2]) })
  }
];

function cleanExerciseName(name) {
  if (!name) return "";
  return name.replace(/[-–—]+/g, '').replace(/\s+/g, ' ').trim();
}

function parseWorkout() {
  const input = document.getElementById('paste-workout-input');
  if(!input || !input.value.trim()) return;

  const lines = input.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let days = [];
  let currentDay = null;
  const dayRegex = /^(day \d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|push|pull|legs)/i;
  
  lines.forEach(line => {
    let rawLine = line.replace(/×/g, 'x');

    if (rawLine.endsWith(':') || dayRegex.test(rawLine)) {
      let dayName = rawLine.replace(':', '').trim();
      currentDay = { id: 'd_'+Date.now()+'_'+Math.random(), name: dayName, exercises: [] };
      days.push(currentDay);
    } else {
      if (!currentDay) {
        currentDay = { id: 'd_'+Date.now(), name: 'Workout 1', exercises: [] };
        days.push(currentDay);
      }
      
      const pureTestStr = rawLine.replace(/target|sets|set|reps|rep|:/gi, '').replace(/\s+/g, '');
      const isPure = pureTestStr.length > 0 && /^[\d\-x~]+$/.test(pureTestStr);
      
      if (isPure) {
        if (currentDay.exercises.length > 0) {
          let lastEx = currentDay.exercises[currentDay.exercises.length - 1];
          for (const p of parserPatterns) {
            const match = rawLine.match(p.re);
            if (match) {
              const parsed = p.parse(match);
              if (!lastEx.hasExplicitSets && parsed.sets !== null) {
                lastEx.sets = parsed.sets;
                if (parsed.reps !== null) lastEx.reps = parsed.reps;
                lastEx.hasExplicitSets = true;
              } else if (parsed.sets === null && parsed.reps !== null) {
                lastEx.reps = parsed.reps;
              }
              break;
            }
          }
        }
        return; 
      }
      
      let sets = 3;
      let reps = '8–12';
      let name = rawLine;
      let hasExplicitSets = false;
      
      for (const p of parserPatterns) {
        const match = rawLine.match(p.re);
        if (match) {
          const parsed = p.parse(match);
          if (parsed.sets !== null) sets = parsed.sets;
          if (parsed.reps !== null) reps = parsed.reps;
          name = rawLine.replace(match[0], '');
          hasExplicitSets = true;
          break;
        }
      }
      
      name = cleanExerciseName(name); 
      
      if (name) {
        currentDay.exercises.push({ name, sets, reps, hasExplicitSets });
      }
    }
  });

  currentParsedPlan = days;
  syncDashboardFocus();
  renderParsedPreview();
}

function syncDashboardFocus() {
  if (currentParsedPlan && currentParsedPlan.length > 0) {
    // Read from the global single source of truth
    const focusDay = currentParsedPlan[activeDayIndex] || currentParsedPlan[0];
    const nameEl = document.getElementById('dash-workout-name');
    const countEl = document.getElementById('dash-workout-count');
    if(nameEl) nameEl.innerText = focusDay.name;
    if(countEl) countEl.innerText = `${focusDay.exercises.length} Exercises`;
  }
}

function renderParsedPreview() {
  const container = document.getElementById('parsed-days-container');
  if(!container) return;
  container.innerHTML = '';
  
  currentParsedPlan.forEach((day, dIdx) => {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'parsed-day';
    
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <input type="text" class="parsed-input parsed-day-title" style="margin-bottom:0; width:auto; flex:1;" value="${day.name}" onchange="updateParsedDay(${dIdx}, this.value)">
      </div>`;
    
    day.exercises.forEach((ex, eIdx) => {
      html += `
        <div class="parsed-ex" style="display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <i data-lucide="check-circle" style="width: 14px; height: 14px; margin-right: 12px; color: var(--neon-blue);"></i> 
          <input type="text" class="parsed-input" value="${ex.name}" onchange="updateParsedEx(${dIdx}, ${eIdx}, this.value)" style="flex:1; margin-bottom: 0;">
          <span style="font-size: 14px; color: var(--text-secondary); margin-left: 12px; min-width: 80px; text-align: right;">${ex.sets} x ${ex.reps}</span>
        </div>`;
    });
    
    dayDiv.innerHTML = html;
    container.appendChild(dayDiv);
  });
  
  safeUpdateIcons();
  
  const previewEl = document.getElementById('parsed-preview');
  if(previewEl) previewEl.style.display = 'block';
}

function updateParsedDay(dIdx, newVal) {
  if(currentParsedPlan[dIdx]) currentParsedPlan[dIdx].name = newVal;
}

function updateParsedEx(dIdx, eIdx, newVal) {
  if(currentParsedPlan[dIdx] && currentParsedPlan[dIdx].exercises[eIdx]) {
    currentParsedPlan[dIdx].exercises[eIdx].name = newVal;
  }
}

function saveParsedWorkout() {
  if (currentParsedPlan.length === 0) return;
  
  const dayList = document.getElementById('day-selection-list');
  if(dayList) {
    dayList.innerHTML = '';
    
    currentParsedPlan.forEach((day, idx) => {
      const card = document.createElement('div');
      card.className = 'day-card';
      card.onclick = () => selectWorkoutDay(idx);
      
      card.innerHTML = `
        <div>
          <div class="day-title">${day.name}</div>
          <div class="day-subtitle">${day.exercises.length} Exercises</div>
        </div>
        <i data-lucide="chevron-right" style="color:var(--text-secondary);"></i>
      `;
      dayList.appendChild(card);
    });
  }
  
  safeUpdateIcons();
  
  const inputEl = document.getElementById('paste-workout-input');
  if(inputEl) inputEl.value = '';
  
  const previewEl = document.getElementById('parsed-preview');
  if(previewEl) previewEl.style.display = 'none';
  
  const pasteCardEl = document.querySelector('.paste-card');
  if(pasteCardEl) pasteCardEl.style.display = 'none';
  
  const selectionEl = document.getElementById('day-selection-container');
  if(selectionEl) selectionEl.style.display = 'block';
}

// --- Exercise Detail Page ---
let detailChartInstance = null;

function openExerciseDetail(exerciseName) {
  const titleEl = document.getElementById('detail-exercise-name');
  if(titleEl) titleEl.innerText = exerciseName;
  
  const screenEl = document.getElementById('screen-exercise-detail');
  if(screenEl) screenEl.style.display = 'block';
  document.body.style.overflow = 'hidden';
  
  const topWeight = 100;
  const topReps = 5;
  const est1RM = Math.round(topWeight * (1 + topReps/30));
  
  const prEl = document.getElementById('detail-pr');
  if(prEl) prEl.innerText = est1RM;
  
  const ctx = document.getElementById('detailChart');
  if(ctx && typeof Chart !== 'undefined') {
    if(detailChartInstance) detailChartInstance.destroy();
    detailChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Oct 29', 'Nov 5'],
        datasets: [{
          label: '1RM (kg)',
          data: [95, 95, 100, 100, 102.5, est1RM],
          borderColor: '#00FFA3',
          backgroundColor: 'rgba(0, 255, 163, 0.1)',
          borderWidth: 3, tension: 0.1, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#A0A0A0' } },
          x: { grid: { display: false }, ticks: { color: '#A0A0A0' } }
        }
      }
    });
  }

  const historyList = document.getElementById('detail-history-list');
  if(historyList) {
    historyList.innerHTML = `
      <div class="history-item">
        <div>
          <div class="h-date">Nov 5</div>
          <div class="subtitle">3 sets</div>
        </div>
        <div class="h-perf">${topWeight}kg x ${topReps}</div>
      </div>
      <div class="history-item">
        <div>
          <div class="h-date">Oct 29</div>
          <div class="subtitle">3 sets</div>
        </div>
        <div class="h-perf">100kg x 4</div>
      </div>
    `;
  }
}

function closeExerciseDetail() {
  const screenEl = document.getElementById('screen-exercise-detail');
  if(screenEl) screenEl.style.display = 'none';
  document.body.style.overflow = '';
}

// --- Modals & Logging ---
function openWeightModal() { 
  const el = document.getElementById('weight-modal');
  if(el) el.style.display = 'flex'; 
}
function closeWeightModal() { 
  const el = document.getElementById('weight-modal');
  if(el) el.style.display = 'none'; 
}

function logWeight() {
  const weightInput = document.getElementById('weight-input');
  if(!weightInput) return;
  const weight = weightInput.value;
  
  if(!weight || parseFloat(weight) <= 0) {
    alert("Weight must be a positive number.");
    return;
  }
  
  const displayEl = document.getElementById('display-weight');
  if(displayEl) displayEl.innerText = weight;
  
  appData.weight.data.push(parseFloat(weight));
  appData.weight.labels.push('Today');
  
  userProfile.currentWeight = parseFloat(weight);
  
  
  if(activeProgressTab === 'weight') {
    renderChart();
    calculateWeightMetrics();
  }
  
  weightInput.value = '';
  closeWeightModal();
}

function openBodyFatModal() { 
  const el = document.getElementById('bodyfat-modal');
  if(el) el.style.display = 'flex'; 
}
function closeBodyFatModal() { 
  const el = document.getElementById('bodyfat-modal');
  if(el) el.style.display = 'none'; 
}

function logBodyFat() {
  const bfInput = document.getElementById('bodyfat-input');
  if(!bfInput) return;
  const bf = bfInput.value;
  if(!bf) return alert("Please enter body fat %.");
  
  appData.bodyfat.data.push(parseFloat(bf));
  appData.bodyfat.labels.push('Today');
  
  if(activeProgressTab === 'bodyfat') renderChart();
  
  bfInput.value = '';
  closeBodyFatModal();
}

function openManualExerciseModal() { 
  const el = document.getElementById('manual-exercise-modal');
  if(el) el.style.display = 'flex'; 
}
function closeManualExerciseModal() { 
  const el = document.getElementById('manual-exercise-modal');
  if(el) el.style.display = 'none'; 
}

function addManualExercise() {
  const nameEl = document.getElementById('manual-ex-name');
  const setsEl = document.getElementById('manual-ex-sets');
  const repsEl = document.getElementById('manual-ex-reps');
  if(!nameEl || !setsEl || !repsEl) return;
  
  const name = nameEl.value;
  const sets = parseInt(setsEl.value) || 3;
  const reps = repsEl.value || '8-12';
  
  if(!name) return alert("Please enter an exercise name.");
  
  const ex = { name, sets, reps };
  const listEl = document.getElementById('today-exercise-list');
  if(listEl) {
    renderLoggingCard(ex, listEl);
    safeUpdateIcons();
  }
  
  nameEl.value = '';
  setsEl.value = '3';
  repsEl.value = '';
  closeManualExerciseModal();
}

// Removed old updateGoalWeight in favor of updateProfile

// --- Workflow Selection ---
let activeDayIndex = 0;
let activeDayExercises = [];

function selectWorkoutDay(dayIndex) {
  activeDayIndex = dayIndex;
  const day = currentParsedPlan[activeDayIndex];
  if(!day) return;
  activeDayExercises = day.exercises;
  
  // Instantly propagate the selection back to the Dashboard
  syncDashboardFocus();
  
  const selContainer = document.getElementById('day-selection-container');
  if(selContainer) selContainer.style.display = 'none';
  const wrkContainer = document.getElementById('today-workout-container');
  if(wrkContainer) wrkContainer.style.display = 'block';
  
  const titleEl = document.getElementById('today-workout-title');
  if(titleEl) titleEl.innerText = day.name;
  
  const today = new Date();
  const dateEl = document.getElementById('today-workout-date');
  if(dateEl) dateEl.innerText = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  
  const countEl = document.getElementById('today-workout-count');
  if(countEl) countEl.innerText = `${day.exercises.length} Exercises`;
  
  const listContainer = document.getElementById('today-exercise-list');
  if(listContainer) {
    listContainer.innerHTML = '';
    activeDayExercises.forEach(ex => {
      renderLoggingCard(ex, listContainer);
    });
  }
  
  safeUpdateIcons();
}

function closeActiveWorkout() {
  const wrkContainer = document.getElementById('today-workout-container');
  if(wrkContainer) wrkContainer.style.display = 'none';
  const selContainer = document.getElementById('day-selection-container');
  if(selContainer) selContainer.style.display = 'block';
}

function renderLoggingCard(ex, container) {
  const exDiv = document.createElement('div');
  exDiv.className = 'card';
  exDiv.style.marginBottom = '16px';
  exDiv.style.padding = '16px';
  
  let html = `
    <div class="workout-header" style="margin-bottom:16px; display:flex; align-items:center; justify-content:space-between;">
      <div style="cursor:pointer; flex:1;" onclick="openExerciseDetail('${ex.name}')">
        <h4 style="font-size:16px; font-weight:600; margin-bottom:4px; color:var(--text-primary);" class="ex-name-display">${ex.name}</h4>
        <span style="font-size:12px; color:var(--text-secondary); font-weight: 500;">TARGET: ${ex.reps}</span>
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <i data-lucide="pencil" style="color:var(--neon-blue); width:18px; height:18px; cursor:pointer;" onclick="editExerciseName(this)"></i>
      </div>
    </div>
    <div class="set-rows" style="display:flex; flex-direction:column; gap:8px;">
  `;
  
  for(let i=1; i<=ex.sets; i++) {
    html += `
      <div class="set-row">
        <span class="set-number">${i}</span>
        <input type="number" placeholder="kg" class="log-input weight-input">
        <input type="number" placeholder="reps" class="log-input reps-input">
        <button class="check-btn" onclick="this.classList.toggle('completed')"><i data-lucide="check"></i></button>
      </div>
    `;
  }
  
  html += `</div>`;
  exDiv.innerHTML = html;
  container.appendChild(exDiv);
}

// --- Manual Exercise Edit ---
function editExerciseName(iconElement) {
  const headerDiv = iconElement.closest('.workout-header');
  const nameDisplay = headerDiv.querySelector('.ex-name-display');
  const oldName = nameDisplay.innerText;
  
  const newName = prompt("Edit Exercise Name:", oldName);
  if (newName && newName.trim() !== "" && newName !== oldName) {
    const cleanName = newName.trim();
    nameDisplay.innerText = cleanName;
    
    const clickWrappers = headerDiv.querySelectorAll('[onclick^="openExerciseDetail"]');
    clickWrappers.forEach(el => el.setAttribute('onclick', `openExerciseDetail('${cleanName}')`));
    
    const exIndex = activeDayExercises.findIndex(e => e.name === oldName);
    if (exIndex !== -1) {
      activeDayExercises[exIndex].name = cleanName;
    }
  }
}

// --- Advanced Metrics Calculation ---
function calculateWeightMetrics() {
  const data = appData.weight.data || [];
  
  let current = 0;
  let high = 0;
  let low = 0;
  let weeklyChange = 0;
  let deficitText = 'Maintenance';
  let progress = 0;

  if(data.length > 0) {
    current = data[data.length - 1] || 0;
    high = Math.max(...data);
    low = Math.min(...data);
    
    if(data.length >= 3) {
      weeklyChange = current - (data[data.length - 3] || 0);
    } else if (data.length >= 2) {
      weeklyChange = current - (data[data.length - 2] || 0);
    }
    
    const startWeight = data[0] || current;
    
    // Dynamic Physiological Calculations based on User Profile
    const bmi = current / Math.pow(userProfile.height / 100, 2);
    // Estimated Body Fat % (Navy/BMI approx formula for males)
    const estBodyFat = Math.round((1.20 * bmi) + (0.23 * 25) - 16.2); 
    
    // BMR (Mifflin-St Jeor) + Sedentary multiplier
    const bmr = (10 * current) + (6.25 * userProfile.height) - (5 * 25) + 5;
    const maintenance = Math.round(bmr * 1.2);
    
    // Goal logic 
    const goalDiff = current - userProfile.goalWeight;
    if (goalDiff > 0) {
      const suggestedDeficit = Math.min(500, Math.round(maintenance * 0.2));
      deficitText = `~${suggestedDeficit} kcal deficit`;
    } else if (goalDiff < 0) {
      deficitText = `+300 kcal surplus`;
    } else {
      deficitText = `${maintenance} kcal (Maint)`;
    }
    
    userProfile.currentWeight = current;
  }
  
  const metricHL = document.getElementById('metric-highlow');
  if(metricHL) metricHL.innerHTML = `<span style="color:#A0A0A0; font-size:12px;">H:</span> ${high.toFixed(1)} <span style="color:#A0A0A0; font-size:12px; margin-left:4px;">L:</span> ${low.toFixed(1)}`;
  
  const metricChange = document.getElementById('metric-change');
  if(metricChange) {
    metricChange.innerText = weeklyChange > 0 ? `+${weeklyChange.toFixed(1)} kg` : `${weeklyChange.toFixed(1)} kg`;
    metricChange.style.color = weeklyChange > 0 ? '#FF0055' : 'var(--neon-green)';
  }
  
  const metricDef = document.getElementById('metric-deficit');
  if(metricDef) metricDef.innerText = deficitText;
  
  const goalText = activeProgressTab === 'weight' ? userProfile.goalWeight.toFixed(1) + ' kg' : 'Body Fat Goal';
  const metricGoal = document.getElementById('metric-goal');
  if(metricGoal) metricGoal.innerText = goalText;
  
  const dashWeight = document.getElementById('dash-weight');
  const dashTrend = document.getElementById('dash-weight-trend');
  const dashGoal = document.getElementById('dash-goal-pct');
  const dashHigh = document.getElementById('dash-high-wt');
  const dashLow = document.getElementById('dash-low-wt');
  
  if(dashWeight) dashWeight.innerText = current.toFixed(1) + ' kg';
  if(dashTrend) {
    dashTrend.innerHTML = weeklyChange > 0 
      ? `<i data-lucide="trending-up"></i> +${weeklyChange.toFixed(1)}kg` 
      : `<i data-lucide="trending-down"></i> ${weeklyChange.toFixed(1)}kg`;
    dashTrend.style.color = weeklyChange > 0 ? '#FF0055' : 'var(--neon-green)';
  }
  
  if(dashGoal) dashGoal.innerText = goalText;
  if(dashHigh) dashHigh.innerText = `${high.toFixed(1)} kg`;
  if(dashLow) dashLow.innerText = `${low.toFixed(1)} kg`;
  
  renderDashMiniChart();
}

// --- Dashboard Mini Chart ---
let dashMiniChartInstance = null;

function renderDashMiniChart() {
  const ctx = document.getElementById('dashMiniChart');
  if(!ctx || typeof Chart === 'undefined') return;
  if(dashMiniChartInstance) dashMiniChartInstance.destroy();
  
  const labels = appData.weight.labels.slice(-7);
  const data = appData.weight.data.slice(-7);
  
  dashMiniChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        borderColor: '#00FFA3',
        backgroundColor: 'rgba(0, 255, 163, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.min(...data) - 1, max: Math.max(...data) + 1 }
      },
      layout: { padding: 0 }
    }
  });
}

// --- Application Initialization Cycle ---
document.addEventListener('DOMContentLoaded', () => {
  // Set date pickers to today
  const wDate = document.getElementById('weight-date');
  if(wDate) wDate.valueAsDate = new Date();
  const bfDate = document.getElementById('bodyfat-date');
  if(bfDate) bfDate.valueAsDate = new Date();
  
  // Safely attach events to toggles to prevent double-binding
  document.querySelectorAll('.toggle').forEach(toggle => {
    if (!toggle.hasAttribute('onclick')) {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        // Example logic: if it's the theme toggle, we could switch body class
      });
    }
  });

  // Attach safe click events to Progress Tabs
  document.querySelectorAll('#progress-tabs .tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('#progress-tabs .tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeProgressTab = e.target.getAttribute('data-target');
      
      const stToggles = document.getElementById('strength-toggles');
      if(stToggles) stToggles.style.display = (activeProgressTab === 'strength') ? 'flex' : 'none';
      
      const metricsDash = document.getElementById('advanced-metrics-dashboard');
      if (metricsDash) metricsDash.style.display = (activeProgressTab === 'weight') ? 'grid' : 'none';
      
      const chartTitle = document.getElementById('chart-title');
      if(chartTitle) chartTitle.innerText = e.target.innerText + ' Trend';
      
      renderChart();
      if(activeProgressTab === 'weight') calculateWeightMetrics();
    });
  });

  // Initial Data Population
  calculateWeightMetrics();
});
