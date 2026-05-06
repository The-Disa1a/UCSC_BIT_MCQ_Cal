import { fetchPapersMeta, fetchPaperDetails } from "./api.js";

// DOM Elements
const semesterSelect = document.getElementById("semester-select");
const subjectSelect = document.getElementById("subject-select");
const yearSelect = document.getElementById("year-select");
const questionsContainer = document.getElementById("questions-container");
const paperTypeBadge = document.getElementById("paper-type-badge");
const actionContainer = document.getElementById("action-container");
const submitBtn = document.getElementById("submit-btn");
const resultsBox = document.getElementById("results-box");
const gradeDisplay = document.getElementById("grade-display");
const scoreContainer = document.getElementById("score-container");
const scoreDisplay = document.getElementById("score-display");
const retestBtn = document.getElementById("retest-btn");
const changePaperBtn = document.getElementById("change-paper-btn");
const commentsBox = document.getElementById("comments-box");
const commentsText = document.getElementById("comments-text");
const toastPopup = document.getElementById("toast-popup");
const toastMessage = document.getElementById("toast-message");
const layoutWrapper = document.getElementById("layout-wrapper");

// Focus Mode DOM Elements
const focusToggleBtn = document.getElementById("focus-toggle-btn");
const headerMain = document.getElementById("header-main");
const filtersContainer = document.getElementById("filters-container");
const appMain = document.getElementById("app");

// Timer DOM Elements
const timerWrapper = document.getElementById("timer-wrapper");
const timerDisplay = document.getElementById("timer-display");
const timerToggleBtn = document.getElementById("timer-toggle-btn");
const timerResetBtn = document.getElementById("timer-reset-btn");
const timerPowerBtn = document.getElementById("timer-power-btn");
const timerDisplayContainer = document.getElementById("timer-display-container");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const iconEye = document.getElementById("icon-eye");
const iconEyeSlash = document.getElementById("icon-eye-slash");

// Overview DOM Elements
const toggleOverviewBtn = document.getElementById("toggle-overview-btn");
const overviewContent = document.getElementById("overview-content");
const statFull = document.getElementById("stat-full");
const statWrong = document.getElementById("stat-wrong");
const statPartialContainer = document.getElementById("stat-partial-container");
const statPartialList = document.getElementById("stat-partial-list");

// Builder DOM Elements
const openBuilderBtn = document.getElementById("open-builder-btn");
const builderModal = document.getElementById("builder-modal");
const closeBuilderBtn = document.getElementById("close-builder-btn");
const builderStep1 = document.getElementById("builder-step-1");
const builderStep2 = document.getElementById("builder-step-2");
const builderNextBtn = document.getElementById("builder-next-btn");
const builderBackBtn = document.getElementById("builder-back-btn");
const builderSaveBtn = document.getElementById("builder-save-btn");
const builderGrid = document.getElementById("builder-grid");

// Safelisted column classes for Tailwind JIT
const colClasses = {
    1: 'columns-1', 2: 'columns-2', 3: 'columns-3', 4: 'columns-4', 
    5: 'columns-5', 6: 'columns-6', 7: 'columns-7', 8: 'columns-8', 9: 'columns-9', 10: 'columns-10'
};
const mdColClasses = {
    1: 'md:columns-1', 2: 'md:columns-2', 3: 'md:columns-3', 4: 'md:columns-4', 
    5: 'md:columns-5', 6: 'md:columns-6', 7: 'md:columns-7', 8: 'md:columns-8', 9: 'md:columns-9', 10: 'md:columns-10'
};

// State Variables
let papersData = null;
let currentPaperData = null;
let isMultiGlobal = false;
let paperActive = false; 
let toastTimeout = null;
let isEnhancementCourse = false;
let isFocusMode = false;

// Timer State
let timerMaxSeconds = 0;
let timerSeconds = 0;
let timerInterval = null;
let isTimerRunning = false;
let isTimerVisible = true;
let hasTimerStartedOnce = false;

async function init() {
  papersData = await fetchPapersMeta();
  if (!papersData) return alert("Failed to load metadata!");

  semesterSelect.addEventListener("change", (e) => {
    if(e.target.value === "custom") {
        loadCustomPapersSubject();
    } else {
        populateSubjects(e.target.value);
    }
  });
  
  subjectSelect.addEventListener("change", async (e) => {
    if(semesterSelect.value === "custom") {
        currentPaperData = getCustomPapers();
        populateYears();
        return;
    }
    currentPaperData = await fetchPaperDetails(e.target.value);
    if (!currentPaperData) {
      yearSelect.classList.add("hidden");
      return alert("Failed to load subject data!");
    }
    populateYears();
  });

  yearSelect.addEventListener("change", (e) => {
    const yearData = currentPaperData[e.target.value];
    renderQuestions(yearData);
  });

  questionsContainer.addEventListener("change", () => {
    if (!paperActive) {
      paperActive = true;
      
      actionContainer.classList.remove("hidden");
      setTimeout(() => {
          actionContainer.classList.remove("opacity-0", "translate-y-4");
          actionContainer.classList.add("opacity-100", "translate-y-0");
      }, 50);

      submitBtn.classList.remove("hidden"); 
      
      semesterSelect.disabled = true;
      subjectSelect.disabled = true;
      yearSelect.disabled = true;
      changePaperBtn.classList.remove("hidden");

      if(!hasTimerStartedOnce && timerMaxSeconds > 0) {
          startTimer();
          hasTimerStartedOnce = true;
      }

      // Task 1: Auto Focus Mode ONLY on mobile (< 768px)
      if (window.innerWidth < 768 && !isFocusMode) {
          toggleFocusMode();
          focusToggleBtn.classList.remove("hidden");
      }
    }
  });

  changePaperBtn.addEventListener("click", () => {
    paperActive = false;
    semesterSelect.disabled = false;
    subjectSelect.disabled = false;
    yearSelect.disabled = false;
    changePaperBtn.classList.add("hidden");
    
    questionsContainer.innerHTML = "";
    questionsContainer.classList.add("hidden");
    
    actionContainer.classList.add("opacity-0", "translate-y-4");
    setTimeout(() => actionContainer.classList.add("hidden"), 300);
    
    submitBtn.classList.add("hidden");
    paperTypeBadge.classList.add("hidden");
    commentsBox.classList.add("hidden");
    yearSelect.value = ""; 
    stopTimer();
    timerWrapper.classList.add("hidden");

    if (isFocusMode) toggleFocusMode();
    focusToggleBtn.classList.add("hidden");
  });

  retestBtn.addEventListener("click", () => {
    const yearData = currentPaperData[yearSelect.value];
    renderQuestions(yearData); 
    
    resultsBox.classList.add("hidden");
    commentsBox.classList.add("hidden");
    submitBtn.classList.remove("hidden");
    
    resetTimer();
    hasTimerStartedOnce = false; 

    // Auto Focus trigger specifically for Mobile on Retest
    if (window.innerWidth < 768 && !isFocusMode) {
        toggleFocusMode();
        focusToggleBtn.classList.remove("hidden");
    }
  });

  toggleOverviewBtn.addEventListener("click", () => {
    overviewContent.classList.toggle("hidden");
  });

  timerToggleBtn.addEventListener("click", () => {
    isTimerRunning ? stopTimer() : startTimer();
  });
  timerResetBtn.addEventListener("click", () => {
      resetTimer();
      hasTimerStartedOnce = false;
  });
  timerPowerBtn.addEventListener("click", () => {
    isTimerVisible = !isTimerVisible;
    timerDisplayContainer.style.display = isTimerVisible ? "flex" : "none";
    iconEye.classList.toggle("hidden");
    iconEyeSlash.classList.toggle("hidden");
  });

  focusToggleBtn.addEventListener("click", toggleFocusMode);

  submitBtn.addEventListener("click", () => {
    if (isFocusMode) toggleFocusMode();
    focusToggleBtn.classList.add("hidden");

    const selectedYear = yearSelect.value;
    const yearData = currentPaperData[selectedYear];
    const correctAnswers = yearData.questions;
    const totalQuestions = yearData.qcount;
    
    let missedQs =[];
    for (let i = 1; i <= totalQuestions; i++) {
      const checked = document.querySelectorAll(`input[name="q${i}"]:checked`);
      if (checked.length === 0) missedQs.push(i);
    }

    if (missedQs.length > 0) showToast(missedQs);

    const allInputs = questionsContainer.querySelectorAll("input");
    allInputs.forEach(inp => inp.disabled = true);
    submitBtn.classList.add("hidden");

    const totalMarks = parseFloat(yearData.total_marks) || 100;
    const Q_MAX = totalMarks / totalQuestions; 
    let totalScore = 0;
    
    let fullCount = 0, wrongCount = 0, partialBreakdown =[];

    for (let i = 1; i <= totalQuestions; i++) {
      const qDiv = document.getElementById(`q-row-${i}`);
      if (!qDiv) continue;
      
      const checkedInputs = document.querySelectorAll(`input[name="q${i}"]:checked`);
      let userAnswers = Array.from(checkedInputs).map(inp => inp.value);
      
      let correctAns = null;
      for (let key in correctAnswers) {
          if (parseInt(key, 10) === i) {
              correctAns = correctAnswers[key];
              break;
          }
      }

      if (!correctAns) continue; 

      let qScore = 0;
      let isPerfect = false;
      
      let actualCorrect =[...correctAns];
      
      const isFree = actualCorrect.includes("free");
      const isOnlyOne = actualCorrect.includes("only_one");
      const isAnyCombo = actualCorrect.includes("any_combo");
      
      if (isOnlyOne) actualCorrect = actualCorrect.filter(x => x !== 'only_one');
      if (isAnyCombo) actualCorrect = actualCorrect.filter(x => x !== 'any_combo');
      if (actualCorrect.length === 1 && actualCorrect[0] === 'all') {
          actualCorrect =['a', 'b', 'c', 'd', 'e'];
      }

      if (isFree) {
          if (userAnswers.length > 0) {
              qScore = Q_MAX;
              isPerfect = true;
          }
      } else if (isOnlyOne) {
          if (userAnswers.length === 1 && actualCorrect.includes(userAnswers[0])) {
              qScore = Q_MAX;
              isPerfect = true;
          }
      } else if (isAnyCombo) {
          const isSubset = userAnswers.every(ans => actualCorrect.includes(ans));
          if (userAnswers.length > 0 && isSubset) {
              qScore = Q_MAX;
              isPerfect = true;
          }
      } else if (!isMultiGlobal) {
        if (userAnswers.length === 1 && actualCorrect.includes(userAnswers[0])) {
            qScore = Q_MAX;
            isPerfect = true;
        }
      } else {
        const X = actualCorrect.length; 
        const numWrongOptions = 5 - X; 
        let Y = 0, Z = 0;

        userAnswers.forEach(ans => {
            if (actualCorrect.includes(ans)) Y++;
            else Z++;
        });

        const posMarks = X > 0 ? (Q_MAX / X) * Y : 0;
        const negMarks = numWrongOptions > 0 ? (Q_MAX / numWrongOptions) * Z : 0;
        
        qScore = posMarks - negMarks;
        if (qScore < 0) qScore = 0; 
        if (Math.abs(qScore - Q_MAX) < 0.01) isPerfect = true;
      }

      totalScore += qScore;

      if (isPerfect) fullCount++;
      else if (qScore === 0) wrongCount++;
      else partialBreakdown.push({ q: i, score: qScore });

      if (isFree && isPerfect) {
          qDiv.classList.add('bg-blue-50', 'rounded-lg', 'border', 'border-blue-200');
      } else if (isPerfect) {
          qDiv.classList.add('bg-green-50', 'rounded-lg', 'border', 'border-green-200');
      } 
      
      const inputsForQ = qDiv.querySelectorAll(`input[name="q${i}"]`);
      inputsForQ.forEach(inp => {
          const val = inp.value;
          const label = inp.parentElement;
          const spanText = label.querySelector("span");

          if (isFree) {
              if (userAnswers.includes(val)) {
                  label.classList.replace('border-gray-400', 'border-blue-500');
                  spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-white bg-blue-500 transition-all";
              }
          } else {
              if (userAnswers.includes(val)) {
                  if (actualCorrect.includes(val)) {
                      label.classList.replace('border-gray-400', 'border-green-500');
                      spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-white bg-green-500 transition-all";
                  } else {
                      label.classList.replace('border-gray-400', 'border-red-500');
                      spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-white bg-red-500 transition-all";
                  }
              } else if (actualCorrect.includes(val)) {
                  label.classList.replace('border-gray-400', 'border-green-500');
                  spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-green-600 bg-transparent transition-all";
              }
          }
      });
      
    }

    const finalRoundedScore = parseFloat(totalScore.toFixed(2));
    
    if (totalMarks === 100) {
        const gradeInfo = getGradeInfo(finalRoundedScore);
        gradeDisplay.classList.remove("hidden");
        gradeDisplay.textContent = gradeInfo.letter;
        gradeDisplay.className = `text-7xl font-black mt-2 drop-shadow-sm ${gradeInfo.color}`;
        
        scoreDisplay.textContent = `${finalRoundedScore}%`;
        scoreContainer.className = "text-xl text-gray-600 mt-2 font-medium";
    } else {
        gradeDisplay.classList.add("hidden");
        scoreDisplay.textContent = `${finalRoundedScore} / ${totalMarks}`;
        scoreContainer.className = "text-5xl font-black text-blue-600 mt-4";
    }
    
    statFull.textContent = fullCount;
    statWrong.textContent = wrongCount;
    statPartialList.innerHTML = "";
    if (partialBreakdown.length > 0) {
        partialBreakdown.forEach(p => {
            const li = document.createElement("li");
            li.textContent = `Q${p.q}: ${p.score.toFixed(2)}`;
            statPartialList.appendChild(li);
        });
        statPartialContainer.classList.remove("hidden");
    } else {
        statPartialContainer.classList.add("hidden");
    }

    resultsBox.classList.remove("hidden");
    resultsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    stopTimer();

    if (yearData.comments) {
        commentsText.textContent = yearData.comments;
        commentsBox.classList.remove("hidden");
    }
  });

  setupBuilder();
}

