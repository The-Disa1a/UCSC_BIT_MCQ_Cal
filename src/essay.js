import { fetchPapersMeta, fetchPaperDetails } from "./api.js";

const DB_NAME = "ucsc-bit-exam-helper";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const API_KEY_RECORD = "gemini-api-key";
const MODEL_NAME = "gemini-3.1-flash-lite";

const launchButton = document.getElementById("launch-essay-btn");
const essayWorkspace = document.getElementById("essay-workspace");
const essayBackButton = document.getElementById("essay-back-btn");
const answerTabButton = document.getElementById("essay-answers-tab");
const settingsTabButton = document.getElementById("essay-settings-tab");
const answerPanel = document.getElementById("essay-answer-panel");
const settingsPanel = document.getElementById("essay-settings-panel");
const questionList = document.getElementById("essay-question-list");
const addQuestionButton = document.getElementById("add-essay-question");
const markButton = document.getElementById("mark-essay-answers");
const statusMessage = document.getElementById("essay-status");
const progressPanel = document.getElementById("essay-progress");
const progressLabel = document.getElementById("essay-progress-label");
const progressBar = progressPanel.querySelector('[role="progressbar"]');
const resultsPanel = document.getElementById("essay-results");
const paperFileInput = document.getElementById("essay-paper-file");
const paperPlaceholder = document.getElementById("essay-paper-placeholder");
const paperPreview = document.getElementById("essay-paper-preview");
const semesterSelect = document.getElementById("essay-semester-select");
const subjectSelect = document.getElementById("essay-subject-select");
const catalogPaperSelect = document.getElementById("essay-paper-select");
const catalogNoteFieldset = document.getElementById("essay-catalog-notes");
const catalogNoteOptions = document.getElementById("essay-catalog-note-options");
const catalogEmptyMessage = document.getElementById("essay-catalog-empty");
const referenceFileInput = document.getElementById("essay-reference-file");
const notesFileInput = document.getElementById("essay-notes-file");
const apiKeyInput = document.getElementById("gemini-api-key");
const saveKeyButton = document.getElementById("save-gemini-key");
const removeKeyButton = document.getElementById("remove-gemini-key");
const keyStatus = document.getElementById("gemini-key-status");

let paperFile = null;
let paperObjectUrl = null;
let nextQuestionId = 1;
let previousVisibility = {};
let papersMetadata = null;
let selectedSubject = null;
let selectedSubjectPaperData = null;
let selectedCatalogPaper = null;
let subjectLoadVersion = 0;
let paperLoadVersion = 0;
const remoteFileCache = new Map();
const inlinePartCache = new WeakMap();

function openKeyDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support encrypted key storage."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open browser key storage."));
  });
}

async function accessKeyRecord(mode, action) {
  const database = await openKeyDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;

    try {
      const request = action(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(new Error("Could not access browser key storage."));
    } catch (error) {
      reject(error);
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error("Could not complete the browser storage operation."));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error("The browser storage operation was cancelled."));
    };
  });
}

async function readSavedApiKey() {
  const record = await accessKeyRecord("readonly", store => store.get(API_KEY_RECORD));
  if (!record) return null;

  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Secure encryption is unavailable in this browser.");
  }

  try {
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      record.cryptoKey,
      new Uint8Array(record.ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("The saved key could not be decrypted. Forget it and save the key again.");
  }
}

async function saveApiKey(apiKey) {
  if (!window.crypto || !window.crypto.subtle || !window.isSecureContext) {
    throw new Error("Encrypted key saving requires a secure HTTPS connection and Web Crypto.");
  }

  const cryptoKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(apiKey)
  );

  await accessKeyRecord("readwrite", store => store.put({
    cryptoKey,
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  }, API_KEY_RECORD));
}

async function forgetSavedApiKey() {
  await accessKeyRecord("readwrite", store => store.delete(API_KEY_RECORD));
}

function showStatus(message, kind = "info") {
  statusMessage.textContent = message;
  statusMessage.className = "mb-4 rounded-lg border p-3 text-sm";
  if (kind === "error") {
    statusMessage.classList.add("border-red-200", "bg-red-50", "text-red-800");
  } else if (kind === "success") {
    statusMessage.classList.add("border-green-200", "bg-green-50", "text-green-800");
  } else {
    statusMessage.classList.add("border-blue-200", "bg-blue-50", "text-blue-800");
  }
}

function clearStatus() {
  statusMessage.textContent = "";
  statusMessage.className = "hidden mb-4 rounded-lg border p-3 text-sm";
}

function updateProgress(message) {
  progressLabel.textContent = message;
  progressBar.setAttribute("aria-valuetext", message);
  progressPanel.classList.remove("hidden");
}

function clearProgress() {
  progressPanel.classList.add("hidden");
}

function publicFileUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A paper or notes link is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Paper and notes links must use HTTPS.");

  if (url.hostname === "github.com") {
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const blobIndex = segments.indexOf("blob");
    if (blobIndex === 2 && segments.length > 4) {
      const [owner, repo] = segments;
      const branch = segments[3];
      const filePath = segments.slice(4).map(encodeURIComponent).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath}`;
    }
  }

  return url.href;
}

async function getRemoteFile(sourceUrl, fallbackMimeType) {
  const url = publicFileUrl(sourceUrl);
  if (remoteFileCache.has(url)) return remoteFileCache.get(url);

  const filePromise = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Loading shared material timed out: ${url}`);
      }
      throw new Error(`Could not load shared material: ${url} (${error.message})`);
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw new Error(`Could not load shared material (${response.status}): ${url}`);
    }

    const blob = await response.blob();
    const fileName = decodeURIComponent(new URL(url).pathname.split("/").pop());
    const contentType = blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : fallbackMimeType;
    return new File([blob], fileName, { type: contentType });
  })();
  remoteFileCache.set(url, filePromise);

  try {
    return await filePromise;
  } catch (error) {
    remoteFileCache.delete(url);
    throw error;
  }
}

function resetPaperPreview() {
  paperFile = null;
  if (paperObjectUrl) URL.revokeObjectURL(paperObjectUrl);
  paperObjectUrl = null;
  paperPreview.src = "";
  paperPreview.classList.add("hidden");
  paperPlaceholder.classList.remove("hidden");
}

function showPaperPreview(file) {
  if (paperObjectUrl) URL.revokeObjectURL(paperObjectUrl);
  paperObjectUrl = URL.createObjectURL(file);
  paperPreview.src = paperObjectUrl;
  paperPreview.classList.remove("hidden");
  paperPlaceholder.classList.add("hidden");
}

function renderCatalogNotes(subject) {
  catalogNoteOptions.replaceChildren();
  const notes = Array.isArray(subject && subject.notes) ? subject.notes : [];
  catalogNoteFieldset.classList.toggle("hidden", notes.length === 0);

  notes.forEach((note, index) => {
    const noteUrl = typeof note === "string" ? note : note && (note.url || note.file);
    if (!noteUrl) return;
    const label = document.createElement("label");
    label.className = "flex items-start gap-2 rounded-lg bg-white p-2 text-sm text-gray-700";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "catalog-note mt-0.5";
    checkbox.value = String(index);
    checkbox.checked = typeof note === "string" || note.defaultSelected !== false;
    checkbox.setAttribute("aria-label", typeof note === "string" ? noteUrl : note.title || noteUrl);

    const title = document.createElement("span");
    title.textContent = typeof note === "string" ? decodeURIComponent(noteUrl.split("/").pop()) : note.title || noteUrl;
    label.append(checkbox, title);
    catalogNoteOptions.appendChild(label);
  });
}

async function loadEssayCatalog() {
  try {
    papersMetadata = await fetchPapersMeta();
    if (!papersMetadata) throw new Error("Could not load the subject list.");
  } catch (error) {
    catalogEmptyMessage.textContent = `${error.message} You can still choose local PDFs below.`;
    catalogEmptyMessage.classList.remove("hidden");
  }
}

function supportsEssay(subject) {
  return subject.essay === true || subject.essay === "true";
}

