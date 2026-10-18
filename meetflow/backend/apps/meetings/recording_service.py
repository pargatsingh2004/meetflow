
import asyncio
from contextlib import asynccontextmanager

from django.conf import settings
from livekit import api


@asynccontextmanager
async def livekit_client():
    client = api.LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    )
    try:
        yield client
    finally:
        await client.aclose()


async def _participants(room_name):
    async with livekit_client() as client:
        result = await client.room.list_participants(
            api.ListParticipantsRequest(room=room_name)
        )
        return [
            p.identity
            for p in result.participants
        ]


def connected_user_ids(room_name):
    identities = asyncio.run(_participants(room_name))
    result = set()

    for identity in identities:
        # MeetFlow currently uses the Django user ID
        # as the LiveKit participant identity.
        if identity.isdecimal():
            result.add(int(identity))

    return result


async def _start_recording(room_name, filepath):
    output = api.EncodedFileOutput(
        file_type=api.EncodedFileType.MP4,
        filepath=filepath,
        s3=api.S3Upload(
            bucket=settings.RECORDING_S3_BUCKET,
            region=settings.RECORDING_S3_REGION,
            endpoint=settings.RECORDING_S3_ENDPOINT,
            access_key=settings.RECORDING_S3_ACCESS_KEY,
            secret=settings.RECORDING_S3_SECRET_KEY,
        ),
    )

    request = api.RoomCompositeEgressRequest(
        room_name=room_name,
        layout="grid",
        audio_only=False,
        file_outputs=[output],
    )

    async with livekit_client() as client:
        return await client.egress.start_room_composite_egress(
            request
        )


def start_recording(room_name, filepath):
    return asyncio.run(_start_recording(room_name, filepath))


async def _stop_recording(egress_id):
    async with livekit_client() as client:
        return await client.egress.stop_egress(
            api.StopEgressRequest(egress_id=egress_id)
        )


def stop_recording(egress_id):
    return asyncio.run(_stop_recording(egress_id))


async def _get_egress(egress_id):
    async with livekit_client() as client:
        result = await client.egress.list_egress(
            api.ListEgressRequest(egress_id=egress_id)
        )
        return result.items[0] if result.items else None


def get_egress(egress_id):
    return asyncio.run(_get_egress(egress_id))