function toggleFocusMode() {
    isFocusMode = !isFocusMode;
    if (isFocusMode) {
        headerMain.classList.add("hidden");
        filtersContainer.classList.add("hidden");
        appMain.classList.replace("p-6", "p-2");
        questionsContainer.classList.replace("gap-6", "gap-2");
        actionContainer.classList.replace("p-6", "p-3");
        
        document.querySelectorAll('.q-row').forEach(row => row.classList.replace('mb-3', 'mb-0.5'));
        
        focusToggleBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
          Exit Focus
        `;
        focusToggleBtn.classList.replace("bg-indigo-100", "bg-red-100");
        focusToggleBtn.classList.replace("text-indigo-700", "text-red-700");
    } else {
        headerMain.classList.remove("hidden");
        filtersContainer.classList.remove("hidden");
        appMain.classList.replace("p-2", "p-6");
        questionsContainer.classList.replace("gap-2", "gap-6");
        actionContainer.classList.replace("p-3", "p-6");
        
        document.querySelectorAll('.q-row').forEach(row => row.classList.replace('mb-0.5', 'mb-3'));
        
        focusToggleBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4H4m0 0v4m0-4l5 5m7-5h4m0 0v4m0-4l-5 5M8 20H4m0 0v-4m0 4l5-5m7 5h4m0 0v-4m0 4l-5-5"></path></svg>
          Enter Focus
        `;
        focusToggleBtn.classList.replace("bg-red-100", "bg-indigo-100");
        focusToggleBtn.classList.replace("text-red-700", "text-indigo-700");
    }
}

