
from django.shortcuts import render


# Homepage
def home(request):
    return render(request, "index.html")


# Login
def login_page(request):
    return render(request, "login.html")


# Signup
def signup_page(request):
    return render(request, "signup.html")


# Forgot Password
def forgot_password(request):
    return render(request, "forgot_password.html")


# Reset Password
def reset_password(request):
    return render(request, "reset_password.html")


# Dashboard
def dashboard(request):
    return render(request, "dashboard.html")


# Video Meeting Room
def meeting_room(request, room_code):
    return render(
        request,
        "meeting.html",
        {
            "room_code": room_code
        }
    )


def verify_email(request):
    return render(request, "verify_email.html")
