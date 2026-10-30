
# 🎥 MeetFlow — Real-Time Video Conferencing Platform

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-5.0.6-092E20?logo=django)](https://www.djangoproject.com/)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-purple)](https://livekit.io/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

**MeetFlow** is a modern, full-stack, browser-based video conferencing platform built using **Python, Django, Django REST Framework, JavaScript, WebRTC, and LiveKit**.

Inspired by Google Meet, Zoom, and Microsoft Teams, MeetFlow provides secure user authentication, real-time video meetings, screen sharing, chat, participant management, host moderation, meeting recording integration, and a dedicated administrative dashboard.

**GitHub Repository:** https://github.com/pargatsingh2004/meetflow

---

## 🌟 Project Overview

MeetFlow is designed to make online communication simple, interactive, and accessible.

The platform allows users to create meetings, join using unique meeting codes, communicate through audio/video, share screens, and collaborate in real time.

It also includes a custom administrative portal for managing users, monitoring meetings, and reviewing platform activity.

### 🎯 Objectives

- Build a professional full-stack video conferencing application.
- Implement secure authentication using JWT.
- Integrate LiveKit for real-time video and audio.
- Develop a responsive, user-friendly meeting interface.
- Implement host and participant management.
- Support meeting recording and collaboration features.
- Create a separate custom administrative dashboard.
- Learn real-world WebRTC, Django, and REST API architecture.

---

## ✨ Key Features

### 🔐 Authentication and User Management

- User registration and login.
- Email OTP verification.
- JWT access and refresh tokens.
- Secure password hashing.
- Forgot-password functionality.
- Password reset using email verification.
- User profile management.
- Logout and authentication APIs.

### 📹 Real-Time Video Conferencing

- Create meetings with unique meeting codes.
- Join existing meetings.
- Real-time audio and video communication.
- Camera on/off controls.
- Microphone mute/unmute controls.
- Participant video tiles.
- Screen sharing.
- Meeting participant count.
- Leave meeting functionality.
- LiveKit room token generation.

### 💬 Real-Time Collaboration

- Meeting chat.
- Chat export functionality.
- Participant list.
- Hand-raising interface.
- Meeting reactions.
- Dynamic participant updates.
- Meeting summary endpoints.

### 👑 Host Controls and Moderation

- Host identification.
- Waiting room admission controls.
- Remove meeting participants.
- Meeting moderation endpoints.
- Meeting access controls.
- Camera and microphone permission requests.
- Participant consent interactions.
- Meeting management controls.

### 🎬 Meeting Recording Integration

The backend includes recording-related APIs for:

- Requesting recording.
- Recording consent.
- Starting recordings.
- Stopping recordings.
- Checking recording status.
- Viewing recording history.
- Downloading recordings.

**Note:** Recording requires properly configured LiveKit recording/egress infrastructure and storage.

### 📅 Meeting Management

- Meeting creation.
- Meeting details.
- Meeting joining.
- Calendar-related endpoints.
- Google Calendar link endpoint.
- Meeting summaries.
- Meeting lifecycle management.

### 🛡️ Custom Admin Panel

MeetFlow includes a separate custom administrative interface built using HTML, CSS, JavaScript, and Django backend modules.

Administrative modules include:

- Admin login.
- Dashboard overview.
- User management.
- User details.
- Meeting attendance.
- Live monitoring.
- Administrative management functions.

### 🎨 Frontend Interface

- Responsive HTML5 and CSS3 design.
- Interactive JavaScript.
- Modern meeting interface.
- Dark/light theme support.
- Dashboard interface.
- Participant controls.
- Custom admin frontend.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Python | Backend programming |
| Django 5.0.6 | Web application framework |
| Django REST Framework 3.15.1 | REST API development |
| Simple JWT | Authentication |
| Django Channels | Asynchronous communication |
| Daphne | ASGI server |
| LiveKit | Real-time video/audio infrastructure |
| WebRTC | Browser media communication |
| HTML5 | Frontend structure |
| CSS3 | Frontend styling |
| JavaScript | Interactive functionality |
| SQLite | Development database |
| SMTP | Email OTP and password recovery |
| Git & GitHub | Version control |

---

## 🏗️ System Architecture

```text
                     MEETFLOW
                        |
          +-------------+-------------+
          |                           |
       FRONTEND                     BACKEND
          |                           |
     HTML / CSS / JS               Django
     Django Templates              REST APIs
          |                        JWT Auth
          |                           |
          +-------------+-------------+
                        |
                  Application APIs
                        |
          +-------------+-------------+
          |                           |
       DATABASE                    LIVEKIT
          |                           |
        SQLite                      WebRTC
          |                           |
     Users / Meetings           Audio / Video
     Meeting Records            Screen Sharing
     Authentication             Participants
                        |
                  ADMIN PORTAL
                        |
               User Management
               Meeting Monitoring
               Attendance
               Analytics
```

---

## 📁 Project Folder Structure

The uploaded project follows this structure:

```text
meetflow/
│
├── meetflow/
│   │
│   ├── START_MEETFLOW.bat
│   ├── livekit.yaml
│   │
│   ├── livekit/
│   │   └── livekit-server.exe
│   │
│   ├── backend/
│   │   ├── manage.py
│   │   ├── requirements.txt
│   │   ├── .env
│   │   │
│   │   ├── apps/
│   │   │   ├── accounts/
│   │   │   ├── meetings/
│   │   │   └── tokens/
│   │   │
│   │   └── meet_project/
│   │       ├── settings.py
│   │       ├── urls.py
│   │       ├── asgi.py
│   │       └── wsgi.py
│   │
│   ├── frontend/
│   │   ├── templates/
│   │   └── static/
│   │       ├── css/
│   │       └── js/
│   │
│   └── admin/
│       ├── backend/
│       │   ├── admin_portal/
│       │   └── management/
│       │
│       └── frontend/
│           ├── templates/
│           └── static/
│
└── README.md
```

The frontend uses Django templates, so a separate React or Node.js server is not required.

---

## ⚙️ Installation and Setup

### Prerequisites

Install the following:

- Windows 10/11
- Python 3.12 (recommended)
- Git
- Visual Studio Code
- A modern web browser
- LiveKit server or LiveKit Cloud credentials
- Gmail SMTP credentials for email verification

### Step 1: Clone the Repository

```powershell
git clone https://github.com/pargatsingh2004/meetflow.git
cd meetflow\meetflow
```

### Step 2: Navigate to Backend

```powershell
cd backend
```

### Step 3: Create Virtual Environment

```powershell
py -3.12 -m venv .venv
```

Activate the environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

### Step 4: Install Dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Step 5: Configure Environment Variables

Create a `.env` file inside the `backend/` directory.

```env
# Django
DJANGO_SECRET_KEY=your_secure_django_secret_key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# CORS and Frontend
CORS_ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
FRONTEND_URL=http://127.0.0.1:8000

# LiveKit
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_URL=http://localhost:7880
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Email Configuration
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_google_app_password
DEFAULT_FROM_EMAIL=your_email@gmail.com

# Optional Redis
REDIS_URL=

# Recording
LIVEKIT_RECORDING_ENABLED=False
RECORDING_S3_BUCKET=
RECORDING_S3_REGION=
RECORDING_S3_ENDPOINT=
RECORDING_S3_ACCESS_KEY=
RECORDING_S3_SECRET_KEY=
```

**Important:** Never upload your real `.env` file, Gmail password, Django secret key, or LiveKit credentials to GitHub.

### Step 6: Apply Database Migrations

```powershell
python manage.py migrate
```

### Step 7: Create Superuser

```powershell
python manage.py createsuperuser
```

### Step 8: Start Django Server

```powershell
python manage.py runserver 127.0.0.1:8000
```

Open:

http://127.0.0.1:8000/

---

## 📡 LiveKit Server Setup

The project includes a local Windows LiveKit server executable and configuration file.

Open another PowerShell terminal.

Navigate to the application root:

```powershell
cd meetflow\meetflow
```

Start LiveKit:

```powershell
.\livekit\livekit-server.exe --config .\livekit.yaml
```

Ensure the API key and secret in `backend/.env` match the LiveKit server configuration.

You can also use [LiveKit Cloud](https://cloud.livekit.io/) instead of running a local server.

A working LiveKit server is required for real-time audio/video calls.

---

## 🌐 Application Pages

| Route | Description |
|---|---|
| `/` | Home page |
| `/signup/` | User registration |
| `/login/` | User login |
| `/verify-email/` | Email OTP verification |
| `/forgot-password/` | Password recovery |
| `/reset-password/` | Password reset |
| `/dashboard/` | User dashboard |
| `/meeting/<room_code>/` | Meeting room |
| `/admin/` | Custom admin portal |

---

## 🔌 REST API Endpoints

### Authentication APIs

Base URL: `/api/auth/`

| Endpoint | Description |
|---|---|
| `register/` | Register user |
| `verify-signup/` | Verify OTP |
| `login/` | User login |
| `refresh/` | Refresh JWT token |
| `logout/` | User logout |
| `me/` | User profile |
| `forgot-password/` | Forgot password |
| `reset-password/` | Reset password |

### Meeting APIs

Base URL: `/api/meetings/`

| Endpoint | Description |
|---|---|
| `/` | List/create meetings |
| `<code>/` | Meeting details |
| `<code>/join/` | Join meeting |
| `<code>/admission/` | Admission status |
| `<code>/admissions/` | Waiting room management |
| `<code>/control/` | Meeting controls |
| `<code>/remove-participant/` | Remove participant |
| `<code>/moderation/` | Meeting moderation |
| `<code>/messages/` | Meeting chat |
| `<code>/chat-export/` | Export meeting chat |
| `<code>/summary/` | Meeting summary |
| `<code>/calendar/` | Calendar information |
| `<code>/google-calendar/` | Google Calendar link |
| `<code>/recording/request/` | Request recording |
| `<code>/recording/consent/` | Recording consent |
| `<code>/recording/start/` | Start recording |
| `<code>/recording/stop/` | Stop recording |
| `<code>/recording/status/` | Recording status |
| `<code>/recording/history/` | Recording history |
| `<code>/recording/<recording_id>/download/` | Download recording |

### LiveKit Token API

```text
/api/token/
```

This endpoint is responsible for generating LiveKit access tokens.

---

## 🧪 Testing

Run Django tests:

```powershell
python manage.py test
```

Recommended manual tests:

1. Register a new user.
2. Verify the email OTP.
3. Log in.
4. Create a meeting.
5. Join the meeting from another browser.
6. Test camera and microphone.
7. Test screen sharing.
8. Send meeting chat messages.
9. Test waiting room admission.
10. Test host moderation.
11. Test custom admin access.
12. Test recording after configuring its infrastructure.

---

## 🔒 Security

MeetFlow uses or supports:

- JWT-based authentication.
- Django password hashing.
- Email OTP verification.
- Access and refresh token handling.
- Backend-generated LiveKit tokens.
- Authenticated meeting endpoints.
- Host authorization checks.
- Environment-based credentials.

### Production Recommendations

- Disable Django debug mode.
- Configure HTTPS and secure WebSockets.
- Restrict allowed hosts and CORS origins.
- Protect API endpoints with appropriate permissions.
- Use secure secret management.
- Add authentication rate limiting.
- Configure a production database.
- Review recording consent and storage security.
- Rotate any exposed credentials.

Never commit `.env`, `.venv/`, `db.sqlite3`, or private keys to your repository.

---

## 🚀 Future Enhancements

- [ ] AI-generated meeting summaries.
- [ ] Automatic meeting minutes.
- [ ] Live speech-to-text transcription.
- [ ] Real-time captions.
- [ ] AI-powered action item extraction.
- [ ] Google Calendar OAuth integration.
- [ ] Automated meeting invitations.
- [ ] Virtual backgrounds.
- [ ] Background noise cancellation.
- [ ] Collaborative whiteboard.
- [ ] Live polls and Q&A.
- [ ] Advanced meeting analytics.
- [ ] Automated attendance reports.
- [ ] Improved cloud recording support.
- [ ] Production cloud deployment.
- [ ] Automated API testing.
- [ ] CI/CD integration.
- [ ] Progressive Web App support.

---

## 📚 Learning Outcomes

This project demonstrates practical experience with:

- Full-stack Python development.
- Django web application architecture.
- REST API design.
- JWT authentication.
- Django Channels.
- ASGI application servers.
- LiveKit and WebRTC.
- Real-time video communication.
- Frontend JavaScript development.
- Meeting management systems.
- Database operations.
- User authorization.
- Administrative dashboards.
- Git and GitHub.

---

## 🤝 Contributing

Contributions and suggestions are welcome.

To contribute:

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Test your changes.
5. Commit your work.
6. Open a pull request.

Example:

```bash
git checkout -b feature/new-feature
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

---

## 👨‍💻 Developer

**Pargat Singh**

Computer Science Engineering | Python Developer | Full-Stack Development | AI & Machine Learning Enthusiast

**GitHub:** [pargatsingh2004](https://github.com/pargatsingh2004)

**Project Repository:** [MeetFlow](https://github.com/pargatsingh2004/meetflow)

---

## 📄 License

No application-wide open-source license was verified in the uploaded source.

If you want to allow others to reuse and modify the project, consider adding an appropriate `LICENSE` file.

---

## ⭐ Support

If you find this project useful, consider giving the GitHub repository a star.

**MeetFlow — Connect. Collaborate. Communicate.**

Built with Python, Django, JavaScript, and LiveKit.