function selectCatalogSemester(semester) {
  subjectLoadVersion++;
  paperLoadVersion++;
  subjectSelect.replaceChildren(new Option("Select a subject", ""));
  subjectSelect.disabled = true;
  catalogPaperSelect.replaceChildren(new Option("Select a year", ""));
  catalogPaperSelect.disabled = true;
  selectedSubject = null;
  selectedSubjectPaperData = null;
  selectedCatalogPaper = null;
  paperFileInput.value = "";
  resetPaperPreview();
  renderCatalogNotes(null);

  const subjects = papersMetadata && Array.isArray(papersMetadata[semester])
    ? papersMetadata[semester].filter(supportsEssay)
    : [];
  subjects.forEach(subject => {
    const option = document.createElement("option");
    option.value = subject.file;
    option.textContent = `${subject.code} - ${subject.name}`;
    subjectSelect.appendChild(option);
  });
  subjectSelect.disabled = subjects.length === 0;
  catalogEmptyMessage.textContent = subjects.length
    ? ""
    : "This semester has no subjects marked as supporting essay questions yet.";
  catalogEmptyMessage.classList.toggle("hidden", subjects.length > 0);
}

async function selectCatalogSubject(subjectFile) {
  const loadVersion = ++subjectLoadVersion;
  paperLoadVersion++;
  selectedSubject = papersMetadata
    ? Object.values(papersMetadata).flat().find(subject => subject.file === subjectFile) || null
    : null;
  selectedSubjectPaperData = null;
  selectedCatalogPaper = null;
  catalogPaperSelect.replaceChildren(new Option("Loading papers...", ""));
  catalogPaperSelect.disabled = true;
  renderCatalogNotes(selectedSubject);

  if (!selectedSubject) return;

  try {
    const paperData = await fetchPaperDetails(subjectFile);
    if (loadVersion !== subjectLoadVersion) return;
    selectedSubjectPaperData = paperData;
    if (!selectedSubjectPaperData) throw new Error(`Could not load ${selectedSubject.code} papers.`);

    const essayYears = Object.entries(selectedSubjectPaperData)
      .filter(([, yearData]) => yearData && Object.prototype.hasOwnProperty.call(yearData, "essay"));
    catalogPaperSelect.replaceChildren(new Option(
      essayYears.length ? "Select a year" : "No essay question list available",
      ""
    ));
    essayYears.forEach(([year]) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      catalogPaperSelect.appendChild(option);
    });
    catalogPaperSelect.disabled = essayYears.length === 0;
    catalogEmptyMessage.classList.toggle("hidden", essayYears.length > 0);
    if (essayYears.length === 0) {
      catalogEmptyMessage.textContent = "This subject has no essay question numbers in its paper data yet.";
    }
  } catch (error) {
    if (loadVersion !== subjectLoadVersion) return;
    catalogPaperSelect.replaceChildren(new Option("Could not load papers", ""));
    catalogEmptyMessage.textContent = error.message;
    catalogEmptyMessage.classList.remove("hidden");
  }
}

function formatQuestionNumber(parts) {
  return parts.map((part, index) => index === 0 ? part : `(${part})`).join(" ");
}

function getEssayQuestionNumbers(essayData) {
  const numbers = [];
  const fullQuestionNumber = /^\d+(?:\s*\([^)]+\)\s*)*$/;

  function visit(value, parents) {
    if (Array.isArray(value)) {
      value.forEach(part => {
        if (typeof part === "string" || typeof part === "number") {
          const label = String(part).trim();
          if (!label) return;
          numbers.push(parents.length === 0 || fullQuestionNumber.test(label)
            ? label
            : formatQuestionNumber([...parents, label.replace(/^\(|\)$/g, "")]));
        } else {
          visit(part, parents);
        }
      });
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => visit(child, [...parents, key]));
    }
  }

  visit(essayData, []);
  return Array.from(new Set(numbers));
}

function renderEssayQuestionRows(questionNumbers) {
  questionList.replaceChildren();
  const questions = questionNumbers.length ? questionNumbers : [""];
  questions.forEach(number => questionList.appendChild(createQuestionCard(number)));
}

