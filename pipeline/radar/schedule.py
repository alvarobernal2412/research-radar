"""Spread the radars' weekly scans over the week.

Every radar scans the same sources (OpenAlex, DBLP, IEEE, ...). Running two
radars on the same day sends them twice the traffic from one IP address, so each
new radar takes the weekday that is farthest from the ones already used.
Weekdays are 0 = Monday ... 6 = Sunday; times are "HH:MM" in the owner's zone.
"""
from __future__ import annotations

from typing import Iterable, Mapping, Sequence

DAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]
DEFAULT_TIME = "09:00"
# Order used to break ties: Sunday first (the install default), then days spread across the week.
PREFERRED_DAYS = [6, 2, 4, 0, 3, 1, 5]
# With more than seven radars a weekday is shared, at hours far apart from each other.
SHARED_HOURS = [9, 21, 3, 15]

Slot = tuple[int, str]


def _hour(t: str) -> int:
    return int(t.split(":")[0]) % 24


def _day_gap(a: int, b: int) -> int:
    d = abs(a - b) % 7
    return min(d, 7 - d)


def _hour_gap(a: int, b: int) -> int:
    d = abs(a - b) % 24
    return min(d, 24 - d)


def _as_slot(x: Mapping | Sequence) -> Slot:
    if isinstance(x, Mapping):
        return int(x["weekday"]), str(x.get("time") or DEFAULT_TIME)
    return int(x[0]), str(x[1] if len(x) > 1 and x[1] else DEFAULT_TIME)


def assign_slot(existing: Iterable[Mapping | Sequence]) -> Slot:
    """Pick (weekday, "HH:MM") for a new radar, given the slots already taken."""
    used = [_as_slot(x) for x in existing]
    if not used:
        return PREFERRED_DAYS[0], DEFAULT_TIME
    taken_days = {d for d, _ in used}
    free = [d for d in PREFERRED_DAYS if d not in taken_days]
    if free:
        # Farthest from every used day; ties go to the earlier entry of PREFERRED_DAYS.
        best = max(free, key=lambda d: (min(_day_gap(d, u) for u in taken_days), -PREFERRED_DAYS.index(d)))
        return best, DEFAULT_TIME
    counts = {d: sum(1 for u, _ in used if u == d) for d in range(7)}
    day = min(PREFERRED_DAYS, key=lambda d: (counts[d], PREFERRED_DAYS.index(d)))
    hours = [_hour(t) for d, t in used if d == day]
    hour = max(SHARED_HOURS, key=lambda h: (min(_hour_gap(h, x) for x in hours), -SHARED_HOURS.index(h)))
    return day, f"{hour:02d}:00"


def schedule_text(weekday: int, time: str) -> str:
    """Human text for meta/config.scheduleText, e.g. "Sundays at 09:00"."""
    return f"{DAY_NAMES[weekday]} at {time}"


def cron_expression(weekday: int, time: str) -> str:
    """Five-field cron for the scheduled task (cron counts Sunday as 0)."""
    h, m = (int(x) for x in time.split(":"))
    return f"{m} {h} * * {(weekday + 1) % 7}"