function getCustomPapers() {
    return JSON.parse(localStorage.getItem("custom_papers") || "{}");
}

function loadCustomPapersSubject() {
    subjectSelect.innerHTML = '<option value="" disabled selected>Select Source</option>';
    yearSelect.classList.add("hidden");
    
    const option = document.createElement("option");
    option.value = "local";
    option.textContent = "My Saved Papers";
    subjectSelect.appendChild(option);
    
    subjectSelect.classList.remove("hidden");
}

function setupBuilder() {
    openBuilderBtn.addEventListener("click", () => builderModal.classList.remove("hidden"));
    closeBuilderBtn.addEventListener("click", () => builderModal.classList.add("hidden"));
    builderBackBtn.addEventListener("click", () => {
        builderStep2.classList.add("hidden");
        builderStep1.classList.remove("hidden");
    });

    builderNextBtn.addEventListener("click", () => {
        const nameInput = document.getElementById("build-name").value.trim();
        const name = nameInput || `Custom Paper ${Date.now()}`;
        const existing = getCustomPapers();

        if (nameInput && existing[nameInput]) {
            alert("A paper with this name already exists. Please choose a different name.");
            return;
        }

        const qCount = parseInt(document.getElementById("build-qcount").value);
        builderGrid.innerHTML = "";
        
        // Dynamic builder columns
        let b_mCols = 2; let b_dCols = 4;
        if (qCount % 4 === 0) { b_mCols = 2; b_dCols = 4; }
        else if (qCount % 2 === 0) { b_mCols = 2; b_dCols = 2; }
        else {
            let div = 2;
            while(qCount % div !== 0 && div <= qCount) div++;
            b_mCols = div; b_dCols = div;
        }
        
        builderGrid.className = `w-full max-w-5xl mx-auto pb-6 gap-6 ${colClasses[b_mCols]} ${mdColClasses[b_dCols]}`;

        for (let i = 1; i <= qCount; i++) {
            const qDiv = document.createElement("div");
            // Task 2: Centered dynamically inside column
            qDiv.className = "flex items-center gap-2 p-2 bg-white rounded border break-inside-avoid mb-3 w-fit mx-auto";
            
            const numSpan = document.createElement("span");
            numSpan.className = "w-6 text-right font-medium text-gray-700 text-sm";
            numSpan.textContent = `${i}.`;
            qDiv.appendChild(numSpan);

            const options =["a", "b", "c", "d", "e"];
            options.forEach(opt => {
                const label = document.createElement("label");
                label.className = "cursor-pointer relative flex items-center justify-center w-7 h-7 shrink-0 rounded-full border-2 border-gray-400 hover:border-gray-500 transition-all";
                
                const input = document.createElement("input");
                input.type = "checkbox"; 
                input.name = `build-q${i}`;
                input.value = opt;
                input.className = "sr-only peer"; 

                const spanText = document.createElement("span");
                spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-gray-700 peer-checked:bg-gray-500 peer-checked:text-white transition-all";
                spanText.textContent = opt.toUpperCase();

                label.appendChild(input);
                label.appendChild(spanText);
                qDiv.appendChild(label);
            });
            builderGrid.appendChild(qDiv);
        }

        builderStep1.classList.add("hidden");
        builderStep2.classList.remove("hidden");
    });

    builderSaveBtn.addEventListener("click", () => {
        const nameInput = document.getElementById("build-name").value.trim();
        const name = nameInput || `Custom Paper ${Date.now()}`;
        const existing = getCustomPapers();

        if (nameInput && existing[nameInput]) {
            alert("A paper with this name already exists. Please choose a different name.");
            return;
        }

        const time = document.getElementById("build-time").value || "2H";
        const type = document.getElementById("build-type").value;
        const qCount = parseInt(document.getElementById("build-qcount").value);
        const totalMarks = parseFloat(document.getElementById("build-total-marks").value) || 100;
        const comments = document.getElementById("build-comments").value.trim();
        
        let questionsObj = {};

        for(let i=1; i<=qCount; i++) {
            const checked = document.querySelectorAll(`input[name="build-q${i}"]:checked`);
            if (checked.length === 0) {
                alert(`Validation Failed: Please select at least 1 correct answer for Question ${i}.`);
                return;
            }
            let answers = Array.from(checked).map(inp => inp.value);
            questionsObj[i.toString()] = answers; 
        }

        const newPaper = {
            time: time,
            answerType: type,
            qcount: qCount,
            total_marks: totalMarks,
            questions: questionsObj
        };

        if (comments) newPaper.comments = comments;

        existing[name] = newPaper;
        localStorage.setItem("custom_papers", JSON.stringify(existing));

        alert("Paper saved successfully!");
        builderModal.classList.add("hidden");
        
        if (semesterSelect.value === "custom") {
            loadCustomPapersSubject();
            if (subjectSelect.value === "local") {
                currentPaperData = getCustomPapers();
                populateYears();
            }
        }

        builderStep2.classList.add("hidden");
        builderStep1.classList.remove("hidden");
        document.getElementById("build-name").value = "";
        document.getElementById("build-comments").value = "";
    });
}

