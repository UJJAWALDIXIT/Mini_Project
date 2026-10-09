import os
import io
import json
import re

from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, send_from_directory

from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from dotenv import load_dotenv
from pypdf import PdfReader

import requests


# =========================================================
# CONFIGURATION
# =========================================================

BASE = os.path.dirname(__file__)

load_dotenv(
    os.path.join(BASE, ".env")
)


app = Flask(
    __name__,
    static_folder=os.path.join(BASE, "frontend"),
    static_url_path=""
)


app.config["SECRET_KEY"] = os.getenv(
    "SECRET_KEY",
    "dev-secret"
)

app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY",
    "dev-jwt-secret"
)

# Keep the login session valid for 7 days
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
    days=7
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL",
    "sqlite:///studyai.db"
)

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

app.config["MAX_CONTENT_LENGTH"] = (
    int(os.getenv("MAX_UPLOAD_MB", "10"))
    * 1024
    * 1024
)


db = SQLAlchemy(app)

jwt = JWTManager(app)

CORS(app)


# =========================================================
# DATABASE MODELS
# =========================================================

class User(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(120),
        nullable=False
    )

    email = db.Column(
        db.String(180),
        unique=True,
        nullable=False
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    branch = db.Column(
        db.String(100),
        default="CSE-AI"
    )

    semester = db.Column(
        db.String(20),
        default="4"
    )


class Subject(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    name = db.Column(
        db.String(120),
        nullable=False
    )


class Attendance(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    subject_id = db.Column(
        db.Integer,
        nullable=False
    )

    attended = db.Column(
        db.Integer,
        default=0
    )

    total = db.Column(
        db.Integer,
        default=0
    )


class Assignment(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    subject_id = db.Column(
        db.Integer
    )

    title = db.Column(
        db.String(200),
        nullable=False
    )

    deadline = db.Column(
        db.String(40)
    )

    priority = db.Column(
        db.String(20),
        default="Medium"
    )

    status = db.Column(
        db.String(30),
        default="Pending"
    )


class Timetable(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    subject_id = db.Column(
        db.Integer,
        nullable=False
    )

    day = db.Column(
        db.String(20),
        nullable=False
    )

    time = db.Column(
        db.String(30),
        nullable=False
    )


class QuizResult(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    topic = db.Column(
        db.String(200)
    )

    score = db.Column(
        db.Float
    )

    date = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


class AIHistory(db.Model):

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    user_id = db.Column(
        db.Integer,
        nullable=False
    )

    question = db.Column(
        db.Text
    )

    response = db.Column(
        db.Text
    )

    timestamp = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )


# =========================================================
# CREATE DATABASE TABLES
# =========================================================

with app.app_context():
    db.create_all()


# =========================================================
# AUTH HELPERS
# =========================================================

def uid():
    return int(get_jwt_identity())


def token_user(function):

    @wraps(function)
    @jwt_required()
    def wrapper(*args, **kwargs):
        return function(*args, **kwargs)

    return wrapper


def subject_owned(subject_id):

    try:
        subject_id = int(subject_id)
    except (TypeError, ValueError):
        return None

    return Subject.query.filter_by(
        id=subject_id,
        user_id=uid()
    ).first()


# =========================================================
# AI ENGINE
# =========================================================

def ai(prompt):

    enabled = (
        os.getenv(
            "OLLAMA_ENABLED",
            "false"
        )
        .strip()
        .lower()
        == "true"
    )


    model = os.getenv(
        "OLLAMA_MODEL",
        "codellama:latest"
    ).strip()


    url = os.getenv(
        "OLLAMA_URL",
        "http://localhost:11434/api/generate"
    ).strip()


    if not enabled:

        raise RuntimeError(
            "AI service is disabled. "
            "Set OLLAMA_ENABLED=true in .env."
        )


    try:

        response = requests.post(

            url,

            json={
                "model": model,
                "prompt": prompt,
                "stream": False,

                "options": {
                    "temperature": 0.2,
                    "num_ctx": 4096,
                    "num_predict": 550
                }
            },

            timeout=180
        )


        response.raise_for_status()


        data = response.json()


        answer = (
            data.get("response") or ""
        ).strip()


        if not answer:

            raise RuntimeError(
                "AI returned an empty response."
            )


        return answer


    except requests.exceptions.ConnectionError as error:

        raise RuntimeError(
            "AI service is not reachable. "
            "Make sure the local AI service is running."
        ) from error


    except requests.exceptions.Timeout as error:

        raise RuntimeError(
            f"AI took too long to respond. "
            f"Model: {model}. "
            f"Try a shorter request."
        ) from error


    except requests.exceptions.RequestException as error:

        raise RuntimeError(
            f"AI request failed: {error}"
        ) from error


    except (ValueError, KeyError) as error:

        raise RuntimeError(
            "AI returned an invalid response."
        ) from error


# =========================================================
# HEALTH
# =========================================================

@app.get("/api/health")
def health():

    return {
        "status": "ok",
        "service": "StudyAI"
    }


# =========================================================
# AUTH - REGISTER
# =========================================================

@app.post("/api/auth/register")
def register():

    data = request.get_json() or {}


    name = str(
        data.get("name", "")
    ).strip()


    email = str(
        data.get("email", "")
    ).strip().lower()


    password = str(
        data.get("password", "")
    )


    if (
        not name
        or not email
        or len(password) < 6
    ):

        return {
            "error":
                "Name, email and password "
                "(6+ chars) are required"
        }, 400


    if User.query.filter_by(
        email=email
    ).first():

        return {
            "error":
                "Email already registered"
        }, 409


    user = User(

        name=name,

        email=email,

        password_hash=
            generate_password_hash(
                password
            ),

        branch=data.get(
            "branch",
            "CSE-AI"
        ),

        semester=data.get(
            "semester",
            "4"
        )
    )


    db.session.add(user)

    db.session.commit()


    return {

        "token":
            create_access_token(
                identity=str(user.id)
            ),

        "user":
            user_json(user)

    }, 201


# =========================================================
# AUTH - LOGIN
# =========================================================

@app.post("/api/auth/login")
def login():

    data = request.get_json() or {}


    email = str(
        data.get("email", "")
    ).strip().lower()


    password = str(
        data.get("password", "")
    )


    user = User.query.filter_by(
        email=email
    ).first()


    if (
        not user
        or not check_password_hash(
            user.password_hash,
            password
        )
    ):

        return {
            "error":
                "Invalid email or password"
        }, 401


    return {

        "token":
            create_access_token(
                identity=str(user.id)
            ),

        "user":
            user_json(user)

    }


def user_json(user):

    return {

        "id":
            user.id,

        "name":
            user.name,

        "email":
            user.email,

        "branch":
            user.branch,

        "semester":
            user.semester
    }


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/api/dashboard")
@token_user
def dashboard():

    subjects = Subject.query.filter_by(
        user_id=uid()
    ).all()


    attendance = []


    for subject in subjects:

        record = Attendance.query.filter_by(
            subject_id=subject.id
        ).first()


        percentage = (

            round(
                record.attended
                / record.total
                * 100,
                1
            )

            if record
            and record.total

            else 0
        )


        attendance.append({

            "subject_id":
                subject.id,

            "subject":
                subject.name,

            "attended":
                record.attended
                if record
                else 0,

            "total":
                record.total
                if record
                else 0,

            "percentage":
                percentage
        })


    assignments = Assignment.query.filter_by(
        user_id=uid()
    ).order_by(
        Assignment.id.desc()
    ).all()


    today = datetime.now().strftime(
        "%A"
    )


    timetable = Timetable.query.filter_by(
        user_id=uid(),
        day=today
    ).all()


    return {

        "attendance":
            attendance,

        "assignments":
            [
                assignment_json(item)
                for item in assignments
            ],

        "today_classes":
            [
                {

                    "subject_id":
                        item.subject_id,

                    "subject":
                        subject_name(
                            item.subject_id
                        ),

                    "day":
                        item.day,

                    "time":
                        item.time
                }

                for item in timetable
            ]
    }


def subject_name(subject_id):

    subject = Subject.query.get(
        subject_id
    )


    return (
        subject.name
        if subject
        else "Unknown"
    )


def assignment_json(assignment):

    return {

        "id":
            assignment.id,

        "title":
            assignment.title,

        "deadline":
            assignment.deadline,

        "priority":
            assignment.priority,

        "status":
            assignment.status,

        "subject_id":
            assignment.subject_id
    }


# =========================================================
# SUBJECTS
# =========================================================

@app.get("/api/subjects")
@token_user
def subjects():

    return [

        {
            "id":
                subject.id,

            "name":
                subject.name
        }

        for subject in Subject.query.filter_by(
            user_id=uid()
        ).all()
    ]


@app.post("/api/subjects")
@token_user
def add_subject():

    name = str(
        (request.get_json() or {})
        .get("name", "")
    ).strip()


    if not name:

        return {
            "error":
                "Subject name is required"
        }, 400


    subject = Subject(
        user_id=uid(),
        name=name
    )


    db.session.add(subject)

    db.session.commit()


    return {

        "id":
            subject.id,

        "name":
            subject.name

    }, 201


# =========================================================
# ATTENDANCE
# =========================================================

@app.post("/api/attendance")
@token_user
def save_attendance():

    data = request.get_json() or {}


    subject = subject_owned(
        data.get("subject_id")
    )


    if not subject:

        return {
            "error":
                "Subject not found"
        }, 404


    try:

        attended = int(
            data.get(
                "attended",
                0
            )
        )

        total = int(
            data.get(
                "total",
                0
            )
        )

    except (
        TypeError,
        ValueError
    ):

        return {
            "error":
                "Invalid attendance values"
        }, 400


    if (
        attended < 0
        or total < 0
        or attended > total
    ):

        return {
            "error":
                "Invalid attendance"
        }, 400


    attendance = Attendance.query.filter_by(
        subject_id=subject.id
    ).first()


    if not attendance:

        attendance = Attendance(
            subject_id=subject.id
        )

        db.session.add(
            attendance
        )


    attendance.attended = attended

    attendance.total = total


    db.session.commit()


    return {
        "message":
            "Attendance updated"
    }


# =========================================================
# ASSIGNMENTS
# =========================================================

@app.get("/api/assignments")
@token_user
def assignments():

    items = Assignment.query.filter_by(
        user_id=uid()
    ).order_by(
        Assignment.id.desc()
    ).all()


    return [
        assignment_json(item)
        for item in items
    ]


@app.post("/api/assignments")
@token_user
def add_assignment():

    data = request.get_json() or {}


    title = str(
        data.get(
            "title",
            ""
        )
    ).strip()


    if not title:

        return {
            "error":
                "Title required"
        }, 400


    assignment = Assignment(

        user_id=uid(),

        subject_id=
            data.get(
                "subject_id"
            ),

        title=title,

        deadline=
            data.get(
                "deadline",
                ""
            ),

        priority=
            data.get(
                "priority",
                "Medium"
            )
    )


    db.session.add(
        assignment
    )

    db.session.commit()


    return assignment_json(
        assignment
    ), 201


@app.patch(
    "/api/assignments/<int:i>"
)
@token_user
def patch_assignment(i):

    assignment = Assignment.query.filter_by(
        id=i,
        user_id=uid()
    ).first()


    if not assignment:

        return {
            "error":
                "Not found"
        }, 404


    data = request.get_json() or {}


    assignment.status = data.get(
        "status",
        assignment.status
    )


    assignment.priority = data.get(
        "priority",
        assignment.priority
    )


    db.session.commit()


    return assignment_json(
        assignment
    )


# =========================================================
# STUDY PLANNER
# =========================================================

@app.post("/api/planner")
@token_user
def planner():

    data = request.get_json() or {}


    try:

        minutes = max(
            20,
            int(
                data.get(
                    "available_minutes",
                    120
                )
            )
        )

    except (
        TypeError,
        ValueError
    ):

        minutes = 120


    subjects = [

        str(item).strip()

        for item in data.get(
            "subjects",
            []
        )

        if str(item).strip()
    ]


    weak = str(
        data.get(
            "weak_subject",
            ""
        )
    ).strip()


    urgent = str(
        data.get(
            "urgent",
            ""
        )
    ).strip()


    ordered = []


    for item in [
        urgent,
        weak,
        *subjects
    ]:

        if (
            item
            and item not in ordered
        ):

            ordered.append(item)


    if not ordered:

        ordered = [
            "General Revision"
        ]


    plan = []

    remaining = minutes

    index = 0


    while (
        remaining > 0
        and index < 20
    ):

        title = ordered[
            index % len(ordered)
        ]


        block = min(
            45,
            remaining
        )


        if (
            title == urgent
            and urgent
        ):

            reason = (
                "Upcoming deadline"
            )

        elif (
            title == weak
            and weak
        ):

            reason = (
                "Weak area"
            )

        else:

            reason = (
                "Regular revision"
            )


        plan.append({

            "title":
                title,

            "minutes":
                block,

            "reason":
                reason
        })


        remaining -= block


        if remaining >= 10:

            plan.append({

                "title":
                    "Break",

                "minutes":
                    10,

                "reason":
                    "Recovery"
            })


            remaining -= 10


        index += 1


    return {
        "plan":
            plan
    }


# =========================================================
# AI STATUS
# =========================================================

@app.get("/api/ai/status")
@token_user
def ai_status():

    enabled = (
        os.getenv(
            "OLLAMA_ENABLED",
            "false"
        )
        .strip()
        .lower()
        == "true"
    )


    model = os.getenv(
        "OLLAMA_MODEL",
        "codellama:latest"
    ).strip()


    if not enabled:

        return {

            "enabled":
                False,

            "connected":
                False,

            "model":
                model,

            "model_available":
                False,

            "message":
                "AI service is disabled"
        }


    try:

        response = requests.get(
            "http://localhost:11434/api/tags",
            timeout=5
        )


        response.raise_for_status()


        models = response.json().get(
            "models",
            []
        )


        model_names = [

            item.get("name")

            for item in models
        ]


        available = (
            model in model_names
        )


        return {

            "enabled":
                True,

            "connected":
                True,

            "model":
                model,

            "model_available":
                available,

            "message":

                "AI is ready"

                if available

                else
                "Configured AI model is not installed"
        }


    except requests.RequestException:

        return {

            "enabled":
                True,

            "connected":
                False,

            "model":
                model,

            "model_available":
                False,

            "message":
                "AI service is not reachable"
        }


# =========================================================
# AI CHAT
# =========================================================

@app.post("/api/ai/chat")
@token_user
def chat():

    question = str(
        (request.get_json() or {})
        .get(
            "question",
            ""
        )
    ).strip()


    if not question:

        return {
            "error":
                "Question required"
        }, 400


    prompt = f"""

You are StudyAI, a helpful academic
assistant for a college B.Tech CSE-AI student.

Answer in simple language suitable
for exam preparation.

Use headings, bullet points,
examples, algorithms or code
when they improve understanding.

For programming questions,
provide correct and runnable examples.

Do not invent facts.

If the question is ambiguous,
clearly state your assumption.

Student question:

{question}
"""


    try:

        answer = ai(
            prompt
        )

    except RuntimeError as error:

        return {
            "error":
                str(error)
        }, 503


    history = AIHistory(

        user_id=uid(),

        question=question,

        response=answer
    )


    db.session.add(history)

    db.session.commit()


    return {

        "answer":
            answer,

        "model":
            os.getenv(
                "OLLAMA_MODEL",
                "codellama:latest"
            )
    }


# =========================================================
# AI PDF SUMMARY
# =========================================================

@app.post("/api/ai/summarize")
@token_user
def summarize():

    file = request.files.get(
        "file"
    )


    if (
        not file
        or not file.filename.lower().endswith(
            ".pdf"
        )
    ):

        return {
            "error":
                "Upload a PDF"
        }, 400


    try:

        reader = PdfReader(
            io.BytesIO(
                file.read()
            )
        )


        text = "\n".join(

            page.extract_text() or ""

            for page in reader.pages
        )


        text = text[:30000]


        if not text.strip():

            return {
                "error":
                    "No extractable text found"
            }, 400


    except Exception as error:

        return {
            "error":
                f"PDF processing failed: {error}"
        }, 400


    prompt = f"""

Summarize this college study material.

Give:

1. Short summary
2. Important topics
3. Definitions or formulas
4. Five revision points

Do not invent information.

MATERIAL:

{text}
"""


    try:

        summary_text = ai(
            prompt
        )

    except RuntimeError as error:

        return {
            "error":
                str(error)
        }, 503


    return {

        "pages":
            len(reader.pages),

        "summary":
            summary_text
    }


# =========================================================
# QUIZ - HELPER FUNCTIONS
# =========================================================

def detect_question_count(
    text,
    default=5
):

    text = str(
        text or ""
    ).lower()


    match = re.search(

        r"\b(\d{1,2})\s*"
        r"(?:questions?|ques|mcqs?|mcq)\b",

        text
    )


    if match:

        number = int(
            match.group(1)
        )


        if 3 <= number <= 15:

            return number


    return default


def extract_topic_keywords(
    text
):

    text = str(
        text or ""
    ).lower()


    # Remove common quiz-request words
    stop_words = {

        "create",
        "make",
        "generate",
        "give",
        "quiz",
        "question",
        "questions",
        "ques",
        "mcq",
        "mcqs",
        "easy",
        "medium",
        "hard",
        "difficult",
        "simple",
        "level",
        "exam",
        "test",
        "for",
        "the",
        "on",
        "about",
        "with",
        "and",
        "or",
        "from",
        "mujhe",
        "do",
        "ka",
        "ke",
        "ki",
        "par",
        "mein",
        "me",
        "btech",
        "college",
        "student",
        "students",
        "questions",
        "question"
    }


    words = re.findall(
        r"[a-zA-Z][a-zA-Z0-9+#.-]*",
        text
    )


    keywords = [

        word

        for word in words

        if len(word) >= 3

        and word not in stop_words
    ]


    return keywords


def topic_matches_quiz(
    questions,
    user_request
):

    if not questions:
        return False


    keywords = extract_topic_keywords(
        user_request
    )


    if not keywords:
        return True


    combined = " ".join(

        str(
            item.get(
                "question",
                ""
            )
        )

        for item in questions
    ).lower()


    # For a single-word topic such as "stack",
    # the exact topic should appear.
    if len(keywords) == 1:

        return keywords[0] in combined


    # Multiple keywords:
    # Require at least one meaningful keyword.
    matches = sum(

        1

        for keyword in keywords

        if keyword.lower() in combined
    )


    return matches >= 1


def clean_ai_output(raw):

    text = str(
        raw or ""
    ).strip()


    if not text:

        return ""


    text = text.replace(
        "```json",
        ""
    )


    text = text.replace(
        "```JSON",
        ""
    )


    text = text.replace(
        "```",
        ""
    )


    return text.strip()


def extract_json(raw):

    text = clean_ai_output(
        raw
    )


    if not text:

        return None


    # Direct JSON
    try:

        return json.loads(
            text
        )

    except Exception:

        pass


    # Embedded JSON object
    start = text.find("{")
    end = text.rfind("}")


    if (
        start != -1
        and end != -1
        and end > start
    ):

        candidate = text[
            start:end + 1
        ]


        try:

            return json.loads(
                candidate
            )

        except Exception:

            pass


    # Embedded JSON array
    start = text.find("[")
    end = text.rfind("]")


    if (
        start != -1
        and end != -1
        and end > start
    ):

        candidate = text[
            start:end + 1
        ]


        try:

            return json.loads(
                candidate
            )

        except Exception:

            pass


    return None


def answer_to_index(
    answer,
    options
):

    if answer is None:

        return None


    # Numeric answer
    try:

        number = int(
            answer
        )


        if 0 <= number <= 3:

            return number


        # Also accept 1-4
        if 1 <= number <= 4:

            return number - 1


    except (
        TypeError,
        ValueError
    ):

        pass


    # Letter answer
    answer_text = str(
        answer
    ).strip().upper()


    mapping = {

        "A": 0,
        "B": 1,
        "C": 2,
        "D": 3
    }


    if answer_text in mapping:

        return mapping[
            answer_text
        ]


    # Exact option text
    answer_text = str(
        answer
    ).strip().lower()


    for index, option in enumerate(
        options
    ):

        if (
            answer_text
            ==
            str(
                option
            ).strip().lower()
        ):

            return index


    return None


def normalize_questions(
    parsed,
    count
):

    if isinstance(
        parsed,
        dict
    ):

        questions = (

            parsed.get("questions")

            or parsed.get("mcqs")

            or parsed.get("quiz")

            or parsed.get("data")

            or []
        )


    elif isinstance(
        parsed,
        list
    ):

        questions = parsed


    else:

        return []


    if not isinstance(
        questions,
        list
    ):

        return []


    valid = []


    for item in questions:

        if not isinstance(
            item,
            dict
        ):

            continue


        question = (

            item.get("question")

            or item.get("question_text")

            or item.get("text")

            or ""
        )


        question = str(
            question
        ).strip()


        if not question:

            continue


        options = (

            item.get("options")

            or item.get("choices")

            or item.get("answers")

            or []
        )


        if not isinstance(
            options,
            list
        ):

            continue


        options = [

            str(option).strip()

            for option in options

            if str(option).strip()
        ]


        if len(options) < 4:

            continue


        options = options[:4]


        answer = (

            item.get("answer")

            if "answer" in item

            else item.get(
                "correct_answer"
            )
        )


        if answer is None:

            answer = item.get(
                "correct"
            )


        answer_index = answer_to_index(

            answer,

            options
        )


        if answer_index is None:

            continue


        explanation = (

            item.get(
                "explanation"
            )

            or item.get(
                "reason"
            )

            or ""
        )


        explanation = str(
            explanation
        ).strip()


        valid.append({

            "question":
                question,

            "options":
                options,

            "answer":
                answer_index,

            "explanation":
                explanation
        })


    return valid[:count]


def parse_text_quiz(
    raw,
    count
):

    if not raw:

        return []


    text = str(
        raw
    ).replace(
        "\r",
        ""
    ).strip()


    pattern = re.compile(

        r"""
        (?:Q(?:uestion)?\s*\d*
        \s*[\.\:\-\)]\s*)?

        (?P<question>.+?)

        \n\s*A[\)\.\:\-]\s*
        (?P<a>.+?)

        \n\s*B[\)\.\:\-]\s*
        (?P<b>.+?)

        \n\s*C[\)\.\:\-]\s*
        (?P<c>.+?)

        \n\s*D[\)\.\:\-]\s*
        (?P<d>.+?)

        \n\s*

        (?:Answer|Correct\s*Answer|Correct)
        [\.\:\-]\s*

        (?P<answer>[ABCDabcd1-4])

        (?:
            \n\s*
            (?:Explanation|Reason)
            [\.\:\-]\s*
            (?P<explanation>.*?)
        )?

        (?=
            \n\s*(?:Q(?:uestion)?\s*\d+)
            |
            \Z
        )
        """,

        re.IGNORECASE
        | re.VERBOSE
        | re.DOTALL
    )


    results = []


    for match in pattern.finditer(
        text
    ):

        question = match.group(
            "question"
        ).strip()


        options = [

            match.group("a").strip(),

            match.group("b").strip(),

            match.group("c").strip(),

            match.group("d").strip()
        ]


        answer_index = answer_to_index(

            match.group("answer"),

            options
        )


        if not question:

            continue


        if answer_index is None:

            continue


        results.append({

            "question":
                question,

            "options":
                options,

            "answer":
                answer_index,

            "explanation":

                (
                    match.group(
                        "explanation"
                    )
                    or ""
                ).strip()
        })


    return results[:count]


# =========================================================
# AI QUIZ GENERATOR
# =========================================================

@app.post("/api/ai/quiz")
@token_user
def quiz():
    data = request.get_json(silent=True) or {}

    # Accept topic/prompt/message fields from different frontend versions.
    user_request = str(
        data.get("topic")
        or data.get("prompt")
        or data.get("message")
        or ""
    ).strip()

    if not user_request:
        return {"error": "Please enter a quiz topic or request."}, 400

    try:
        count = int(data.get("count", 5))
    except (TypeError, ValueError):
        count = 5
    count = max(3, min(10, count))

    enabled = os.getenv("OLLAMA_ENABLED", "false").strip().lower() in {
        "true", "1", "yes", "on"
    }
    if not enabled:
        return {
            "error": "AI service is disabled. Set OLLAMA_ENABLED=true in your .env file and restart the server."
        }, 503

    model = os.getenv("OLLAMA_MODEL", "llama3.2:3b").strip()
    url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate").strip()

    prompt = f"""You are StudyAI, an academic quiz generator.

Student's complete request/topic:
---
{user_request}
---

Interpret the entire input as a request to create a quiz. Extract the likely
academic topic even when the request is informal or written in Hinglish. For
example, 'stack ke uppar quiz' means a quiz about the Stack data structure.
If the input is vague, use its most likely educational meaning. Always return
a quiz, not a general answer or an explanation.

Create exactly {count} multiple-choice questions about that topic. Every
question must have exactly four options. Return valid JSON only:
{{
  "questions": [
    {{
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0
    }}
  ]
}}

The answer is the zero-based index of the correct option (0, 1, 2, or 3).
Do not include markdown, explanations, or text outside the JSON.
"""

    last_error = "AI generated an incomplete quiz. Please try again."
    for attempt in range(2):
        try:
            response = requests.post(
                url,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": 0.2,
                        "num_ctx": 4096,
                        "num_predict": 1400
                    }
                },
                timeout=180
            )
            response.raise_for_status()
            result = response.json()
            raw = str(result.get("response") or "").strip()
            questions = normalize_questions(extract_json(raw), count)

            if len(questions) >= count:
                return {"topic": user_request, "questions": questions[:count]}
            if len(questions) >= 3:
                return {"topic": user_request, "questions": questions}

            last_error = "AI returned an invalid or incomplete quiz."
            prompt = f"""Fix the quiz response. Student's topic/request: {user_request}
Return exactly {count} valid MCQs as JSON only, with a 'questions' array.
Each item must have a question string, exactly four option strings, and an
integer answer from 0 to 3. Do not include markdown or extra text."""

        except requests.exceptions.ConnectionError:
            return {
                "error": "Cannot connect to Ollama. Start Ollama and run `ollama serve`."
            }, 503
        except requests.exceptions.Timeout:
            return {
                "error": f"AI response timed out (model: {model}). Try again or use a smaller Ollama model."
            }, 503
        except requests.exceptions.RequestException as error:
            return {"error": f"AI request failed: {error}"}, 503
        except (ValueError, TypeError) as error:
            last_error = f"AI returned an invalid response: {error}"

    return {"error": last_error}, 503

# QUIZ RESULT
# =========================================================

@app.post("/api/ai/quiz/result")
@token_user
def quiz_result():

    data = request.get_json() or {}


    topic = data.get(
        "topic",
        "General"
    )


    try:

        score = float(
            data.get(
                "score",
                0
            )
        )

    except (
        TypeError,
        ValueError
    ):

        score = 0


    result = QuizResult(

        user_id=uid(),

        topic=topic,

        score=score
    )


    db.session.add(
        result
    )

    db.session.commit()


    return {

        "message":
            "Saved"

    }, 201


# =========================================================
# ANALYTICS
# =========================================================

@app.get("/api/analytics")
@token_user
def analytics():

    results = QuizResult.query.filter_by(
        user_id=uid()
    ).order_by(
        QuizResult.date.desc()
    ).all()


    assignments = Assignment.query.filter_by(
        user_id=uid()
    ).all()


    completed = sum(

        item.status == "Completed"

        for item in assignments
    )


    average_score = (

        round(

            sum(
                item.score
                for item in results
            )

            / len(results),

            1
        )

        if results

        else 0
    )


    assignment_completion = (

        round(

            completed
            / len(assignments)
            * 100,

            1
        )

        if assignments

        else 0
    )


    return {

        "quiz_attempts":
            len(results),

        "average_quiz_score":
            average_score,

        "assignment_completion":
            assignment_completion,

        "recent_quizzes":

            [

                {

                    "topic":
                        item.topic,

                    "score":
                        item.score,

                    "date":
                        item.date.isoformat()

                }

                for item in results[:10]
            ]
    }


# =========================================================
# FRONTEND
# =========================================================

@app.get("/")
def index():

    return send_from_directory(
        app.static_folder,
        "index.html"
    )


@app.get(
    "/<path:path>",
    endpoint="frontend_files"
)
def frontend_files(path):

    full_path = os.path.join(
        app.static_folder,
        path
    )


    if os.path.isfile(
        full_path
    ):

        return send_from_directory(
            app.static_folder,
            path
        )


    return send_from_directory(
        app.static_folder,
        "index.html"
    )


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )