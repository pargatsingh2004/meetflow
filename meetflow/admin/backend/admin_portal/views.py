
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.shortcuts import render, redirect
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_POST
from django.contrib.admin.views.decorators import staff_member_required
# Import existing management dashboard functions
from management import views as management_views


# ============================================
# ADMIN LOGIN
# ============================================

@never_cache
@require_http_methods(["GET", "POST"])
def admin_login(request):

    # Always show the admin login page when
    # the user opens /admin/login/
    if request.method == "GET":
        return render(
            request,
            "admin_portal/login.html"
        )

    email = request.POST.get("email", "").strip().lower()
    password = request.POST.get("password", "")

    if not email or not password:
        messages.error(
            request,
            "Please enter your email and password."
        )
        return redirect("portal_login")

    # Authenticate using email-based username
    user = authenticate(
        request,
        username=email,
        password=password
    )

    # Allow active staff administrators only
    if (
        user is not None
        and user.is_active
        and user.is_staff
    ):
        login(request, user)

        messages.success(
            request,
            "Welcome to MeetFlow Admin Dashboard!"
        )

        return redirect("management_overview")

    messages.error(
        request,
        "Invalid administrator credentials or access denied."
    )

    return redirect("portal_login")


# ============================================
# ADMIN LOGOUT
# ============================================

@require_POST
def admin_logout(request):

    logout(request)

    messages.success(
        request,
        "You have successfully logged out."
    )

    return redirect("portal_login")


# ============================================
# ADMIN DASHBOARD
# ============================================

overview = management_views.overview


# ============================================
# USER MANAGEMENT
# ============================================

users_page = management_views.users_page

user_detail = management_views.user_detail

toggle_suspension = management_views.toggle_suspension


# ============================================
# ATTENDANCE
# ============================================

attendance = management_views.attendance


# ============================================
# LIVE MEETING MONITORING
# ============================================

live_monitor = management_views.live_monitor

live_monitor_data = management_views.live_monitor_data

live_remove = management_views.live_remove

live_end = management_views.live_end
# Protected admin dashboard
overview = staff_member_required(
    management_views.overview,
    login_url="portal_login"
)

# Protected user management
users_page = staff_member_required(
    management_views.users_page,
    login_url="portal_login"
)

user_detail = staff_member_required(
    management_views.user_detail,
    login_url="portal_login"
)

toggle_suspension = staff_member_required(
    management_views.toggle_suspension,
    login_url="portal_login"
)

# Protected attendance
attendance = staff_member_required(
    management_views.attendance,
    login_url="portal_login"
)

# Protected live meeting monitoring
live_monitor = staff_member_required(
    management_views.live_monitor,
    login_url="portal_login"
)

live_monitor_data = staff_member_required(
    management_views.live_monitor_data,
    login_url="portal_login"
)

live_remove = staff_member_required(
    management_views.live_remove,
    login_url="portal_login"
)

live_end = staff_member_required(
    management_views.live_end,
    login_url="portal_login"
)