async function selectCatalogPaper(year) {
  const loadVersion = ++paperLoadVersion;
  selectedCatalogPaper = selectedSubjectPaperData
    ? selectedSubjectPaperData[year] || null
    : null;

  renderEssayQuestionRows(selectedCatalogPaper
    ? getEssayQuestionNumbers(selectedCatalogPaper.essay)
    : []);

  if (!selectedCatalogPaper) {
    paperFileInput.value = "";
    resetPaperPreview();
    clearStatus();
    return;
  }

  const paperUrl = selectedCatalogPaper.paperPdf
    || selectedCatalogPaper.questionPaperPdf
    || selectedCatalogPaper.questionPaper;
  if (!paperUrl) {
    paperFileInput.value = "";
    resetPaperPreview();
    clearStatus();
    return;
  }

  try {
    const file = await getRemoteFile(paperUrl, "application/pdf");
    if (loadVersion !== paperLoadVersion) return;
    paperFile = file;
    paperFileInput.value = "";
    showPaperPreview(file);
    clearStatus();
  } catch (error) {
    if (loadVersion !== paperLoadVersion) return;
    resetPaperPreview();
    showStatus(error.message, "error");
  }
}

function showAnswersTab() {
  answerPanel.classList.remove("hidden");
  settingsPanel.classList.add("hidden");
  answerTabButton.className = "px-4 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50";
  settingsTabButton.className = "px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100";
}

function showSettingsTab() {
  answerPanel.classList.add("hidden");
  settingsPanel.classList.remove("hidden");
  settingsTabButton.className = "px-4 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50";
  answerTabButton.className = "px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100";
}

async function refreshKeyStatus() {
  try {
    const apiKey = await readSavedApiKey();
    keyStatus.textContent = apiKey ? "Key saved encrypted on this browser." : "No key saved.";
  } catch (error) {
    keyStatus.textContent = error.message;
  }
}

async function getApiKeyForMarking() {
  const enteredKey = apiKeyInput.value.trim();
  const savedKey = await readSavedApiKey();

  if (!enteredKey) {
    if (savedKey) return savedKey;
    showSettingsTab();
    throw new Error("Add a Gemini API key in Settings before calculating marks.");
  }

  if (enteredKey === savedKey) return savedKey;

  const shouldSave = window.confirm(
    "This API key is not saved on this browser. Save it encrypted now? Choose Cancel to use it only for this session."
  );

  if (!shouldSave) return enteredKey;

  try {
    await saveApiKey(enteredKey);
    apiKeyInput.value = "";
    keyStatus.textContent = "Key saved encrypted on this browser.";
    return enteredKey;
  } catch (error) {
    const useOnce = window.confirm(
      `${error.message}\n\nUse this key for this marking session only?`
    );
    if (useOnce) return enteredKey;
    throw error;
  }
}

function createQuestionCard(questionNumber = "") {
  const card = document.createElement("article");
  card.className = "essay-answer-card rounded-xl border bg-white p-4 shadow-sm";

  const header = document.createElement("div");
  header.className = "mb-3 flex items-center justify-between gap-3";

  const title = document.createElement("label");
  title.className = "text-sm font-bold text-gray-800";
  title.textContent = "Question / sub-question";

  const numberInput = document.createElement("input");
  numberInput.type = "text";
  numberInput.value = questionNumber;
  numberInput.placeholder = "e.g. 1 (a) (i)";
  numberInput.setAttribute("aria-label", "Question number");
  numberInput.className = "question-number min-w-0 flex-1 rounded-lg border p-2 text-sm outline-none focus:border-indigo-500";
  title.htmlFor = `question-number-${nextQuestionId++}`;
  numberInput.id = title.htmlFor;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.className = "shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50";
  removeButton.addEventListener("click", () => card.remove());

  header.append(title, numberInput, removeButton);

  const marksLabel = document.createElement("label");
  marksLabel.className = "mb-3 block text-xs text-gray-600";
  marksLabel.textContent = "Maximum marks (optional; Gemini will read it from the paper if blank)";
  const maxMarksInput = document.createElement("input");
  maxMarksInput.type = "number";
  maxMarksInput.min = "1";
  maxMarksInput.step = "1";
  maxMarksInput.placeholder = "Marks";
  maxMarksInput.setAttribute("aria-label", "Maximum marks for this question");
  maxMarksInput.className = "max-marks mt-1 w-28 rounded-lg border p-2 text-sm outline-none focus:border-indigo-500";
  marksLabel.appendChild(maxMarksInput);

  const questionTextLabel = document.createElement("label");
  questionTextLabel.className = "mb-3 block text-xs font-medium text-gray-600";
  questionTextLabel.textContent = "Question text (optional; add it if PDF OCR is unclear)";
  const questionText = document.createElement("textarea");
  questionText.rows = 2;
  questionText.placeholder = "Type or correct the question wording...";
  questionText.className = "question-text mt-1 w-full resize-y rounded-lg border p-2.5 text-sm outline-none focus:border-indigo-500";
  questionTextLabel.appendChild(questionText);

  const answerLabel = document.createElement("label");
  answerLabel.className = "block text-xs font-medium text-gray-600";
  answerLabel.textContent = "Your answer";
  const answerText = document.createElement("textarea");
  answerText.rows = 5;
  answerText.placeholder = "Write your answer...";
  answerText.className = "student-answer mt-1 w-full resize-y rounded-lg border p-3 text-sm outline-none focus:border-indigo-500";
  answerLabel.appendChild(answerText);

  const imageLabel = document.createElement("label");
  imageLabel.className = "mt-3 block text-xs font-medium text-gray-600";
  imageLabel.textContent = "Or attach answer photos";
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/png,image/jpeg,image/webp";
  imageInput.multiple = true;
  imageInput.className = "answer-images mt-1 block w-full text-sm text-gray-600";
  imageLabel.appendChild(imageInput);

  card.append(header, marksLabel, questionTextLabel, answerLabel, imageLabel);
  return card;
}

