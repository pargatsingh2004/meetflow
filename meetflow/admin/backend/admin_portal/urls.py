
from django.urls import path
from . import views


urlpatterns = [

    # ==================================
    # ADMIN AUTHENTICATION
    # ==================================

    path(
        "login/",
        views.admin_login,
        name="portal_login",
    ),

    path(
        "logout/",
        views.admin_logout,
        name="portal_logout",
    ),

    # ==================================
    # ADMIN DASHBOARD
    # ==================================

    path(
        "",
        views.overview,
        name="management_overview",
    ),

    # ==================================
    # USER MANAGEMENT
    # ==================================

    path(
        "users/",
        views.users_page,
        name="management_users",
    ),

    path(
        "users/<int:pk>/",
        views.user_detail,
        name="management_user_detail",
    ),

    path(
        "users/<int:pk>/suspension/",
        views.toggle_suspension,
        name="management_toggle_suspension",
    ),

    # ==================================
    # ATTENDANCE MANAGEMENT
    # ==================================

    path(
        "attendance/",
        views.attendance,
        name="management_attendance",
    ),

    # ==================================
    # LIVE MEETING MONITORING
    # ==================================

    path(
        "live/",
        views.live_monitor,
        name="management_live",
    ),

    path(
        "live/data/",
        views.live_monitor_data,
        name="management_live_data",
    ),

    path(
        "live/<str:code>/remove/",
        views.live_remove,
        name="management_live_remove",
    ),

    path(
        "live/<str:code>/end/",
        views.live_end,
        name="management_live_end",
    ),

]
