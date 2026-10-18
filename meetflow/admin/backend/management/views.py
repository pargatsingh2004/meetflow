from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.db.models import Count, Q, F, Value, DateField
from django.db.models.functions import TruncDate
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib import messages
from django.contrib.auth.decorators import user_passes_test
from django.views.decorators.http import require_POST
from django.http import HttpResponse
from django.utils import timezone
from datetime import timedelta
import csv
from apps.meetings.models import Meeting, Participant, Message, AdmissionRequest, MeetingSummary

@staff_member_required(login_url="/admin/login/")
def overview(request):
    User = get_user_model()
    users = User.objects.all()
    meetings = Meeting.objects.select_related("host").annotate(participant_total=Count("participants", distinct=True))
    query = request.GET.get("q", "").strip()[:100]
    if query:
        meetings = meetings.filter(Q(title__icontains=query) | Q(code__icontains=query) | Q(host__email__icontains=query))
    status = request.GET.get("status", "")
    if status == "ended": meetings = meetings.filter(ended_at__isnull=False)
    elif status == "locked": meetings = meetings.filter(is_locked=True, ended_at__isnull=True)
    elif status == "open": meetings = meetings.filter(is_locked=False, ended_at__isnull=True)
    page = Paginator(meetings.order_by("-created_at"), 15).get_page(request.GET.get("page"))
    today = timezone.localdate()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    meeting_daily = dict(Meeting.objects.filter(created_at__date__gte=days[0]).annotate(day=TruncDate("created_at")).values("day").annotate(total=Count("id")).values_list("day", "total"))
    user_daily = dict(User.objects.filter(date_joined__date__gte=days[0]).annotate(day=TruncDate("date_joined")).values("day").annotate(total=Count("id")).values_list("day", "total"))
    return render(request, "management/overview.html", {
        "chart_data": {"labels": [d.isoformat() for d in days], "meetings": [meeting_daily.get(d, 0) for d in days], "users": [user_daily.get(d, 0) for d in days]},
        "user_count": users.count(), "host_count": Meeting.objects.values("host_id").distinct().count(),
        "meeting_count": Meeting.objects.count(), "participant_count": Participant.objects.count(),
        "message_count": Message.objects.count(), "pending_count": AdmissionRequest.objects.filter(status="pending").count(),
        "summary_count": MeetingSummary.objects.count(), "active_count": Meeting.objects.filter(ended_at__isnull=True).count(),
        "recent_users": users.order_by("-date_joined")[:8], "page": page, "q": query, "status": status,
    })

@staff_member_required(login_url="/admin/login/")
def users_page(request):
    User = get_user_model()
    q = request.GET.get("q", "").strip()[:100]
    users = User.objects.annotate(hosted_total=Count("hosted_meetings", distinct=True), joined_total=Count("participations", distinct=True)).order_by("-date_joined")
    if q: users = users.filter(Q(email__icontains=q) | Q(full_name__icontains=q))
    return render(request, "management/users.html", {"page": Paginator(users, 20).get_page(request.GET.get("page")), "q":q})


@staff_member_required(login_url="/admin/login/")
def user_detail(request, pk):
    User = get_user_model()
    user = get_object_or_404(User, pk=pk)
    hosted = Meeting.objects.filter(host=user).annotate(attendee_count=Count("participants", distinct=True)).order_by("-created_at")[:30]
    attended = Participant.objects.filter(user=user).select_related("meeting", "meeting__host").order_by("-joined_at")[:30]
    return render(request, "management/user_detail.html", {"profile": user, "hosted": hosted, "attended": attended, "hosted_total": Meeting.objects.filter(host=user).count(), "attended_total": Participant.objects.filter(user=user).count()})


@staff_member_required(login_url="/admin/login/")
@require_POST
def toggle_suspension(request, pk):
    User = get_user_model()
    target = get_object_or_404(User, pk=pk)
    if target.pk == request.user.pk or target.is_superuser or target.is_staff:
        messages.error(request, "Staff, superusers, and your own account cannot be suspended here.")
    else:
        target.is_active = not target.is_active
        target.save(update_fields=["is_active"])
        messages.success(request, f"{target.email} {'reactivated' if target.is_active else 'suspended'}.")
    return redirect("management_user_detail", pk=pk)