function readAnswerRows() {
  const cards = Array.from(questionList.querySelectorAll(".essay-answer-card"));
  if (cards.length === 0) throw new Error("Add at least one answer row.");

  const seenNumbers = new Set();
  return cards.map(card => {
    const questionNumber = card.querySelector(".question-number").value.trim();
    const questionText = card.querySelector(".question-text").value.trim();
    const answerText = card.querySelector(".student-answer").value.trim();
    const rawMaxMarks = card.querySelector(".max-marks").value.trim();
    const images = Array.from(card.querySelector(".answer-images").files);

    if (!questionNumber) throw new Error("Every answer row needs a question number.");
    if (seenNumbers.has(questionNumber.toLowerCase())) {
      throw new Error(`Question number "${questionNumber}" is used more than once.`);
    }
    seenNumbers.add(questionNumber.toLowerCase());

    if (!answerText && images.length === 0) {
      throw new Error(`Enter or attach an answer for question ${questionNumber}.`);
    }

    let maxMarks = null;
    if (rawMaxMarks) {
      maxMarks = Number(rawMaxMarks);
      if (!Number.isInteger(maxMarks) || maxMarks < 1) {
        throw new Error(`Maximum marks for ${questionNumber} must be a positive whole number.`);
      }
    }

    return { questionNumber, questionText, answerText, maxMarks, images };
  });
}

function fileAsInlinePart(file, fallbackMimeType) {
  if (inlinePartCache.has(file)) return inlinePartCache.get(file);
  const partPromise = file.arrayBuffer()
    .then(buffer => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return {
        inline_data: {
          mime_type: file.type || fallbackMimeType,
          data: window.btoa(binary)
        }
      };
    })
    .catch(error => {
      inlinePartCache.delete(file);
      throw error;
    });
  inlinePartCache.set(file, partPromise);
  return partPromise;
}

function isTextFile(file) {
  return file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
}

