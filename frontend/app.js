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

const $ = id => document.getElementById(id);

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
                "Content-Type": "application/json"
            }),

        ...(token
            ? {
                Authorization: "Bearer " + token
            }
            : {})
    };

    let response;

    try {

        response = await fetch(A + path, {
            ...options,

            headers: {
                ...headers,
                ...(options.headers || {})
            }
        });

    } catch (error) {

        throw new Error(
            "Backend server se connection nahi ho pa raha."
        );
    }


    const data = await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

        throw new Error(
            data.error ||
            `Server error (${response.status})`
        );
    }


    return data;
}


/* =========================================================
   AUTH MODE
   ========================================================= */

function mode(type) {

    $("login").classList.toggle(
        "hide",
        type !== "login"
    );

    $("reg").classList.toggle(
        "hide",
        type !== "reg"
    );
}


/* =========================================================
   LOGIN
   ========================================================= */

$("login").onsubmit = async event => {

    event.preventDefault();

    try {

        const data = await api(
            "/auth/login",
            {
                method: "POST",

                body: JSON.stringify({
                    email: $("le").value,
                    password: $("lp").value
                })
            }
        );

        session(data);

    } catch (error) {

        toast(error.message);
    }
};


/* =========================================================
   REGISTER
   ========================================================= */