@staff_member_required(login_url="/admin/login/")
def attendance(request):
    q = request.GET.get("q", "").strip()[:100]
    records = Participant.objects.select_related("meeting", "meeting__host", "user").order_by("-joined_at")
    if q:
        records = records.filter(Q(meeting__code__icontains=q) | Q(meeting__title__icontains=q) | Q(user__email__icontains=q) | Q(meeting__host__email__icontains=q))
    if request.GET.get("format") == "csv":
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="meetflow_attendance.csv"'
        writer = csv.writer(response)
        writer.writerow(["Meeting code", "Meeting title", "Host email", "Participant email", "First joined (UTC)", "Meeting ended (UTC)"])
        for item in records.iterator(chunk_size=1000):
            writer.writerow([item.meeting.code, item.meeting.title, item.meeting.host.email, item.user.email, item.joined_at.isoformat(), item.meeting.ended_at.isoformat() if item.meeting.ended_at else ""])
        return response
    return render(request, "management/attendance.html", {"page": Paginator(records, 25).get_page(request.GET.get("page")), "q": q, "total": records.count()})

# Phase 10: LiveKit's actual connected-room state (not historical join records).
from django.http import JsonResponse
from .livekit_service import list_rooms, list_participants, remove_participant, delete_room, LiveKitAdminError

@staff_member_required(login_url='/admin/login/')
def live_monitor(request):
    return render(request, 'management/live_monitor.html')

@staff_member_required(login_url='/admin/login/')
def live_monitor_data(request):
    try:
        rooms = list_rooms()
        codes = [r.get('name') for r in rooms if r.get('name')]
        known = {m.code: m for m in Meeting.objects.filter(code__in=codes).select_related('host')}
        result = []
        for room in rooms:
            code = room.get('name', '')
            meeting = known.get(code)
            if not meeting:
                continue  # Do not expose unrelated rooms on a shared LiveKit server.
            participants = list_participants(code)
            ids = [p.get('identity') for p in participants if p.get('identity')]
            User = get_user_model()
            users = {str(u.pk): u for u in User.objects.filter(pk__in=[int(i) for i in ids if i.isdecimal()])}
            result.append({'code': code, 'title': meeting.title, 'host': meeting.host.email,
                'locked': meeting.is_locked, 'participant_count': len(participants),
                'participants': [{'identity': p.get('identity'), 'name': p.get('name') or (users.get(str(p.get('identity'))).email if users.get(str(p.get('identity'))) else 'Guest'),
                    'email': users[str(p.get('identity'))].email if str(p.get('identity')) in users else '',
                    'is_host': str(p.get('identity')) == str(meeting.host_id)} for p in participants]})
        return JsonResponse({'rooms': result, 'total_rooms': len(result), 'total_participants': sum(r['participant_count'] for r in result)})
    except LiveKitAdminError:
        return JsonResponse({'error': 'LiveKit server is unavailable or not configured correctly.'}, status=503)

@staff_member_required(login_url='/admin/login/')
@require_POST
def live_remove(request, code):
    meeting = get_object_or_404(Meeting, code=code, ended_at__isnull=True)
    identity = request.POST.get('identity', '')
    if not identity.isdecimal():
        return JsonResponse({'error': 'Invalid participant identity.'}, status=400)
    if not get_user_model().objects.filter(pk=int(identity)).exists():
        return JsonResponse({'error': 'Participant is not a MeetFlow account.'}, status=400)
    if identity == str(meeting.host_id):
        return JsonResponse({'error': 'Cannot remove the host. End the meeting instead.'}, status=400)
    try:
        remove_participant(meeting.code, identity)
    except LiveKitAdminError:
        return JsonResponse({'error': 'LiveKit removal failed.'}, status=503)
    # Persist removal so token endpoint denies reconnects.
    from apps.meetings.models import AdmissionRequest
    AdmissionRequest.objects.update_or_create(meeting=meeting, user_id=int(identity), defaults={'status': 'removed'})
    return JsonResponse({'ok': True})

@staff_member_required(login_url='/admin/login/')
@require_POST
def live_end(request, code):
    meeting = get_object_or_404(Meeting, code=code)
    try:
        delete_room(meeting.code)
    except LiveKitAdminError:
        return JsonResponse({'error': 'LiveKit room shutdown failed. Database status was not changed.'}, status=503)
    if not meeting.ended_at:
        meeting.ended_at = timezone.now()
        meeting.save(update_fields=['ended_at'])
    return JsonResponse({'ok': True})