async function buildGeminiRequestParts(rows, onProgress = () => {}) {
  if (!paperFile) throw new Error("Choose the question paper PDF first.");
  if (paperFile.type !== "application/pdf" && !paperFile.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("The question paper must be a PDF.");
  }

  const referenceFiles = Array.from(referenceFileInput.files);
  if (selectedCatalogPaper && (selectedCatalogPaper.answerPdf || selectedCatalogPaper.lectureAnswers)) {
    const references = selectedCatalogPaper.answerPdf || selectedCatalogPaper.lectureAnswers;
    const referenceLinks = Array.isArray(references) ? references : [references];
    for (const link of referenceLinks) {
      onProgress(`Loading lecturer reference ${referenceFiles.length + 1}...`);
      referenceFiles.unshift(await getRemoteFile(link, "application/pdf"));
    }
  }

  if (referenceFiles.length === 0) {
    throw new Error("Choose the lecturer's answer PDF in Settings first.");
  }

  const noteFiles = Array.from(notesFileInput.files);
  if (selectedSubject) {
    const notes = Array.isArray(selectedSubject.notes) ? selectedSubject.notes : [];
    const selectedNoteIndexes = new Set(
      Array.from(catalogNoteOptions.querySelectorAll(".catalog-note:checked"))
        .map(input => Number(input.value))
    );
    for (const index of selectedNoteIndexes) {
      const note = notes[index];
      const link = typeof note === "string" ? note : note && (note.url || note.file);
      if (link) {
        onProgress(`Loading syllabus notes ${noteFiles.length + 1}...`);
        noteFiles.unshift(await getRemoteFile(link, "application/pdf"));
      }
    }
  }

  if (noteFiles.length === 0) {
    throw new Error("Choose the subject notes in Settings first.");
  }

  const rowsForPrompt = rows.map(({ images, ...row }) => ({
    ...row,
    answerImageNames: images.map(image => image.name)
  }));
  const promptSections = [
    "Mark the student's answers using the question paper, syllabus notes, and lecturer's answers supplied with this request.",
    "The lecturer's answer is an example of a valid answer and expected depth, not an exact answer to match. Award credit for correct equivalent explanations, terminology, and approaches that are within the syllabus.",
    "Do not require the student's wording to match the lecturer's wording. Do not introduce requirements from outside the supplied syllabus. Use the visible maximum marks for each question; if an optional maximum was provided in the answer data, use that value.",
    "Return one result for every supplied answer row. Marks must be whole non-negative integers and must not exceed the question's maximum. Return only the requested JSON structure; do not include feedback.",
    `Student answer rows: ${JSON.stringify(rowsForPrompt)}`
  ];

  onProgress("Preparing the question paper for Gemini...");
  const parts = [
    { text: promptSections.join("\n\n") },
    { text: "The next attached PDF is the question paper. Use it to identify question wording and maximum marks." },
    await fileAsInlinePart(paperFile, "application/pdf"),
  ];

  for (const referenceFile of referenceFiles) {
    if (referenceFile.type !== "application/pdf" && !referenceFile.name.toLowerCase().endsWith(".pdf")) {
      throw new Error(`Lecturer answer "${referenceFile.name}" must be a PDF.`);
    }
    onProgress(`Preparing lecturer reference: ${referenceFile.name}`);
    parts.push({ text: `The next attached PDF contains lecturer answer material (${referenceFile.name}). Treat it as an example, not an exact-match key.` });
    parts.push(await fileAsInlinePart(referenceFile, "application/pdf"));
  }

  for (const notesFile of noteFiles) {
    if (isTextFile(notesFile)) {
      onProgress(`Preparing syllabus notes: ${notesFile.name}`);
      promptSections.push(`BEGIN SUBJECT NOTES: ${notesFile.name}\n${await notesFile.text()}\nEND SUBJECT NOTES`);
      continue;
    }
    if (notesFile.type !== "application/pdf" && !notesFile.name.toLowerCase().endsWith(".pdf")) {
      throw new Error(`Subject notes "${notesFile.name}" must be a PDF or plain-text file.`);
    }
    onProgress(`Preparing syllabus notes: ${notesFile.name}`);
    parts.push({ text: `The next attached PDF contains syllabus notes (${notesFile.name}). Use it to keep marking within the syllabus.` });
    parts.push(await fileAsInlinePart(notesFile, "application/pdf"));
  }

  parts[0].text = promptSections.join("\n\n");

  for (const row of rows) {
    for (const image of row.images) {
      if (!image.type.startsWith("image/")) {
        throw new Error(`Unsupported answer image "${image.name}". Use PNG, JPEG, or WebP.`);
      }
      onProgress(`Preparing answer image for ${row.questionNumber}...`);
      parts.push({ text: `The next image is part of the student's answer for question ${row.questionNumber}.` });
      parts.push(await fileAsInlinePart(image, image.type));
    }
  }

  return parts;
}

async function requestMarks(apiKey, parts, rows, onProgress) {
  const questionNumbers = rows.map(row => row.questionNumber);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);
  let response;

  onProgress("Sending PDFs and answers to Gemini; waiting for its response...");
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                results: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      question_number: { type: "STRING" },
                      marks: { type: "INTEGER" }
                    },
                    required: ["question_number", "marks"]
                  }
                }
              },
              required: ["results"]
            }
          }
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Gemini did not respond within 3 minutes. Check your connection and try again.");
    }
    throw new Error(`The Gemini request could not be completed: ${error.message}`);
  } finally {
    window.clearTimeout(timeoutId);
  }

  onProgress("Gemini responded; validating the returned marks...");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Gemini returned a response that could not be read as JSON.");
  }
  if (!response.ok) {
    throw new Error(payload.error && payload.error.message
      ? payload.error.message
      : `Gemini request failed with status ${response.status}.`);
  }

  const outputText = payload.candidates
    && payload.candidates[0]
    && payload.candidates[0].content
    && payload.candidates[0].content.parts
    ? payload.candidates[0].content.parts.map(part => part.text || "").join("")
    : "";
  if (!outputText) {
    throw new Error("Gemini did not return marks. Check the paper and answer files, then try again.");
  }

  let result;
  try {
    result = JSON.parse(outputText);
  } catch {
    throw new Error("Gemini returned invalid structured marks. Please try again.");
  }

  if (!result || !Array.isArray(result.results) || result.results.length !== rows.length) {
    throw new Error("Gemini did not return exactly one mark for every answer row.");
  }

  const rowByNumber = new Map(rows.map(row => [row.questionNumber, row]));
  const marksByNumber = new Map();
  for (const item of result.results) {
    if (!item || typeof item.question_number !== "string" || !rowByNumber.has(item.question_number)) {
      throw new Error("Gemini returned a mark for an unknown question number.");
    }
    if (!Number.isInteger(item.marks) || item.marks < 0) {
      throw new Error(`Gemini returned an invalid mark for ${item.question_number}.`);
    }

    const row = rowByNumber.get(item.question_number);
    if (row.maxMarks !== null && item.marks > row.maxMarks) {
      throw new Error(`Gemini returned ${item.marks} marks for ${item.question_number}, above its ${row.maxMarks}-mark limit.`);
    }
    if (marksByNumber.has(item.question_number)) {
      throw new Error(`Gemini returned duplicate marks for ${item.question_number}.`);
    }
    marksByNumber.set(item.question_number, item.marks);
  }

  if (questionNumbers.some(number => !marksByNumber.has(number))) {
    throw new Error("Gemini omitted one or more answers. Please try again.");
  }

  return rows.map(row => ({
    questionNumber: row.questionNumber,
    marks: marksByNumber.get(row.questionNumber),
    maxMarks: row.maxMarks
  }));
}

function renderResults(results) {
  resultsPanel.replaceChildren();
  const heading = document.createElement("h3");
  heading.className = "text-lg font-bold text-gray-900";
  heading.textContent = "Marks";

  const list = document.createElement("ul");
  list.className = "mt-3 divide-y";
  let totalMarks = 0;
  let totalMaximum = 0;
  let allMaximumsKnown = true;

  results.forEach(result => {
    totalMarks += result.marks;
    if (result.maxMarks === null) {
      allMaximumsKnown = false;
    } else {
      totalMaximum += result.maxMarks;
    }

    const item = document.createElement("li");
    item.className = "flex justify-between gap-3 py-2 text-sm";
    const number = document.createElement("span");
    number.className = "font-medium text-gray-700";
    number.textContent = result.questionNumber;
    const mark = document.createElement("span");
    mark.className = "font-bold text-indigo-700";
    mark.textContent = result.maxMarks === null
      ? `${result.marks} marks`
      : `${result.marks} / ${result.maxMarks}`;
    item.append(number, mark);
    list.appendChild(item);
  });

  const total = document.createElement("p");
  total.className = "mt-3 border-t pt-3 text-right font-bold text-gray-900";
  total.textContent = allMaximumsKnown
    ? `Total: ${totalMarks} / ${totalMaximum}`
    : `Total awarded: ${totalMarks}`;
  resultsPanel.append(heading, list, total);
  resultsPanel.classList.remove("hidden");
}

