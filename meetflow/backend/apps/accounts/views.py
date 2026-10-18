from django.conf import settings
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
from datetime import timedelta
import secrets
import logging
from django.db import transaction
from django.core.cache import cache
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import User, EmailOTP
from .serializers import RegisterSerializer, UserSerializer


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


logger = logging.getLogger(__name__)


def issue_otp(email, purpose, payload=None):
    # Cache-based per-email throttle (configure shared Redis cache for production).
    throttle = f"otp:cooldown:{purpose}:{email}"
    if not cache.add(throttle, "1", timeout=60):
        return False
    code = f"{secrets.randbelow(1000000):06d}"
    otp = EmailOTP.objects.create(email=email, purpose=purpose, code_hash=make_password(code),
                                  payload=payload or {}, expires_at=timezone.now() + timedelta(minutes=10))
    try:
        send_mail("Your MeetFlow verification code", f"Your MeetFlow code is {code}. It expires in 10 minutes. Never share this code.",
                  settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
    except Exception:
        otp.delete()
        cache.delete(throttle)
        logger.exception("OTP delivery failed")
        return None
    return True


def verify_otp(email, purpose, code):
    with transaction.atomic():
        otp = EmailOTP.objects.select_for_update().filter(email=email, purpose=purpose).order_by("-created_at").first()
        if not otp or otp.expires_at <= timezone.now() or otp.attempts >= 5:
            return None
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        if not check_password(code, otp.code_hash):
            return None
        payload = otp.payload
        EmailOTP.objects.filter(email=email, purpose=purpose).delete()
        return payload


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        email = data["email"]
        result = issue_otp(email, "signup", {"full_name": data["full_name"], "password_hash": make_password(data["password"])})
        if result is None:
            return Response({"detail": "Email could not be sent. Check SMTP configuration."}, status=503)
        if result is False:
            return Response({"detail": "Please wait 60 seconds before requesting another code."}, status=429)
        return Response({"detail": "Verification code sent to your email."}, status=202)


class VerifySignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        code = str(request.data.get("otp", "")).strip()
        if not (len(code) == 6 and code.isdigit()):
            return Response({"detail": "Enter a valid six-digit code."}, status=400)
        payload = verify_otp(email, "signup", code)
        if not payload:
            return Response({"detail": "Invalid or expired code."}, status=400)
        if User.objects.filter(email__iexact=email).exists():
            return Response({"detail": "Account already exists."}, status=400)
        user = User(email=email, full_name=payload["full_name"], password=payload["password_hash"])
        user.save()
        return Response({"detail": "Email verified. Account created. You can log in."}, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        user = authenticate(request, email=email, password=password)
        if user is None or not user.is_active:
            return Response({"detail": "Wrong email or password. Try again."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(issue_tokens(user))


class RefreshView(TokenRefreshView):
    authentication_classes = []
    permission_classes = [AllowAny]


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh", "")).blacklist()
        except TokenError:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            result = issue_otp(email, "reset")
            if result is None:
                return Response({"detail": "Email service unavailable. Please try again later."}, status=503)
        return Response({"detail": "If this email is registered, a six-digit code has been sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        code = str(request.data.get("otp", "")).strip()
        password = request.data.get("password", "")
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({"detail": "Invalid or expired code."}, status=400)
        try:
            validate_password(password, user)
        except DjangoValidationError as e:
            return Response({"detail": " ".join(e.messages)}, status=400)
        if not (len(code) == 6 and code.isdigit()) or verify_otp(email, "reset", code) is None:
            return Response({"detail": "Invalid or expired code."}, status=400)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated. You can log in now."})