$("reg").onsubmit = async event => {

    event.preventDefault();

    try {

        const data = await api(
            "/auth/register",
            {
                method: "POST",

                body: JSON.stringify({
                    name: $("rn").value,
                    email: $("re").value,
                    password: $("rp").value,
                    branch: $("rb").value,
                    semester: $("rs").value
                })
            }
        );

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

    localStorage.setItem(
        "token",
        token
    );

    localStorage.setItem(
        "me",
        JSON.stringify(me)
    );


    $("auth").classList.add("hide");

    $("app").classList.remove("hide");


    $("welcome").textContent =
        me.name;

    $("dn").textContent =
        me.name;


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

    document
        .querySelectorAll("main section")
        .forEach(section => {

            section.classList.add("hide");

        });


    const target = $(id);

    if (target) {
        target.classList.remove("hide");
    }


    document
        .querySelectorAll(".nav")
        .forEach(nav => {

            nav.classList.remove("active");

        });


    if (button) {
        button.classList.add("active");
    }


    if (id === "dash") {
        dash();
    }


    if (
        ["subjects", "att", "assign"]
        .includes(id)
    ) {
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

        const data =
            await api("/dashboard");


        const averageAttendance =
            data.attendance.length
                ? data.attendance.reduce(
                    (sum, item) =>
                        sum + item.percentage,
                    0
                ) / data.attendance.length
                : 0;


        const pendingAssignments =
            data.assignments.filter(
                item =>
                    item.status !== "Completed"
            ).length;


        $("stats").innerHTML = `

            <div class="stat">
                Attendance
                <strong>
                    ${averageAttendance.toFixed(1)}%
                </strong>
            </div>

            <div class="stat">
                Pending Work
                <strong>
                    ${pendingAssignments}
                </strong>
            </div>

            <div class="stat">
                Subjects
                <strong>
                    ${data.attendance.length}
                </strong>
            </div>

            <div class="stat">
                Study Target
                <strong>
                    3h
                </strong>
            </div>

        `;


        $("classes").innerHTML =

            data.today_classes
                .map(item => `

                    <div class="row">

                        <span>
                            ${item.subject}
                        </span>

                        <span class="badge">
                            ${item.time}
                        </span>

                    </div>

                `)
                .join("")

            ||

            "<p>No classes today.</p>";


        $("dassign").innerHTML =

            data.assignments
                .slice(0, 5)
                .map(item => `

                    <div class="row">

                        <span>
                            ${item.title}
                        </span>

                        <span class="badge">
                            ${item.deadline}
                        </span>

                    </div>

                `)
                .join("")

            ||

            "<p>No assignments.</p>";


        $("datt").innerHTML =

            data.attendance
                .map(item => `

                    <div>

                        <b>
                            ${item.subject}
                        </b>

                        <div class="bar">

                            <i
                                style="
                                    width:${Math.min(
                                        100,
                                        item.percentage
                                    )}%
                                "
                            ></i>

                        </div>

                        <span>
                            ${item.percentage}%
                        </span>

                    </div>

                `)
                .join("");


    } catch (error) {

        toast(error.message);
    }
}


/* =========================================================
   SUBJECTS / ATTENDANCE / ASSIGNMENTS
   ========================================================= */

async function academic() {

    try {

        subs =
            await api("/subjects");


        $("sl").innerHTML =

            subs
                .map(subject => `

                    <div class="item">

                        <b>
                            ${subject.name}
                        </b>

                        <p>
                            Subject ID:
                            ${subject.id}
                        </p>

                    </div>

                `)
                .join("")

            ||

            "<div class='card'>No subjects.</div>";


        $("asub").innerHTML =

            subs
                .map(subject => `

                    <option value="${subject.id}">
                        ${subject.name}
                    </option>

                `)
                .join("");


        const dashboard =
            await api("/dashboard");


        $("al").innerHTML =

            dashboard.attendance
                .map(item => `

                    <div class="item">

                        <b>
                            ${item.subject}
                        </b>

                        <p>
                            ${item.attended}/${item.total}
                            —
                            ${item.percentage}%
                        </p>

                        <div class="row">

                            <input
                                id="at${item.subject_id}"
                                type="number"
                                value="${item.attended}"
                            >

                            <input
                                id="to${item.subject_id}"
                                type="number"
                                value="${item.total}"
                            >

                            <button
                                onclick="saveAtt(${item.subject_id})"
                            >
                                Save
                            </button>

                        </div>

                    </div>

                `)
                .join("");


        const assignments =
            await api("/assignments");


        $("alist").innerHTML =

            assignments
                .map(item => `

                    <div class="item">

                        <div class="row">

                            <b>
                                ${item.title}
                            </b>

                            <span class="badge">
                                ${item.priority}
                            </span>

                        </div>

                        <p>
                            Deadline:
                            ${item.deadline}
                        </p>

                        <button
                            onclick="complete(${item.id})"
                        >
                            ${
                                item.status === "Completed"
                                    ? "Completed"
                                    : "Mark Complete"
                            }
                        </button>

                    </div>

                `)
                .join("")

            ||

            "<div class='card'>No assignments.</div>";


    } catch (error) {

        toast(error.message);
    }
}


/* =========================================================
   ADD SUBJECT
   ========================================================= */

async function addSubject() {

    try {

        await api(
            "/subjects",
            {
                method: "POST",

                body: JSON.stringify({
                    name: $("sname").value
                })
            }
        );


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

        await api(
            "/attendance",
            {
                method: "POST",

                body: JSON.stringify({

                    subject_id: id,

                    attended:
                        +$("at" + id).value,

                    total:
                        +$("to" + id).value

                })
            }
        );


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

        await api(
            "/assignments",
            {
                method: "POST",

                body: JSON.stringify({

                    title:
                        $("atitle").value,

                    subject_id:
                        +$("asub").value,

                    deadline:
                        $("adead").value,

                    priority:
                        $("apri").value

                })
            }
        );


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

async function complete(id) {

    try {

        await api(
            "/assignments/" + id,
            {
                method: "PATCH",

                body: JSON.stringify({
                    status: "Completed"
                })
            }
        );


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

async function makePlan() {

    try {

        const data =
            await api(
                "/planner",
                {
                    method: "POST",

                    body: JSON.stringify({

                        available_minutes:
                            +$("mins").value,

                        weak_subject:
                            $("weak").value,

                        urgent:
                            $("urgent").value,

                        subjects:
                            $("psubs")
                                .value
                                .split(",")

                    })
                }
            );


        $("planout").innerHTML =

            data.plan
                .map(item => `

                    <div>

                        <b>
                            ${item.title}
                        </b>

                        —
                        ${item.minutes}
                        min

                        <br>

                        <small>
                            ${item.reason}
                        </small>

                    </div>

                `)
                .join("");


    } catch (error) {

        toast(error.message);
    }
}


/* =========================================================
   AI STATUS
   ========================================================= */

async function aiStatus() {

    const statusElement =
        $("aiStatus");


    if (!statusElement) {
        return;
    }


    statusElement.textContent =
        "● Checking AI";


    statusElement.className =
        "ai-status ai-status-check";


    try {

        const data =
            await api("/ai/status");


        const ready =
            data.enabled &&
            data.connected &&
            data.model_available;


        if (ready) {

            statusElement.textContent =
                "● AI Ready";

            statusElement.className =
                "ai-status ready";

        } else {

            statusElement.textContent =
                "● AI Unavailable";

            statusElement.className =
                "ai-status error";
        }


    } catch (error) {

        statusElement.textContent =
            "● AI Unavailable";

        statusElement.className =
            "ai-status error";
    }
}


/* =========================================================
   AI QUICK PROMPT
   ========================================================= */

function setPrompt(text) {

    const questionBox =
        $("q");


    if (!questionBox) {
        return;
    }


    questionBox.value = text;

    questionBox.focus();

    questionBox.setSelectionRange(
        questionBox.value.length,
        questionBox.value.length
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

    const answerBox =
        $("ans");


    if (!answerBox) {
        return;
    }


    const text =
        answerBox.textContent.trim();


    if (
        !text ||
        text ===
        "Ask an academic question to start. Your answer will appear here."
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

    const questionBox =
        $("q");

    const answerBox =
        $("ans");

    const button =
        $("askBtn");


    if (!questionBox || !answerBox || !button) {
        return;
    }


    const question =
        questionBox.value.trim();


    if (!question) {

        toast("Write a question first");

        questionBox.focus();

        return;
    }


    button.disabled = true;

    button.innerHTML =
        "<span>Thinking...</span><span>⏳</span>";


    answerBox.textContent =
        "StudyAI is thinking...";


    try {

        const data =
            await api(
                "/ai/chat",
                {
                    method: "POST",

                    body: JSON.stringify({
                        question: question
                    })
                }
            );


        answerBox.textContent =
            data.answer ||
            "No response received.";


    } catch (error) {

        answerBox.textContent =
            "AI Error: " +
            error.message;


    } finally {

        button.disabled = false;

        button.innerHTML =
            "<span>Ask StudyAI</span><span>➜</span>";
    }
}


/* =========================================================
   PDF SUMMARY
   ========================================================= */

async function summary() {

    const fileInput =
        $("pdf");


    if (!fileInput) {
        return;
    }


    const file =
        fileInput.files[0];


    if (!file) {

        toast("Select a PDF");

        return;
    }


    $("sum").textContent =
        "Processing...";


    const formData =
        new FormData();


    formData.append(
        "file",
        file
    );


    try {

        const data =
            await api(
                "/ai/summarize",
                {
                    method: "POST",

                    body: formData
                }
            );


        $("sum").textContent =
            `Pages: ${data.pages}\n\n${data.summary}`;


    } catch (error) {

        $("sum").textContent =
            error.message;
    }
}


/* =========================================================
   AI QUIZ
   ========================================================= */

async function makeQuiz() {

    $("quizout").innerHTML =
        "<div class='card'>Generating...</div>";


    try {

        const data =
            await api(
                "/ai/quiz",
                {
                    method: "POST",

                    body: JSON.stringify({

                        topic:
                            $("topic").value,

                        count:
                            +$("count").value

                    })
                }
            );


        window.Q =
            data.questions;


        window.currentQuizTopic =
            data.topic;


        $("quizout").innerHTML = `

            <div class="card">

                <h3>
                    ${data.topic}
                </h3>

                ${data.questions
                    .map((question, index) => `

                        <div class="quiz">

                            <b>
                                Q${index + 1}.
                                ${question.question}
                            </b>

                            ${question.options
                                .map((option, optionIndex) => `

                                    <label class="option">

                                        <input
                                            type="radio"
                                            name="q${index}"
                                            value="${optionIndex}"
                                        >

                                        ${option}

                                    </label>

                                `)
                                .join("")}

                        </div>

                    `)
                    .join("")}


                <button
                    onclick="submitQuiz()"
                >
                    Submit Quiz
                </button>

            </div>

        `;


    } catch (error) {

        $("quizout").textContent =
            error.message;
    }
}


/* =========================================================
   SUBMIT QUIZ
   ========================================================= */

async function submitQuiz(topic = null) {

    const quizTopic =
        topic ||
        window.currentQuizTopic ||
        "Quiz";


    const questions =
        window.Q || [];


    if (!questions.length) {

        toast("Quiz data not available");

        return;
    }


    let score = 0;


    questions.forEach(
        (question, index) => {

            const selected =
                document.querySelector(
                    `input[name="q${index}"]:checked`
                );


            if (
                selected &&
                +selected.value === question.answer
            ) {

                score++;
            }

        }
    );


    const percentage =
        Math.round(
            (score / questions.length) * 100
        );


    try {

        await api(
            "/ai/quiz/result",
            {
                method: "POST",

                body: JSON.stringify({

                    topic:
                        quizTopic,

                    score:
                        percentage

                })
            }
        );

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

        const data =
            await api("/analytics");


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
                .map(item => `

                    <div class="row">

                        <span>
                            ${item.topic}
                        </span>

                        <b>
                            ${item.score}%
                        </b>

                    </div>

                `)
                .join("")

            ||

            "<p>No quiz results yet.</p>";


    } catch (error) {

        /* Analytics errors are ignored
           so the rest of the dashboard keeps working. */
    }
}


/* =========================================================
   INITIAL SESSION
   ========================================================= */

if (token && me) {

    $("auth").classList.add("hide");

    $("app").classList.remove("hide");


    $("welcome").textContent =
        me.name;

    $("dn").textContent =
        me.name;


    load();

}