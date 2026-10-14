const A = "/api";

let token = localStorage.getItem("token");
let me = null;
let subs = [];

/* =========================================================
   SAFE USER DATA
   ========================================================= */

try {
  me = JSON.parse(localStorage.getItem("me") || "null");
} catch (e) {
  me = null;
}

/* =========================================================
   HELPER
   ========================================================= */

const $ = (id) => document.getElementById(id);

function toast(message) {
  const box = $("toast");

  if (!box) return;

  box.innerHTML = `<div class="toast">${message}</div>`;

  setTimeout(() => {
    box.innerHTML = "";
  }, 2200);
}

/* =========================================================
   API HELPER
   ========================================================= */

async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : {
          "Content-Type": "application/json",
        }),

    ...(token
      ? {
          Authorization: "Bearer " + token,
        }
      : {}),
  };

  let response;

  try {
    response = await fetch(A + path, {
      ...options,

      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error("Backend server se connection nahi ho pa raha.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return data;
}

/* =========================================================
   AUTH MODE
   ========================================================= */

function mode(type) {
  $("login").classList.toggle("hide", type !== "login");

  $("reg").classList.toggle("hide", type !== "reg");
}

/* =========================================================
   LOGIN
   ========================================================= */

$("login").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const data = await api("/auth/login", {
      method: "POST",

      body: JSON.stringify({
        email: $("le").value,
        password: $("lp").value,
      }),
    });

    session(data);
  } catch (error) {
    toast(error.message);
  }
};

/* =========================================================
   REGISTER
   ========================================================= */

$("reg").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const data = await api("/auth/register", {
      method: "POST",

      body: JSON.stringify({
        name: $("rn").value,
        email: $("re").value,
        password: $("rp").value,
        branch: $("rb").value,
        semester: $("rs").value,
      }),
    });

    session(data);
  } catch (error) {
    toast(error.message);
  }
};

/* =========================================================
   CREATE SESSION
   ========================================================= */

function session(data) {
  token = data.token;
  me = data.user;

  localStorage.setItem("token", token);

  localStorage.setItem("me", JSON.stringify(me));

  $("auth").classList.add("hide");

  $("app").classList.remove("hide");

  $("welcome").textContent = me.name;

  $("dn").textContent = me.name;

  load();
}

/* =========================================================
   LOGOUT
   ========================================================= */

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("me");

  location.reload();
}

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function go(id, button) {
  document.querySelectorAll("main section").forEach((section) => {
    section.classList.add("hide");
  });

  const target = $(id);

  if (target) {
    target.classList.remove("hide");
  }

  document.querySelectorAll(".nav").forEach((nav) => {
    nav.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }

  if (id === "dash") {
    dash();
  }

  if (["subjects", "att", "assign"].includes(id)) {
    academic();
  }

  if (id === "analytics") {
    analytics();
  }

  if (id === "ai") {
    aiStatus();
  }
}

/* =========================================================
   LOAD ALL DATA
   ========================================================= */

async function load() {
  await academic();

  await dash();

  await analytics();

  aiStatus();
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function dash() {
  try {
    const data = await api("/dashboard");

    const averageAttendance = data.attendance.length
      ? data.attendance.reduce((sum, item) => sum + item.percentage, 0) /
        data.attendance.length
      : 0;

    const pendingAssignments = data.assignments.filter(
      (item) => item.status !== "Completed",
    ).length;

    const todayClass = data.today_classes[0];
    const subjectCount = data.subjects?.length || data.attendance.length;

    $("stats").innerHTML = `
      <div class="stat">
        <span class="stat-icon">✓</span>
        <span class="stat-title">Attendance</span>
        <strong>(${averageAttendance.toFixed(1)}%)</strong>
      </div>
      <div class="stat">
        <span class="stat-icon">☷</span>
        <span class="stat-title">Pending Work</span>
        <strong>(${pendingAssignments})</strong>
      </div>
      <div class="stat">
        <span class="stat-icon">▣</span>
        <span class="stat-title">My Subjects</span>
        <strong>(${subjectCount})</strong>
      </div>
      <div class="stat">
        <span class="stat-icon">◷</span>
        <span class="stat-title">Today's Classes</span>
        <strong>(${todayClass ? `${todayClass.time} - ${todayClass.subject}` : "None today"})</strong>
      </div>
      <div class="stat">
        <span class="stat-icon">▣</span>
        <span class="stat-title">Due Assignments</span>
        <strong>(${data.assignments.length ? `${data.assignments.length} due` : "None due today"})</strong>
      </div>
      <div class="stat">
        <span class="stat-icon">◎</span>
        <span class="stat-title">Study Target</span>
        <strong>(3h)</strong>
      </div>
    `;
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   SUBJECTS / ATTENDANCE / ASSIGNMENTS
   ========================================================= */

async function academic() {
  try {
    subs = await api("/subjects");

    $("sl").innerHTML =
      subs
        .map(
          (subject) => `

                    <div class="item">

                        <b>
                            ${subject.name}
                        </b>

                        <p>
                            Subject ID:
                            ${subject.id}
                        </p>

                    </div>

                `,
        )
        .join("") || "<div class='card'>No subjects.</div>";

    $("asub").innerHTML = subs
      .map(
        (subject) => `

                    <option value="${subject.id}">
                        ${subject.name}
                    </option>

                `,
      )
      .join("");

    const dashboard = await api("/dashboard");

  $("al").innerHTML = dashboard.attendance
  .map((item) => `
    <div class="table-row att-grid">
      <strong>${item.subject}</strong>
      <div class="attendance-progress">
        <span style="width:${Math.min(100, item.percentage)}%; background:${item.percentage > 0 ? "#4ade80" : "#ef4444"}"></span>
      </div>
      <span>${item.attended}/${item.total} — ${item.percentage}%</span>
      <div class="input-pill">
        <input id="at${item.subject_id}" type="number" value="${item.attended}" aria-label="Attended classes for ${item.subject}">
        <input id="to${item.subject_id}" type="number" value="${item.total}" aria-label="Total classes for ${item.subject}">
      </div>
      <button class="btn-soft" onclick="saveAtt(${item.subject_id})">Save</button>
    </div>
  `).join("");

    const assignments = await api("/assignments");

  const badgeClass = (value) => value.toLowerCase().replace(/\\s+/g, "-");
  $("alist").innerHTML = assignments.map((item) => `
    <div class="table-row assign-grid">
      <strong>${item.title}</strong>
      <span>${item.subject || "—"}</span>
      <span class="status-badge priority-${badgeClass(item.priority)}">${item.priority}</span>
      <span>${item.deadline || "—"}</span>
      <span class="status-badge status-${badgeClass(item.status)}">${item.status}</span>
      <div class="assignment-actions">
        <button onclick="complete(${item.id})">${item.status === "Completed" ? "Completed" : "Mark Complete"}</button>
        <button class="btn-outline" onclick="editAssignment(${item.id})">Edit</button>
      </div>
    </div>
  `).join("") || "<div class='empty-state'>No assignments.</div>";
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   ADD SUBJECT
   ========================================================= */

async function addSubject() {
  try {
    await api("/subjects", {
      method: "POST",

      body: JSON.stringify({
        name: $("sname").value,
      }),
    });

    $("sname").value = "";

    await academic();

    await dash();

    toast("Subject added");
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   SAVE ATTENDANCE
   ========================================================= */

async function saveAtt(id) {
  try {
    await api("/attendance", {
      method: "POST",

      body: JSON.stringify({
        subject_id: id,

        attended: +$("at" + id).value,

        total: +$("to" + id).value,
      }),
    });

    await academic();

    await dash();

    toast("Attendance saved");
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   ADD ASSIGNMENT
   ========================================================= */

async function addAssignment() {
  try {
    await api("/assignments", {
      method: "POST",

      body: JSON.stringify({
        title: $("atitle").value,

        subject_id: +$("asub").value,

        deadline: $("adead").value,

        priority: $("apri").value,
      }),
    });

    $("atitle").value = "";

    $("adead").value = "";

    await academic();

    await dash();

    toast("Assignment added");
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   COMPLETE ASSIGNMENT
   ========================================================= */

  async function editAssignment(id) {
  try {
    const assignment = (await api("/assignments")).find((item) => item.id === id);
    if (!assignment) return;
    $("atitle").value = assignment.title || "";
    $("asub").value = assignment.subject_id || "";
    $("adead").value = assignment.deadline || "";
    $("apri").value = assignment.priority || "Medium";
    $("atitle").focus();
    toast("Assignment loaded for editing. Update the fields and add it again.");
  } catch (error) {
    toast(error.message);
  }
  }

  async function complete(id) {
  try {
    await api("/assignments/" + id, {
      method: "PATCH",

      body: JSON.stringify({
        status: "Completed",
      }),
    });

    await academic();

    await dash();

    await analytics();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================================================
   STUDY PLANNER
   ========================================================= */

let currentPlan = [];

function renderPlan(plan) {
  currentPlan = plan;
  $("planout").innerHTML = plan.map((item, index) => `
    <article class="plan-day-card">
      <h4>Day ${String(index + 1).padStart(2, "0")}</h4>
      <div class="plan-card-grid">
        <div><span class="col-header">Topic</span><span>${item.title || item.topic || "Study session"}</span></div>
        <div><span class="col-header">Subject</span><span>${item.subject_name || item.subject || "Subject Name"}<br><small class="muted">${item.subject_code || ""}</small></span></div>
        <div><span class="col-header">Duration</span><span>${item.minutes || 0} min</span></div>
        <div><span class="col-header">Status</span><span class="badge ${item.completed ? "status-completed" : "status-pending"}">${item.completed ? "Completed" : "Pending"}</span></div>
        <div class="plan-card-actions"><span class="col-header">Actions</span><div class="plan-card-actions"><button onclick="startPlanItem(${index})">${item.completed ? "Review" : "Start"}</button><button class="btn-outline" onclick="viewPlanDetails(${index})">View Details</button></div></div>
      </div>
    </article>
  `).join("") || "<div class='empty-state'>Generate a plan to see your day-wise breakdown.</div>";
}

async function makePlan() {
  try {
    const availableMinutes = (+($("plan-days").value || 0) * 1440) + (+($("plan-hours").value || 0) * 60) + +($("plan-mins").value || 0);
    const data = await api("/planner", {
      method: "POST",
      body: JSON.stringify({
        available_minutes: availableMinutes,
        weak_subject: $("weak").value,
        urgent: $("urgent").value,
        subjects: $("psubs").value.split(",").map((subject) => subject.trim()).filter(Boolean),
      }),
    });
    renderPlan(data.plan || []);
    const days = Math.max(1, Math.ceil(availableMinutes / 1440));
    $("planSummaryTitle").textContent = `Your Derived Plan Summary (${days} Days)`;
  } catch (error) {
    toast(error.message);
  }
}

function startPlanItem(index) {
  if (!currentPlan[index]) return;
  currentPlan[index].completed = true;
  renderPlan(currentPlan);
  toast("Study session marked completed.");
}

function viewPlanDetails(index) {
  const item = currentPlan[index];
  if (!item) return;
  toast(`${item.title || "Study session"}: ${item.reason || `${item.minutes || 0} minutes planned.`}`);
}

/* =========================================================
   AI STATUS
   ========================================================= */

async function aiStatus() {
  const statusElement = $("aiStatus");

  if (!statusElement) {
    return;
  }

  statusElement.textContent = "● Checking AI";

  statusElement.className = "ai-status ai-status-check";

  try {
    const data = await api("/ai/status");

    const ready = data.enabled && data.connected && data.model_available;

    if (ready) {
      statusElement.textContent = "● AI Ready";

      statusElement.className = "ai-status ready";
    } else {
      statusElement.textContent = "● AI Unavailable";

      statusElement.className = "ai-status error";
    }
  } catch (error) {
    statusElement.textContent = "● AI Unavailable";

    statusElement.className = "ai-status error";
  }
}

/* =========================================================
   AI QUICK PROMPT
   ========================================================= */

function setPrompt(text) {
  const questionBox = $("q");

  if (!questionBox) {
    return;
  }

  questionBox.value = text;

  questionBox.focus();

  questionBox.setSelectionRange(
    questionBox.value.length,
    questionBox.value.length,
  );
}

/* =========================================================
   CLEAR AI
   ========================================================= */

function clearAnswer() {
  const questionBox = $("q");
  const answerBox = $("ans");

  if (questionBox) {
    questionBox.value = "";
  }

  if (answerBox) {
    answerBox.textContent =
      "Ask an academic question to start. Your answer will appear here.";
  }

  if (questionBox) {
    questionBox.focus();
  }
}

/* =========================================================
   COPY AI ANSWER
   ========================================================= */

async function copyAnswer() {
  const answerBox = $("ans");

  if (!answerBox) {
    return;
  }

  const text = answerBox.textContent.trim();

  if (
    !text ||
    text === "Ask an academic question to start. Your answer will appear here."
  ) {
    toast("Nothing to copy");

    return;
  }

  try {
    await navigator.clipboard.writeText(text);

    toast("Answer copied");
  } catch (error) {
    toast("Copy is not available");
  }
}

/* =========================================================
   ASK AI
   ========================================================= */

async function ask() {
  const questionBox = $("q");

  const answerBox = $("ans");

  const button = $("askBtn");

  if (!questionBox || !answerBox || !button) {
    return;
  }

  const question = questionBox.value.trim();

  if (!question) {
    toast("Write a question first");

    questionBox.focus();

    return;
  }

  button.disabled = true;

  button.innerHTML = "<span>Thinking...</span><span>⏳</span>";

  answerBox.textContent = "StudyAI is thinking...";

  try {
    const data = await api("/ai/chat", {
      method: "POST",

      body: JSON.stringify({
        question: question,
      }),
    });

    answerBox.textContent = data.answer || "No response received.";
  } catch (error) {
    answerBox.textContent = "AI Error: " + error.message;
  } finally {
    button.disabled = false;

    button.innerHTML = "<span>Ask StudyAI</span><span>➜</span>";
  }
}

/* =========================================================
   PDF SUMMARY
   ========================================================= */

async function summary() {
  const fileInput = $("pdf");

  if (!fileInput) {
    return;
  }

  const file = fileInput.files[0];

  if (!file) {
    toast("Select a PDF");

    return;
  }

  $("sum").textContent = "Processing...";

  const formData = new FormData();

  formData.append("file", file);

  try {
    const data = await api("/ai/summarize", {
      method: "POST",

      body: formData,
    });

    $("sum").textContent = `Pages: ${data.pages}\n\n${data.summary}`;
  } catch (error) {
    $("sum").textContent = error.message;
  }
}

/* =========================================================
   AI QUIZ
   ========================================================= */

async function makeQuiz() {
  $("quizout").innerHTML = "<div class='card'>Generating...</div>";

  try {
    const data = await api("/ai/quiz", {
      method: "POST",

      body: JSON.stringify({
        topic: $("topic").value,

        count: +$("count").value,
      }),
    });

    window.Q = data.questions;

    window.currentQuizTopic = data.topic;

    $("quizout").innerHTML = `

            <div class="card">

                <h3>
                    ${data.topic}
                </h3>

                ${data.questions
                  .map(
                    (question, index) => `

                        <div class="quiz">

                            <b>
                                Q${index + 1}.
                                ${question.question}
                            </b>

                            ${question.options
                              .map(
                                (option, optionIndex) => `

                                    <label class="option">

                                        <input
                                            type="radio"
                                            name="q${index}"
                                            value="${optionIndex}"
                                        >

                                        ${option}

                                    </label>

                                `,
                              )
                              .join("")}

                        </div>

                    `,
                  )
                  .join("")}


                <button
                    onclick="submitQuiz()"
                >
                    Submit Quiz
                </button>

            </div>

        `;
  } catch (error) {
    $("quizout").textContent = error.message;
  }
}

/* =========================================================
   SUBMIT QUIZ
   ========================================================= */

async function submitQuiz(topic = null) {
  const quizTopic = topic || window.currentQuizTopic || "Quiz";

  const questions = window.Q || [];

  if (!questions.length) {
    toast("Quiz data not available");

    return;
  }

  let score = 0;

  questions.forEach((question, index) => {
    const selected = document.querySelector(`input[name="q${index}"]:checked`);

    if (selected && +selected.value === question.answer) {
      score++;
    }
  });

  const percentage = Math.round((score / questions.length) * 100);

  try {
    await api("/ai/quiz/result", {
      method: "POST",

      body: JSON.stringify({
        topic: quizTopic,

        score: percentage,
      }),
    });
  } catch (error) {
    /* Quiz result saving failure
           should not block the score display. */
  }

  $("quizout").innerHTML = `

        <div class="card">

            <h2>
                Score: ${percentage}%
            </h2>

            <p>
                ${score}/${questions.length}
                correct.
            </p>

        </div>

    `;

  analytics();
}

/* =========================================================
   ANALYTICS
   ========================================================= */

async function analytics() {
  try {
    const data = await api("/analytics");

    $("ac").innerHTML = `

            <div class="stat">

                Quiz Attempts

                <strong>
                    ${data.quiz_attempts}
                </strong>

            </div>


            <div class="stat">

                Average Score

                <strong>
                    ${data.average_quiz_score}%
                </strong>

            </div>


            <div class="stat">

                Assignment Completion

                <strong>
                    ${data.assignment_completion}%
                </strong>

            </div>


            <div class="stat">

                AI Assistant

                <strong>
                    Ready
                </strong>

            </div>

        `;

    $("recent").innerHTML =
      data.recent_quizzes
        .map(
          (item) => `

                    <div class="row">

                        <span>
                            ${item.topic}
                        </span>

                        <b>
                            ${item.score}%
                        </b>

                    </div>

                `,
        )
        .join("") || "<p>No quiz results yet.</p>";
  } catch (error) {
    /* Analytics errors are ignored
           so the rest of the dashboard keeps working. */
  }
}

const themeToggle = $("themeToggle");

function setTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  if (!themeToggle) return;
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.querySelector(".theme-knob").textContent = isDark ? "☾" : "☼";
}

setTheme(sessionStorage.getItem("studyai-theme") === "dark");

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark-mode");
    setTheme(isDark);
    sessionStorage.setItem("studyai-theme", isDark ? "dark" : "light");
  });
}

/* =========================================================
   INITIAL SESSION
   ========================================================= */

if (token && me) {
  $("auth").classList.add("hide");

  $("app").classList.remove("hide");

  $("welcome").textContent = me.name;

  $("dn").textContent = me.name;

  load();
}
