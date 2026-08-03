from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import google.auth.transport.requests
from google.oauth2 import service_account
import requests

from .config import PLAY_SCOPE, RECENT_WINDOW_DAYS

REVIEWS_URL = (
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
)


@dataclass
class Review:
    review_id: str
    author_name: str | None
    star_rating: int
    text: str | None
    original_text: str | None
    reviewer_language: str | None
    device: str | None
    app_version_code: int | None
    app_version_name: str | None
    android_os_version: int | None
    manufacturer: str | None
    device_class: str | None
    thumbs_up: int
    thumbs_down: int
    has_developer_reply: bool
    developer_reply: str | None
    last_modified_at: int
    source: str
    synced_at: int


def fetch_recent_reviews(
    service_account_path: Path,
    package_name: str,
    window_days: int = RECENT_WINDOW_DAYS,
) -> list[Review]:
    if not service_account_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy Service Account: {service_account_path}"
        )

    credentials = service_account.Credentials.from_service_account_file(
        str(service_account_path),
        scopes=[PLAY_SCOPE],
    )
    credentials.refresh(google.auth.transport.requests.Request())
    access_token = credentials.token

    window_start = int(time.time()) - window_days * 24 * 60 * 60
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {access_token}"})

    all_reviews: list[Review] = []
    page_token: str | None = None

    while True:
        url = f"{REVIEWS_URL}/{package_name}/reviews?maxResults=100"
        if page_token:
            url += f"&token={page_token}"

        response = session.get(url, timeout=30)
        if not response.ok:
            raise RuntimeError(f"Play API error {response.status_code}: {response.text}")

        payload = response.json()
        any_recent = False

        for api_review in payload.get("reviews") or []:
            mapped = _map_api_review(api_review)
            if mapped is None:
                continue
            if mapped.last_modified_at >= window_start:
                all_reviews.append(mapped)
                any_recent = True

        page_token = (payload.get("tokenPagination") or {}).get("nextPageToken")
        if not any_recent or not page_token:
            break

    return all_reviews


def _map_api_review(review: dict[str, Any]) -> Review | None:
    comments = review.get("comments") or []
    user_comment = next(
        (c.get("userComment") for c in comments if c.get("userComment")),
        None,
    )
    if not user_comment:
        return None

    star_rating = user_comment.get("starRating")
    if star_rating is None:
        return None

    developer_reply = next(
        (
            (c.get("developerComment") or {}).get("text")
            for c in comments
            if c.get("developerComment")
        ),
        None,
    )

    seconds_raw = ((user_comment.get("lastModified") or {}).get("seconds")) or None
    try:
        last_modified_at = int(seconds_raw) if seconds_raw is not None else int(time.time())
    except (TypeError, ValueError):
        last_modified_at = int(time.time())

    device_meta = user_comment.get("deviceMetadata") or {}

    return Review(
        review_id=review["reviewId"],
        author_name=review.get("authorName"),
        star_rating=int(star_rating),
        text=user_comment.get("text"),
        original_text=user_comment.get("originalText"),
        reviewer_language=user_comment.get("reviewerLanguage"),
        device=user_comment.get("device"),
        app_version_code=user_comment.get("appVersionCode"),
        app_version_name=user_comment.get("appVersionName"),
        android_os_version=user_comment.get("androidOsVersion"),
        manufacturer=device_meta.get("manufacturer"),
        device_class=device_meta.get("deviceClass"),
        thumbs_up=int(user_comment.get("thumbsUpCount") or 0),
        thumbs_down=int(user_comment.get("thumbsDownCount") or 0),
        has_developer_reply=developer_reply is not None,
        developer_reply=developer_reply,
        last_modified_at=last_modified_at,
        source="api",
        synced_at=int(time.time()),
    )
