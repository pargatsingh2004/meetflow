
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv


# ==========================================
# BASE DIRECTORY & ENVIRONMENT
# ==========================================

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
ADMIN_DIR = PROJECT_DIR / "admin"

# Make the isolated custom admin backend importable from Django.
import sys
sys.path.insert(0, str(ADMIN_DIR / "backend"))

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "dev-insecure-key-change-me"
)

DEBUG = os.getenv(
    "DJANGO_DEBUG",
    "True"
).lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "DJANGO_ALLOWED_HOSTS",
        "localhost,127.0.0.1"
    ).split(",")
    if host.strip()
]


# ==========================================
# INSTALLED APPLICATIONS
# ==========================================

INSTALLED_APPS = [

    # Daphne must be first for ASGI runserver
    "daphne",

    # Django applications
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # REST API
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",

    # CORS and WebSockets
    "corsheaders",
    "channels",

    # Existing MeetFlow applications
    "apps.accounts",
    "apps.meetings",
    "apps.tokens",
]


# ==========================================
# MIDDLEWARE
# ==========================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ==========================================
# URL CONFIGURATION
# ==========================================

ROOT_URLCONF = "meet_project.urls"


# ==========================================
# HTML TEMPLATE CONFIGURATION
# ==========================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",

        # HTML frontend templates
        "DIRS": [
            FRONTEND_DIR / "templates",
            ADMIN_DIR / "frontend" / "templates",
        ],

        "APP_DIRS": True,

        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ==========================================
# WSGI / ASGI
# ==========================================

WSGI_APPLICATION = "meet_project.wsgi.application"

ASGI_APPLICATION = "meet_project.asgi.application"


# ==========================================
# DATABASE - SQLITE
# ==========================================

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# ==========================================
# DJANGO CHANNELS / REDIS
# ==========================================

REDIS_URL = os.getenv("REDIS_URL", "").strip()

if REDIS_URL:

    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
            },
        },
    }

else:

    # Local development without Redis
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }


# ==========================================
# CUSTOM USER MODEL
# ==========================================

AUTH_USER_MODEL = "accounts.User"


# ==========================================
# PASSWORD VALIDATION
# ==========================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
        "OPTIONS": {
            "min_length": 8,
        },
    },
]


# ==========================================
# LANGUAGE AND TIMEZONE
# ==========================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# ==========================================
# STATIC FILES - CSS, JS, IMAGES
# ==========================================

STATIC_URL = "/static/"

# Frontend assets
STATICFILES_DIRS = [
    FRONTEND_DIR / "static",
    ADMIN_DIR / "frontend" / "static",
]

# Collected production static files
STATIC_ROOT = BASE_DIR / "staticfiles"


# ==========================================
# DEFAULT PRIMARY KEY
# ==========================================

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ==========================================
# DJANGO REST FRAMEWORK
# ==========================================

REST_FRAMEWORK = {

    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],

    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}


# ==========================================
# JWT AUTHENTICATION
# ==========================================

SIMPLE_JWT = {

    "ACCESS_TOKEN_LIFETIME": timedelta(hours=20),

    "REFRESH_TOKEN_LIFETIME": timedelta(hours=24),

    "ROTATE_REFRESH_TOKENS": True,

    "BLACKLIST_AFTER_ROTATION": False,

    "AUTH_HEADER_TYPES": ("Bearer",),
}


# ==========================================
# CORS CONFIGURATION
# ==========================================

# Same-origin Django templates normally do not need CORS.
# Keep configurable origins for optional external clients.

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:8000,http://localhost:8000"
    ).split(",")
    if origin.strip()
]

CORS_ALLOW_CREDENTIALS = True


# ==========================================
# FRONTEND URL
# ==========================================

# Django serves HTML pages directly.
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://127.0.0.1:8000"
)


# ==========================================
# EMAIL CONFIGURATION
# ==========================================



EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.smtp.EmailBackend"
)

EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))

EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "False").lower() == "true"

EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")

DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL",
    EMAIL_HOST_USER
)
# ==========================================
# LIVEKIT VIDEO CONFERENCING
# ==========================================

LIVEKIT_URL = os.getenv(
    "LIVEKIT_URL",
    "ws://localhost:7880"
)

LIVEKIT_API_KEY = os.getenv(
    "LIVEKIT_API_KEY",
    "devkey"
)

LIVEKIT_API_SECRET = os.getenv(
    "LIVEKIT_API_SECRET",
    "devsecret-devsecret-devsecret-0123456789"
)

# Optional: separate HTTP(S) LiveKit server API address for admin monitoring.
LIVEKIT_API_URL = os.getenv("LIVEKIT_API_URL", "")


LIVEKIT_RECORDING_ENABLED = (
    os.getenv("LIVEKIT_RECORDING_ENABLED", "false").lower() == "true"
)

RECORDING_S3_BUCKET = os.getenv("RECORDING_S3_BUCKET", "")
RECORDING_S3_REGION = os.getenv("RECORDING_S3_REGION", "")
RECORDING_S3_ENDPOINT = os.getenv("RECORDING_S3_ENDPOINT", "")
RECORDING_S3_ACCESS_KEY = os.getenv("RECORDING_S3_ACCESS_KEY", "")
RECORDING_S3_SECRET_KEY = os.getenv("RECORDING_S3_SECRET_KEY", "")