function getGradeInfo(score) {
    if (isEnhancementCourse) {
        if (score >= 40) return { letter: 'PASS', color: 'text-green-500' };
        return { letter: 'FAIL', color: 'text-red-600' };
    }

    if(score >= 85) return { letter: 'A+', color: 'text-green-600' };
    if(score >= 70) return { letter: 'A', color: 'text-green-500' };
    if(score >= 65) return { letter: 'A-', color: 'text-green-400' };
    if(score >= 60) return { letter: 'B+', color: 'text-blue-500' };
    if(score >= 55) return { letter: 'B', color: 'text-blue-400' };
    if(score >= 50) return { letter: 'B-', color: 'text-teal-500' };
    if(score >= 45) return { letter: 'C+', color: 'text-yellow-500' };
    if(score >= 40) return { letter: 'C', color: 'text-yellow-600' };
    if(score >= 35) return { letter: 'C-', color: 'text-orange-400' };
    if(score >= 30) return { letter: 'D+', color: 'text-orange-500' };
    if(score >= 25) return { letter: 'D', color: 'text-red-500' };
    return { letter: 'E', color: 'text-red-600' };
}

function showToast(missedArr) {
    if (toastTimeout) clearTimeout(toastTimeout);
    
    if (missedArr.length <= 5) {
        toastMessage.textContent = `Missed questions: ${missedArr.join(', ')}`;
    } else {
        toastMessage.textContent = `You forgot to select ${missedArr.length} questions.`;
    }

    toastPopup.classList.remove("translate-x-[150%]");
    toastTimeout = setTimeout(() => {
        toastPopup.classList.add("translate-x-[150%]");
    }, 5000);
}

function setupTimer(timeStr) {
    stopTimer();
    hasTimerStartedOnce = false; 
    
    if (!timeStr) {
        timerWrapper.classList.add("hidden");
        return;
    }
    
    const hours = parseInt(timeStr.replace(/[^0-9]/g, '')) || 2;
    timerMaxSeconds = hours * 3600;
    timerSeconds = timerMaxSeconds;
    updateTimerUI(); 
    timerWrapper.classList.remove("hidden");
}

function startTimer() {
    if (isTimerRunning) return;
    isTimerRunning = true;
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerUI();
        } else {
            stopTimer();
        }
    }, 1000);
}

function stopTimer() {
    isTimerRunning = false;
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
    clearInterval(timerInterval);
}

function resetTimer() {
    stopTimer();
    timerSeconds = timerMaxSeconds;
    updateTimerUI();
}

function updateTimerUI() {
    const h = Math.floor(timerSeconds / 3600);
    const m = Math.floor((timerSeconds % 3600) / 60);
    const s = timerSeconds % 60;
    timerDisplay.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function populateSubjects(semester) {
  subjectSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>';
  yearSelect.innerHTML = '<option value="" disabled selected>Select Year/Name</option>';
  
  yearSelect.classList.add("hidden");
  questionsContainer.classList.add("hidden");
  actionContainer.classList.add("opacity-0", "hidden");
  paperTypeBadge.classList.add("hidden");

  const subjects = papersData[semester];
  subjects.forEach((sub) => {
    const option = document.createElement("option");
    option.value = sub.file;
    option.textContent = `${sub.code} - ${sub.name}`;
    subjectSelect.appendChild(option);
  });

  subjectSelect.classList.remove("hidden");
}

function populateYears() {
  yearSelect.innerHTML = '<option value="" disabled selected>Select Year/Name</option>';
  const years = Object.keys(currentPaperData);
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${year}`;
    yearSelect.appendChild(option);
  });
  yearSelect.classList.remove("hidden");
}

function renderQuestions(yearData) {
  questionsContainer.innerHTML = "";
  resultsBox.classList.add("hidden");
  commentsBox.classList.add("hidden");
  overviewContent.classList.add("hidden"); 
  submitBtn.classList.add("hidden"); 

  paperActive = false;
  actionContainer.classList.add("opacity-0", "hidden");

  if (semesterSelect.value === "custom") {
      isEnhancementCourse = yearSelect.value.toLowerCase().startsWith('en');
  } else {
      const fileName = subjectSelect.value.split('/').pop().toLowerCase();
      isEnhancementCourse = fileName.startsWith('en');
  }

  isMultiGlobal = yearData.answerType === "multi";
  
  paperTypeBadge.textContent = isMultiGlobal ? "Multi Answer (Negative Marks)" : "Single Answer";
  paperTypeBadge.classList.remove("hidden");

  setupTimer(yearData.time);

  const totalQuestions = yearData.qcount;

  // Task 1: Responsive Math for Perfect CSS Columns
  let mCols = 2;
  let dCols = 4;

  if (totalQuestions % 4 === 0) {
      mCols = 2;
      dCols = 4;
  } else if (totalQuestions % 2 === 0) {
      mCols = 2;
      dCols = 2;
  } else {
      let div = 2;
      while (totalQuestions % div !== 0 && div <= totalQuestions) {
          div++;
      }
      mCols = div;
      dCols = div;
  }

  // Inject computed column count
  questionsContainer.className = `hidden w-full max-w-5xl mx-auto pb-4 gap-6 transition-all duration-300 ${colClasses[mCols]} ${mdColClasses[dCols]}`;

  // Task 1: Action container push to bottom if 5+ columns (Too dense for side-by-side)
  if (dCols >= 5) {
      layoutWrapper.className = "flex flex-col gap-8 w-full justify-center items-center";
      actionContainer.className = "hidden w-full max-w-md flex-shrink-0 bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm transition-all duration-500 opacity-0 transform translate-y-4";
  } else {
      layoutWrapper.className = "flex flex-col md:flex-row gap-8 w-full justify-center items-start";
      actionContainer.className = "hidden w-full md:w-80 flex-shrink-0 md:sticky md:top-6 bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm transition-all duration-500 opacity-0 transform translate-y-4";
  }

  for (let i = 1; i <= totalQuestions; i++) {
    const qDiv = document.createElement("div");
    qDiv.id = `q-row-${i}`; 
    // Task 2: w-fit mx-auto locks bubbles perfectly in center of column lane
    qDiv.className = "q-row flex items-center justify-start gap-1.5 p-1 rounded transition-colors break-inside-avoid mb-3 w-fit mx-auto";
    
    const numberSpan = document.createElement("span");
    numberSpan.className = "w-6 text-right font-medium text-gray-700 select-none text-sm";
    numberSpan.textContent = `${i}.`;
    qDiv.appendChild(numberSpan);

    const options =["a", "b", "c", "d", "e"];
    options.forEach((opt) => {
      const label = document.createElement("label");
      label.className = "cursor-pointer relative flex items-center justify-center w-7 h-7 shrink-0 rounded-full border-2 border-gray-400 bg-white transition-all";
      
      const input = document.createElement("input");
      input.type = isMultiGlobal ? "checkbox" : "radio";
      input.name = `q${i}`;
      input.value = opt;
      input.className = "sr-only peer disabled:opacity-50"; 

      const spanText = document.createElement("span");
      spanText.className = "absolute inset-0 flex items-center justify-center rounded-full text-xs font-bold text-gray-700 peer-checked:bg-gray-500 peer-checked:text-white peer-disabled:cursor-not-allowed transition-all";
      spanText.textContent = opt.toUpperCase();

      label.appendChild(input);
      label.appendChild(spanText);
      qDiv.appendChild(label);
    });
    questionsContainer.appendChild(qDiv);
  }
  
  questionsContainer.classList.remove("hidden");
}

init();