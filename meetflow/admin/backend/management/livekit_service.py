"""LiveKit RoomService Twirp JSON client, using existing PyJWT dependency."""
import json
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
import jwt
from django.conf import settings

class LiveKitAdminError(Exception):
    pass

def _api_base():
    raw = getattr(settings, 'LIVEKIT_API_URL', '') or settings.LIVEKIT_URL
    parsed = urlsplit(raw)
    scheme = {'wss': 'https', 'ws': 'http'}.get(parsed.scheme, parsed.scheme)
    if scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
        raise LiveKitAdminError('Invalid LiveKit API URL configuration.')
    return urlunsplit((scheme, parsed.netloc, '', '', ''))

def _request(method, data):
    now = int(time.time())
    token = jwt.encode({'iss': settings.LIVEKIT_API_KEY, 'sub': 'meetflow-admin', 'nbf': now-5,
        'exp': now+60, 'video': {'roomList': True, 'roomAdmin': True}},
        settings.LIVEKIT_API_SECRET, algorithm='HS256')
    request = Request(_api_base() + '/twirp/livekit.RoomService/' + method,
        data=json.dumps(data).encode(), method='POST', headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=8) as response:
            return json.loads(response.read(2_000_000).decode())
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise LiveKitAdminError(f'LiveKit {method} failed: {type(exc).__name__}') from exc

def list_rooms():
    return _request('ListRooms', {}).get('rooms', [])

def list_participants(room):
    return _request('ListParticipants', {'room': room}).get('participants', [])

def remove_participant(room, identity):
    return _request('RemoveParticipant', {'room': room, 'identity': identity})

def delete_room(room):
    return _request('DeleteRoom', {'room': room})