async function calculateMarks() {
  clearStatus();
  clearProgress();
  resultsPanel.classList.add("hidden");
  markButton.disabled = true;
  markButton.textContent = "Preparing...";

  try {
    const rows = readAnswerRows();
    const apiKey = await getApiKeyForMarking();
    const progress = message => updateProgress(message);
    progress("Preparing the selected paper, notes, and answers...");
    const parts = await buildGeminiRequestParts(rows, progress);
    const results = await requestMarks(apiKey, parts, rows, progress);
    renderResults(results);
    clearProgress();
    showStatus("Marks are ready. Check the result against the paper; OCR or AI marking can make mistakes.", "success");
  } catch (error) {
    clearProgress();
    showStatus(`Marking failed: ${error.message || "Could not calculate marks."}`, "error");
  } finally {
    markButton.disabled = false;
    markButton.textContent = "Calculate marks";
  }
}

launchButton.addEventListener("click", () => {
  const headerMain = document.getElementById("header-main");
  const app = document.getElementById("app");
  const timer = document.getElementById("timer-wrapper");
  previousVisibility = {
    headerHidden: headerMain.classList.contains("hidden"),
    appHidden: app.classList.contains("hidden"),
    timerHidden: timer.classList.contains("hidden")
  };
  headerMain.classList.add("hidden");
  app.classList.add("hidden");
  timer.classList.add("hidden");
  essayWorkspace.classList.remove("hidden");
  clearStatus();
});

essayBackButton.addEventListener("click", () => {
  const headerMain = document.getElementById("header-main");
  const app = document.getElementById("app");
  const timer = document.getElementById("timer-wrapper");
  essayWorkspace.classList.add("hidden");
  headerMain.classList.toggle("hidden", previousVisibility.headerHidden);
  app.classList.toggle("hidden", previousVisibility.appHidden);
  timer.classList.toggle("hidden", previousVisibility.timerHidden);
});

answerTabButton.addEventListener("click", showAnswersTab);
settingsTabButton.addEventListener("click", showSettingsTab);
addQuestionButton.addEventListener("click", () => {
  questionList.appendChild(createQuestionCard());
});
markButton.addEventListener("click", calculateMarks);

semesterSelect.addEventListener("change", () => {
  selectCatalogSemester(semesterSelect.value);
  renderEssayQuestionRows([]);
  clearStatus();
});

subjectSelect.addEventListener("change", () => {
  paperFileInput.value = "";
  resetPaperPreview();
  renderEssayQuestionRows([]);
  selectCatalogSubject(subjectSelect.value);
  clearStatus();
});

catalogPaperSelect.addEventListener("change", () => {
  selectCatalogPaper(catalogPaperSelect.value);
});

paperFileInput.addEventListener("change", () => {
  paperLoadVersion++;
  selectedCatalogPaper = null;
  catalogPaperSelect.value = "";
  paperFile = paperFileInput.files[0] || null;
  if (paperObjectUrl) URL.revokeObjectURL(paperObjectUrl);
  paperObjectUrl = null;

  if (!paperFile) {
    paperPreview.src = "";
    paperPreview.classList.add("hidden");
    paperPlaceholder.classList.remove("hidden");
    return;
  }

  if (paperFile.type !== "application/pdf" && !paperFile.name.toLowerCase().endsWith(".pdf")) {
    paperFile = null;
    paperFileInput.value = "";
    showStatus("Choose a PDF file for the question paper.", "error");
    resetPaperPreview();
    return;
  }

  showPaperPreview(paperFile);
  clearStatus();
});

saveKeyButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    keyStatus.textContent = "Enter an API key before saving.";
    return;
  }

  saveKeyButton.disabled = true;
  try {
    await saveApiKey(apiKey);
    apiKeyInput.value = "";
    keyStatus.textContent = "Key saved encrypted on this browser.";
  } catch (error) {
    keyStatus.textContent = error.message;
  } finally {
    saveKeyButton.disabled = false;
  }
});

removeKeyButton.addEventListener("click", async () => {
  try {
    await forgetSavedApiKey();
    apiKeyInput.value = "";
    keyStatus.textContent = "Saved key forgotten.";
  } catch (error) {
    keyStatus.textContent = error.message;
  }
});

questionList.appendChild(createQuestionCard("1"));
refreshKeyStatus();
loadEssayCatalog();
