
from django.urls import include, path
from . import page_views


urlpatterns = [
    # ==========================
    # MAIN WEBSITE
    # ==========================

    path(
        "",
        page_views.home,
        name="home",
    ),

    path(
        "login/",
        page_views.login_page,
        name="login",
    ),

    path(
        "signup/",
        page_views.signup_page,
        name="signup",
    ),

    path(
        "forgot-password/",
        page_views.forgot_password,
        name="forgot_password",
    ),

    path(
        "reset-password/",
        page_views.reset_password,
        name="reset_password",
    ),

    path(
        "verify-email/",
        page_views.verify_email,
        name="verify_email",
    ),

    path(
        "dashboard/",
        page_views.dashboard,
        name="dashboard",
    ),

    path(
        "meeting/<str:room_code>/",
        page_views.meeting_room,
        name="meeting_room",
    ),

    # ==========================
    # CUSTOM ADMIN PORTAL
    # ==========================

    path(
        "admin/",
        include("admin_portal.urls"),
    ),

    # ==========================
    # REST API ROUTES
    # ==========================

    path(
        "api/auth/",
        include("apps.accounts.urls"),
    ),

    path(
        "api/meetings/",
        include("apps.meetings.urls"),
    ),

    path(
        "api/token/",
        include("apps.tokens.urls"),
    ),
]
