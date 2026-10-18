from django.urls import path

from . import views ,recording_views, feature_views

urlpatterns = [
    path("<str:code>/moderation/", feature_views.ModerationView.as_view()),
    path("<str:code>/google-calendar/", feature_views.GoogleCalendarLinkView.as_view()),
    path(
        "<str:code>/recording/status/",
        recording_views.RecordingStatusView.as_view(),
    ),
    path(
        "<str:code>/recording/request/",
        recording_views.RecordingRequestView.as_view(),
    ),
    path(
        "<str:code>/recording/consent/",
        recording_views.RecordingConsentView.as_view(),
    ),
    path(
        "<str:code>/recording/start/",
        recording_views.RecordingStartView.as_view(),
    ),
    path(
        "<str:code>/recording/stop/",
        recording_views.RecordingStopView.as_view(),
    ),
    path(
        "<str:code>/recording/history/",
        recording_views.RecordingHistoryView.as_view(),
    ),
    path(
        "<str:code>/recording/<uuid:recording_id>/download/",
        recording_views.RecordingDownloadView.as_view(),
    ),
    path("<str:code>/summary/", views.MeetingSummaryView.as_view()),
    path("", views.MeetingListCreateView.as_view()),
    path("<str:code>/", views.MeetingDetailView.as_view()),
    path("<str:code>/remove-participant/", views.RemoveParticipantView.as_view()),
    path("<str:code>/control/", views.MeetingControlView.as_view()),
    path("<str:code>/join/", views.MeetingJoinView.as_view()),
    path("<str:code>/admission/", views.AdmissionStatusView.as_view()),
    path("<str:code>/admissions/", views.AdmissionManageView.as_view()),
    path("<str:code>/calendar/", views.MeetingCalendarView.as_view()),
    path("<str:code>/chat-export/", views.MeetingChatExportView.as_view()),
    path("<str:code>/messages/", views.MessageListCreateView.as_view()),
]
